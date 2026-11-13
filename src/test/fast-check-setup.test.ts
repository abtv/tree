import fc from 'fast-check'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('fast-check', () => ({ default: { configureGlobal: vi.fn() } }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('TREE_PROPERTY_RUNS', undefined)
  vi.stubEnv('FC_SEED', undefined)
  vi.stubEnv('FC_PATH', undefined)
})

afterEach(() => vi.unstubAllEnvs())

it.each([undefined, ''])('leaves fast-check to choose a random seed when replay settings are %j', async (value) => {
  vi.stubEnv('FC_SEED', value)
  vi.stubEnv('FC_PATH', value)

  await import('./fast-check-setup')

  expect(fc.configureGlobal).toHaveBeenCalledExactlyOnceWith({ numRuns: 100 })
})

it.each(['0', '-17', '2147483647'])('preserves the replay seed %s and path', async (seed) => {
  vi.stubEnv('FC_SEED', seed)
  vi.stubEnv('FC_PATH', '2:1:0')

  await import('./fast-check-setup')

  expect(fc.configureGlobal).toHaveBeenCalledExactlyOnceWith({ numRuns: 100, seed: Number(seed), path: '2:1:0' })
})

it('applies the property multiplier to the global default', async () => {
  vi.stubEnv('TREE_PROPERTY_RUNS', '20')

  await import('./fast-check-setup')

  expect(fc.configureGlobal).toHaveBeenCalledExactlyOnceWith({ numRuns: 2000 })
})

it.each(['0.5', 'NaN', 'Infinity', 'not-a-seed'])(
  'rejects an invalid replay seed %s before configuring tests',
  async (seed) => {
    vi.stubEnv('FC_SEED', seed)

    await expect(import('./fast-check-setup')).rejects.toThrow('FC_SEED must be an integer')

    expect(fc.configureGlobal).not.toHaveBeenCalled()
  },
)
