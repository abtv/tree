import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (text: string) => unknown }

test('production packaging requires the security fuse policy', () => {
  const config = load(readFileSync('electron-builder.yml', 'utf8')) as { electronFuses: Record<string, boolean> }

  expect(config.electronFuses).toMatchObject({
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  })
})

test('packages attributed About credits outside the application archive', () => {
  const config = load(readFileSync('electron-builder.yml', 'utf8')) as { extraResources: unknown[] }

  expect(config.extraResources).toContainEqual({ from: 'assets/about/Credits.html', to: 'Credits.html' })
  expect(readFileSync('assets/about/Credits.html', 'utf8')).toContain(
    '<a href="https://github.com/abtv/tree">GitHub repository</a>',
  )
})

test('release reuses authenticated main checks before credentials or release writes', () => {
  const workflow = load(readFileSync('.github/workflows/create-macos-release-draft.yml', 'utf8')) as {
    jobs: {
      candidate: { steps: Array<{ run?: string; with?: { ref?: string } }>; permissions?: unknown }
      release: { needs: string; if: string; steps: Array<{ run?: string; 'continue-on-error'?: boolean }> }
    }
  }
  const steps = workflow.jobs.release.steps
  const gate = steps.findIndex((step) => step.run === 'node scripts/release-draft.mts reserve')

  expect(workflow.jobs.release.needs).toBe('candidate')
  expect(workflow.jobs.release.if).toBe("needs.candidate.outputs.ready == 'true'")
  expect(workflow.jobs.candidate.steps.some((step) => step.run === 'node scripts/release-draft.mts plan')).toBe(true)
  expect(gate).toBeGreaterThan(-1)
  expect(gate).toBeLessThan(steps.findIndex((step) => step.run === 'npm ci'))
  expect(steps[gate]?.['continue-on-error']).not.toBe(true)
  expect(gate).toBeLessThan(steps.findIndex((step) => step.run?.includes('electron-builder --mac')))
  expect(
    steps.some((step) => /npm run (check|audit|test:perf|test:e2e|test:smoke:electron)/.test(step.run ?? '')),
  ).toBe(false)
  const build = steps.find((step) => step.run?.includes('electron-builder --mac'))!.run!
  expect(build).toContain('--publish never')
  expect(build).toContain('node scripts/verify-release-fuses.mts dist/mac-arm64/Tree.app')
  expect(build).toContain('node scripts/packaged-smoke.mts dist/mac-arm64/Tree.app')
  expect(build).toContain('xcrun stapler validate dist/Tree-*.dmg')
  expect(build).toContain('spctl --assess --type execute')
  const text = readFileSync('.github/workflows/create-macos-release-draft.yml', 'utf8')
  const header = text.split('\njobs:')[0]!
  const candidate = text.split('\n  candidate:')[1]!.split('\n  release:')[0]!
  expect(header).toContain('contents: read')
  expect(header).not.toContain('contents: write')
  expect(candidate).toContain("github.event_name == 'workflow_dispatch'")
  expect(candidate).toContain("github.ref == 'refs/heads/main'")
  expect(candidate).toContain('ref: ${{ github.sha }}')
  expect(candidate).not.toContain('secrets.')
  expect(text.slice(0, text.indexOf('      - name: Build signed and notarized DMG'))).not.toContain('secrets.')
  expect(text).toContain('workflow_call:')
  expect(text).toContain('VALIDATION_RUN_ID: ${{ inputs.run_id }}')
  expect(text).toContain('group: release-macos-main')
  expect(text).toContain('cancel-in-progress: false')
  expect(text).toContain('ref: ${{ needs.candidate.outputs.sha }}')
  expect(text).toContain('node scripts/release-draft.mts upload')
  expect(text).not.toContain('--draft=false')
  expect(text).not.toContain('--clobber')
})
