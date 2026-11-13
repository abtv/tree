import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

interface Step {
  if?: string
  run?: string
}
interface Workflow {
  jobs: Record<string, { steps?: Step[] }>
}
const { load } = createRequire(import.meta.url)('js-yaml') as { load: (source: string) => Workflow }

it.each([
  ['run-smoke-tests.yml', 'smoke'],
  ['run-electron-e2e-tests.yml', 'macos'],
  ['create-macos-release-draft.yml', 'sign'],
  ['publish-demo-video-and-screenshots.yml', 'generate'],
])('selects a Foundation Models SDK before building in %s', (file, job) => {
  const workflow = load(readFileSync(`.github/workflows/${file}`, 'utf8'))
  const steps = workflow.jobs[job]!.steps!
  const select = steps.findIndex(
    (step) => step.run === 'sudo xcode-select --switch /Applications/Xcode_26.2.app/Contents/Developer',
  )
  const build = steps.findIndex((step) => /npm run (build|demo:video|screenshots:readme)/.test(step.run ?? ''))

  expect(select).toBeGreaterThanOrEqual(0)
  expect(build).toBeGreaterThan(select)
  expect(steps[select]!.if).toBe(job === 'smoke' ? "runner.os == 'macOS'" : undefined)
})
