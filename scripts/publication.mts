import { appendFile, readFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { api, verifyValidation } from './web-release/github.mts'
import { currentVersion, isNewWebVersion } from './web-release/version.mts'
import { releaseSourceState, reserveReleaseSource } from './release-source.mts'
import type { Request, WorkflowRun } from './web-release/types.mts'

const root = '/repos/abtv/tree'

export async function dispatchedSource(
  env: NodeJS.ProcessEnv = process.env,
  request: Request = api,
  wait = setTimeout,
) {
  if (
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REPOSITORY !== 'abtv/tree' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    !/^[1-9][0-9]*$/.test(env.VALIDATION_RUN_ID ?? '') ||
    !/^[1-9][0-9]*$/.test(env.VALIDATION_RUN_ATTEMPT ?? '') ||
    !/^[a-f0-9]{40}$/.test(env.VALIDATION_SHA ?? '') ||
    env.GITHUB_SHA !== env.VALIDATION_SHA
  )
    throw new Error('Invalid publication dispatch identity')
  const identity = {
    sourceRepository: 'abtv/tree',
    sourceSha: env.VALIDATION_SHA!,
    sourceRunId: env.VALIDATION_RUN_ID!,
    sourceRunAttempt: Number(env.VALIDATION_RUN_ATTEMPT),
  }
  // Dispatch is the final validation job. Wait for its run to finish before trusting it.
  for (let attempt = 0; attempt < 30; attempt++) {
    const run = (await request(`${root}/actions/runs/${identity.sourceRunId}`, { token: env.GH_TOKEN })) as WorkflowRun
    if (run.run_attempt !== identity.sourceRunAttempt) throw new Error('Validation attempt superseded')
    if (run.status === 'completed') return verifyValidation(identity, { request, token: env.GH_TOKEN })
    await wait(2000)
  }
  throw new Error('Validation did not finish; retry after its successful completion')
}

export async function releaseNeeded(version: string, sha: string, request: Request = api, token?: string) {
  const state = await releaseSourceState(version, sha, request, token)
  if (state === 'unavailable') return false
  // Rerunning validation of the reserved source must regenerate expired artifacts,
  // including when Web finished but the desktop branch still needs recovery.
  if (state === 'reserved') return true
  return isNewWebVersion(version, { request, token, sourceSha: sha })
}

export async function dispatchPublications(
  inputs: { run_id: string; run_attempt: string; sha: string; version: string },
  release: boolean,
  request: Request = api,
  token?: string,
) {
  const workflows = ['publish-demo-video-and-screenshots.yml', ...(release ? ['release-new-app-version.yml'] : [])]
  const results = await Promise.allSettled(
    workflows.map((workflow) =>
      request(`${root}/actions/workflows/${workflow}/dispatches`, {
        token,
        method: 'POST',
        body: { ref: 'main', inputs },
      }),
    ),
  )
  const failed = results.flatMap((result, index) => (result.status === 'rejected' ? [workflows[index]] : []))
  if (failed.length) throw new Error(`Dispatch failed: ${failed.join(', ')}; inspect Actions before retrying`)
}

if (import.meta.main) {
  try {
    const [command] = process.argv.slice(2)
    if (command === 'verify' || command === 'reserve') {
      const run = await dispatchedSource()
      const version = await currentVersion()
      if (version !== process.env.RELEASE_VERSION) throw new Error('Dispatch version differs from checked source')
      if (command === 'reserve') await reserveReleaseSource(version, run.head_sha, api, process.env.GH_TOKEN)
      await appendFile(
        process.env.GITHUB_OUTPUT!,
        `sha=${run.head_sha}\nrun_id=${run.id}\nrun_attempt=${run.run_attempt}\n`,
      )
    } else if (command === 'version') {
      const version = await currentVersion()
      const ready = await releaseNeeded(version, process.env.GITHUB_SHA!, api, process.env.GH_TOKEN)
      await appendFile(process.env.GITHUB_OUTPUT!, `ready=${ready}\nversion=${version}\n`)
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY!,
        ready ? `New release: ${version}\n` : 'No new release version\n',
      )
    } else if (command === 'dispatch') {
      const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8'))
      if (
        process.env.GITHUB_EVENT_NAME !== 'push' ||
        process.env.GITHUB_REF !== 'refs/heads/main' ||
        process.env.GITHUB_REPOSITORY !== 'abtv/tree' ||
        event.after !== process.env.GITHUB_SHA
      ) {
        throw new Error('Only a main push can dispatch publication')
      }
      const head = (await api(`${root}/git/ref/heads/main`, { token: process.env.GH_TOKEN })) as {
        object: { sha: string }
      }
      if (head.object.sha !== process.env.GITHUB_SHA) throw new Error('Publication candidate superseded')
      await dispatchPublications(
        {
          run_id: process.env.GITHUB_RUN_ID!,
          run_attempt: process.env.GITHUB_RUN_ATTEMPT!,
          sha: process.env.GITHUB_SHA!,
          version: process.env.RELEASE_VERSION!,
        },
        process.env.RELEASE_READY === 'true',
        api,
        process.env.GH_TOKEN,
      )
    } else throw new Error('Usage: publication.mts verify|reserve|version|dispatch')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
