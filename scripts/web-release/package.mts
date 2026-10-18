import type { CurrentManifest, ReleaseFile, ReleaseIdentity } from './types.mts'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { allowedPath, assetPaths, MAX_FILE_BYTES, MAX_FILES, MAX_PACKAGE_BYTES, validateManifest } from './policy.mts'

export async function inspectPackage(directory: string) {
  const files: ReleaseFile[] = []
  let total = 0
  const root = await lstat(directory)
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid package directory')
  async function inspect(relative = ''): Promise<void> {
    for (const name of await readdir(join(directory, relative))) {
      const path = relative ? `${relative}/${name}` : name
      const stat = await lstat(join(directory, path))
      if (path === 'assets' && stat.isDirectory() && !stat.isSymbolicLink()) {
        await inspect(path)
        continue
      }
      if (!stat.isFile() || stat.isSymbolicLink() || !allowedPath(path) || stat.size > MAX_FILE_BYTES) {
        throw new Error(`Unexpected release entry: ${path}`)
      }
      if (files.length >= MAX_FILES) throw new Error('Too many release files')
      total += stat.size
      if (total > MAX_PACKAGE_BYTES) throw new Error('Release package is too large')
      const bytes = await readFile(join(directory, path))
      files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length })
    }
  }
  await inspect()
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  const html = await readFile(join(directory, 'index.html'), 'utf8')
  const paths = new Set(files.map((file) => file.path))
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
    if (!match[1]!.startsWith('./assets/') || !paths.has(match[1]!.slice(2))) {
      throw new Error('HTML contains a non-package asset reference')
    }
  }
  return files
}

export async function createManifest(
  directory: string,
  identity: { [K in keyof ReleaseIdentity]: ReleaseIdentity[K] | undefined },
): Promise<CurrentManifest> {
  const manifest = { ...identity, schema: 2, files: await inspectPackage(directory) }
  return validateManifest({ ...manifest, assetGenerations: [assetPaths(manifest)] }) as CurrentManifest
}

export async function verifyPackage(directory: string, input: unknown) {
  const manifest = validateManifest(input)
  const actual = await inspectPackage(directory)
  const expected = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path, 'en'))
  if (
    actual.length !== expected.length ||
    actual.some(
      (file, index) =>
        file.path !== expected[index]!.path ||
        file.sha256 !== expected[index]!.sha256 ||
        file.size !== expected[index]!.size,
    )
  ) {
    throw new Error('Release package differs from manifest')
  }
  if (manifest.schema === 2) {
    const current = new Set(manifest.assetGenerations[0])
    const html = await readFile(join(directory, 'index.html'), 'utf8')
    for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
      if (!current.has(match[1]!.slice(2))) throw new Error('HTML references a non-current asset')
    }
  }
  return manifest
}
