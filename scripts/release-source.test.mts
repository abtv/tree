import { describe, expect, it, vi } from 'vitest'
import { releaseSourceState, requireReleaseSource, reserveReleaseSource } from './release-source.mts'
import type { Request } from './web-release/types.mts'
import { isNewWebVersion } from './web-release/version.mts'

vi.mock('./web-release/version.mts', () => ({ isNewWebVersion: vi.fn().mockResolvedValue(true) }))

const sha = 'a'.repeat(40)
const other = 'b'.repeat(40)
function fixture(tags: { name: string; commit: { sha: string } }[] = [], releases: { tag_name: string }[] = []) {
  return vi.fn<Request>(async (path, options) => {
    if (path.endsWith('/heads/main')) return { object: { sha } }
    if (path.includes('/tags?')) return tags.slice()
    if (path.includes('/releases?')) return releases
    if (path.endsWith('/git/refs') && options?.method === 'POST') {
      tags.push({ name: 'v1.2.3', commit: { sha } })
      return {}
    }
    throw new Error(`Unexpected request ${path}`)
  })
}

// @requirement PRODUCT.md §1.4.1
describe('one immutable source for both release platforms', () => {
  it('reserves before either platform publishes and reuses the same tag after either platform fails', async () => {
    const request = fixture()

    await reserveReleaseSource('1.2.3', sha, request)
    await reserveReleaseSource('1.2.3', sha, request)
    await requireReleaseSource('1.2.3', sha, request)

    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toEqual([
      ['/repos/abtv/tree/git/refs', { token: undefined, method: 'POST', body: { ref: 'refs/tags/v1.2.3', sha } }],
    ])
  })

  it.each([
    [{ name: 'v1.2.3', commit: { sha: other } }],
    [{ name: 'v1.2.4', commit: { sha } }],
    [{ name: 'v1.2.3+other', commit: { sha } }],
  ])('blocks conflicting, newer and equal-precedence tags %j', async (tag) => {
    const request = fixture([tag])

    expect(await releaseSourceState('1.2.3', sha, request)).toBe('unavailable')
    await expect(reserveReleaseSource('1.2.3', sha, request)).rejects.toThrow('obsolete')
    expect(request.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  })

  it.each(['v1.2.3', 'v1.2.4'])('does not reuse numbers reserved by a release without a tag (%s)', async (tag_name) => {
    expect(await releaseSourceState('1.2.3', sha, fixture([], [{ tag_name }]))).toBe('unavailable')
  })

  it('rejects missing tags before web publication', async () => {
    await expect(requireReleaseSource('1.2.3', sha, fixture())).rejects.toThrow('not reserved')
  })

  it('checks later tag pages before accepting an existing source reservation', async () => {
    const request = fixture()
    request.mockImplementation(async (path) => {
      if (path.includes('/releases?')) return []
      if (path.endsWith('page=1')) return Array.from({ length: 100 }, () => ({ name: 'v1.2.3', commit: { sha } }))
      if (path.endsWith('page=2')) return [{ name: 'v1.2.4', commit: { sha: other } }]
      throw new Error(`Unexpected request ${path}`)
    })

    expect(await releaseSourceState('1.2.3', sha, request)).toBe('unavailable')
  })

  it('requires read-back confirmation before allowing either publication', async () => {
    const request = fixture()
    const unconfirmed: Request = (path, options) =>
      options?.method === 'POST' ? Promise.resolve({}) : request(path, options)

    await expect(reserveReleaseSource('1.2.3', sha, unconfirmed)).rejects.toThrow('not reserved')
  })

  it('does not reserve a legacy web version for different desktop source', async () => {
    const request = fixture()
    vi.mocked(isNewWebVersion).mockRejectedValueOnce(new Error('Web release version belongs to another source commit'))

    await expect(reserveReleaseSource('1.2.3', sha, request)).rejects.toThrow('another source')

    expect(isNewWebVersion).toHaveBeenLastCalledWith('1.2.3', { request, token: undefined, sourceSha: sha })
    expect(request.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  })

  it('does not reserve an untagged version at or below the latest web release', async () => {
    const request = fixture()
    vi.mocked(isNewWebVersion).mockResolvedValueOnce(false)

    await expect(reserveReleaseSource('1.2.3', sha, request)).rejects.toThrow('not newer than the web release')

    expect(request.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  })

  it('does not turn a stale-source retry into a release of current main', async () => {
    const request = fixture([{ name: 'v1.2.3', commit: { sha } }])
    request.mockResolvedValueOnce({ object: { sha: other } })

    await expect(reserveReleaseSource('1.2.3', sha, request)).rejects.toThrow('stale')
    expect(request).toHaveBeenCalledOnce()
  })

  it('reconciles a lost tag-creation response on retry without replacing the tag', async () => {
    const request = fixture()
    const uncertain: Request = async (path, options) => {
      const result = await request(path, options)
      if (options?.method === 'POST') throw new Error('Response lost')
      return result
    }

    await expect(reserveReleaseSource('1.2.3', sha, uncertain)).rejects.toThrow('Response lost')
    await reserveReleaseSource('1.2.3', sha, uncertain)

    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  })

  it('fails closed on unreadable state, malformed identities and failed reservation', async () => {
    await expect(releaseSourceState('1.2.3', 'main', fixture())).rejects.toThrow('SHA')
    await expect(releaseSourceState('1.2.3', sha, vi.fn().mockResolvedValue({}))).rejects.toThrow('state')
    const request = fixture()
    const conflict: Request = async (path, options) => {
      if (options?.method === 'POST') throw new Error('422')
      return request(path, options)
    }

    await expect(reserveReleaseSource('1.2.3', sha, conflict)).rejects.toThrow('422')
    await expect(requireReleaseSource('1.2.3', sha, request)).rejects.toThrow('not reserved')
  })
})
