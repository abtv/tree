import { afterEach, describe, expect, it, vi } from 'vitest'
import { planDraft, reserveDraft, verifyUpload, verifySource, request, type Request } from './release-draft.mts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const sha = 'a'.repeat(40)
const other = 'b'.repeat(40)
function fixture(version = '1.2.3') {
  const run = {
    id: 42,
    run_attempt: 1,
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    path: '.github/workflows/test-and-build-app.yml',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: 'abtv/tree' },
    head_repository: { full_name: 'abtv/tree' },
  }
  const event = { workflow_run: structuredClone(run) }
  const tags: { name: string; commit: { sha: string } }[] = []
  const releases: {
    id: number
    tag_name: string
    draft: boolean
    body: string
    assets: { name: string; state: string; size: number }[]
  }[] = []
  const jobs = [{ name: 'Check release version', status: 'completed', conclusion: 'success' }]
  const writes: { path: string; method: string; body: unknown }[] = []
  const state = { main: sha }
  const api: Request = async (path, method = 'GET', body) => {
    if (method !== 'GET') {
      writes.push({ path, method, body })
      if (path.endsWith('/git/refs')) {
        const input = body as { ref: string; sha: string }
        tags.push({ name: input.ref.slice('refs/tags/'.length), commit: { sha: input.sha } })
        return {}
      }
      if (path.endsWith('/releases')) {
        const input = body as { tag_name: string; draft: boolean; body: string }
        const release = { ...input, id: 123, assets: [] }
        releases.push(release)
        return structuredClone(release)
      }
      throw new Error(`Unexpected write ${path}`)
    }
    if (path.endsWith('/actions/runs/42')) return structuredClone(run)
    if (path.includes('/jobs?')) return { jobs: structuredClone(jobs), total_count: jobs.length }
    if (path.includes('/tags?')) return structuredClone(tags)
    if (path.includes('/releases?')) return structuredClone(releases)
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: state.main } }
    throw new Error(`Unexpected read ${path}`)
  }
  const texts = [JSON.stringify({ version }), JSON.stringify({ version, packages: { '': { version } } })]
  return { run, event, tags, releases, jobs, writes, api, texts, state }
}

