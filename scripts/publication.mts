import { appendFile, readFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { api, verifyValidation } from './web-release/github.mts'
import { currentVersion, isNewWebVersion } from './web-release/version.mts'
import { compareVersions, parseVersion } from './release-version.mts'
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

export async function newMacVersion(version: string, request: Request = api, token?: string) {
  for (let page = 1; page <= 100; page++) {
    const tags = (await request(`${root}/tags?per_page=100&page=${page}`, { token })) as { name: string }[]
    if (!Array.isArray(tags)) throw new Error('Invalid release tags')
    for (const tag of tags) {
      if (!tag.name.startsWith('v')) continue
      try {
        parseVersion(tag.name.slice(1))
      } catch {
        continue
      }
      if (compareVersions(version, tag.name.slice(1)) <= 0) return false
    }
    if (tags.length < 100) return true
  }
  throw new Error('Too many release tags')
}

export async function versionIncreased(version: string, before: string, request: Request = api, token?: string) {
  if (!/^[a-f0-9]{40}$/.test(before)) throw new Error('Invalid previous push SHA')
  if (/^0+$/.test(before)) return true
  const blob = (await request(`${root}/contents/package.json?ref=${before}`, { token })) as {
    encoding: string
    content: string
    size: number
  }
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > 1024 * 1024) {
    throw new Error('Invalid previous version metadata')
  }
  const previous = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
  return compareVersions(version, previous.version) > 0
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
    if (command === 'verify') {
      const run = await dispatchedSource()
      const version = await currentVersion()
      if (version !== process.env.RELEASE_VERSION) throw new Error('Dispatch version differs from checked source')
      await appendFile(
        process.env.GITHUB_OUTPUT!,
        `sha=${run.head_sha}\nrun_id=${run.id}\nrun_attempt=${run.run_attempt}\n`,
      )
    } else if (command === 'version') {
      const version = await currentVersion()
      const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8'))
      const increased = await versionIncreased(version, event.before, api, process.env.GH_TOKEN)
      const web = increased && (await isNewWebVersion(version, { token: process.env.GH_TOKEN }))
      const mac = increased && (await newMacVersion(version, api, process.env.GH_TOKEN))
      await appendFile(process.env.GITHUB_OUTPUT!, `ready=${web || mac}\nversion=${version}\n`)
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY!,
        web || mac ? `New release: ${version}\n` : 'Version unchanged — no release needed\n',
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
    } else throw new Error('Usage: publication.mts verify|version|dispatch')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
