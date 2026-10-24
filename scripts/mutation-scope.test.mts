import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it.each(['domain', 'application', 'renderer'])('selects only the configured %s mutation scope', async (shard) => {
  vi.stubEnv('TREE_MUTATION_SHARD', shard)
  const { default: config } = await import('../stryker.config.mjs')
  const included = config.mutate.filter((pattern) => !pattern.startsWith('!'))
  expect(included.length).toBeGreaterThan(0)
  expect(included.every((pattern) => pattern.startsWith(`src/${shard}/`))).toBe(true)
})

it('retains every full-run module in exactly one scheduled shard', async () => {
  vi.stubEnv('TREE_MUTATION_SHARD', '')
  const { default: full } = await import('../stryker.config.mjs')
  const scheduled = []
  for (const shard of ['domain', 'application', 'renderer']) {
    vi.stubEnv('TREE_MUTATION_SHARD', shard)
    vi.resetModules()
    const { default: config } = await import('../stryker.config.mjs')
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
  await expect(import('../stryker.config.mjs')).rejects.toThrow('Unknown mutation shard')
})

it('lets the scheduled workflow select the scope from the Stryker configuration', () => {
  const workflow = readFileSync(new URL('../.github/workflows/run-mutation-testing.yml', import.meta.url), 'utf8')
  expect(workflow).toContain('shard: [domain, application, renderer]')
  expect(workflow).toContain('TREE_MUTATION_SHARD: ${{ matrix.shard }}')
  expect(workflow).not.toContain('--mutate')
})
