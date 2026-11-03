import { spawnSync } from 'node:child_process'
import { expect, test, vi } from 'vitest'
import { validateTicket } from './stapler-validate.mts'

const lostConnection = 'Error Domain=NSURLErrorDomain Code=-1005 "The network connection was lost."'

test('retries the observed Apple connection loss after 15 and 30 seconds', async () => {
  const run = vi
    .fn()
    .mockReturnValueOnce({ status: 68, output: lostConnection })
    .mockReturnValueOnce({ status: 68, output: lostConnection })
    .mockReturnValue({ status: 0, output: 'valid' })
  const wait = vi.fn().mockResolvedValue(undefined)

  expect(await validateTicket('Tree app.app', run, wait)).toBe(0)

  expect(run.mock.calls).toEqual([['Tree app.app'], ['Tree app.app'], ['Tree app.app']])
  expect(wait.mock.calls).toEqual([[15000], [30000]])
})

test('returns the final error after exhausting retries', async () => {
  const run = vi.fn().mockReturnValue({ status: 68, output: lostConnection })
  const wait = vi.fn().mockResolvedValue(undefined)

  expect(await validateTicket('Tree.app', run, wait)).toBe(68)
  expect(run).toHaveBeenCalledTimes(3)
  expect(wait).toHaveBeenCalledTimes(2)
})

test('stops when a timeout retry returns a permanent failure', async () => {
  const run = vi
    .fn()
    .mockReturnValueOnce({ status: 68, output: 'Error Domain=NSURLErrorDomain Code=-1001 "Timed out"' })
    .mockReturnValue({ status: 65, output: 'Invalid ticket' })
  const wait = vi.fn().mockResolvedValue(undefined)

  expect(await validateTicket('Tree.app', run, wait)).toBe(65)
  expect(run).toHaveBeenCalledTimes(2)
  expect(wait.mock.calls).toEqual([[15000]])
})

test.each([
  [0, 'valid'],
  [68, 'CloudKit response was invalid'],
  [65, 'Invalid ticket'],
  [68, 'Error Domain=NSURLErrorDomain Code=-1202 "Untrusted certificate"'],
  [68, 'Error Domain=NSURLErrorDomain Code=-999 "Cancelled"'],
])('does not retry status %i with output %s', async (status, output) => {
  const run = vi.fn().mockReturnValue({ status, output })
  const wait = vi.fn()

  expect(await validateTicket('Tree.app', run, wait)).toBe(status)
  expect(run).toHaveBeenCalledTimes(1)
  expect(wait).not.toHaveBeenCalled()
})

test.skipIf(process.platform !== 'darwin')('CLI preserves a real stapler failure for a nonexistent bundle', () => {
  const result = spawnSync(process.execPath, ['scripts/stapler-validate.mts', '/nonexistent/tree-retry-test.app'], {
    encoding: 'utf8',
  })

  expect(result.status).not.toBe(0)
  expect(result.stdout + result.stderr).toContain('does not exist')
})
