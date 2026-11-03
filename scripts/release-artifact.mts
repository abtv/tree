import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, lstat, readFile } from 'node:fs/promises'
import { packageVersion } from './release-version.mts'

export async function installerDigest(file: string, expected?: string): Promise<string> {
  if (expected !== undefined && (expected.length !== 64 || !/^[a-f0-9]{64}$/.test(expected)))
    throw new Error('Invalid expected installer digest')
  const info = await lstat(file)
  if (!info.isFile() || info.size === 0) throw new Error('Installer must be a nonempty regular file')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  const digest = hash.digest('hex')
  if (expected !== undefined && digest !== expected) throw new Error('Installer digest mismatch')
  return digest
}

if (import.meta.main) {
  const [command, ...extra] = process.argv.slice(2)
  if (!['record', 'verify'].includes(command ?? '') || extra.length)
    throw new Error('Usage: release-artifact.mts record|verify')
  const { version } = packageVersion(
    await Promise.all(['package.json', 'package-lock.json'].map((file) => readFile(file, 'utf8'))),
  )
  const file = `dist/Tree-${version}-arm64.dmg`
  const expected = command === 'verify' ? (process.env.EXPECTED_DMG_SHA256 ?? '') : undefined
  const sha256 = await installerDigest(file, expected)
  await appendFile(process.env.GITHUB_OUTPUT!, `sha256=${sha256}\nfile=${file}\n`)
  console.log(`Installer ${command === 'verify' ? 'verified' : 'recorded'}: ${file} (${sha256})`)
}
