import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { load } = createRequire(import.meta.url)('js-yaml') as { load: (text: string) => Workflow }
type Step = {
  name?: string
  run?: string
  uses?: string
  if?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
}
type Job = {
  name: string
  needs?: string | string[]
  if?: string
  uses?: string
  steps?: Step[]
  permissions?: Record<string, string>
  strategy?: { 'fail-fast': boolean; matrix: { include: unknown[] } }
}
type Workflow = {
  name: string
  on: Record<string, unknown>
  jobs: Record<string, Job>
  permissions: Record<string, string>
  concurrency?: { group: string; 'cancel-in-progress': boolean }
}
const text = (name: string) => readFileSync(`.github/workflows/${name}.yml`, 'utf8')
const workflow = (name: string) => load(text(name))

// @requirement PRODUCT.md §1.4
describe('automatic publication wiring', () => {
  it('runs code and audit in parallel, then browser and smoke, and gates dispatch on every result', () => {
    const ci = workflow('test-and-build-app')

    expect(ci.on).toMatchObject({ push: { branches: ['main'] }, pull_request: null })
    expect(ci.jobs.check!.needs).toBeUndefined()
    expect(ci.jobs.audit!.needs).toBeUndefined()
    expect(ci.jobs.audit!.uses).toBe('./.github/workflows/audit-dependencies.yml')
    for (const name of ['chrome', 'smoke']) expect(ci.jobs[name]!.needs).toEqual(['check', 'audit'])
    expect(ci.jobs.candidate!.needs).toEqual(['check', 'audit', 'chrome', 'smoke'])
    expect(ci.jobs.candidate!.steps).toContainEqual(
      expect.objectContaining({ run: 'node scripts/web-release/cli.mts gate' }),
    )
    expect(ci.jobs.dispatch!.needs).toBe('candidate')
    expect(ci.jobs.dispatch!.if).toContain("github.event_name == 'push'")
    expect(ci.jobs.dispatch!.permissions).toEqual({ contents: 'read', actions: 'write' })
    expect(text('test-and-build-app')).not.toContain('secrets.')
    const commands = ci.jobs
      .check!.steps!.map((step) => step.run)
      .filter(Boolean)
      .join('\n')
    for (const group of ['links', 'tests', 'decisions', 'structure'])
      expect(commands).toContain(`check:docs -- --group ${group}`)
    for (const command of [
      'typecheck',
      'lint',
      'format:check',
      'check:requirements',
      'check:e2e-modes',
      'check:opencode',
      'test:coverage',
    ])
      expect(commands).toContain(`npm run ${command}`)
  })

  it('does not create duplicate automatic suite or audit runs', () => {
    for (const name of ['run-web-e2e-tests', 'run-smoke-tests', 'audit-dependencies']) {
      const value = workflow(name)
      expect(value.on).not.toHaveProperty('push')
      expect(value.on).not.toHaveProperty('pull_request')
      expect(value.on).toHaveProperty('workflow_call')
    }
    expect(workflow('audit-dependencies').on).toHaveProperty('schedule')
    expect(text('audit-dependencies')).toContain('npm audit --audit-level=high')
    expect(text('audit-dependencies')).not.toContain('continue-on-error:')
  })

  it('runs two independent platform smoke jobs and retains all four targets', () => {
    const smoke = workflow('run-smoke-tests').jobs.smoke!
    expect(smoke.strategy).toEqual({
      'fail-fast': false,
      matrix: {
        include: [
          { os: 'ubuntu-24.04', platform: 'Linux' },
          { os: 'macos-15', platform: 'macOS' },
        ],
      },
    })
    for (const command of [
      'npm run build',
      'npm run build:web',
      'xvfb-run --auto-servernum npm run test:smoke:electron',
      'npm run test:smoke:electron',
      'npm run test:smoke:chromium',
      'npm run test:smoke:safari',
    ]) {
      expect(smoke.steps!.some((step) => step.run === command)).toBe(true)
    }
    const browser = text('run-web-e2e-tests')
    expect(browser).toContain('npm run test:web:built')
    expect(browser).not.toContain('--grep')
    expect(browser).toContain('browser-${{ github.sha }}-${{ github.run_attempt }}')
    expect(browser).toContain('include-hidden-files: true')
  })

  it('dispatches demo and release only through verified immutable validation identity', () => {
    for (const name of ['publish-demo-video-and-screenshots', 'release-new-app-version']) {
      const value = workflow(name)
      expect(Object.keys(value.on)).toEqual(['workflow_dispatch'])
      expect(text(name)).toContain('node scripts/publication.mts verify')
      expect(text(name)).toContain('VALIDATION_RUN_ID: ${{ inputs.run_id }}')
      expect(text(name)).not.toContain('pull_request_target')
    }
    const demo = text('publish-demo-video-and-screenshots')
    expect(demo.indexOf('publication.mts verify')).toBeLessThan(demo.indexOf('npm ci'))
    expect(demo).toContain('path: reports/site/')
    expect(demo).not.toContain('tree-editor.github.io')
  })

  it('keeps macOS independent of web failure and preserves narrowly scoped publishing credentials', () => {
    const release = workflow('release-new-app-version')
    expect(release.jobs.macos!.needs).toBe('gate')
    expect(release.jobs.candidate!.needs).toEqual(['gate'])
    expect(release.jobs.sign!.needs).toEqual(['gate', 'candidate'])
    expect(release.jobs.publish!.needs).toEqual(['gate', 'candidate', 'sign'])
    expect(release.jobs.publish!.if).toContain("needs.sign.result == 'skipped'")
    expect(release.concurrency!['cancel-in-progress']).toBe(false)
    const source = text('release-new-app-version')
    expect(source).toContain('run-id: ${{ inputs.run_id }}')
    expect(source).toContain('name: browser-${{ github.sha }}-${{ inputs.run_attempt }}')
    expect(source).toContain('node scripts/web-release/status.mts verify')
    expect(source).toContain('permission-contents: write')
    expect(source).not.toContain('permission-actions: write')
    expect(source).toContain('repositories: tree-editor.github.io')
    for (const name of ['sign', 'publish']) {
      const steps = release.jobs[name]!.steps!
      const install = steps.findIndex((step) => step.run === 'npm ci --ignore-scripts')
      const verify = steps.findIndex((step) => step.run?.startsWith('node scripts/web-release/'))
      expect(install).toBeGreaterThan(-1)
      expect(verify).toBeGreaterThan(install)
    }
    expect(release.jobs.sign!.permissions).toMatchObject({ 'id-token': 'write', attestations: 'write' })
    expect(release.jobs.publish!.permissions).not.toHaveProperty('id-token')
    expect(JSON.stringify(release.jobs.sign)).not.toContain('secrets.')
  })

  it('preserves target authentication, hosted verification and permission isolation', () => {
    const target = load(readFileSync('deployment/github-pages/deploy-web-app.yml', 'utf8'))
    expect(target.jobs.deploy!.needs).toBe('verify')
    expect(target.jobs.hosted!.needs).toEqual(['verify', 'deploy'])
    expect(JSON.stringify(target.jobs.deploy)).not.toContain('actions/checkout')
    expect(target.jobs.verify!.permissions).not.toHaveProperty('pages')
    expect(JSON.stringify(target)).toContain('verify-target.mts hosted')
    expect(JSON.stringify(target)).not.toContain('node candidate/')
    expect(target.concurrency!['cancel-in-progress']).toBe(false)
  })

  it('resolves reusable calls, pins Actions and retains scheduled suites without CI timing runs', () => {
    for (const file of readdirSync('.github/workflows').filter((name) => name.endsWith('.yml'))) {
      const source = readFileSync(`.github/workflows/${file}`, 'utf8')
      expect(source).not.toMatch(/npm run (?:test:perf|check:full)|perf\.config\.ts/)
      for (const [, path] of source.matchAll(/uses: \.\/(\.github\/workflows\/[^\s]+)/g))
        expect(load(readFileSync(path!, 'utf8')).on).toHaveProperty('workflow_call')
      if (
        [
          'test-and-build-app.yml',
          'run-web-e2e-tests.yml',
          'run-smoke-tests.yml',
          'audit-dependencies.yml',
          'release-new-app-version.yml',
          'create-macos-release-draft.yml',
          'publish-demo-video-and-screenshots.yml',
        ].includes(file)
      ) {
        for (const [, sha] of source.matchAll(/uses: actions\/[^@\s]+@([^\s]+)/g)) expect(sha).toMatch(/^[a-f0-9]{40}$/)
      }
    }
    for (const name of ['run-electron-e2e-tests', 'run-electron-memory-tests']) {
      const suite = workflow(name)
      expect(suite.on).toHaveProperty('schedule')
      expect(suite.on).not.toHaveProperty('push')
      expect(suite.on).not.toHaveProperty('pull_request')
    }
  })
})
