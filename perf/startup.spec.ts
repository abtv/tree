import { performance as nodePerformance } from 'node:perf_hooks'
import { expect, launchTree, largeSeed, round, seedDocument, test, wideSeed, type Seed } from './fixtures'
import { recordPerfResult } from './results'

async function measureStartup(
  userDataDir: string,
  scenario: string,
  options: { seed?: Seed; rendererCeilingMs?: number } = {},
): Promise<void> {
  const launchSamples: number[] = []
  const rendererSamples: number[] = []
  for (let repetition = 0; repetition < 3; repetition += 1) {
    if (options.seed !== undefined) seedDocument(userDataDir, options.seed)
    const start = nodePerformance.now()
    const { window } = await launchTree(userDataDir)
    launchSamples.push(nodePerformance.now() - start)
    rendererSamples.push(await window.evaluate(() => performance.now()))
  }
  const range = (samples: number[]): { min: number; max: number } => ({
    min: round(Math.min(...samples)),
    max: round(Math.max(...samples)),
  })
  const launch = range(launchSamples)
  const renderer = range(rendererSamples)

  recordPerfResult({
    kind: 'startup',
    scenario,
    samples: launchSamples.length,
    metrics: { launchMs: launch, rendererMs: renderer },
  })

  expect(launch.max).toBeLessThan(2_000)
  expect(renderer.max).toBeLessThan(options.rendererCeilingMs ?? 1_000)
}

test.describe('startup', () => {
  test('fresh', async ({ userDataDir }) => {
    await measureStartup(userDataDir, 'fresh')
  })

  test('wide-1000', async ({ userDataDir }) => {
    await measureStartup(userDataDir, 'wide-1000', { seed: wideSeed(1_000) })
  })

  test('wide-10000', async ({ userDataDir }) => {
    await measureStartup(userDataDir, 'wide-10000', { seed: wideSeed(10_000), rendererCeilingMs: 2_000 })
  })

  test('large-10000', async ({ userDataDir }) => {
    await measureStartup(userDataDir, 'large-10000', { seed: largeSeed(100, 100) })
  })
})
