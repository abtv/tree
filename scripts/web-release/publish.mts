import type { Commit, Manifest, Reference, Request, Sha, Tree } from './types.mts'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { api, verifySource } from './github.mts'
import { verifyPackage } from './package.mts'
import { verifyAttestation } from './attestation.mts'
import { assertWorkflowWriteDenied } from './permission-check.mts'

export async function transferPackage(
  directory: string,
  manifest: Manifest,
  {
    token,
    targetToken,
    request = api,
    targetRepository = 'tree-editor/tree-editor.github.io',
    manifestFile,
    bundleFile,
    attest = verifyAttestation,
  }: {
    token?: string | undefined
    targetToken?: string | undefined
    request?: Request
    targetRepository?: string
    manifestFile: string
    bundleFile: string
    attest?: typeof verifyAttestation
  },
) {
  const signed = await attest(manifestFile, bundleFile)
  if (JSON.stringify(signed) !== JSON.stringify(manifest)) throw new Error('Signed manifest differs from transfer')
  await verifyPackage(directory, manifest)
  await verifySource(manifest, { token, request })
  if (!targetToken || targetRepository !== 'tree-editor/tree-editor.github.io')
    throw new Error('Missing or invalid target authorization')
  const root = `/repos/${targetRepository}`
  const options = { token: targetToken }
  // Setup switches Pages before installing this workflow. The Contents-only
  // publisher cannot inspect or change Pages settings; do not broaden its token.
  const base = (await request(`${root}/git/ref/heads/main`, options)) as Reference
  const commit = (await request(`${root}/git/commits/${base.object.sha}`, options)) as Commit
  const existing = (await request(`${root}/git/trees/${commit.tree.sha}?recursive=1`, options)) as Tree
  if (
    existing.truncated ||
    !existing.tree?.some(
      (entry) => entry.path === '.github/workflows/pages.yml' && entry.type === 'blob' && entry.mode === '100644',
    )
  ) {
    throw new Error('Trusted target workflow is missing')
  }
  await assertWorkflowWriteDenied(root, base.object.sha, manifest, { request, token: targetToken })
  const tree = []
  for (const file of manifest.files) {
    const blob = await request(`${root}/git/blobs`, {
      ...options,
      method: 'POST',
      body: {
        content: (await readFile(join(directory, file.path))).toString('base64'),
        encoding: 'base64',
      },
    })
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: (blob as Sha).sha })
  }
  const site = await request(`${root}/git/trees`, { ...options, method: 'POST', body: { tree } })
  const provenance = await request(`${root}/git/blobs`, {
    ...options,
    method: 'POST',
    body: {
      content: (await readFile(manifestFile)).toString('base64'),
      encoding: 'base64',
    },
  })
  const proof = await request(`${root}/git/blobs`, {
    ...options,
    method: 'POST',
    body: { content: (await readFile(bundleFile)).toString('base64'), encoding: 'base64' },
  })
  const updated = await request(`${root}/git/trees`, {
    ...options,
    method: 'POST',
    body: {
      base_tree: commit.tree.sha,
      tree: [
        { path: 'site', mode: '040000', type: 'tree', sha: (site as Sha).sha },
        { path: 'provenance.json', mode: '100644', type: 'blob', sha: (provenance as Sha).sha },
        { path: 'provenance.sigstore.json', mode: '100644', type: 'blob', sha: (proof as Sha).sha },
      ],
    },
  })
  const next = await request(`${root}/git/commits`, {
    ...options,
    method: 'POST',
    body: {
      message: `build(web): Publish source ${manifest.sourceSha}`,
      tree: (updated as Sha).sha,
      parents: [base.object.sha],
    },
  })
  // A concurrent target update makes this non-fast-forward request fail without changing main.
  await request(`${root}/git/refs/heads/main`, {
    ...options,
    method: 'PATCH',
    body: { sha: (next as Sha).sha, force: false },
  })
  return (next as Sha).sha
}

export function verifyIdentity(manifest: Manifest, env: NodeJS.ProcessEnv) {
  if (
    env.GITHUB_REPOSITORY !== manifest.sourceRepository ||
    env.GITHUB_SHA !== manifest.sourceSha ||
    env.GITHUB_RUN_ID !== manifest.sourceRunId ||
    env.GITHUB_RUN_ATTEMPT !== String(manifest.sourceRunAttempt)
  ) {
    throw new Error('Release identity differs from the current run')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, directory, file, ...extra] = process.argv.slice(2)
    if (!['preflight', 'transfer'].includes(command!) || !directory || !file || extra.length)
      throw new Error('Invalid publish arguments')
    const bundleFile = file.replace(/\.json$/, '.sigstore.json')
    if (bundleFile === file) throw new Error('Manifest must have a JSON suffix')
    const manifest = await verifyAttestation(file, bundleFile)
    await verifyPackage(directory, manifest)
    verifyIdentity(manifest, process.env)
    if (command === 'preflight') await verifySource(manifest, { token: process.env.GH_TOKEN })
    else
      await transferPackage(directory, manifest, {
        token: process.env.GH_TOKEN,
        targetToken: process.env.WEB_TARGET_TOKEN,
        manifestFile: file,
        bundleFile,
      })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
