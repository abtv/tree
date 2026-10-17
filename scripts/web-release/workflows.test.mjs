import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

// @requirement PRODUCT.md §1.4
describe('automatic publication wiring', () => {
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
    const selection = release.split('\n  changes:')[1].split('\n  check:')[0]
    expect(selection).toContain('actions: read')
    expect(selection).toContain('GH_TOKEN: ${{ github.token }}')
    expect(selection).toContain('fetch-depth: 0')
    expect(selection).toContain('cli.mjs changes "$BEFORE_SHA" "$GITHUB_SHA"')
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
    expect(target).toContain('verify-target.mjs hosted verified-provenance')
    const verify = target.split('\n  verify:')[1].split('\n  deploy:')[0]
    const deploy = target.split('\n  deploy:')[1].split('\n  hosted:')[0]
    expect(verify).not.toMatch(/pages: write|id-token: write/)
    expect(deploy).not.toMatch(/actions\/checkout|run:/)
    expect(deploy).toContain('needs: verify')
    expect(deploy).toContain('if: ${{ !inputs.rejection_probe }}')
    expect(verify).toContain('verify-target.mjs rejection-probe candidate')
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
    const sign = release.split('\n  sign:')[1].split('\n  publish:')[0]
    const publish = release.split('\n  publish:')[1]
    expect(sign).toContain('attestations: write')
    expect(sign).toContain('subject-path: signed-browser/web-provenance.json')
    expect(sign).not.toContain('secrets.')
    expect(publish).not.toMatch(/id-token: write|attestations: write/)
    expect(publish).toContain('name: signed-browser-${{ github.sha }}-${{ github.run_attempt }}')
  })
})
