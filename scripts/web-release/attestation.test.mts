import type { ApiOptions, Blob, CommandRunner, Manifest } from './types.mts'
import { mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createManifest, verifyPackage } from './package.mts'
import { verifyAttestation, verifyRetainedAttestation } from './attestation.mts'
import { preparePackage } from './prepare.mts'
import { verifyTarget } from './verify-target.mts'

const identity = { sourceRepository: 'abtv/tree', sourceSha: 'a'.repeat(40), sourceRunId: '10', sourceRunAttempt: 2 }
async function fixture() {
  await mkdir('.scratch/web-release/auth-tests', { recursive: true })
  const base = await mkdtemp('.scratch/web-release/auth-tests/case-')
  const dir = join(base, 'web')
  await mkdir(join(dir, 'assets'), { recursive: true })
  for (const [path, bytes] of Object.entries({
    'index.html': '<script src="./assets/app.js"></script>',
    '.nojekyll': '',
    'assets/app.js': 'safe',
    'assets/app.css': 'css',
    'assets/font.ttf': 'font',
  }))
    await writeFile(join(dir, path), bytes)
  const manifest = await createManifest(dir, identity)
  const manifestFile = join(base, 'provenance.json')
  const bundleFile = join(base, 'provenance.sigstore.json')
  await writeFile(manifestFile, JSON.stringify(manifest))
  await writeFile(bundleFile, '{}')
  return { base, dir, manifest, manifestFile, bundleFile }
}

// @requirement PRODUCT.md §1.4
describe('independent manifest authentication', () => {
  it('requires gh to verify exact signed bytes, source workflow, main ref, source digest and hosted runner', async () => {
    const f = await fixture()
    const run = vi.fn<CommandRunner>()

    await expect(verifyAttestation(f.manifestFile, f.bundleFile, { run })).resolves.toEqual(f.manifest)

    const [command, args] = run.mock.calls[0]!

    expect(command).toBe('gh')
    expect(args).toEqual([
      'attestation',
      'verify',
      expect.stringContaining('/provenance.json'),
      '--bundle',
      expect.stringContaining('/provenance.sigstore.json'),
      '--repo',
      'abtv/tree',
      '--signer-workflow',
      'abtv/tree/.github/workflows/release-web-app.yml',
      '--source-ref',
      'refs/heads/main',
      '--source-digest',
      identity.sourceSha,
      '--deny-self-hosted-runners',
    ])
    await expect(
      verifyAttestation(f.manifestFile, f.bundleFile, {
        run: () => {
          throw new Error('forged proof or wrong certificate identity')
        },
      }),
    ).rejects.toThrow('attestation verification failed')
  })

  it('accepts the historical signer only for retained assets and keeps all other trust constraints', async () => {
    const f = await fixture()
    const run = vi.fn<CommandRunner>((_command, args) => {
      if (!args.includes('abtv/tree/.github/workflows/release.yml')) throw new Error('Signer mismatch')
      return ''
    })

    await expect(verifyAttestation(f.manifestFile, f.bundleFile, { run })).rejects.toThrow('verification failed')
    expect(run).toHaveBeenCalledOnce()

    run.mockClear()

    await expect(verifyRetainedAttestation(f.manifestFile, f.bundleFile, { run })).resolves.toEqual(f.manifest)
    expect(run).toHaveBeenCalledTimes(2)

    const current = run.mock.calls[0]![1]
    const historical = run.mock.calls[1]![1]

    expect(historical).toEqual(current.map((arg) => arg.replace('release-web-app.yml', 'release.yml')))

    run.mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    await expect(verifyRetainedAttestation(f.manifestFile, f.bundleFile, { run })).rejects.toThrow(
      'verification failed',
    )
  })

  it('does not try the historical signer when the current signature verifies', async () => {
    const f = await fixture()
    const run = vi.fn<CommandRunner>()

    await expect(verifyRetainedAttestation(f.manifestFile, f.bundleFile, { run })).resolves.toEqual(f.manifest)
    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0]![1]).toContain('abtv/tree/.github/workflows/release-web-app.yml')
  })

  it('rejects missing proof and symlink metadata before invoking the signature verifier', async () => {
    const f = await fixture()
    const run = vi.fn<CommandRunner>()

    await expect(verifyAttestation(f.manifestFile, join(f.base, 'absent.json'), { run })).rejects.toThrow()

    const link = join(f.base, 'linked.json')

    await symlink(f.bundleFile.split('/').at(-1)!, link)

    await expect(verifyAttestation(f.manifestFile, link, { run })).rejects.toThrow('metadata')
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects changed bytes and arbitrary HTML/SVG retained assets regardless of caller options', async () => {
    for (const name of ['x.html', 'x.svg']) {
      const f = await fixture()
      const file = join(f.dir, 'assets', name)

      await writeFile(file, 'unsafe')

      // @ts-expect-error Exercise the obsolete JavaScript call shape; extra options must not bypass validation.
      await expect(verifyPackage(f.dir, f.manifest, { allowRetainedAssets: true })).rejects.toThrow('Unexpected')
    }
  })

  it('requires independent source tool SHA to agree with authenticated package source', async () => {
    const f = await fixture()

    await expect(
      verifyTarget({
        directory: f.dir,
        manifestFile: f.manifestFile,
        sha: 'b'.repeat(40),
        toolsSha: 'c'.repeat(40),
        request: async () => ({ object: { sha: 'b'.repeat(40) } }),
        attest: async () => f.manifest,
      }),
    ).rejects.toThrow('Trusted tools')
  })
})

