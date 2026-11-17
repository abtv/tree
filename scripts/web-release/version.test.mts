import { afterEach, expect, it, vi } from 'vitest'
import { isNewWebVersion } from './version.mts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const sha = 'a'.repeat(40)
const blob = (value: unknown) => {
  const bytes = Buffer.from(JSON.stringify(value))
  return { encoding: 'base64', size: bytes.length, content: bytes.toString('base64') }
}
const provenance = {
  schema: 1,
  sourceRepository: 'abtv/tree',
  sourceSha: sha,
  sourceRunId: '123',
  sourceRunAttempt: 1,
  files: [
    { path: 'index.html', sha256: 'b'.repeat(64), size: 20 },
    { path: '.nojekyll', sha256: 'b'.repeat(64), size: 0 },
    { path: 'assets/app.js', sha256: 'b'.repeat(64), size: 20 },
    { path: 'assets/app.css', sha256: 'b'.repeat(64), size: 20 },
    { path: 'assets/font.ttf', sha256: 'b'.repeat(64), size: 20 },
  ],
}

it.each([
  ['0.1.3', true],
  ['0.2.0', true],
  ['0.1.2', false],
  ['0.1.1', false],
  ['0.1.2+other', false],
  ['0.1.2-rc.1', false],
])('publishes %s only above the last transferred package version', async (version, expected) => {
  const request = vi.fn(async (path: string) => {
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha } }
    if (path.endsWith(`/contents/provenance.json?ref=${sha}`)) return blob(provenance)
    if (path.endsWith(`/contents/package.json?ref=${sha}`)) return blob({ version: '0.1.2' })
    throw new Error(`Unexpected request ${path}`)
  })

  await expect(isNewWebVersion(version, { request })).resolves.toBe(expected)
  expect(request.mock.calls.every(([path]) => !path.includes('ref=main'))).toBe(true)
})

it('fails closed on missing or malformed previous release metadata', async () => {
  const request = vi.fn().mockRejectedValue(new Error('404'))

  await expect(isNewWebVersion('0.1.3', { request, targetSha: sha })).rejects.toThrow('404')

  request.mockResolvedValue(blob({ ...provenance, sourceSha: 'main' }))

  await expect(isNewWebVersion('0.1.3', { request, targetSha: sha })).rejects.toThrow()
})

it('rejects reuse of a legacy web version by a different source commit', async () => {
  const request = vi.fn(async (path: string) => {
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha } }
    if (path.includes('/contents/provenance.json?')) return blob(provenance)
    if (path.includes('/contents/package.json?')) return blob({ version: '0.1.2' })
    throw new Error(`Unexpected request ${path}`)
  })

  await expect(isNewWebVersion('0.1.2', { request, sourceSha: 'b'.repeat(40) })).rejects.toThrow('another source')
  await expect(isNewWebVersion('0.1.2', { request, sourceSha: sha })).resolves.toBe(false)
})

it.each([
  ['0.1.3', true],
  ['0.1.2', false],
] as const)('resumes the version comparison for %s after a hosting rate limit', async (version, expected) => {
  vi.useFakeTimers()
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 403, headers: { 'retry-after': '3' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha } })))
    .mockResolvedValueOnce(new Response(JSON.stringify(blob(provenance))))
    .mockResolvedValueOnce(new Response(JSON.stringify(blob({ version: '0.1.2' }))))
  vi.stubGlobal('fetch', fetch)

  const result = isNewWebVersion(version, { token: 'source' }).catch((error) => error)
  await vi.runAllTimersAsync()

  expect(await result).toBe(expected)
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1])
  expect(fetch.mock.calls[2]![0]).toContain(`/contents/provenance.json?ref=${sha}`)
  expect(fetch.mock.calls[3]![0]).toContain(`/contents/package.json?ref=${sha}`)
  expect(fetch.mock.calls[3]![1].headers.Authorization).toBe('Bearer source')
})
