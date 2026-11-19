import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { api } from './github.mts'
import { withHostingRepository } from './hosting.mts'
import { verifyAttestation } from './attestation.mts'
import { currentVersion, isNewWebVersion } from './version.mts'
import { dispatchedSource } from '../publication.mts'
import { requireReleaseSource } from '../release-source.mts'
import type { ApiError, Blob, Reference, Request, WorkflowRun } from './types.mts'

const root = '/repos/tree-editor/tree-editor.github.io'

export async function publicationHead(transferredSha: string | undefined, request: Request) {
  if (transferredSha) {
    if (!/^[a-f0-9]{40}$/.test(transferredSha)) throw new Error('Invalid transferred commit')
    return transferredSha
  }

  const head = (await request(`${root}/git/ref/heads/main`)) as Reference
  return head.object.sha
}

export async function waitForDeployment(sha: string, request: Request = api, wait = setTimeout, token?: string) {
  // Target Actions are public. The source token gives this read its own quota
  // instead of the anonymous budget shared by runner addresses. GitHub does not
  // document that token for another owner's public Actions data, so a refusal
  // falls back to anonymous reads, which stay bounded below the hourly budget.
  const path = `${root}/actions/workflows/deploy-web-app.yml/runs?head_sha=${sha}&per_page=100`
  let options = token ? { token } : undefined
  for (let attempt = 0; attempt < 20; attempt++) {
    let data: { workflow_runs: WorkflowRun[] }
    try {
      data = (await request(path, options)) as { workflow_runs: WorkflowRun[] }
    } catch (error) {
      const failure = error as ApiError
      if (!options || failure.rateLimited || ![401, 403, 404].includes(failure.status ?? 0)) throw error
      options = undefined
      data = (await request(path)) as { workflow_runs: WorkflowRun[] }
    }
    if (!Array.isArray(data.workflow_runs)) throw new Error('Invalid hosting run list')
    const runs = data.workflow_runs.filter(
      (run) =>
        run.head_sha === sha &&
        run.head_branch === 'main' &&
        run.repository.full_name === 'tree-editor/tree-editor.github.io' &&
        run.path === '.github/workflows/deploy-web-app.yml' &&
        ['push', 'workflow_dispatch'].includes(run.event),
    )
    const run = runs.sort((a, b) => b.id - a.id)[0]
    if (run?.status === 'completed') {
      const link = `https://github.com/tree-editor/tree-editor.github.io/actions/runs/${run.id}`
      if (run.conclusion !== 'success')
        throw new Error(`Web deployment failed. Re-run failed jobs at ${link}, then retry this job.`)
      return link
    }
    await wait(30000)
  }
  throw new Error(
    'Web deployment has not finished. Inspect https://github.com/tree-editor/tree-editor.github.io/actions',
  )
}

if (import.meta.main) {
  try {
    await dispatchedSource()
    const [command] = process.argv.slice(2)
    if (command === 'candidate') {
      const version = await currentVersion()
      await requireReleaseSource(version, process.env.GITHUB_SHA!, api, process.env.GH_TOKEN)
      const ready = await isNewWebVersion(version, { token: process.env.GH_TOKEN })
      await appendFile(process.env.GITHUB_OUTPUT!, `ready=${ready}\n`)
    } else if (command === 'verify') {
      const { verifyHosted } = await import('./verify-target.mts')
      // Hosting Git data is read over Git; see hosting.mts.
      await withHostingRepository(async (hosting) => {
        const sha = await publicationHead(process.env.WEB_TARGET_SHA, hosting)
        await mkdir('verified-hosting', { recursive: true })
        for (const name of ['provenance.json', 'provenance.sigstore.json']) {
          const blob = (await hosting(`${root}/contents/${name}?ref=${sha}`)) as Blob
          if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > 1024 * 1024)
            throw new Error('Invalid hosting metadata')
          await writeFile(`verified-hosting/${name}`, Buffer.from(blob.content, 'base64'))
        }
        const manifest = await verifyAttestation(
          'verified-hosting/provenance.json',
          'verified-hosting/provenance.sigstore.json',
        )
        if (
          manifest.sourceSha !== process.env.GITHUB_SHA ||
          manifest.sourceRunId !== process.env.VALIDATION_RUN_ID ||
          String(manifest.sourceRunAttempt) !== process.env.VALIDATION_RUN_ATTEMPT
        )
          throw new Error('Hosted candidate belongs to another validation run')
        const link = await waitForDeployment(sha, api, setTimeout, process.env.GH_TOKEN)
        await verifyHosted(manifest)
        const latest = (await hosting(`${root}/git/ref/heads/main`)) as Reference
        if (latest.object.sha !== sha) throw new Error('Hosted candidate superseded')
        await appendFile(
          process.env.GITHUB_STEP_SUMMARY!,
          `Web: [Published](https://tree-editor.github.io) · [Deployment](${link})\n`,
        )
      })
    } else throw new Error('Usage: status.mts candidate|verify')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
    process.exitCode = 1
  }
}
