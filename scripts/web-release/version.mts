import { readFile, appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { compareVersions, packageVersion, parseVersion } from '../release-version.mts'
import { api } from './github.mts'
import { withHostingRepository } from './hosting.mts'
import { validateManifest } from './policy.mts'
import type { Blob, Reference, Request } from './types.mts'

const hosting = 'tree-editor/tree-editor.github.io'
const metadataLimit = 2_000_000

async function readJSON(path: string, request: Request, token?: string) {
  const blob = (await request(path, { token })) as Blob
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > metadataLimit) {
    throw new Error('Invalid version metadata')
  }
  return JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
}

async function readPublicProvenance(remote?: string) {
  // The source workflow has no hosting credential. Read the live branch and its
  // immutable file over Git, outside the anonymous REST and raw-content limits.
  return withHostingRepository(async (request) => {
    const head = (await request(`/repos/${hosting}/git/ref/heads/main`)) as Reference
    return readJSON(`/repos/${hosting}/contents/provenance.json?ref=${head.object.sha}`, request)
  }, remote)
}

// Resolve the previous package version through its immutable source SHA. Legacy
// web packages already record that SHA, so migration needs no new manifest schema.
export async function isNewWebVersion(
  version: string,
  {
    request = api,
    token,
    targetSha,
    targetToken,
    sourceSha,
    hostingRemote,
  }: {
    request?: Request
    token?: string | undefined
    targetSha?: string
    targetToken?: string
    sourceSha?: string
    hostingRemote?: string
  } = {},
) {
  parseVersion(version)
  if (targetSha !== undefined && !/^[a-f0-9]{40}$/.test(targetSha)) throw new Error('Invalid hosting commit')
  const previous = validateManifest(
    targetSha === undefined
      ? await readPublicProvenance(hostingRemote)
      : await readJSON(`/repos/${hosting}/contents/provenance.json?ref=${targetSha}`, request, targetToken),
  )
  const manifest = await readJSON(`/repos/abtv/tree/contents/package.json?ref=${previous.sourceSha}`, request, token)
  const order = compareVersions(version, manifest.version)
  if (order === 0 && sourceSha && previous.sourceSha !== sourceSha) {
    throw new Error('Web release version belongs to another source commit')
  }
  return order > 0
}

export async function currentVersion() {
  return packageVersion(await Promise.all(['package.json', 'package-lock.json'].map((path) => readFile(path, 'utf8'))))
    .version
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const ready = await isNewWebVersion(await currentVersion(), { token: process.env.GH_TOKEN })
    if (!process.env.GITHUB_OUTPUT) throw new Error('Missing GITHUB_OUTPUT')
    await appendFile(process.env.GITHUB_OUTPUT, `ready=${ready}\n`)
    console.log(ready ? 'New web release version' : 'No new web release version')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