describe('verified main release drafts', () => {
  it('plans without writes then reserves a tag and draft at the checked SHA', async () => {
    const f = fixture()

    expect(await planDraft(f.event, f.texts, f.api)).toMatchObject({ tag: 'v1.2.3', sha })
    expect(f.writes).toEqual([])
    const result = await reserveDraft(f.event, f.texts, f.api)

    expect(result?.release.id).toBe(123)
    expect(f.writes.map((write) => write.method)).toEqual(['POST', 'POST'])
    expect(f.writes[0]?.body).toEqual({ ref: 'refs/tags/v1.2.3', sha })
    expect(f.writes[1]?.body).toMatchObject({ tag_name: 'v1.2.3', target_commitish: sha, draft: true })
    expect(f.releases[0]?.body).toContain(`source=${sha} run=42`)
  })

  it.each([
    ['conclusion', 'failure'],
    ['conclusion', 'cancelled'],
    ['status', 'in_progress'],
    ['head_sha', other],
    ['head_branch', 'feature'],
    ['event', 'pull_request'],
    ['path', '.github/workflows/other.yml'],
    ['run_attempt', 2],
    ['repository', { full_name: 'fork/tree' }],
    ['head_repository', { full_name: 'fork/tree' }],
  ])('rejects changed upstream %s', async (field, value) => {
    const f = fixture()
    Object.assign(f.run, { [field as string]: value })

    await expect(reserveDraft(f.event, f.texts, f.api)).rejects.toThrow('Untrusted')
    expect(f.writes).toEqual([])
  })

  it.each(['missing', 'duplicate', 'failed'])('rejects %s source gate', async (kind) => {
    const f = fixture()
    if (kind === 'missing') f.jobs[0]!.name = 'Other check'
    if (kind === 'duplicate') f.jobs.push({ ...f.jobs[0]! })
    if (kind === 'failed') f.jobs[0]!.conclusion = 'failure'

    await expect(verifySource(f.event, f.api)).rejects.toThrow('checks did not pass')
  })

  it('skips a superseded main commit before writes', async () => {
    const f = fixture()
    f.state.main = other

    expect(await reserveDraft(f.event, f.texts, f.api)).toBeUndefined()
    expect(f.writes).toEqual([])
  })

  it.each(['v1.2.10', 'v1.3.0', 'v2.0.0', 'v1.2.4-beta', 'v1.2.3+build'])(
    'skips candidate behind reserved %s',
    async (name) => {
      const f = fixture()
      f.tags.push({ name, commit: { sha: other } })

      expect(await reserveDraft(f.event, f.texts, f.api)).toBeUndefined()
      expect(f.writes).toEqual([])
    },
  )

  it('skips ordinary later main commits with an already reserved version', async () => {
    const f = fixture()
    f.tags.push({ name: 'v1.2.3', commit: { sha: other } })

    expect(await reserveDraft(f.event, f.texts, f.api)).toBeUndefined()
    expect(f.writes).toEqual([])
  })

  it('resumes its empty draft without another tag or release, even after main advances', async () => {
    const f = fixture()
    await reserveDraft(f.event, f.texts, f.api)
    f.state.main = other
    f.writes.length = 0

    expect((await reserveDraft(f.event, f.texts, f.api))?.release.id).toBe(123)
    expect((await verifyUpload(f.event, f.texts, 123, f.api)).sha).toBe(sha)
    expect(f.writes).toEqual([])
  })

  it('recovers a tag reservation when draft creation previously failed', async () => {
    const f = fixture()
    const failing: Request = async (path, method, body) => {
      if (method === 'POST' && path.endsWith('/releases')) throw new Error('network error')
      return f.api(path, method, body)
    }

    await expect(reserveDraft(f.event, f.texts, failing)).rejects.toThrow('network error')
    expect(f.tags).toHaveLength(1)
    expect((await reserveDraft(f.event, f.texts, f.api))?.release.id).toBe(123)
    expect(f.tags).toHaveLength(1)
  })

  it.each(['published', 'ready', 'unknown', 'partial'])('protects an existing %s release', async (kind) => {
    const f = fixture()
    await reserveDraft(f.event, f.texts, f.api)
    f.writes.length = 0
    const release = f.releases[0]!
    if (kind === 'published') release.draft = false
    if (kind === 'ready')
      release.assets.push(
        ...['Tree-1.2.3-arm64.dmg', 'Tree-1.2.3-arm64.zip', 'latest-mac.yml'].map((name) => ({
          name,
          state: 'uploaded',
          size: 100,
        })),
      )
    if (kind === 'unknown') release.body = 'unrelated draft'
    if (kind === 'partial') release.assets.push({ name: 'partial.dmg', state: 'new', size: 0 })

    if (kind === 'unknown' || kind === 'partial') await expect(reserveDraft(f.event, f.texts, f.api)).rejects.toThrow()
    else expect(await reserveDraft(f.event, f.texts, f.api)).toBeUndefined()
    await expect(verifyUpload(f.event, f.texts, 123, f.api)).rejects.toThrow()
    expect(f.writes).toEqual([])
  })

  it('rejects upload if a newer release appeared or the source attempt changed', async () => {
    const f = fixture()
    await reserveDraft(f.event, f.texts, f.api)
    f.tags.push({ name: 'v2.0.0', commit: { sha: other } })

    await expect(verifyUpload(f.event, f.texts, 123, f.api)).rejects.toThrow('no longer eligible')

    f.tags.pop()
    f.run.run_attempt++
    await expect(verifyUpload(f.event, f.texts, 123, f.api)).rejects.toThrow('superseded')
  })

  it('reads past the first tag and release pages', async () => {
    const f = fixture()
    const api: Request = async (path, method, body) => {
      if (path.includes('/tags?'))
        return path.endsWith('page=1')
          ? Array.from({ length: 100 }, (_, i) => ({ name: `unrelated-${i}`, commit: { sha } }))
          : [{ name: 'v9.0.0', commit: { sha } }]
      return f.api(path, method, body)
    }

    expect(await reserveDraft(f.event, f.texts, api)).toBeUndefined()
    expect(f.writes).toEqual([])
  })

  it('fails closed on unavailable API reads', async () => {
    const f = fixture()
    await expect(
      reserveDraft(f.event, f.texts, async () => {
        throw new Error('API unavailable')
      }),
    ).rejects.toThrow('API unavailable')
    expect(f.writes).toEqual([])
  })

  it('uses authenticated fixed-host API calls without redirects or remote error text', async () => {
    vi.stubEnv('GH_TOKEN', 'synthetic-token')
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 123 }), { status: 201 }))
    vi.stubGlobal('fetch', fetch)

    expect(await request('/repos/abtv/tree/releases', 'POST', { draft: true })).toEqual({ id: 123 })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/abtv/tree/releases',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: '{"draft":true}',
        headers: expect.objectContaining({ Authorization: 'Bearer synthetic-token' }),
      }),
    )

    fetch.mockResolvedValue(new Response('secret remote error', { status: 403 }))
    await expect(request('/repos/abtv/tree/releases')).rejects.toThrow('Release API GET failed (403)')
    await expect(request('/repos/other/tree/releases')).rejects.toThrow('Invalid release API path')
  })
})
