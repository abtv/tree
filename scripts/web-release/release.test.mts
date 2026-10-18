import { mkdir, mkdtemp, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createManifest, verifyPackage } from './package.mts'
import { MAX_PACKAGE_BYTES, selectChecks, validateGate, validateManifest } from './policy.mts'

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
  const success = Object.fromEntries(
    ['changes', 'check', 'electron', 'audit', 'chrome', 'memory', 'demo'].map((key) => [key, { result: 'success' }]),
  )
  it('requires every mandatory check and every selected optional check to succeed', () => {
    expect(() => validateGate(success, { memoryRequired: true, demoRequired: true })).not.toThrow()
    for (const key of Object.keys(success)) {
      for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
        expect(() =>
          validateGate({ ...success, [key]: { result } }, { memoryRequired: true, demoRequired: true }),
        ).toThrow()
      }
    }
  })
  it('permits optional skipped jobs only when their path selector excludes them', () => {
    const skipped = { ...success, memory: { result: 'skipped' }, demo: { result: 'skipped' } }
    expect(() => validateGate(skipped, { memoryRequired: false, demoRequired: false })).not.toThrow()
    expect(() => validateGate(skipped, { memoryRequired: undefined, demoRequired: false })).toThrow()
    expect(() =>
      validateGate({ ...skipped, demo: { result: 'failure' } }, { memoryRequired: false, demoRequired: false }),
    ).toThrow()
  })
  it('matches the conditional workflow paths without making unrelated documentation run them', () => {
    expect(selectChecks(['docs/PRODUCT.md', '.github/workflows/web-release.yml'])).toEqual({
      memory: false,
      demo: false,
    })
    expect(selectChecks(['src/renderer/main.tsx'])).toEqual({ memory: false, demo: true })
    expect(selectChecks(['src/electron/main/index.ts'])).toEqual({ memory: false, demo: true })
    expect(selectChecks(['src/web/main.tsx', 'scripts/web/build.mts'])).toEqual({ memory: false, demo: false })
    expect(selectChecks(['e2e/electron/shared-application-memory.spec.ts'])).toEqual({ memory: true, demo: false })
    expect(selectChecks(['.github/workflows/e2e.yml'])).toEqual({ memory: true, demo: false })
    expect(selectChecks(['package-lock.json'])).toEqual({ memory: true, demo: true })
    expect(selectChecks(['e2e/electron/electron-entry.cjs'])).toEqual({ memory: true, demo: true })
  })
  it('revalidates both suites when publication policy changes, including migration from push-only selection', () => {
    for (const path of [
      '.github/workflows/release.yml',
      'scripts/web-release/selection.mts',
      'scripts/web-release/policy.mts',
    ]) {
      expect(selectChecks([path])).toEqual({ memory: true, demo: true })
    }
  })
})
