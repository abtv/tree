import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, verifySource } from './github.mjs'
import { createManifest, verifyPackage } from './package.mjs'
import { transferPackage, verifyIdentity } from './publish.mjs'
import { probeRejection, verifyHosted, verifyTarget } from './verify-target.mjs'

const identity = { sourceRepository: 'abtv/tree', sourceSha: 'a'.repeat(40), sourceRunId: '123', sourceRunAttempt: 2 }
async function fixture() {
  await mkdir('.scratch/web-release/remote-tests', { recursive: true })
  const dir = await mkdtemp('.scratch/web-release/remote-tests/case-')
  await mkdir(join(dir, 'assets'))
  await Promise.all(
    Object.entries({
      'index.html': '<script src="./assets/app.js"></script>',
      '.nojekyll': '',
      'assets/app.js': 'app',
      'assets/app.css': 'css',
      'assets/font.ttf': 'font',
    }).map(([path, content]) => writeFile(join(dir, path), content)),
  )
  const manifest = await createManifest(dir, identity)
  const manifestFile = `${dir}-provenance.json`
  const bundleFile = `${dir}-provenance.sigstore.json`
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(bundleFile, '{}')
  return { dir, manifest, manifestFile, bundleFile, attest: async () => manifest }
}
const goodRun = {
  repository: { full_name: 'abtv/tree' },
  path: '.github/workflows/release.yml',
  event: 'push',
  head_branch: 'main',
  head_sha: identity.sourceSha,
  run_attempt: 2,
  status: 'in_progress',
  conclusion: null,
}
const goodGate = { name: 'Release gate', status: 'completed', conclusion: 'success' }
function sourceRequest({ run = goodRun, sha = identity.sourceSha, jobs = [goodGate], paginated = false } = {}) {
  return vi.fn(async (path) => {
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha } }
    if (path.endsWith('/actions/runs/123')) return run
    if (path.includes('/jobs?'))
      return {
        total_count: jobs.length,
        jobs: paginated ? (path.endsWith('page=1') ? jobs.slice(0, 1) : jobs.slice(1)) : jobs,
      }
    throw new Error(`Unexpected test request ${path}`)
  })
}

describe('GitHub release trust', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('pins API origin and fails closed without printing response secrets', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    vi.stubGlobal('fetch', fetch)
    await expect(api('https://evil.test/repos/a/b/x', { token: 'secret' })).rejects.toThrow('Invalid')
    expect(fetch).not.toHaveBeenCalled()
    await expect(api('/repos/abtv/tree/pages', { token: 'secret' })).rejects.toThrow('GitHub API GET failed (403)')
    expect(fetch.mock.calls[0][0]).toBe('https://api.github.com/repos/abtv/tree/pages')
    expect(fetch.mock.calls[0][1].redirect).toBe('error')
  })
  it('recognizes explicit GitHub App permission denials without exposing response text', async () => {
    const path = '/repos/tree-editor/tree-editor.github.io/contents/.github/workflows/probe.yml'
    const refusal =
      'refusing to allow a GitHub App to create or update workflow `.github/workflows/probe.yml` without `workflows` permission'
    for (const [status, message, expected] of [
      [403, refusal, true],
      [403, 'API rate limit exceeded', false],
      [403, 'You have exceeded a secondary rate limit', false],
      [403, 'Resource not accessible by integration', true],
      [403, refusal.replace('probe.yml', 'other.yml'), false],
      [403, null, false],
      [404, refusal, undefined],
      [429, refusal, undefined],
      [500, refusal, undefined],
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message }), { status })))
      await expect(api(path, { token: 'secret', method: 'PUT', body: {} })).rejects.toMatchObject({
        status,
        message: `GitHub API PUT failed (${status})`,
        ...(expected === undefined ? {} : { workflowWriteDenied: expected }),
      })
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid JSON', { status: 403 })))
    await expect(api(path, { method: 'PUT' })).rejects.toMatchObject({ workflowWriteDenied: false })
  })
  it('checks source identity, current head, exact attempt and successful unique gate including pagination', async () => {
    const { manifest } = await fixture()
    const request = sourceRequest({ jobs: [{ name: 'other' }, goodGate], paginated: true })
    await expect(verifySource(manifest, { request })).resolves.toBeUndefined()
    expect(request.mock.calls.at(-1)[0]).toContain('/attempts/2/jobs?per_page=100&page=2')
    for (const override of [
      { event: 'pull_request' },
      { repository: { full_name: 'evil/tree' } },
      { head_branch: 'dev' },
      { head_sha: 'b'.repeat(40) },
      { run_attempt: 3 },
      { path: '.github/workflows/evil.yml' },
      { conclusion: 'failure' },
      { status: 'completed', conclusion: null },
    ])
      await expect(
        verifySource(manifest, { request: sourceRequest({ run: { ...goodRun, ...override } }) }),
      ).rejects.toThrow('Untrusted')
    await expect(verifySource(manifest, { request: sourceRequest({ sha: 'b'.repeat(40) }) })).rejects.toThrow('stale')
    for (const jobs of [
      [],
      [goodGate, goodGate],
      [{ ...goodGate, conclusion: 'failure' }],
      [{ ...goodGate, status: 'in_progress' }],
    ]) {
      await expect(verifySource(manifest, { request: sourceRequest({ jobs }) })).rejects.toThrow('gate')
    }
  })
  it('rejects identity changes and unsigned retained assets even with the obsolete retention option', async () => {
    const { dir, manifest } = await fixture()
    expect(() => verifyIdentity(manifest, { GITHUB_REPOSITORY: 'evil/tree' })).toThrow('identity')
    await writeFile(join(dir, 'assets/old.js'), 'old')
    await expect(verifyPackage(dir, manifest)).rejects.toThrow('differs')
    await expect(verifyPackage(dir, manifest, { allowRetainedAssets: true })).rejects.toThrow('differs')
    await writeFile(join(dir, 'provenance.json'), '{}')
    await expect(verifyPackage(dir, manifest, { allowRetainedAssets: true })).rejects.toThrow('Unexpected')
  })
})

