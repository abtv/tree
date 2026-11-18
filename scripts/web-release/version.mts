import { readFile, appendFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { compareVersions, packageVersion, parseVersion } from '../release-version.mts'
import { api } from './github.mts'
import { validateManifest } from './policy.mts'
import type { Blob, Request } from './types.mts'

const hosting = 'tree-editor/tree-editor.github.io'
const metadataLimit = 2_000_000

async function readJSON(path: string, request: Request, token?: string) {
  const blob = (await request(path, { token })) as Blob
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > metadataLimit) {
    throw new Error('Invalid version metadata')
  }
  return JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
}

async function readPublicProvenance() {
  // The source workflow cannot authenticate to the hosting repository. Resolve
  // the live Git ref, then read the immutable file outside the REST API quota.
  let refs: string
  try {
    refs = execFileSync('git', ['ls-remote', '--exit-code', `https://github.com/${hosting}.git`, 'refs/heads/main'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    })
  } catch {
    throw new Error('Could not resolve the public hosting branch')
  }

  const sha = /^([a-f0-9]{40})\trefs\/heads\/main$/.exec(refs.trim())?.[1]
  if (!sha) throw new Error('Invalid hosting commit')

  const response = await fetch(`https://raw.githubusercontent.com/${hosting}/${sha}/provenance.json`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok || !response.body) throw new Error(`Could not read public hosting metadata (${response.status})`)

  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > metadataLimit) throw new Error('Invalid hosting metadata size')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
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
  }: {
    request?: Request
    token?: string | undefined
    targetSha?: string
    targetToken?: string
    sourceSha?: string
  } = {},
) {
  parseVersion(version)
  if (targetSha !== undefined && !/^[a-f0-9]{40}$/.test(targetSha)) throw new Error('Invalid hosting commit')
  const previous = validateManifest(
    targetSha === undefined
      ? await readPublicProvenance()
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
