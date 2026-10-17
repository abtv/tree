import { execFileSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateManifest } from './policy.mjs'

export const MAX_METADATA_BYTES = 1024 * 1024

export async function readMetadata(file) {
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_METADATA_BYTES) {
    throw new Error('Invalid release metadata file')
  }
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function verifyAttestation(manifestFile, bundleFile, { run = execFileSync } = {}) {
  const manifest = validateManifest(await readMetadata(manifestFile))
  await readMetadata(bundleFile)
  // gh verifies Sigstore trust, the subject's exact bytes and certificate claims.
  // A target-supplied predicate or decoded certificate is never accepted as proof.
  const args = [
    'attestation',
    'verify',
    resolve(manifestFile),
    '--bundle',
    resolve(bundleFile),
    '--repo',
    'abtv/tree',
    '--signer-workflow',
    'abtv/tree/.github/workflows/release.yml',
    '--source-ref',
    'refs/heads/main',
    '--source-digest',
    manifest.sourceSha,
    '--deny-self-hosted-runners',
  ]
  try {
    run('gh', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
  } catch {
    throw new Error('Release attestation verification failed')
  }
  return manifest
}
