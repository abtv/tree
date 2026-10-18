import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))

it('loads script libraries with native Node type stripping and no transpilation loader', () => {
  const modules = [
    './scripts/product-sections.mts',
    './scripts/perf-report.mts',
    './scripts/retire-file.mts',
    './scripts/retire-scratch.mts',
    './scripts/e2e-diagnose.mts',
    './scripts/web/static-server.mts',
    './scripts/web-release/prepare.mts',
    './scripts/web-release/publish.mts',
    './scripts/web-release/selection.mts',
    './scripts/web-release/verify-target.mts',
  ]
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `for (const path of ${JSON.stringify(modules)}) await import(path)`, 'runtime-smoke'],
    { cwd: root, encoding: 'utf8' },
  )
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
})

it.each(['cli', 'publish', 'verify-target'])('preserves the installed %s.mjs release entry point', (name) => {
  const run = (extension: string) =>
    spawnSync(process.execPath, [`scripts/web-release/${name}.${extension}`], { cwd: root, encoding: 'utf8' })
  const legacy = run('mjs')
  const migrated = run('mts')
  expect(legacy.error).toBeUndefined()
  expect(migrated.error).toBeUndefined()
  expect(migrated.status).toBe(1)
  expect(legacy.status).toBe(migrated.status)
  expect(legacy.stdout).toBe(migrated.stdout)
  expect(legacy.stderr).toBe(migrated.stderr)
})
