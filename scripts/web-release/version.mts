import { readFile, appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { compareVersions, packageVersion, parseVersion } from '../release-version.mts'
import { api } from './github.mts'
import { validateManifest } from './policy.mts'
import type { Blob, Reference, Request } from './types.mts'

async function readJSON(path: string, request: Request, token?: string) {
  const blob = (await request(path, { token })) as Blob
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > 2_000_000) {
    throw new Error('Invalid version metadata')
  }
  return JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
}

// Resolve the previous package version through its immutable source SHA. Legacy
// web packages already record that SHA, so migration needs no new manifest schema.
export async function isNewWebVersion(
  version: string,
  { request = api, token, targetSha }: { request?: Request; token?: string | undefined; targetSha?: string } = {},
) {
  parseVersion(version)
  const root = '/repos/tree-editor/tree-editor.github.io'
  const sha = targetSha ?? ((await request(`${root}/git/ref/heads/main`)) as Reference).object.sha
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid hosting commit')
  const previous = validateManifest(await readJSON(`${root}/contents/provenance.json?ref=${sha}`, request))
  const manifest = await readJSON(`/repos/abtv/tree/contents/package.json?ref=${previous.sourceSha}`, request, token)
  return compareVersions(version, manifest.version) > 0
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
