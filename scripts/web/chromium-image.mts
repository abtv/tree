import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')

export function dependencyImage(packageBytes: Uint8Array, lockBytes: Uint8Array, ...recipeBytes: Uint8Array[]) {
  const manifest = JSON.parse(Buffer.from(packageBytes).toString()) as Record<string, unknown>
  // npm scripts and descriptive metadata do not affect an --ignore-scripts install.
  const installation = Object.fromEntries(
    [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
      'overrides',
      'engines',
      'packageManager',
    ].map((key) => [key, manifest[key]]),
  )
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        installation,
        Buffer.from(lockBytes).toString(),
        ...recipeBytes.map((bytes) => Buffer.from(bytes).toString()),
      ]),
    )
    .digest('hex')
  return `tree-chromium-tests:${digest}`
}

export function currentDependencyImage() {
  return dependencyImage(
    readFileSync(resolve(root, 'package.json')),
    readFileSync(resolve(root, 'package-lock.json')),
    readFileSync(resolve(root, 'scripts/web/chromium.Dockerfile')),
    readFileSync(resolve(root, 'scripts/web/chromium.Dockerfile.dockerignore')),
    readFileSync(resolve(root, 'Makefile')),
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) console.log(currentDependencyImage())
