import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

async function settings(scale: string | undefined) {
  vi.stubEnv('TREE_PROPERTY_RUNS', scale)
  return import('./property-runs')
}

it.each([undefined, ''])('uses the ordinary property budget when the scale is %j', async (scale) => {
  const { propertyRunScale, propertyRuns } = await settings(scale)

  expect(propertyRunScale).toBe(1)
  expect(propertyRuns(100)).toBe(100)
})

it('rounds fractional run counts and keeps at least one run', async () => {
  const { propertyRuns } = await settings('0.15')

  expect(propertyRuns(10)).toBe(2)
  expect(propertyRuns(1)).toBe(1)
})

it('caps the multiplier for properties that retain mocks', async () => {
  const { propertyRunScale, propertyRuns } = await settings('20')

  expect(propertyRunScale).toBe(20)
  expect(propertyRuns(100)).toBe(2000)
  expect(propertyRuns(100, 3)).toBe(300)
  expect(propertyRuns(100, 30)).toBe(2000)
})

it.each(['0', '-1', 'NaN', 'Infinity', 'not-a-number'])(
  'rejects an invalid scale rather than silently reducing coverage: %s',
  async (scale) => {
    await expect(settings(scale)).rejects.toThrow('TREE_PROPERTY_RUNS must be a positive number')
  },
)
