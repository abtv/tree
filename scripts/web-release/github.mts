import type { ApiError, ApiOptions, Request, Reference, WorkflowRun, Job } from './types.mts'
import { validateManifest } from './policy.mts'

export async function api(path: string, { token, method = 'GET', body }: ApiOptions = {}): Promise<unknown> {
  if (!/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\//.test(path) || path.includes('..') || /[\r\n#]/.test(path)) {
    throw new Error('Invalid GitHub API path')
  }
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    redirect: 'error',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const error: ApiError = new Error(`GitHub API ${method} failed (${response.status})`)
    error.status = response.status
    // Keep remote text out of diagnostics. The probe establishes ordinary
    // Contents writes before accepting this documented permission denial.
    if (response.status === 403 && method === 'PUT' && path.includes('/contents/.github/workflows/')) {
      const data = (await response.json().catch(() => null)) as { message?: string } | null
      const workflow = path.slice(path.indexOf('/contents/') + '/contents/'.length)
      error.workflowWriteDenied =
        data?.message === 'Resource not accessible by integration' ||
        data?.message ===
          `refusing to allow a GitHub App to create or update workflow \`${workflow}\` without \`workflows\` permission`
    }
    throw error
  }
  return response.status === 204 ? undefined : response.json()
}

export async function verifySource(
  input: unknown,
  { token, request = api }: { token?: string | undefined; request?: Request } = {},
) {
  const manifest = validateManifest(input)
  const root = '/repos/abtv/tree'
  const head = (await request(`${root}/git/ref/heads/main`, { token })) as Reference
  if (head.object?.sha !== manifest.sourceSha) throw new Error('Source release is stale')
  const run = (await request(`${root}/actions/runs/${manifest.sourceRunId}`, { token })) as WorkflowRun
  if (
    run.repository?.full_name !== 'abtv/tree' ||
    run.path !== '.github/workflows/release.yml' ||
    run.event !== 'push' ||
    run.head_branch !== 'main' ||
    run.head_sha !== manifest.sourceSha ||
    run.run_attempt !== manifest.sourceRunAttempt ||
    !['success', null].includes(run.conclusion) ||
    !['in_progress', 'completed'].includes(run.status) ||
    (run.status === 'completed' && run.conclusion !== 'success')
  ) {
    throw new Error('Untrusted source release run')
  }
  const jobs: Job[] = []
  for (let page = 1; page <= 20; page++) {
    const response = (await request(
      `${root}/actions/runs/${manifest.sourceRunId}/attempts/${manifest.sourceRunAttempt}/jobs?per_page=100&page=${page}`,
      { token },
    )) as { jobs: Job[]; total_count: number }
    if (!Array.isArray(response.jobs) || !Number.isSafeInteger(response.total_count) || response.total_count > 2000) {
      throw new Error('Invalid source job list')
    }
    jobs.push(...response.jobs)
    if (jobs.length >= response.total_count) break
    if (response.jobs.length === 0 || page === 20) throw new Error('Incomplete source job list')
  }
  const gates = jobs.filter((job) => job.name === 'Release gate')
  if (gates.length !== 1 || gates[0]!.status !== 'completed' || gates[0]!.conclusion !== 'success') {
    throw new Error('Source release gate did not succeed')
  }
}