describe('atomic package transfer', () => {
  it('checks hosted bytes with bounded propagation retries and reports failures after switching', async () => {
    const { dir, manifest } = await fixture()
    const contents = Object.fromEntries(
      await Promise.all(manifest.files.map(async (file) => [file.path, await readFile(join(dir, file.path))])),
    )
    const request = vi.fn(async (url, options) => {
      expect(url.origin).toBe('https://tree-editor.github.io')
      expect(url.searchParams.get('release')).toBe('123-2')
      expect(options.redirect).toBe('error')
      return new Response(url.searchParams.get('attempt') === '1' ? 'stale' : contents[url.pathname.slice(1)])
    })
    const wait = vi.fn().mockResolvedValue(undefined)
    await expect(verifyHosted(manifest, { request, wait })).resolves.toBeUndefined()
    expect(wait).toHaveBeenCalledExactlyOnceWith(10000)
    const unavailable = vi.fn().mockResolvedValue({ ok: false })
    const waits = vi.fn().mockResolvedValue(undefined)
    await expect(verifyHosted(manifest, { request: unavailable, wait: waits })).rejects.toThrow('Deployment switched')
    expect(unavailable).toHaveBeenCalledTimes(6)
    expect(waits).toHaveBeenCalledTimes(5)
  })
  async function targetFixture({ conflict = false, workflow = true, source = sourceRequest() } = {}) {
    const f = await fixture()
    const request = vi.fn(async (path, options = {}) => {
      if (path.startsWith('/repos/abtv/tree/')) return source(path, options)
      if (path.endsWith('/git/ref/heads/main')) return { object: { sha: 'b'.repeat(40) } }
      if (path.includes('/git/commits/') && options.method !== 'POST') return { tree: { sha: 'base-tree' } }
      if (path.includes('/git/trees/base-tree'))
        return {
          truncated: false,
          tree: [
            ...(workflow ? [{ path: '.github/workflows/pages.yml', mode: '100644', type: 'blob' }] : []),
            { path: 'README.md' },
            { path: 'site/assets/old.js' },
          ],
        }
      if (path.includes('/contents/.github/workflows/')) {
        const error = new Error('Workflow write denied')
        error.status = 403
        error.workflowWriteDenied = true
        throw error
      }
      if (path.endsWith('/contents/tree-publisher-permission-probe.txt')) return { content: { sha: 'probe' } }
      if (options.method === 'DELETE') return undefined
      if (options.method === 'PATCH') {
        if (conflict) throw new Error('GitHub API PATCH failed (422)')
        return {}
      }
      if (options.method === 'POST') return { sha: path.endsWith('/git/commits') ? 'c'.repeat(40) : 'new-object' }
      throw new Error('Unexpected target test request')
    })
    return { ...f, request }
  }
  it('preserves existing tree paths and appends one non-forced commit containing only allowlisted files', async () => {
    const { dir, manifest, request, ...auth } = await targetFixture()
    await transferPackage(dir, manifest, { ...auth, token: 'source', targetToken: 'target', request })
    expect(request.mock.calls.some(([path]) => path.endsWith('/pages'))).toBe(false)
    const tree = request.mock.calls.find(([path, opts]) => path.endsWith('/git/trees') && opts.body?.base_tree)[1].body
    expect(tree.base_tree).toBe('base-tree')
    expect(tree.tree.map((entry) => entry.path).sort()).toEqual(
      ['site', 'provenance.json', 'provenance.sigstore.json'].sort(),
    )
    const site = request.mock.calls.find(([path, opts]) => path.endsWith('/git/trees') && !opts.body?.base_tree)[1].body
    expect(site.tree.map((file) => file.path).sort()).toEqual(manifest.files.map((file) => file.path).sort())
    expect(site.tree.every((entry) => entry.mode === '100644' && entry.type === 'blob')).toBe(true)
    expect(tree.tree.find((entry) => entry.path === 'site').mode).toBe('040000')
    const commit = request.mock.calls.find(([path, opts]) => path.endsWith('/git/commits') && opts.method === 'POST')[1]
      .body
    expect(commit.parents).toEqual(['b'.repeat(40)])
    expect(request.mock.calls.at(-1)[1].body).toEqual({ sha: 'c'.repeat(40), force: false })
  })
  it('does not mutate target on rejected trust or missing setup and never retries a ref conflict', async () => {
    for (const options of [{ workflow: false }, { source: sourceRequest({ sha: 'd'.repeat(40) }) }]) {
      const { dir, manifest, request, ...auth } = await targetFixture(options)
      await expect(transferPackage(dir, manifest, { ...auth, targetToken: 'target', request })).rejects.toThrow()
      expect(request.mock.calls.some(([, opts]) => ['POST', 'PATCH'].includes(opts?.method))).toBe(false)
    }
    const { dir, manifest, request, ...auth } = await targetFixture({ conflict: true })
    await expect(transferPackage(dir, manifest, { ...auth, targetToken: 'target', request })).rejects.toThrow('422')
    expect(request.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')).toHaveLength(1)
  })
  it('target rechecks current target and source heads before permitting deployment without a source token', async () => {
    const { dir, manifest, attest } = await fixture()
    const file = `${dir}-provenance.json`
    await writeFile(file, JSON.stringify(manifest))
    const source = sourceRequest()
    const request = vi.fn(async (path, options) =>
      path.startsWith('/repos/tree-editor/') ? { object: { sha: 'b'.repeat(40) } } : source(path, options),
    )
    await expect(
      verifyTarget({ directory: dir, manifestFile: file, sha: 'b'.repeat(40), request, attest }),
    ).resolves.toEqual(manifest)
    expect(source.mock.calls.every(([, options]) => !options?.token)).toBe(true)
    await expect(
      verifyTarget({ directory: dir, manifestFile: file, sha: 'c'.repeat(40), request, attest }),
    ).rejects.toThrow('stale')
  })

  it('does not deploy a package when independent attestation verification rejects its manifest', async () => {
    const { dir, manifest } = await fixture()
    const file = `${dir}-provenance.json`
    await writeFile(file, JSON.stringify(manifest))
    const source = sourceRequest()
    const request = async (path, options) =>
      path.startsWith('/repos/tree-editor/') ? { object: { sha: 'b'.repeat(40) } } : source(path, options)
    await expect(
      verifyTarget({
        directory: dir,
        manifestFile: file,
        sha: 'b'.repeat(40),
        request,
        attest: async () => {
          throw new Error('Untrusted signature')
        },
      }),
    ).rejects.toThrow('Untrusted signature')
  })

  it('checks a real valid baseline before testing corrupted-copy rejection and restores local bytes', async () => {
    const { dir, manifest, attest } = await fixture()
    const file = `${dir}-provenance.json`
    const source = sourceRequest()
    const request = async (path, options) =>
      path.startsWith('/repos/tree-editor/') ? { object: { sha: 'b'.repeat(40) } } : source(path, options)
    const before = await readFile(join(dir, 'assets/app.js'))
    await expect(
      probeRejection({ directory: dir, manifestFile: file, sha: 'b'.repeat(40), request, attest }),
    ).resolves.toBeUndefined()
    expect(await readFile(join(dir, 'assets/app.js'))).toEqual(before)
    await expect(
      probeRejection({
        directory: dir,
        manifestFile: file,
        sha: 'b'.repeat(40),
        request,
        attest: async () => {
          throw new Error('Invalid baseline signature')
        },
      }),
    ).rejects.toThrow('Invalid baseline')
    expect(manifest.sourceSha).toBe(identity.sourceSha)
  })
})
