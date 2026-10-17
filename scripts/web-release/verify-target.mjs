import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { api, verifySource } from './github.mjs'
import { verifyPackage } from './package.mjs'
import { validateManifest } from './policy.mjs'
import { verifyAttestation } from './attestation.mjs'
import { join } from 'node:path'

export async function verifyHosted(manifest, { request = fetch, wait = setTimeout } = {}) {
  validateManifest(manifest)
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      for (const file of manifest.files) {
        if (file.path === '.nojekyll') continue // Hosting control file, not a public resource.
        const url = new URL(file.path, 'https://tree-editor.github.io/')
        url.search = new URLSearchParams({
          release: `${manifest.sourceRunId}-${manifest.sourceRunAttempt}`,
          attempt: String(attempt),
        }).toString()
        const response = await request(url, {
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) throw new Error('Hosted file is unavailable')
        const chunks = []
        let size = 0
        for await (const chunk of response.body) {
          size += chunk.byteLength
          if (size > file.size) {
            throw new Error('Hosted file exceeds expected size')
          }
          chunks.push(chunk)
        }
        const bytes = Buffer.concat(chunks)
        if (size !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
          throw new Error('Hosted file differs from release')
        }
      }
      return
    } catch {
      if (attempt === 6)
        throw new Error('Deployment switched, but hosted release verification failed; inspect Pages before retrying')
      await wait(10000)
    }
  }
}

export async function verifyTarget({
  directory = 'site',
  manifestFile = 'provenance.json',
  bundleFile = 'provenance.sigstore.json',
  sha,
  request = api,
  attest = verifyAttestation,
  token,
  toolsSha,
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid target candidate SHA')
  const head = await request('/repos/tree-editor/tree-editor.github.io/git/ref/heads/main', { token })
  if (head.object?.sha !== sha) throw new Error('Target release is stale')
  const manifest = await attest(manifestFile, bundleFile)
  if (toolsSha && toolsSha !== manifest.sourceSha) throw new Error('Trusted tools and release source differ')
  await verifyPackage(directory, manifest)
  await verifySource(manifest, { request })
  return manifest
}

export async function probeRejection(options) {
  const manifest = await verifyTarget(options)
  const file = join(options.directory, manifest.files.find((file) => file.path.endsWith('.js')).path)
  const bytes = await readFile(file)
  try {
    await appendFile(file, '\ncorrupted synthetic candidate')
    try {
      await verifyTarget(options)
    } catch (error) {
      if (error.message === 'Release package differs from manifest') return
      throw error
    }
    throw new Error('Corrupted package was accepted')
  } finally {
    await writeFile(file, bytes)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, root, ...extra] = process.argv.slice(2)
    if (!['verify', 'hosted', 'rejection-probe'].includes(command) || !root || extra.length)
      throw new Error('Invalid target verification arguments')
    const manifestFile = join(root, 'provenance.json')
    const bundleFile = join(root, 'provenance.sigstore.json')
    if (command === 'hosted') {
      await verifyHosted(await verifyAttestation(manifestFile, bundleFile))
    } else {
      if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
      const options = {
        directory: join(root, 'site'),
        manifestFile,
        bundleFile,
        sha: process.env.GITHUB_SHA,
        token: process.env.GH_TOKEN,
        toolsSha: process.env.TREE_RELEASE_TOOLS_SHA,
      }
      if (command === 'rejection-probe') {
        await probeRejection(options)
        console.log('PASS authenticated baseline accepted and corrupted candidate rejected; no deployment requested')
      } else {
        const manifest = await verifyTarget(options)
        await appendFile(process.env.GITHUB_OUTPUT, `source_sha=${manifest.sourceSha}\n`)
      }
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
