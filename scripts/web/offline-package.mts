import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function offlinePackage(directory: string) {
  const names = (await readdir(directory)).filter(
    (name) => name !== 'assets' && name !== '.nojekyll' && name !== 'sw.js',
  )
  names.push(...(await readdir(join(directory, 'assets'))).map((name) => `assets/${name}`))
  const files = []
  for (const path of names.sort()) {
    const bytes = await readFile(join(directory, path))
    files.push({ path, integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}` })
  }
  return { files, version: createHash('sha256').update(JSON.stringify(files)).digest('hex') }
}
