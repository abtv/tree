import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { api } from './github.mts'
import { verifyAttestation } from './attestation.mts'
import { currentVersion, isNewWebVersion } from './version.mts'
import { verifyHosted } from './verify-target.mts'
import { dispatchedSource } from '../publication.mts'
import type { Blob, Reference, Request, WorkflowRun } from './types.mts'

const root = '/repos/tree-editor/tree-editor.github.io'

export async function waitForDeployment(sha: string, request: Request = api, wait = setTimeout) {
  // Target Actions are public. Keep this bounded below the anonymous API budget;
  // the source token does not establish Actions access in the hosting repository.
  for (let attempt = 0; attempt < 20; attempt++) {
    const data = (await request(`${root}/actions/workflows/deploy-web-app.yml/runs?head_sha=${sha}&per_page=100`)) as {
      workflow_runs: WorkflowRun[]
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
      const ready = await isNewWebVersion(await currentVersion(), { token: process.env.GH_TOKEN })
      await appendFile(process.env.GITHUB_OUTPUT!, `ready=${ready}\n`)
    } else if (command === 'verify') {
      const head = (await api(`${root}/git/ref/heads/main`)) as Reference
      await mkdir('verified-hosting', { recursive: true })
      for (const name of ['provenance.json', 'provenance.sigstore.json']) {
        const blob = (await api(`${root}/contents/${name}?ref=${head.object.sha}`)) as Blob
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
      const link = await waitForDeployment(head.object.sha)
      await verifyHosted(manifest)
      const latest = (await api(`${root}/git/ref/heads/main`)) as Reference
      if (latest.object.sha !== head.object.sha) throw new Error('Hosted candidate superseded')
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY!,
        `Web: [Published](https://tree-editor.github.io) · [Deployment](${link})\n`,
      )
    } else throw new Error('Usage: status.mts candidate|verify')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
    process.exitCode = 1
  }
}
