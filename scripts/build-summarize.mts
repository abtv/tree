import { execFileSync } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function buildSummarize(platform = process.platform, arch = process.arch): Promise<void> {
  if (platform !== 'darwin' || arch !== 'arm64') return
  const source = resolve('src/electron/native/summarize.swift')
  const binary = resolve('out/native/tree-summarize')
  const output = await stat(binary).catch(() => undefined)
  if (
    output &&
    output.mtimeMs >= Math.max((await stat(source)).mtimeMs, (await stat(new URL(import.meta.url))).mtimeMs)
  )
    return
  const cache = resolve('.scratch/summarize/swift-cache')
  await mkdir(resolve('out/native'), { recursive: true })
  await mkdir(cache, { recursive: true })
  console.log('Building on-device Apple summarization helper…')
  execFileSync(
    'xcrun',
    [
      'swiftc',
      '-parse-as-library',
      '-O',
      '-target',
      'arm64-apple-macos13.0',
      '-module-cache-path',
      cache,
      source,
      '-o',
      binary,
    ],
    { stdio: 'inherit' },
  )
}
