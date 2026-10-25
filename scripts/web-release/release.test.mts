import { mkdir, mkdtemp, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createManifest, verifyPackage } from './package.mts'
import { MAX_PACKAGE_BYTES, validateGate, validateManifest } from './policy.mts'

const identity = {
  sourceRepository: 'abtv/tree',
  sourceSha: 'a'.repeat(40),
  sourceRunId: '123',
  sourceRunAttempt: 1,
}

async function fixture() {
  const base = '.scratch/web-release/package-tests'
  await mkdir(base, { recursive: true })
  const dir = await mkdtemp(join(base, 'case-'))
  await mkdir(join(dir, 'assets'))
  await Promise.all(
    Object.entries({
      'index.html': '<script src="./assets/app.js"></script><link href="./assets/app.css">',
      '.nojekyll': '',
      'assets/app.js': 'console.log("Tree")',
      'assets/app.css': '@font-face{src:url(./font.woff2)}',
      'assets/font.woff2': 'font',
    }).map(([path, value]) => writeFile(join(dir, path), value)),
  )
  return dir
}

describe('release manifest and package', () => {
  it('verifies a complete immutable static package and rejects changed or added files', async () => {
    const dir = await fixture()
    const manifest = await createManifest(dir, identity)

    await expect(verifyPackage(dir, manifest)).resolves.toEqual(manifest)

    await writeFile(join(dir, 'assets/app.js'), 'changed')

    await expect(verifyPackage(dir, manifest)).rejects.toThrow('differs')

    await writeFile(join(dir, 'unexpected.txt'), 'unexpected')

    await expect(verifyPackage(dir, manifest)).rejects.toThrow('Unexpected')
  })

  it('rejects symlinks, nested directories and external or root-relative HTML assets', async () => {
    const linked = await fixture()

    await symlink('app.js', join(linked, 'assets/link.js'))

    await expect(createManifest(linked, identity)).rejects.toThrow('Unexpected')

    const nested = await fixture()

    await mkdir(join(nested, 'assets/nested'))

    await expect(createManifest(nested, identity)).rejects.toThrow('Unexpected')

    for (const ref of ['https://example.com/app.js', '/assets/app.js', '../app.js']) {
      const dir = await fixture()

      await writeFile(join(dir, 'index.html'), `<script src="${ref}"></script>`)

      await expect(createManifest(dir, identity)).rejects.toThrow('asset reference')
    }
  })

  it('accepts the exact installable-app root files and rejects other root names', async () => {
    const dir = await fixture()

    await writeFile(
      join(dir, 'index.html'),
      '<script src="./assets/app.js"></script><link rel="manifest" href="./manifest.webmanifest">' +
        '<link rel="apple-touch-icon" href="./apple-touch-icon.png">',
    )
    for (const name of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'sw.js']) {
      await writeFile(join(dir, name), name)
    }
    const manifest = await createManifest(dir, identity)

    expect(manifest.assetGenerations[0]!.some((path) => !path.startsWith('assets/'))).toBe(false)
    await expect(verifyPackage(dir, manifest)).resolves.toEqual(manifest)

    for (const name of ['other.html', 'other.js', 'icon.svg', 'icon-256.png', 'manifest.json', 'Icon-192.png']) {
      const other = await fixture()

      await writeFile(join(other, name), name)

      await expect(createManifest(other, identity)).rejects.toThrow('Unexpected')
    }
    const nested = await fixture()

    await mkdir(join(nested, 'icons'))
    await writeFile(join(nested, 'icons/icon-192.png'), 'icon')

    await expect(createManifest(nested, identity)).rejects.toThrow('Unexpected')

    const missing = await fixture()

    await writeFile(join(missing, 'index.html'), '<link rel="manifest" href="./manifest.webmanifest">')

    await expect(createManifest(missing, identity)).rejects.toThrow('asset reference')

    for (const ref of ['/manifest.webmanifest', 'manifest.webmanifest', './icons/icon-192.png']) {
      const dir = await fixture()

      await writeFile(join(dir, 'manifest.webmanifest'), '{}')
      await writeFile(join(dir, 'index.html'), `<link href="${ref}">`)

      await expect(createManifest(dir, identity)).rejects.toThrow('asset reference')
    }
  })

  it('rejects untrusted identities, duplicate/traversing paths and oversized manifests', async () => {
    const manifest = await createManifest(await fixture(), identity)

    for (const replacement of [
      { schema: 3 },
      { sourceRepository: 'other/tree' },
      { sourceSha: 'main' },
      { sourceRunId: '1e3' },
      { sourceRunAttempt: 0 },
      { files: [...manifest.files, manifest.files[0]] },
      { files: [{ ...manifest.files[0], path: 'assets/../app.js' }] },
      { files: manifest.files.map((file) => ({ ...file, size: MAX_PACKAGE_BYTES })) },
      { files: manifest.files.filter((file) => !file.path.endsWith('.woff2')) },
    ])
      expect(() => validateManifest({ ...manifest, ...replacement })).toThrow()
  })
})

describe('release gates', () => {
  const success = Object.fromEntries(['check', 'audit', 'chrome'].map((key) => [key, { result: 'success' }]))
  it('requires every Linux publication check to succeed', () => {
    expect(() => validateGate(success)).not.toThrow()

    for (const key of Object.keys(success)) {
      for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
        expect(() => validateGate({ ...success, [key]: { result } })).toThrow()
      }

      const missing = { ...success }
      delete missing[key]

      expect(() => validateGate(missing)).toThrow()
    }
  })
})
