import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, lstat, readFile, writeFile } from 'node:fs/promises'
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

export async function updateMetadata(version: string, zipFile: string): Promise<string> {
  await installerDigest(zipFile)
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(zipFile)) hash.update(chunk)
  const sha512 = hash.digest('base64')
  const zip = `Tree-${version}-arm64.zip`
  // JSON is valid YAML. The separately stapled DMG is only for manual installation.
  return (
    JSON.stringify(
      { version, files: [{ url: zip, sha512, size: (await lstat(zipFile)).size }], path: zip, sha512 },
      null,
      2,
    ) + '\n'
  )
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
  const zip = `Tree-${version}-arm64.zip`
  const zipFile = `dist/${zip}`
  const metadataFile = 'dist/latest-mac.yml'
  if (command === 'record') {
    await writeFile(metadataFile, await updateMetadata(version, zipFile))
  }
  const zipSha256 = await installerDigest(
    zipFile,
    command === 'verify' ? (process.env.EXPECTED_ZIP_SHA256 ?? '') : undefined,
  )
  const metadataSha256 = await installerDigest(
    metadataFile,
    command === 'verify' ? (process.env.EXPECTED_METADATA_SHA256 ?? '') : undefined,
  )
  await appendFile(process.env.GITHUB_OUTPUT!, `sha256=${sha256}\nfile=${file}\n`)
  await appendFile(process.env.GITHUB_OUTPUT!, `zip_sha256=${zipSha256}\nmetadata_sha256=${metadataSha256}\n`)
  console.log(`Installer ${command === 'verify' ? 'verified' : 'recorded'}: ${file} (${sha256})`)
}
