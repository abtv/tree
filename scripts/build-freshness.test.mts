import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertFreshBuild } from './build-freshness.mts'

const temporaryDirectories: string[] = []

function writeAt(root: string, path: string, seconds: number) {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, '')
  utimesSync(file, seconds, seconds)
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'tree-build-freshness-'))
  temporaryDirectories.push(root)
  writeAt(root, 'src/renderer/App.tsx', 1000)
  writeAt(root, 'src/web/nested/entry.ts', 1000)
  return root
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('assertFreshBuild', () => {
  it('accepts a build newer than every source file', async () => {
    const root = createRepository()
    writeAt(root, 'out/web/index.html', 2000)
    writeAt(root, 'out/main/index.js', 2000)

    await expect(assertFreshBuild('web', root)).resolves.toBeUndefined()
    await expect(assertFreshBuild('electron', root)).resolves.toBeUndefined()
  })

  it('rejects a build older than a nested source file and names the build command', async () => {
    const root = createRepository()
    writeAt(root, 'out/web/index.html', 2000)
    writeAt(root, 'out/main/index.js', 2000)
    writeAt(root, 'src/web/nested/entry.ts', 3000)

    await expect(assertFreshBuild('web', root)).rejects.toThrow(
      'out/web/index.html is older than src/; run npm run build:web before this smoke check',
    )
    await expect(assertFreshBuild('electron', root)).rejects.toThrow(
      'out/main/index.js is older than src/; run npm run build before this smoke check',
    )
  })

  it('rejects a missing build', async () => {
    const root = createRepository()

    await expect(assertFreshBuild('web', root)).rejects.toThrow(
      'Missing out/web/index.html; run npm run build:web before this smoke check',
    )
  })
})
