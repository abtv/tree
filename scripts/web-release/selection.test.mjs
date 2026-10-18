import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { selectReleaseChecks } from './selection.mjs'

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))

async function history(changedPath) {
  await mkdir('.scratch/release-gate-fixes/git-tests', { recursive: true })
  const cwd = resolve(await mkdtemp('.scratch/release-gate-fixes/git-tests/case-'))
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
  const git = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()
  git('init', '--quiet', '--initial-branch=main')
  const commit = (message) => {
    git(
      '-c',
      'user.name=Release Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      message,
    )
    return git('rev-parse', 'HEAD')
  }
  await writeFile(join(cwd, 'README.md'), 'Baseline\n')
  git('add', 'README.md')
  const baseline = commit('Successful release')
  await mkdir(dirname(join(cwd, changedPath)), { recursive: true })
  await writeFile(join(cwd, changedPath), 'Changed input\n')
  git('add', changedPath)
  const before = commit('Relevant change whose release failed')
  await writeFile(join(cwd, 'README.md'), 'Documentation only\n')
  git('add', 'README.md')
  const after = commit('Documentation after failed release')
  return { cwd, env, baseline, before, after, git }
}

function successfulRun(sha) {
  return {
    id: 123,
    repository: { full_name: 'abtv/tree' },
    path: '.github/workflows/release.yml',
    event: 'push',
    head_branch: 'main',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
  }
}

describe('release check selection across pushes', () => {
  it.each([
    ['e2e/electron/fixtures.ts', 'memory=true', 'demo=false'],
    ['src/renderer/main.tsx', 'demo=true', 'memory=false'],
  ])('keeps %s changes required after a failed release followed by documentation', async (path, required, skipped) => {
    const fixture = await history(path)
    const response = { workflow_runs: [successfulRun(fixture.baseline)] }
    const preload = join(fixture.cwd, 'github-fixture.mjs')
    await writeFile(
      preload,
      `globalThis.fetch = async () => new Response(${JSON.stringify(JSON.stringify(response))})\n`,
    )
    const output = join(fixture.cwd, 'outputs')
    execFileSync(process.execPath, ['--import', preload, cli, 'changes', fixture.before, fixture.after], {
      cwd: fixture.cwd,
      env: { ...fixture.env, GITHUB_OUTPUT: output, GITHUB_RUN_ID: '456', GH_TOKEN: 'test-token' },
      stdio: 'pipe',
    })
    const checks = await readFile(output, 'utf8')
    expect(checks).toContain(required)
    expect(checks).toContain(skipped)
  })

  it('returns to selective skipping after the relevant changes have a successful source release', async () => {
    const fixture = await history('e2e/electron/fixtures.ts')
    const request = vi.fn(async () => ({ workflow_runs: [successfulRun(fixture.before)] }))
    await expect(
      selectReleaseChecks(fixture.before, fixture.after, {
        currentRunId: '456',
        token: 'source-token',
        request,
        run: (file, args, options) => execFileSync(file, args, { ...options, cwd: fixture.cwd }),
      }),
    ).resolves.toEqual({ memory: false, demo: false })
    expect(request).toHaveBeenCalledExactlyOnceWith(
      '/repos/abtv/tree/actions/workflows/release.yml/runs?branch=main&event=push&status=success&per_page=100',
      { token: 'source-token' },
    )
  })

  it('counts removed matching paths when a change renames them outside the selector', async () => {
    const fixture = await history('e2e/electron/fixtures.ts')
    fixture.git('mv', 'e2e/electron/fixtures.ts', 'renamed.txt')
    // Worktree changes are not part of a release candidate; create its immutable commit.
    fixture.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'Rename')
    const after = fixture.git('rev-parse', 'HEAD')
    await expect(
      selectReleaseChecks(fixture.after, after, {
        currentRunId: '456',
        request: async () => ({ workflow_runs: [successfulRun(fixture.before)] }),
        run: (file, args, options) => execFileSync(file, args, { ...options, cwd: fixture.cwd }),
      }),
    ).resolves.toEqual({ memory: true, demo: false })
  })
})

describe('release selection history trust and failures', () => {
  const before = 'b'.repeat(40)
  const after = 'c'.repeat(40)
  const baseline = successfulRun('a'.repeat(40))
  const unchanged = () => 'README.md\0'
  const select = (runs, run = unchanged) =>
    selectReleaseChecks(before, after, {
      currentRunId: '456',
      request: async () => ({ workflow_runs: runs }),
      run,
    })

  it('requires both checks with no trustworthy completed baseline, including first publication', async () => {
    for (const overrides of [
      { id: 456 },
      { id: 0 },
      { repository: { full_name: 'other/tree' } },
      { path: '.github/workflows/ci.yml' },
      { event: 'workflow_dispatch' },
      { head_branch: 'feature' },
      { head_sha: 'main' },
      { status: 'in_progress' },
      { conclusion: 'failure' },
      { conclusion: 'cancelled' },
      { conclusion: 'skipped' },
    ]) {
      await expect(select([{ ...baseline, ...overrides }])).resolves.toEqual({ memory: true, demo: true })
    }
    await expect(select([])).resolves.toEqual({ memory: true, demo: true })
  })

  it('uses an ancestral successful run and conservatively runs both if the bounded page has none', async () => {
    const run = vi.fn((file, args) => {
      if (args[0] === 'merge-base' && args[2] === after) throw Object.assign(new Error('Not ancestor'), { status: 1 })
      return 'README.md\0'
    })
    const unrelated = { ...baseline, head_sha: after }
    await expect(select([unrelated, baseline], run)).resolves.toEqual({ memory: false, demo: false })
    await expect(select(Array(100).fill(unrelated), run)).resolves.toEqual({ memory: true, demo: true })
  })

  it('does not turn unavailable API or Git history into permission to skip', async () => {
    await expect(
      selectReleaseChecks(before, after, {
        currentRunId: '456',
        run: unchanged,
        request: async () => {
          throw new Error('API unavailable')
        },
      }),
    ).rejects.toThrow('API unavailable')
    for (const response of [{}, { workflow_runs: null }, { workflow_runs: Array(101).fill(baseline) }]) {
      await expect(
        selectReleaseChecks(before, after, { currentRunId: '456', run: unchanged, request: async () => response }),
      ).rejects.toThrow('Invalid release history')
    }
    await expect(
      select([baseline], (file, args) => {
        if (args[0] === 'merge-base') throw Object.assign(new Error('Missing commit'), { status: 128 })
        return 'README.md\0'
      }),
    ).rejects.toThrow('Cannot establish release baseline ancestry')
  })

  it('keeps directly required checks and avoids history lookups when both are already required', async () => {
    const request = vi.fn()
    await expect(
      selectReleaseChecks(before, after, { currentRunId: '456', request, run: () => 'package.json\0' }),
    ).resolves.toEqual({ memory: true, demo: true })
    expect(request).not.toHaveBeenCalled()
    await expect(
      select([baseline], (file, args) => {
        if (args[0] === 'diff' && args[4] === before) return 'e2e/electron/fixtures.ts\0'
        return 'README.md\0'
      }),
    ).resolves.toEqual({ memory: true, demo: false })
  })

  it('rejects missing run identity and malformed revisions before executing Git or requests', async () => {
    const run = vi.fn()
    const request = vi.fn()
    for (const [first, second, currentRunId] of [
      [before, after, undefined],
      ['main', after, '456'],
      [before, '--help', '456'],
    ]) {
      await expect(selectReleaseChecks(first, second, { currentRunId, run, request })).rejects.toThrow('identity')
    }
    expect(run).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })
})
