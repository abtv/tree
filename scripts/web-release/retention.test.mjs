import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createManifest, verifyPackage } from './package.mjs'
import { preparePackage } from './prepare.mjs'
import { validateManifest } from './policy.mjs'

const identity = { sourceRepository: 'abtv/tree', sourceSha: 'a'.repeat(40), sourceRunId: '10', sourceRunAttempt: 1 }

async function build(version) {
  await mkdir('.scratch/web-release/retention-tests', { recursive: true })
  const base = await mkdtemp('.scratch/web-release/retention-tests/case-')
  const dir = join(base, 'site')
  await mkdir(join(dir, 'assets'), { recursive: true })
  for (const [path, bytes] of Object.entries({
    'index.html': `<script src="./assets/app-${version}.js"></script>`,
    '.nojekyll': '',
    [`assets/app-${version}.js`]: `application ${version}`,
    [`assets/app-${version}.css`]: `/* style ${version} */`,
    'assets/font.ttf': 'shared font',
  }))
    await writeFile(join(dir, path), bytes)
  const manifest = await createManifest(dir, identity)
  const manifestFile = join(base, 'provenance.json')
  await writeFile(manifestFile, JSON.stringify(manifest))
  return { dir, manifest, manifestFile }
}

async function previous(fixture) {
  const blobs = new Map()
  const tree = []
  const contents = [
    ['provenance.json', Buffer.from(JSON.stringify(fixture.manifest))],
    ['provenance.sigstore.json', Buffer.from('{}')],
    ...(await Promise.all(
      fixture.manifest.files.map(async (file) => [`site/${file.path}`, await readFile(join(fixture.dir, file.path))]),
    )),
  ]
  for (const [path, bytes] of contents) {
    const sha = createHash('sha1').update(bytes).digest('hex')
    tree.push({ path, sha, mode: '100644', type: 'blob', size: bytes.length })
    blobs.set(sha, { encoding: 'base64', size: bytes.length, content: bytes.toString('base64') })
  }
  const request = vi.fn(async (path, options) => {
    expect(options?.method ?? 'GET').toBe('GET')
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: 'b'.repeat(40) } }
    if (path.includes('/git/commits/')) return { tree: { sha: 'tree' } }
    if (path.includes('/git/trees/')) return { truncated: false, tree }
    if (path.includes('/git/blobs/')) return blobs.get(path.split('/').at(-1))
    throw new Error('Unexpected request')
  })
  return { request, attest: async () => fixture.manifest, blobs, tree }
}

// @requirement PRODUCT.md §1.4
describe('bounded authenticated build retention', () => {
  it('keeps exactly three distinct asset sets through 100 publications and deduplicates the shared font', async () => {
    let last = await build(0)
    for (let version = 1; version < 100; version++) {
      const next = await build(version)
      const remote = await previous(last)
      next.manifest = await preparePackage(next.dir, next.manifestFile, remote)
      const versions = Array.from({ length: Math.min(3, version + 1) }, (_, i) => version - i)
      expect(next.manifest.files.map((file) => file.path).sort()).toEqual(
        [
          '.nojekyll',
          'index.html',
          'assets/font.ttf',
          ...versions.flatMap((n) => [`assets/app-${n}.js`, `assets/app-${n}.css`]),
        ].sort(),
      )
      await expect(verifyPackage(next.dir, next.manifest)).resolves.toEqual(next.manifest)
      last = next
    }
    expect(last.manifest.assetGenerations).toHaveLength(3)
  })

  it('does not consume a slot for identical assets and refreshes a returning build only once', async () => {
    let last = await build(1)
    for (const version of [2, 3, 3, 1, 1]) {
      const next = await build(version)
      next.manifest = await preparePackage(next.dir, next.manifestFile, await previous(last))
      last = next
    }
    expect(last.manifest.assetGenerations.map((paths) => paths.find((path) => path.endsWith('.js')))).toEqual([
      'assets/app-1.js',
      'assets/app-3.js',
      'assets/app-2.js',
    ])
  })

  it('migrates a legacy manifest as one conservative set and eventually evicts it', async () => {
    let last = await build('legacy')
    last.manifest.schema = 1
    delete last.manifest.assetGenerations
    for (const version of [1, 2, 3]) {
      const next = await build(version)
      next.manifest = await preparePackage(next.dir, next.manifestFile, await previous(last))
      expect(next.manifest.schema).toBe(2)
      expect(next.manifest.files.some((file) => file.path === 'assets/app-legacy.js')).toBe(version < 3)
      last = next
    }
  })

  it('rejects malformed signed retention metadata', async () => {
    const { manifest } = await build(1)
    const assets = manifest.files.filter((file) => file.path.startsWith('assets/')).map((file) => file.path)
    for (const generations of [
      [],
      [assets, assets],
      [assets, assets, assets, assets],
      [['index.html', ...assets]],
      [[...assets, 'assets/missing.js']],
      [assets.filter((path) => !path.endsWith('.js'))],
      [[...assets, assets[0]]],
    ]) {
      expect(() => validateManifest({ ...manifest, schema: 2, assetGenerations: generations })).toThrow()
    }
  })

  it('leaves the candidate unchanged when a retained file is corrupt', async () => {
    const old = await build(1)
    const next = await build(2)
    const remote = await previous(old)
    const entry = remote.tree.find((file) => file.path === 'site/assets/app-1.js')
    remote.blobs.get(entry.sha).content = Buffer.alloc(entry.size).toString('base64')
    await expect(preparePackage(next.dir, next.manifestFile, remote)).rejects.toThrow('authenticated manifest')
    await expect(verifyPackage(next.dir, next.manifest)).resolves.toEqual(next.manifest)
    expect(JSON.parse(await readFile(next.manifestFile, 'utf8'))).toEqual(next.manifest)
  })

  it('does not fetch evicted assets and rejects HTML referencing a non-current generation', async () => {
    let last = await build(1)
    for (const version of [2, 3]) {
      const next = await build(version)
      next.manifest = await preparePackage(next.dir, next.manifestFile, await previous(last))
      last = next
    }
    const remote = await previous(last)
    const evicted = remote.tree.find((file) => file.path === 'site/assets/app-1.js')
    remote.blobs.delete(evicted.sha)
    const next = await build(4)
    next.manifest = await preparePackage(next.dir, next.manifestFile, remote)
    expect(remote.request.mock.calls.some(([path]) => path.endsWith(`/git/blobs/${evicted.sha}`))).toBe(false)
    const wrong = { ...next.manifest, assetGenerations: [...next.manifest.assetGenerations].reverse() }
    await expect(verifyPackage(next.dir, wrong)).rejects.toThrow('non-current')
  })
})
