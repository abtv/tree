import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

// Evaluate only the context references used by these workflow group templates.
// The reusable-workflow context belongs to its caller, as GitHub documents.
function concurrencyGroup(
  workflow: string,
  context: { workflow: string; ref: string; pr?: number; runId?: number; caller?: string },
) {
  const template = workflow.match(/^ {2}group: (.+)$/m)?.[1]
  if (!template) throw new Error('Missing workflow concurrency group')
  const values: Record<string, string | number> = {
    'github.workflow': context.workflow,
    'github.ref': context.ref,
    'github.event.pull_request.number || github.ref': context.pr || context.ref,
    "inputs.caller || 'audit'": context.caller || 'audit',
  }
  return template
    .replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_: string, expression: string) => {
      if (!(expression in values)) throw new Error(`Unsupported concurrency expression: ${expression}`)
      return String(values[expression])
    })
    .toLowerCase()
}

// @requirement PRODUCT.md §1.4
describe('automatic publication wiring', () => {
  it('requires a successful audit before starting tests or allocating macOS runners', async () => {
    for (const [file, job] of [
      ['ci', 'check'],
      ['e2e', 'shard'],
      ['browser', 'chrome'],
      ['e2e-memory', 'memory'],
      ['performance', 'performance'],
      ['property-soak', 'soak'],
      ['mutation', 'mutation'],
      ['demo', 'generate'],
    ]) {
      const workflow = await read(`.github/workflows/${file}.yml`)
      const audit = workflow.split('\n  audit:')[1]!.split(/\n {2}\w+:/)[0]!
      expect(audit).toContain('uses: ./.github/workflows/audit.yml')
      expect(audit).toContain(`caller: ${file}`)
      const section = workflow.split(`\n  ${job}:`)[1]!.split(/\n {2}\w+:/)[0]!
      expect(section).toContain('needs: audit')
      expect(section).not.toMatch(/^ {4}if:/m) // Retain GitHub's default success() gate.
    }
    const release = await read('.github/workflows/release.yml')
    for (const job of ['check', 'electron', 'chrome', 'memory', 'demo']) {
      const section = release.split(`\n  ${job}:`)[1]!.split(/\n {2}\w+:/)[0]!
      expect(section).toMatch(/needs: (?:audit|\[changes, audit\])/)
      expect(section).not.toMatch(/if:.*(?:always\(|!cancelled\()/)
    }
    const audit = await read('.github/workflows/audit.yml')
    expect(audit).toContain('runs-on: ubuntu-24.04')
    expect(audit).toContain('npm audit --audit-level=high')
    expect(audit).toContain("-${{ inputs.caller || 'audit' }}")
    expect(audit).not.toContain('continue-on-error:')
    const context = { workflow: 'CI and browser release', ref: 'refs/heads/main' }
    const callers = ['audit', 'ci', 'e2e', 'browser', 'e2e-memory', 'demo']
    const groups = callers.map((caller) => concurrencyGroup(audit, { ...context, caller }))
    expect(new Set(groups).size).toBe(callers.length)
    const firstPr = concurrencyGroup(audit, { ...context, pr: 1 })
    const secondPr = concurrencyGroup(audit, { ...context, pr: 2 })
    expect(firstPr).not.toBe(secondPr)
  })

  it.each([
    ['sign', 'gate'],
    ['publish', 'sign'],
  ])('lets %s follow a successful %s despite skipped optional ancestors', async (job, prerequisite) => {
    const release = await read('.github/workflows/release.yml')
    const section = release.split(`\n  ${job}:`)[1]!.split(/\n {2}\w+:/)[0]!
    expect(section).toContain(`needs: [${prerequisite}]`)
    // An explicit status function overrides GitHub's implicit success(), which
    // propagates optional ancestor skips even through a successful release gate.
    // Keep the direct prerequisite and source identity checks fail-closed.
    expect(section.match(/^ {4}if: (.+)$/m)?.[1]).toBe(
      `\${{ !cancelled() && needs.${prerequisite}.result == 'success' && github.repository == 'abtv/tree' && github.event_name == 'push' && github.ref == 'refs/heads/main' }}`,
    )
  })

  it('isolates release checks from standalone manual/scheduled runs and from each other', async () => {
    const release = await read('.github/workflows/release.yml')
    const context = { workflow: 'Browser release', ref: 'refs/heads/main' }
    const groups = [concurrencyGroup(release, context)]
    for (const file of ['audit', 'e2e', 'e2e-memory', 'demo', 'ci']) {
      const workflow = await read(`.github/workflows/${file}.yml`)
      const standaloneName = workflow.match(/^name: (.+)$/m)![1]!
      const called = concurrencyGroup(workflow, context)
      const standalone = concurrencyGroup(workflow, { ...context, workflow: standaloneName })
      expect(called, file).not.toBe(standalone)
      groups.push(called)
      expect(workflow).toContain('cancel-in-progress: true')
      // Successive standalone runs still supersede each other on the same ref.
      expect(concurrencyGroup(workflow, { ...context, workflow: standaloneName, runId: 2 })).toBe(standalone)
    }
    expect(new Set(groups).size).toBe(groups.length)
    expect(release).toContain('cancel-in-progress: false')
  })

  it('keeps independent PRs and branches in separate cancellation groups', async () => {
    for (const file of ['ci', 'e2e', 'e2e-memory']) {
      const workflow = await read(`.github/workflows/${file}.yml`)
      const context = { workflow: workflow.match(/^name: (.+)$/m)![1]!, ref: 'refs/heads/main' }
      expect(concurrencyGroup(workflow, { ...context, pr: 12 })).not.toBe(
        concurrencyGroup(workflow, { ...context, pr: 13 }),
      )
      expect(concurrencyGroup(workflow, context)).not.toBe(
        concurrencyGroup(workflow, { ...context, ref: 'refs/heads/feature' }),
      )
    }
    const demo = await read('.github/workflows/demo.yml')
    expect(concurrencyGroup(demo, { workflow: 'Generate demo', ref: 'refs/heads/main' })).not.toBe(
      concurrencyGroup(demo, { workflow: 'Generate demo', ref: 'refs/heads/feature' }),
    )
  })
  it('never executes publisher-controlled target verifier scripts', async () => {
    const target = await read('deployment/github-pages/pages.yml')
    expect(target).not.toContain('run: node .github/scripts/')
    expect(target).toContain('repository: abtv/tree')
  })
  it('gates same-run transfer on every applicable check and keeps secrets out of check jobs', async () => {
    const release = await read('.github/workflows/release.yml')
    expect(release).toContain('branches: [main]')
    expect(release).not.toContain('pull_request_target')
    expect(release).not.toContain('workflow_run:')
    expect(release).toContain('needs: [changes, check, electron, audit, chrome, memory, demo]')
    expect(release).toMatch(/gate:\n\s+name: Release gate\n\s+if: always\(\)/)
    expect(release).toMatch(/sign:\n[\s\S]*?needs: \[gate\]/)
    expect(release).toMatch(/publish:\n[\s\S]*?needs: \[sign\]/)
    expect(release).toContain("github.repository == 'abtv/tree' && github.event_name == 'push'")
    expect(release).toContain('name: browser-${{ github.sha }}-${{ github.run_attempt }}')
    expect(release).toContain('permission-contents: write')
    expect(release).toContain('repositories: tree-editor.github.io')
    const selection = release.split('\n  changes:')[1]!.split('\n  check:')[0]
    expect(selection).toContain('actions: read')
    expect(selection).toContain('GH_TOKEN: ${{ github.token }}')
    expect(selection).toContain('fetch-depth: 0')
    expect(selection).toContain('cli.mts changes "$BEFORE_SHA" "$GITHUB_SHA"')
    const checks = release.split('\n  publish:')[0]
    expect(checks).not.toContain('secrets.')
    expect(checks).not.toContain('secrets: inherit')
    const browser = await read('.github/workflows/browser.yml')
    expect(browser).toContain('npm run test:web:built')
    expect(browser).toContain('include-hidden-files: true')
    expect(browser).not.toContain('npm run build:web') // No rebuilding after Chrome passes.
  })

  it('preserves PR, scheduled/manual and six-shard coverage without duplicate main triggers', async () => {
    for (const name of ['ci', 'e2e', 'audit', 'demo', 'e2e-memory']) {
      const text = await read(`.github/workflows/${name}.yml`)
      expect(text).toContain('workflow_call:')
      expect(text).not.toMatch(/^ {2}push:/m)
      if (['ci', 'e2e', 'e2e-memory'].includes(name)) expect(text).toContain('pull_request:')
      if (['audit', 'e2e-memory'].includes(name)) expect(text).toContain('schedule:')
      if (name !== 'ci') expect(text).toContain('workflow_dispatch:')
    }
    const electron = await read('.github/workflows/e2e.yml')
    expect(electron).toContain('shard: [1, 2, 3, 4, 5, 6]')
    expect(electron).toContain('test "${{ needs.shard.result }}" = "success"')
    const demo = await read('.github/workflows/demo.yml')
    expect(demo).toContain('path: reports/site/')
    expect(demo).not.toContain('tree-editor.github.io')
  })

  it('deploys the transferred package with repeated provenance guards and serialized publication', async () => {
    const target = await read('deployment/github-pages/pages.yml')
    expect(target).toContain('cancel-in-progress: false')
    expect(target).toContain('path: candidate/site/')
    expect(target).toContain('pages: write')
    expect(target).toContain('id-token: write')
    expect(target).not.toMatch(/npm |node (?:candidate|site)\//)
    expect(target).toContain('verify-target.mts hosted verified-provenance')
    const verify = target.split('\n  verify:')[1]!.split('\n  deploy:')[0]
    const deploy = target.split('\n  deploy:')[1]!.split('\n  hosted:')[0]
    expect(verify).not.toMatch(/pages: write|id-token: write/)
    expect(deploy).not.toMatch(/actions\/checkout|run:/)
    expect(deploy).toContain('needs: verify')
    expect(deploy).toContain('if: ${{ !inputs.rejection_probe }}')
    expect(verify).toContain('verify-target.mts rejection-probe candidate')
    expect(deploy).toContain('Target candidate superseded')
    expect(deploy).toContain('Source candidate superseded')
  })

  it('pins every Action reachable by source and target publication to an immutable SHA', async () => {
    for (const path of ['ci', 'e2e', 'audit', 'demo', 'e2e-memory', 'browser', 'release']
      .map((name) => `.github/workflows/${name}.yml`)
      .concat('deployment/github-pages/pages.yml')) {
      const workflow = await read(path)
      const actions = [...workflow.matchAll(/uses:\s+(actions\/[^@\s]+)@([^\s]+)/g)]
      expect(actions.length).toBeGreaterThan(0)
      for (const [, , sha] of actions) expect(sha).toMatch(/^[a-f0-9]{40}$/)
    }
    const release = await read('.github/workflows/release.yml')
    const sign = release.split('\n  sign:')[1]!.split('\n  publish:')[0]
    const publish = release.split('\n  publish:')[1]
    expect(sign).toContain('attestations: write')
    expect(sign).toContain('subject-path: signed-browser/web-provenance.json')
    expect(sign).not.toContain('secrets.')
    expect(publish).not.toMatch(/id-token: write|attestations: write/)
    expect(publish).toContain('name: signed-browser-${{ github.sha }}-${{ github.run_attempt }}')
  })
})
