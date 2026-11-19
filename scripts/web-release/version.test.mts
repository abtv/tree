import { afterEach, expect, it, vi } from 'vitest'
import { hostingRemote } from './hosting-remote.fixture.mts'
import { isNewWebVersion } from './version.mts'

afterEach(() => {
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
    if (path.endsWith(`/contents/provenance.json?ref=${sha}`)) return blob(provenance)
    if (path.endsWith(`/contents/package.json?ref=${sha}`)) return blob({ version: '0.1.2' })
    throw new Error(`Unexpected request ${path}`)
  })

  await expect(isNewWebVersion(version, { request, targetSha: sha, targetToken: 'target' })).resolves.toBe(expected)
  expect(request).toHaveBeenNthCalledWith(
    1,
    `/repos/tree-editor/tree-editor.github.io/contents/provenance.json?ref=${sha}`,
    { token: 'target' },
  )
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
    if (path.includes('/contents/provenance.json?')) return blob(provenance)
    if (path.includes('/contents/package.json?')) return blob({ version: '0.1.2' })
    throw new Error(`Unexpected request ${path}`)
  })

  await expect(isNewWebVersion('0.1.2', { request, targetSha: sha, sourceSha: 'b'.repeat(40) })).rejects.toThrow(
    'another source',
  )
  await expect(isNewWebVersion('0.1.2', { request, targetSha: sha, sourceSha: sha })).resolves.toBe(false)
})

it.each([
  ['0.1.3', true],
  ['0.1.2', false],
] as const)('compares %s even when the anonymous GitHub REST budget is exhausted', async (version, expected) => {
  const remote = await hostingRemote({ 'provenance.json': JSON.stringify(provenance) })
  const fetch = vi.fn(async (url: string) => {
    if (url === `https://api.github.com/repos/abtv/tree/contents/package.json?ref=${sha}`) {
      return Response.json(blob({ version: '0.1.2' }))
    }
    return new Response('{}', { status: 403, headers: { 'retry-after': '3600' } })
  })
  vi.stubGlobal('fetch', fetch)

  await expect(isNewWebVersion(version, { token: 'source', hostingRemote: remote.url })).resolves.toBe(expected)
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining(`/contents/package.json?ref=${sha}`),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer source' }) }),
  )
})

it('fails closed if the hosting commit has no public provenance file', async () => {
  const remote = await hostingRemote({ 'README.md': 'hosting' })
  const request = vi.fn()

  await expect(isNewWebVersion('0.1.3', { request, hostingRemote: remote.url })).rejects.toThrow(
    'Could not read the public hosting repository',
  )
  expect(request).not.toHaveBeenCalled()
})
