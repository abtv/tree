import { createHash } from 'node:crypto'
import { appendFile, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

type JsonObject = Record<string, unknown>
type Request = (path: string) => Promise<unknown>
type Identity = { marker: string; event: string; headSha: string }

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as JsonObject
}

function commit(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new Error('Invalid commit SHA')
  return value
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing event identity field')
  return value
}

export function auditIdentity(event: string, checkoutSha: string, input: unknown): Identity {
  const payload = object(input)
  const sha = commit(checkoutSha)
  let headSha = sha
  let fields: unknown[]
  if (event === 'push') {
    if (commit(payload.after) !== sha) throw new Error('Push SHA does not match checkout')
    fields = [event, sha, commit(payload.before), string(payload.ref)]
  } else if (event === 'pull_request') {
    const pr = object(payload.pull_request)
    headSha = commit(object(pr.head).sha)
    if (!Number.isSafeInteger(payload.number) || Number(payload.number) < 1) throw new Error('Invalid PR number')
    fields = [
      event,
      sha,
      payload.number,
      string(payload.action),
      headSha,
      commit(object(pr.base).sha),
      string(pr.updated_at),
    ]
  } else {
    throw new Error(`Unsupported automatic audit event: ${event}`)
  }
  const digest = createHash('sha256').update(JSON.stringify(fields)).digest('hex')
  return { marker: `dependency-audit-${digest}`, event, headSha }
}

export async function requireAudit({
  repository,
  identity,
  request,
  now = Date.now,
  wait = () => new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
  timeout = 420_000,
}: {
  repository: string
  identity: Identity
  request: Request
  now?: () => number
  wait?: () => Promise<void>
  timeout?: number
}): Promise<number> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository')
  const root = `/repos/${repository}/actions`
  const deadline = now() + timeout
  while (now() < deadline) {
    const response = object(
      await request(
        `${root}/workflows/audit-dependencies.yml/runs?event=${identity.event}&head_sha=${identity.headSha}&per_page=100`,
      ),
    )
    if (!Array.isArray(response.workflow_runs)) throw new Error('Invalid workflow runs response')
    const runs = response.workflow_runs
      .map(object)
      .filter(
        (run) =>
          run.path === '.github/workflows/audit-dependencies.yml' &&
          run.event === identity.event &&
          run.head_sha === identity.headSha &&
          object(run.repository).full_name === repository,
      )
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id))
    for (const run of runs) {
      if (!Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt) || Number(run.run_attempt) < 1) {
        throw new Error('Invalid audit run identity')
      }
      const response = object(await request(`${root}/runs/${run.id}/artifacts?per_page=100`))
      if (
        !Number.isSafeInteger(response.total_count) ||
        !Array.isArray(response.artifacts) ||
        Number(response.total_count) > 100
      ) {
        throw new Error('Invalid artifacts response')
      }
      const artifacts = response.artifacts.map(object)
      // An old attempt identifies the event, but cannot prove the current attempt passed.
      if (!artifacts.some((artifact) => String(artifact.name).startsWith(`${identity.marker}-`))) continue
      if (run.status === 'completed' && run.conclusion !== 'success') {
        throw new Error(`Dependency audit ${run.id}, attempt ${run.run_attempt}, did not succeed: ${run.conclusion}`)
      }
      const current = artifacts.find((artifact) => artifact.name === `${identity.marker}-${run.run_attempt}`)
      if (run.status === 'completed' && run.conclusion === 'success' && current?.expired === false) {
        return Number(run.id)
      }
      // The latest matching run takes precedence over any older successful run.
      break
    }
    await wait()
  }
  throw new Error('Timed out waiting for the dependency audit of this event and checkout SHA')
}

async function main() {
  const identity = auditIdentity(
    string(process.env.GITHUB_EVENT_NAME),
    string(process.env.GITHUB_SHA),
    JSON.parse(await readFile(string(process.env.GITHUB_EVENT_PATH), 'utf8')),
  )
  if (process.argv[2] === 'identify') {
    await appendFile(string(process.env.GITHUB_OUTPUT), `marker=${identity.marker}\n`)
    return
  }
  if (process.argv[2] !== 'require') throw new Error('Expected identify or require')
  const token = string(process.env.GH_TOKEN)
  const request: Request = async (path) => {
    const response = await fetch(`https://api.github.com${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!response.ok) throw new Error(`GitHub audit lookup failed: HTTP ${response.status}`)
    return response.json()
  }
  const id = await requireAudit({ repository: string(process.env.GITHUB_REPOSITORY), identity, request })
  console.log(`Dependency audit passed: run ${id}; reused the result for this event and checkout SHA`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Dependency audit gate failed')
    process.exitCode = 1
  })
}
