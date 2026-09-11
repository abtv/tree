import { performance as nodePerformance } from 'node:perf_hooks'
import { expect, launchTree, largeSeed, round, seedDocument, test, wideSeed, type Seed } from './fixtures'

async function measureStartup(userDataDir: string, scenario: string, seed?: Seed): Promise<void> {
  if (seed !== undefined) {
    seedDocument(userDataDir, seed)
  }

  const start = nodePerformance.now()
  const { window } = await launchTree(userDataDir)
  const launchMs = nodePerformance.now() - start
  const rendererMs = await window.evaluate(() => performance.now())

  console.log(`PERF ${JSON.stringify({ kind: 'startup', scenario, launchMs: round(launchMs), rendererMs: round(rendererMs) })}`)

  expect(launchMs).toBeLessThan(15_000)
  expect(rendererMs).toBeLessThan(15_000)
}

test.describe('startup', () => {
  test('fresh', async ({ userDataDir }) => {
    await measureStartup(userDataDir, 'fresh')
  })

  test('wide-1000', async ({ userDataDir }) => {
    await measureStartup(userDataDir, 'wide-1000', wideSeed(1_000))
  })

  test('large-10000', async ({ userDataDir }) => {
    await measureStartup(userDataDir, 'large-10000', largeSeed(100, 100))
  })
})
