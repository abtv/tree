import { globSync, readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const shards = ['domain', 'application', 'renderer', 'web', 'shared', 'electron', 'infrastructure']

it.each(shards)('selects only the configured %s mutation scope', async (shard) => {
  vi.stubEnv('TREE_MUTATION_SHARD', shard)
  const { default: config } = await import('../config/testing/stryker.config.mjs')
  const included = config.mutate.filter((pattern) => !pattern.startsWith('!'))

  expect(included.length).toBeGreaterThan(0)
  expect(included.every((pattern) => pattern.startsWith(`src/${shard}/`))).toBe(true)
})

it('retains every full-run module in exactly one selectable shard', async () => {
  vi.stubEnv('TREE_MUTATION_SHARD', '')
  const { default: full } = await import('../config/testing/stryker.config.mjs')
  const scheduled = []
  for (const shard of shards) {
    vi.stubEnv('TREE_MUTATION_SHARD', shard)
    vi.resetModules()
    const { default: config } = await import('../config/testing/stryker.config.mjs')

    scheduled.push(...config.mutate.filter((pattern) => !pattern.startsWith('!')))

    expect(config.mutate.filter((pattern) => pattern.startsWith('!'))).toEqual(
      full.mutate.filter((pattern) => pattern.startsWith('!')),
    )
  }

  expect(scheduled).toEqual(full.mutate.filter((pattern) => !pattern.startsWith('!')))
  expect(new Set(scheduled).size).toBe(scheduled.length)
})

it('rejects an unknown shard rather than silently running a different scope', async () => {
  vi.stubEnv('TREE_MUTATION_SHARD', 'unknown')

  await expect(import('../config/testing/stryker.config.mjs')).rejects.toThrow('Unknown mutation shard')
})

it('includes new production layers without mutating tests, declarations, or test helpers', async () => {
  vi.stubEnv('TREE_MUTATION_SHARD', '')
  const { default: config } = await import('../config/testing/stryker.config.mjs')
  const files = globSync(
    config.mutate.filter((pattern) => !pattern.startsWith('!')),
    {
      exclude: config.mutate.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1)),
    },
  )

  expect(files).toEqual(
    expect.arrayContaining([
      'src/web/main.tsx',
      'src/web/storage-persistence.ts',
      'src/shared/png-validation.ts',
      'src/electron/main/ipc-security.ts',
      'src/infrastructure/main/notes-replacement.ts',
    ]),
  )
  expect(files.some((file) => /\.test\.|\.d\.ts$|-test-utils\.ts$/.test(file))).toBe(false)
})

it('lets the scheduled workflow select the scope from the Stryker configuration', () => {
  const workflow = readFileSync(new URL('../.github/workflows/run-mutation-testing.yml', import.meta.url), 'utf8')

  expect(workflow).toContain('shard: [renderer, web, shared, electron, infrastructure]')
  expect(workflow).toContain('TREE_MUTATION_SHARD: ${{ matrix.shard }}')
  expect(workflow).not.toContain('--mutate')
})
