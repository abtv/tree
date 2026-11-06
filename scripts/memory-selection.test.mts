import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('selects the release memory guards and detector checks without timing tests or skips', () => {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '-c',
      'config/testing/playwright.memory.config.ts',
      '--list',
      '--reporter=json',
    ],
    { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
  )

  expect(result.status, result.stderr).toBe(0)
  type Suite = { suites?: Suite[]; specs?: { title: string; tests: { expectedStatus: string }[] }[] }
  const report = JSON.parse(result.stdout) as {
    suites: Suite[]
    errors: unknown[]
    config: { workers: number; projects: { retries: number }[] }
  }
  const cases: string[] = []
  const visit = (suite: Suite) => {
    for (const spec of suite.specs ?? []) {
      expect(spec.tests.map((test) => test.expectedStatus)).toEqual(['passed'])
      cases.push(spec.title)
    }
    suite.suites?.forEach(visit)
  }
  report.suites.forEach(visit)

  expect(report.errors).toEqual([])
  expect(report.config.workers).toBe(1)
  expect(report.config.projects.every((project) => project.retries === 0)).toBe(true)
  expect(cases.sort()).toEqual(
    [
      'measures successive edit/reset bursts after warm-up',
      'measures matched fresh edit bursts as memory controls',
      'warms missing GPU accounting without showing the hidden window',
      'fresh application process footprint',
      'sustained-10000 structural edits keep renderer memory bounded',
      'does not grow the renderer heap unboundedly when expanding many branches',
      'releases canceled scans across query refinement and presentation switches',
      'detects deliberately retained rendererHeap allocations',
      'detects deliberately retained mainHeap allocations',
      'detects deliberately retained mainWorkingSet allocations',
    ].sort(),
  )
})
