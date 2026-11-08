import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

interface Step {
  run?: string
  if?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}
interface Job {
  name: string
  needs?: string | string[]
  if?: string
  'runs-on': string
  'timeout-minutes': number
  strategy?: { 'fail-fast': boolean; matrix: { shard: number[] } }
  steps: Step[]
}
interface Workflow {
  on: Record<string, unknown>
  permissions: Record<string, string>
  jobs: Record<string, Job>
}
const { load } = createRequire(import.meta.url)('js-yaml') as { load: (source: string) => Workflow }
const source = readFileSync('.github/workflows/run-electron-e2e-tests.yml', 'utf8')
const workflow = load(source)

it('runs reusable memory measurements on Linux with display dependencies and retained evidence', () => {
  const memorySource = readFileSync('.github/workflows/run-electron-memory-tests.yml', 'utf8')
  const memoryWorkflow = load(memorySource)
  const memory = memoryWorkflow.jobs.memory!

  expect(memoryWorkflow.on).toEqual({
    workflow_call: null,
    schedule: [{ cron: '0 4 * * 0' }],
    workflow_dispatch: null,
  })
  expect(memoryWorkflow.permissions).toEqual({ contents: 'read' })
  expect(memoryWorkflow.jobs.audit!.if).toBe(
    "github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
  )
  expect(memory.needs).toBe('audit')
  expect(memory.if).toBe("${{ !cancelled() && (needs.audit.result == 'success' || needs.audit.result == 'skipped') }}")
  expect(memory['runs-on']).toBe('ubuntu-24.04')
  expect(memory.steps).toContainEqual(expect.objectContaining({ run: 'npx playwright install-deps chromium' }))
  expect(memory.steps).toContainEqual(expect.objectContaining({ run: 'npm run build' }))
  expect(memory.steps).toContainEqual(
    expect.objectContaining({
      run: 'xvfb-run --auto-servernum npx playwright test -c config/testing/playwright.memory.config.ts --reporter=list,json',
      env: { PLAYWRIGHT_JSON_OUTPUT_NAME: 'reports/e2e-memory.json' },
    }),
  )
  expect(memory.steps).toContainEqual(
    expect.objectContaining({
      if: 'always()',
      with: expect.objectContaining({ path: 'reports/e2e-memory.json\ntest-results/\n' }),
    }),
  )
  expect(memorySource).not.toContain('continue-on-error')
})

it('runs complementary Electron configurations without adding automatic suite executions', () => {
  expect(workflow.on).toEqual({
    workflow_call: null,
    schedule: [{ cron: '0 2 * * 0' }],
    workflow_dispatch: null,
  })
  expect(workflow.permissions).toEqual({ contents: 'read' })
  expect(source).not.toContain('continue-on-error')
  const macos = workflow.jobs.macos!
  const linux = workflow.jobs.linux!

  expect(macos['runs-on']).toBe('macos-15')
  expect(macos.strategy).toEqual({ 'fail-fast': false, matrix: { shard: [1, 2, 3, 4] } })
  expect(macos.steps).toContainEqual(
    expect.objectContaining({
      run: 'npx playwright test -c config/testing/playwright.macos.config.ts --shard=${{ matrix.shard }}/4 --workers=3',
    }),
  )
  expect(linux['runs-on']).toBe('ubuntu-24.04')
  expect(linux.strategy).toBeUndefined()
  expect(linux.steps).toContainEqual(expect.objectContaining({ run: 'npx playwright install-deps chromium' }))
  expect(linux.steps).toContainEqual(
    expect.objectContaining({
      run: 'xvfb-run --auto-servernum npx playwright test -c config/testing/playwright.linux.config.ts',
    }),
  )

  for (const [platform, job] of [
    ['macos', macos],
    ['linux', linux],
  ] as const) {
    expect(job.needs).toBe('audit')
    expect(job.if).toBe("${{ !cancelled() && (needs.audit.result == 'success' || needs.audit.result == 'skipped') }}")
    expect(job['timeout-minutes']).toBe(12)
    expect(job.steps).toContainEqual(expect.objectContaining({ run: 'npm ci' }))
    expect(job.steps).toContainEqual(expect.objectContaining({ run: 'npm run build' }))
    const artifact = job.steps.find((step) => step.with?.name?.toString().startsWith('playwright-report-'))!
    expect(artifact.if).toBe('always()')
    expect(artifact.with!.name).toBe(
      `playwright-report-${platform}-${platform === 'macos' ? '${{ matrix.shard }}' : '1'}-` +
        '${{ github.run_attempt }}',
    )
  }
})

it('executes the actual aggregate gate and rejects either platform failing, cancelling or skipping', () => {
  const gate = workflow.jobs.e2e!
  expect(gate.name).toBe('Require all Electron E2E shards to pass')
  expect(gate.if).toBe('always()')
  expect(gate.needs).toEqual(['macos', 'linux'])
  const step = gate.steps[0]!
  expect(step.env).toEqual({
    MACOS_RESULT: '${{ needs.macos.result }}',
    LINUX_RESULT: '${{ needs.linux.result }}',
  })

  for (const macos of ['success', 'failure', 'cancelled', 'skipped']) {
    for (const linux of ['success', 'failure', 'cancelled', 'skipped']) {
      // GitHub's default Bash runner exits on the first failed command.
      const result = spawnSync('bash', ['-e', '-c', step.run!], {
        env: { ...process.env, MACOS_RESULT: macos, LINUX_RESULT: linux },
      })

      expect(result.error).toBeUndefined()
      expect(result.status === 0, `macOS=${macos}, Linux=${linux}`).toBe(macos === 'success' && linux === 'success')
    }
  }
})
