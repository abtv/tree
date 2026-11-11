import { execFileSync } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function buildImageToText(platform = process.platform, arch = process.arch): Promise<void> {
  if (platform !== 'darwin' || arch !== 'arm64') return
  const source = resolve('src/electron/native/image-to-text.swift')
  const directory = resolve('out/native')
  const binary = resolve(directory, 'tree-image-to-text')
  const output = await stat(binary).catch(() => undefined)
  const buildScript = new URL(import.meta.url)
  if (
    output === undefined ||
    output.mtimeMs < Math.max((await stat(source)).mtimeMs, (await stat(buildScript)).mtimeMs)
  ) {
    await mkdir(directory, { recursive: true })
    // Swift and its Clang importer must not write their module cache outside the workspace.
    const moduleCache = resolve('.scratch/image-to-text/swift-cache')
    await mkdir(moduleCache, { recursive: true })
    console.log('Building Apple Vision image-to-text helper…')
    execFileSync(
      'xcrun',
      [
        'swiftc',
        '-O',
        '-target',
        'arm64-apple-macos13.0',
        '-module-cache-path',
        moduleCache,
        '-framework',
        'Vision',
        '-framework',
        'ImageIO',
        source,
        '-o',
        binary,
      ],
      {
        stdio: 'inherit',
      },
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildImageToText()
