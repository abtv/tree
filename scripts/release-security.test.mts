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

test('release audits the installed snapshot before credentials or release writes', () => {
  const workflow = load(readFileSync('.github/workflows/release.yml', 'utf8')) as {
    jobs: { release: { steps: Array<{ run?: string; 'continue-on-error'?: boolean }> } }
  }
  const steps = workflow.jobs.release.steps
  const audit = steps.findIndex((step) => step.run === 'npm run audit -- --audit-level=high')

  expect(audit).toBeGreaterThan(steps.findIndex((step) => step.run === 'npm ci'))
  expect(steps[audit]?.['continue-on-error']).not.toBe(true)
  expect(audit).toBeLessThan(steps.findIndex((step) => step.run?.includes('gh release create')))
  expect(audit).toBeLessThan(steps.findIndex((step) => step.run?.includes('electron-builder --mac')))
  const build = steps.find((step) => step.run?.includes('electron-builder --mac'))!.run!
  expect(build).toContain('--publish never')
  expect(build).toContain('node scripts/verify-release-fuses.mts dist/mac-arm64/Tree.app')
  expect(build).toContain('node scripts/packaged-smoke.mts dist/mac-arm64/Tree.app')
  expect(build).toContain('xcrun stapler validate dist/Tree-*.dmg')
  expect(build).toContain('spctl --assess --type execute')
})
