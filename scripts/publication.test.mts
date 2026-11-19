import { describe, expect, it, vi } from 'vitest'
import { dispatchedSource, dispatchPublications, releaseNeeded } from './publication.mts'
import { isNewWebVersion } from './web-release/version.mts'
import { waitForDeployment } from './web-release/status.mts'
import type { Request } from './web-release/types.mts'

const sha = 'a'.repeat(40)
vi.mock('./web-release/version.mts', () => ({ isNewWebVersion: vi.fn() }))
const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: 'abtv/tree',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: sha,
  VALIDATION_SHA: sha,
  VALIDATION_RUN_ID: '42',
  VALIDATION_RUN_ATTEMPT: '1',
}
const run = {
  id: 42,
  run_attempt: 1,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  repository: { full_name: 'abtv/tree' },
  path: '.github/workflows/test-and-build-app.yml',
  status: 'completed',
  conclusion: 'success',
}
const gate = { name: 'Check release version', status: 'completed', conclusion: 'success' }
function fixture(overrides = {}) {
  return vi.fn<Request>(async (path) => {
    if (path.endsWith('/heads/main')) return { object: { sha } }
    if (path.includes('/jobs?')) return { jobs: [gate], total_count: 1 }
    return { ...run, ...overrides }
  })
}

describe('verified publication dispatch', () => {
  it('does not release later same-version commits when web publication is behind macOS', async () => {
    vi.mocked(isNewWebVersion).mockResolvedValue(true)
    const request = vi.fn<Request>(async (path) =>
      path.includes('/tags?') ? [{ name: 'v1.2.3', commit: { sha: 'b'.repeat(40) } }] : [],
    )

    expect(await releaseNeeded('1.2.3', sha, request)).toBe(false)
  })

  it('starts a macOS release after the version-bump push failed validation', async () => {
    vi.mocked(isNewWebVersion).mockResolvedValue(true)
    const request = vi.fn<Request>(async (path) => {
      if (path.includes('/tags?')) return [{ name: 'v1.2.2' }]
      if (path.includes('/releases?')) return []
      throw new Error(`Unexpected request ${path}`)
    })

    expect(await releaseNeeded('1.2.3', sha, request)).toBe(true)
  })

  it.each([
    [false, 'v1.2.3', true],
    [false, 'v1.2.4', false],
    [true, 'v1.2.3', true],
    [true, 'v1.2.2', true],
    [false, 'v1.2.2', false],
  ])('checks both platform release states (web=%s, mac=%s)', async (web, tag, expected) => {
    vi.mocked(isNewWebVersion).mockResolvedValue(web)
    const request = vi.fn<Request>(async (path) => (path.includes('/tags?') ? [{ name: tag, commit: { sha } }] : []))

    expect(await releaseNeeded('1.2.3', sha, request)).toBe(expected)
  })

  it('fails closed when release state cannot be read', async () => {
    vi.mocked(isNewWebVersion).mockRejectedValueOnce(new Error('unavailable'))

    await expect(releaseNeeded('1.2.3', sha, vi.fn().mockResolvedValue([]))).rejects.toThrow('unavailable')
  })
  it('uses immutable successful validation identity independently of release attempts', async () => {
    const request = fixture()

    expect(await dispatchedSource({ ...env, GITHUB_RUN_ATTEMPT: '7' }, request)).toEqual(run)
    expect(request.mock.calls.some(([path]) => path.includes('/attempts/1/jobs'))).toBe(true)
  })

  it.each([
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REPOSITORY: 'fork/tree' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_SHA: 'b'.repeat(40) },
    { VALIDATION_RUN_ID: '../bad' },
    { VALIDATION_RUN_ATTEMPT: '0' },
  ])('rejects forged dispatch %j before API access', async (override) => {
    const request = fixture()

    await expect(dispatchedSource({ ...env, ...override }, request)).rejects.toThrow('identity')
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    { conclusion: 'failure' },
    { event: 'pull_request' },
    { path: '.github/workflows/other.yml' },
    { head_sha: 'b'.repeat(40) },
    { run_attempt: 2 },
  ])('rejects untrusted validation %j', async (override) => {
    await expect(dispatchedSource(env, fixture(override))).rejects.toThrow()
  })

  it('waits boundedly for the dispatching validation job and rejects a later failed result', async () => {
    const wait = vi.fn().mockResolvedValue(undefined)
    const request = fixture().mockResolvedValueOnce({ ...run, status: 'in_progress' })

    expect(await dispatchedSource(env, request, wait)).toEqual(run)
    expect(wait).toHaveBeenCalledOnce()
    await expect(dispatchedSource(env, fixture({ status: 'in_progress' }), wait)).rejects.toThrow('did not finish')
  })

  it.each([false, true])('dispatches demo and only eligible release (%s)', async (ready) => {
    const request = vi.fn<Request>().mockResolvedValue(undefined)
    const inputs = { run_id: '42', run_attempt: '1', sha, version: '1.2.3' }

    await dispatchPublications(inputs, ready, request)

    expect(request).toHaveBeenCalledTimes(ready ? 2 : 1)
    expect(request.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { ref: 'main', inputs } })
    expect(request.mock.calls.some(([path]) => path.includes('release-new-app-version'))).toBe(ready)
  })

  it('still starts the other publication when one dispatch fails', async () => {
    const request = vi.fn<Request>().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined)

    await expect(
      dispatchPublications({ run_id: '42', run_attempt: '1', sha, version: '1.2.3' }, true, request),
    ).rejects.toThrow('publish-demo')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('reports the exact failed target run without requesting write access', async () => {
    const target = {
      ...run,
      repository: { full_name: 'tree-editor/tree-editor.github.io' },
      path: '.github/workflows/deploy-web-app.yml',
    }
    const request = vi.fn<Request>().mockResolvedValue({ workflow_runs: [{ ...target, conclusion: 'failure' }] })

    await expect(waitForDeployment(sha, request)).rejects.toThrow(
      'https://github.com/tree-editor/tree-editor.github.io/actions/runs/42',
    )
    expect(request.mock.calls.every(([, options]) => options === undefined)).toBe(true)
    request.mockResolvedValue({ workflow_runs: [target] })
    expect(await waitForDeployment(sha, request)).toContain('/42')
  })

  it('bounds public hosting polling below the anonymous hourly request budget', async () => {
    const request = vi.fn<Request>().mockResolvedValue({ workflow_runs: [] })
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(waitForDeployment(sha, request, wait)).rejects.toThrow('has not finished')

    expect(request).toHaveBeenCalledTimes(20)
    expect(wait).toHaveBeenCalledTimes(20)
    expect(wait).toHaveBeenCalledWith(30000)
  })

  describe('with the source token', () => {
    const target = {
      ...run,
      repository: { full_name: 'tree-editor/tree-editor.github.io' },
      path: '.github/workflows/deploy-web-app.yml',
    }
    const denial = (status: number, rateLimited = false) => Object.assign(new Error('denied'), { status, rateLimited })

    it('polls deployments outside the anonymous budget shared by runner addresses', async () => {
      const request = vi.fn<Request>().mockResolvedValue({ workflow_runs: [target] })

      expect(await waitForDeployment(sha, request, vi.fn(), 'source')).toContain('/42')

      expect(request).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(`head_sha=${sha}`), { token: 'source' })
    })

    it.each([401, 403, 404])('continues anonymously when GitHub refuses the token with %s', async (status) => {
      const request = vi
        .fn<Request>()
        .mockRejectedValueOnce(denial(status))
        .mockResolvedValueOnce({ workflow_runs: [] })
        .mockResolvedValue({ workflow_runs: [target] })
      const wait = vi.fn().mockResolvedValue(undefined)

      expect(await waitForDeployment(sha, request, wait, 'source')).toContain('/42')

      expect(request.mock.calls.map(([, options]) => options)).toEqual([{ token: 'source' }, undefined, undefined])
    })

    it.each([
      ['a rate limit', denial(403, true)],
      ['a server failure', denial(502)],
    ])('does not hide %s behind anonymous reads', async (_name, error) => {
      const request = vi.fn<Request>().mockRejectedValue(error)

      await expect(waitForDeployment(sha, request, vi.fn(), 'source')).rejects.toBe(error)

      expect(request).toHaveBeenCalledOnce()
    })
  })
})
