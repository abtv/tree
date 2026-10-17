import { execFileSync } from 'node:child_process'
import { api } from './github.mjs'
import { selectChecks, SOURCE_REPOSITORY } from './policy.mjs'

export async function selectReleaseChecks(
  before,
  after,
  { currentRunId, token, request = api, run = execFileSync } = {},
) {
  if (!/^[a-f0-9]{40}$/.test(before) || !/^[a-f0-9]{40}$/.test(after) || !/^[1-9][0-9]*$/.test(currentRunId)) {
    throw new Error('Invalid release selection identity')
  }
  const git = (args) =>
    run('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  const changedPaths = (base) =>
    git(
      /^0{40}$/.test(base)
        ? ['ls-tree', '-r', '--name-only', '-z', after]
        : ['diff', '--no-renames', '--name-only', '-z', base, after, '--'],
    )
      .split('\0')
      .filter(Boolean)
  const direct = selectChecks(changedPaths(before))
  if (direct.memory && direct.demo) return direct

  // A failed/cancelled push must not disappear from the next push's selector.
  // Only a completed source release establishes a baseline. Target-controlled
  // metadata, PR checks and the current run cannot supply this evidence.
  const response = await request(
    `/repos/${SOURCE_REPOSITORY}/actions/workflows/release.yml/runs?branch=main&event=push&status=success&per_page=100`,
    { token },
  )
  if (!Array.isArray(response?.workflow_runs) || response.workflow_runs.length > 100) {
    throw new Error('Invalid release history')
  }
  for (const previous of response.workflow_runs) {
    if (
      !Number.isSafeInteger(previous?.id) ||
      previous.id < 1 ||
      String(previous.id) === currentRunId ||
      previous.repository?.full_name !== SOURCE_REPOSITORY ||
      previous.path !== '.github/workflows/release.yml' ||
      previous.event !== 'push' ||
      previous.head_branch !== 'main' ||
      previous.status !== 'completed' ||
      previous.conclusion !== 'success' ||
      !/^[a-f0-9]{40}$/.test(previous.head_sha)
    ) {
      continue
    }
    try {
      git(['merge-base', '--is-ancestor', previous.head_sha, after])
    } catch (error) {
      if (error.status === 1) continue
      throw new Error('Cannot establish release baseline ancestry', { cause: error })
    }
    const cumulative = selectChecks(changedPaths(previous.head_sha))
    return { memory: direct.memory || cumulative.memory, demo: direct.demo || cumulative.demo }
  }
  // No suitable baseline in this bounded page (including first publication):
  // run both checks rather than interpreting missing history as a safe skip.
  return { memory: true, demo: true }
}
