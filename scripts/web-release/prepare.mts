import type { Blob, Commit, Reference, Request, Tree, TreeEntry, CurrentManifest } from './types.mts'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { api } from './github.mts'
import { readMetadata, verifyAttestation, MAX_METADATA_BYTES } from './attestation.mts'
import { verifyPackage } from './package.mts'
import { assetPaths, MAX_ASSET_GENERATIONS, MAX_FILE_BYTES, validateManifest } from './policy.mts'

function decodeBlob(blob: Blob, limit: number) {
  if (
    blob.encoding !== 'base64' ||
    !Number.isSafeInteger(blob.size) ||
    blob.size < 0 ||
    blob.size > limit ||
    typeof blob.content !== 'string' ||
    blob.content.length > Math.ceil(limit / 3) * 4 + Math.ceil(limit / 40)
  ) {
    throw new Error('Invalid retained release blob')
  }
  const encoded = blob.content.replaceAll('\n', '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid retained blob encoding')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length !== blob.size) throw new Error('Invalid retained blob size')
  return bytes
}

export async function preparePackage(
  directory: string,
  manifestFile: string,
  { request = api, attest = verifyAttestation }: { request?: Request; attest?: typeof verifyAttestation } = {},
): Promise<CurrentManifest> {
  const current = validateManifest(await readMetadata(manifestFile))
  if (current.schema !== 2 || current.assetGenerations.length !== 1) {
    throw new Error('Preparation requires a fresh single-build manifest')
  }
  await verifyPackage(directory, current)
  const root = '/repos/tree-editor/tree-editor.github.io'
  const head = (await request(`${root}/git/ref/heads/main`)) as Reference
  const commit = (await request(`${root}/git/commits/${head.object.sha}`)) as Commit
  const listing = (await request(`${root}/git/trees/${commit.tree.sha}?recursive=1`)) as Tree
  if (listing.truncated || !Array.isArray(listing.tree)) throw new Error('Incomplete previous release tree')
  const entries = new Map(listing.tree.map((entry) => [entry.path, entry]))
  const previous = entries.get('provenance.json')
  const proof = entries.get('provenance.sigstore.json')
  if (!previous && !proof) {
    if (listing.tree.some((entry) => entry.path === 'site' || entry.path.startsWith('site/'))) {
      throw new Error('Previous site has no authenticated provenance')
    }
    return current
  }
  const get = async (entry: TreeEntry | undefined, limit: number) => {
    if (
      !entry ||
      entry.type !== 'blob' ||
      entry.mode !== '100644' ||
      !/^[a-f0-9]{40}$/.test(entry.sha) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > limit
    ) {
      throw new Error('Invalid previous release entry')
    }
    return decodeBlob((await request(`${root}/git/blobs/${entry.sha}`)) as Blob, limit)
  }
  const oldManifestFile = `${manifestFile}.previous`
  const oldBundleFile = `${manifestFile}.previous.sigstore.json`
  await writeFile(oldManifestFile, await get(previous, MAX_METADATA_BYTES))
  await writeFile(oldBundleFile, await get(proof, MAX_METADATA_BYTES))
  // Authenticate old hashes independently before promoting any bytes into the
  // newly signed manifest. Unsigned target data must never become trusted input.
  const old = await attest(oldManifestFile, oldBundleFile)
  validateManifest(old)
  // Legacy manifests have no build boundaries. Keep their entire authenticated
  // asset set as one generation until normal retention evicts it.
  const currentAssets = assetPaths(current)
  const previousGenerations = old.schema === 2 ? old.assetGenerations : [assetPaths(old)]
  const assetGenerations = [
    currentAssets,
    ...previousGenerations.filter((paths) => JSON.stringify([...paths].sort()) !== JSON.stringify(currentAssets)),
  ].slice(0, MAX_ASSET_GENERATIONS)
  const keep = new Set(assetGenerations.flat())
  const files = new Map(current.files.map((file) => [file.path, file]))
  const additions = []
  for (const file of old.files.filter((file) => file.path.startsWith('assets/'))) {
    const existing = files.get(file.path)
    if (existing) {
      if (existing.sha256 !== file.sha256 || existing.size !== file.size) throw new Error('Retained asset collision')
      continue
    }
    if (!keep.has(file.path)) continue
    additions.push(file)
    files.set(file.path, file)
  }
  const merged = validateManifest({
    ...current,
    assetGenerations,
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')),
  })
  // Check cumulative bounds before downloading or retaining old asset buffers.
  const retained = []
  for (const file of additions) {
    const bytes = await get(entries.get(`site/${file.path}`), MAX_FILE_BYTES)
    if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new Error('Retained asset differs from authenticated manifest')
    }
    retained.push({ path: file.path, bytes })
  }
  for (const file of retained) await writeFile(join(directory, file.path), file.bytes)
  await verifyPackage(directory, merged)
  await writeFile(manifestFile, `${JSON.stringify(merged, null, 2)}\n`)
  return merged as CurrentManifest
}
