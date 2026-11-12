import { PassThrough } from 'node:stream'
import { execFile } from 'node:child_process'
import { beforeEach, expect, it, vi } from 'vitest'
import { createSummarization } from './summarize'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
let finish: (error: Error | null, text: string) => void
let stdin: PassThrough
let kill: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  stdin = new PassThrough()
  kill = vi.fn()
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    finish = args[3] as typeof finish
    return { stdin, kill } as unknown as ReturnType<typeof execFile>
  })
})

// @requirement PRODUCT.md §15.2
it('uses a fixed executable, bounded pipes and a fresh inference for each reduction', async () => {
  const worker = createSummarization('/fixed/tree-summarize')
  const available = worker.available()
  finish(null, '{"available":true}')
  await expect(available).resolves.toBe(true)
  await worker.begin('job')
  stdin = new PassThrough()

  const request = worker.reduce('job', 'Notes', true)
  expect(JSON.parse(stdin.read().toString())).toEqual({ text: 'Notes', final: true })
  expect(execFile).toHaveBeenLastCalledWith(
    '/fixed/tree-summarize',
    [],
    expect.objectContaining({ timeout: 60000, maxBuffer: 32768, killSignal: 'SIGKILL' }),
    expect.any(Function),
  )
  finish(null, '{"text":" Summary "}')

  await expect(request).resolves.toBe('Summary')
  await worker.finish('job', 'Summary')
  await expect(worker.reduce('job', 'Notes', true)).rejects.toThrow('unavailable')
})

// @requirement PRODUCT.md §15.2
it('rejects concurrent jobs, oversized requests and late results after cancellation', async () => {
  const worker = createSummarization('/helper')
  await worker.begin('job')
  await expect(worker.begin('other')).rejects.toThrow('already running')
  await expect(worker.reduce('job', 'x'.repeat(2401), false)).rejects.toThrow('too large')
  expect(execFile).not.toHaveBeenCalled()
  const pending = worker.reduce('job', 'Notes', true)
  const rejected = expect(pending).rejects.toThrow('canceled')

  await worker.cancel('job')
  finish(null, '{"text":"Late"}')

  await rejected
  expect(kill).toHaveBeenCalledWith('SIGKILL')
})

// @requirement PRODUCT.md §15.2
it.each(['invalid', '{}', '{"text":""}', '{"text":42}'])('rejects invalid model output %s', async (output) => {
  const worker = createSummarization('/helper')
  await worker.begin('job')
  const pending = worker.reduce('job', 'Notes', true)
  const rejected = expect(pending).rejects.toThrow()

  finish(null, output)

  await rejected
})
