import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withHostingRepository } from './hosting.mts'
import { hostingRemote } from './hosting-remote.fixture.mts'
import { createManifest } from './package.mts'
import { preparePackage } from './prepare.mts'
import type { Blob, Manifest, Reference, Tree } from './types.mts'

const root = '/repos/tree-editor/tree-editor.github.io'
const decode = (blob: unknown) => Buffer.from((blob as Blob).content, 'base64').toString('utf8')
const exhaustedRestBudget = () =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ message: 'API rate limit exceeded for 192.0.2.1.' }), {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) },
      }),
  )

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('public hosting repository reader', () => {
  it('serves the hosting Git data that release checks read without the REST API', async () => {
    const remote = await hostingRemote({
      'provenance.json': '{"schema":2}',
      'site/.nojekyll': '',
      'site/assets/app ö "one".js': 'application',
    })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const result = await withHostingRepository(async (request) => {
      const head = (await request(`${root}/git/ref/heads/main`)) as Reference
      const commit = (await request(`${root}/git/commits/${head.object.sha}`)) as { tree: { sha: string } }
      const tree = (await request(`${root}/git/trees/${commit.tree.sha}?recursive=1`)) as Tree
      const asset = tree.tree.find((entry) => entry.path === 'site/assets/app ö "one".js')!
      return {
        head: head.object.sha,
        tree: commit.tree.sha,
        listing: tree,
        asset: decode(await request(`${root}/git/blobs/${asset.sha}`)),
        provenance: decode(await request(`${root}/contents/provenance.json?ref=${head.object.sha}`)),
      }
    }, remote.url)

    expect(result).toEqual({
      head: remote.commit,
      tree: remote.tree,
      listing: {
        truncated: false,
        tree: [
          {
            path: 'provenance.json',
            mode: '100644',
            type: 'blob',
            sha: remote.git('rev-parse', 'main:provenance.json'),
            size: 12,
          },
          {
            path: 'site/.nojekyll',
            mode: '100644',
            type: 'blob',
            sha: remote.git('rev-parse', 'main:site/.nojekyll'),
            size: 0,
          },
          {
            path: 'site/assets/app ö "one".js',
            mode: '100644',
            type: 'blob',
            sha: remote.git('rev-parse', 'main:site/assets/app ö "one".js'),
            size: 11,
          },
        ],
      },
      asset: 'application',
      provenance: '{"schema":2}',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses writes and paths outside the supported hosting reads', async () => {
    const remote = await hostingRemote({ 'provenance.json': '{}' })
    const sha = remote.commit

    await withHostingRepository(async (request) => {
      for (const [path, options] of [
        [`${root}/git/refs/heads/main`, { method: 'PATCH' }],
        [`${root}/git/blobs/${sha}`, { method: 'POST' }],
        [`${root}/contents/../provenance.json?ref=${sha}`, {}],
        [`${root}/contents/-provenance.json?ref=${sha}`, {}],
        [`${root}/contents/provenance.json?ref=main`, {}],
        [`/repos/abtv/tree/git/ref/heads/main`, {}],
        [`${root}/actions/workflows/deploy-web-app.yml/runs`, {}],
      ] as const) {
        await expect(request(path, options)).rejects.toThrow('Unsupported hosting repository request')
      }
    }, remote.url)
  })

  it('reads a published commit after the branch has moved past it', async () => {
    const remote = await hostingRemote({ 'provenance.json': '{"schema":2}' })
    const next = remote.git('commit-tree', remote.tree, '-p', remote.commit, '-m', 'Next release')
    remote.git('update-ref', 'refs/heads/main', next)

    const provenance = await withHostingRepository(
      async (request) => decode(await request(`${root}/contents/provenance.json?ref=${remote.commit}`)),
      remote.url,
    )

    expect(provenance).toBe('{"schema":2}')
  })

  it('returns file contents only for a regular file, like the Contents API', async () => {
    const remote = await hostingRemote({ 'provenance.json': { link: 'README.md' }, 'README.md': '{}' })

    await expect(
      withHostingRepository((request) => request(`${root}/contents/provenance.json?ref=${remote.commit}`), remote.url),
    ).rejects.toThrow('Invalid hosting file')
  })

  it('fails closed without Git diagnostics and retries only network failures', async () => {
    const remote = await hostingRemote({ 'README.md': 'hosting' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await withHostingRepository(async (request) => {
      await expect(request(`${root}/contents/provenance.json?ref=${remote.commit}`)).rejects.toThrow(
        /^Could not read the public hosting repository$/,
      )

      remote.git('update-ref', '-d', 'refs/heads/main')

      await expect(request(`${root}/git/ref/heads/main`)).rejects.toThrow(
        /^Could not read the public hosting repository$/,
      )
    }, remote.url)

    expect(log).not.toHaveBeenCalled()

    await expect(
      withHostingRepository((request) => request(`${root}/git/ref/heads/main`), `${remote.url}-missing`),
    ).rejects.toThrow(/^Could not read the public hosting repository$/)

    expect(log.mock.calls).toEqual([
      ['Hosting repository read failed; retrying in 1000ms'],
      ['Hosting repository read failed; retrying in 2000ms'],
    ])
    log.mockRestore()
  }, 15000)
})

describe('retained asset preparation', () => {
  it('reads the previous release over Git when the anonymous REST budget is exhausted', async () => {
    await mkdir('.scratch/web-release/hosting-tests', { recursive: true })
    const base = await mkdtemp('.scratch/web-release/hosting-tests/package-')
    const dir = join(base, 'web')
    await mkdir(join(dir, 'assets'), { recursive: true })
    for (const [path, bytes] of Object.entries({
      'index.html': '<script src="./assets/app.js"></script>',
      '.nojekyll': '',
      'assets/app.js': 'current',
      'assets/app.css': 'css',
      'assets/font.ttf': 'font',
    }))
      await writeFile(join(dir, path), bytes)
    const identity = {
      sourceRepository: 'abtv/tree',
      sourceSha: 'a'.repeat(40),
      sourceRunId: '10',
      sourceRunAttempt: 1,
    }
    const manifest = await createManifest(dir, identity)
    const manifestFile = join(base, 'provenance.json')
    await writeFile(manifestFile, JSON.stringify(manifest))
    const oldBytes = Buffer.from('previous verified application')
    const file = {
      path: 'assets/old.js',
      size: oldBytes.length,
      sha256: createHash('sha256').update(oldBytes).digest('hex'),
    }
    const { assetGenerations: _generations, ...legacy } = manifest
    void _generations
    const old: Manifest = { ...legacy, schema: 1, sourceSha: 'd'.repeat(40), files: [...manifest.files, file] }
    const remote = await hostingRemote({
      'provenance.json': JSON.stringify(old),
      'provenance.sigstore.json': '{}',
      'site/assets/old.js': oldBytes,
    })
    const fetch = exhaustedRestBudget()
    vi.stubGlobal('fetch', fetch)

    const merged = await preparePackage(dir, manifestFile, { attest: async () => old, remote: remote.url })

    expect(merged.files).toContainEqual(file)
    expect(await readFile(join(dir, file.path))).toEqual(oldBytes)
    expect(fetch).not.toHaveBeenCalled()
  })
})