describe('authenticated retained assets', () => {
  async function previousFixture() {
    const f = await fixture()
    const oldBytes = Buffer.from('previous verified application')
    const file = {
      path: 'assets/old.js',
      size: oldBytes.length,
      sha256: createHash('sha256').update(oldBytes).digest('hex'),
    }
    const { assetGenerations: _generations, ...legacy } = f.manifest
    const old: Manifest = {
      ...legacy,
      schema: 1,
      sourceSha: 'd'.repeat(40),
      sourceRunId: '9',
      files: [...f.manifest.files, file],
    }
    void _generations
    const blobs = new Map<string, Blob>()
    const tree: { path: string; type: string; sha?: string; mode?: string; size?: number }[] = []
    for (const [path, bytes] of [
      ['provenance.json', Buffer.from(JSON.stringify(old))],
      ['provenance.sigstore.json', Buffer.from('{}')],
      ['site/assets/old.js', oldBytes],
    ] as const) {
      const sha = createHash('sha1').update(path).digest('hex')
      tree.push({ path, sha, mode: '100644', type: 'blob', size: bytes.length })
      blobs.set(sha, { encoding: 'base64', size: bytes.length, content: bytes.toString('base64') })
    }
    const request = vi.fn(async (path: string, _options?: ApiOptions) => {
      void _options
      if (path.endsWith('/git/ref/heads/main')) return { object: { sha: 'b'.repeat(40) } }
      if (path.includes('/git/commits/')) return { tree: { sha: 'tree' } }
      if (path.includes('/git/trees/')) return { truncated: false, tree }
      if (path.includes('/git/blobs/')) return blobs.get(path.split('/').at(-1)!)
      throw new Error('Unexpected API path')
    })
    return { ...f, old, oldBytes, file, tree, blobs, request }
  }

  it('retains only independently authenticated old bytes and commits them to the new manifest', async () => {
    const f = await previousFixture()
    const attest = vi.fn(async (manifestFile: string, bundleFile: string) => {
      expect(JSON.parse(await readFile(manifestFile, 'utf8'))).toEqual(f.old)
      expect(JSON.parse(await readFile(bundleFile, 'utf8'))).toEqual({})

      return f.old
    })
    const merged = await preparePackage(f.dir, f.manifestFile, { request: f.request, attest })

    expect(attest).toHaveBeenCalledOnce()
    expect(merged.sourceSha).toBe(identity.sourceSha)
    expect(merged.files).toContainEqual(f.file)
    expect(await readFile(join(f.dir, f.file.path))).toEqual(f.oldBytes)
    await expect(verifyPackage(f.dir, merged)).resolves.toEqual(merged)
  })

  it('never promotes target-supplied hashes when the old signature is invalid', async () => {
    const f = await previousFixture()

    await expect(
      preparePackage(f.dir, f.manifestFile, {
        request: f.request,
        attest: async () => {
          throw new Error('bad signature')
        },
      }),
    ).rejects.toThrow('bad signature')
    await expect(readFile(join(f.dir, f.file.path))).rejects.toThrow()
    expect(JSON.parse(await readFile(f.manifestFile, 'utf8'))).toEqual(f.manifest)
  })

  it('rejects tampered bytes, oversized metadata, missing proof and hash collisions', async () => {
    for (const fault of ['bytes', 'metadata', 'proof', 'collision']) {
      const f = await previousFixture()
      if (fault === 'bytes')
        f.blobs.get(f.tree[2]!.sha!)!.content = Buffer.alloc(f.oldBytes.length, 1).toString('base64')
      if (fault === 'metadata') f.tree[0]!.size = 2 * 1024 * 1024
      if (fault === 'proof') f.tree.splice(1, 1)
      if (fault === 'collision') f.old.files.find((file) => file.path === 'assets/app.js')!.sha256 = '0'.repeat(64)

      await expect(
        preparePackage(f.dir, f.manifestFile, { request: f.request, attest: async () => f.old }),
      ).rejects.toThrow()
      await expect(readFile(join(f.dir, f.file.path))).rejects.toThrow()
    }
  })

  it('allows genuine first publication but refuses an existing unsigned site', async () => {
    const f = await previousFixture()

    f.tree.splice(0)

    await expect(preparePackage(f.dir, f.manifestFile, { request: f.request })).resolves.toEqual(f.manifest)

    f.tree.push({ path: 'site', type: 'tree' })

    await expect(preparePackage(f.dir, f.manifestFile, { request: f.request })).rejects.toThrow('no authenticated')
  })

  it('checks cumulative authenticated history bounds before fetching retained assets', async () => {
    const f = await previousFixture()

    await writeFile(join(f.dir, 'assets/current.js'), Buffer.alloc(2 * 1024 * 1024))
    const current = await createManifest(f.dir, identity)

    await writeFile(f.manifestFile, JSON.stringify(current))
    f.old.files = f.manifest.files.concat(
      [1, 2, 3].map((n) => ({
        path: `assets/old-${n}.js`,
        sha256: '0'.repeat(64),
        size: 8 * 1024 * 1024,
      })),
    )

    await expect(
      preparePackage(f.dir, f.manifestFile, {
        request: f.request,
        attest: async () => f.old,
      }),
    ).rejects.toThrow('oversized')
    expect(f.request.mock.calls.filter(([path]) => path.includes('/git/blobs/'))).toHaveLength(2)
  })
})
