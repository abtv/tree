import { expect, launchTree, largeSeed, round, seedDocument, test, wideSeed, type Seed } from './fixtures'

const TYPED = 'abcdefghijklmnopqrstuvwxyz'.repeat(4)

function summarize(samples: number[]): { median: number; p95: number; max: number } {
  const sorted = [...samples].sort((left, right) => left - right)
  const at = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!
  return { median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]! }
}

async function measureTyping(userDataDir: string, scenario: string, seed: Seed): Promise<void> {
  seedDocument(userDataDir, seed)
  const { window } = await launchTree(userDataDir)
  await window.getByRole('textbox').first().focus()

  await window.evaluate(() => {
    const commits: number[] = []
    const paints: number[] = []
    const store = window as unknown as { commits: number[]; paints: number[] }
    store.commits = commits
    store.paints = paints
    const target = document.activeElement as HTMLElement
    target.addEventListener('input', (event) => {
      const start = event.timeStamp
      queueMicrotask(() => commits.push(performance.now() - start))
      requestAnimationFrame(() => requestAnimationFrame(() => paints.push(performance.now() - start)))
    })
  })

  await window.keyboard.type(TYPED)
  await window.waitForFunction(
    (count) => (window as unknown as { paints: number[] }).paints.length >= count,
    TYPED.length,
  )
  const measured = await window.evaluate(() => {
    const store = window as unknown as { commits: number[]; paints: number[] }
    return { commits: store.commits.slice(), paints: store.paints.slice() }
  })

  const commit = summarize(measured.commits)
  const paint = summarize(measured.paints)

  console.log(
    `PERF ${JSON.stringify({
      kind: 'typing',
      scenario,
      commitMedianMs: round(commit.median),
      commitP95Ms: round(commit.p95),
      paintMedianMs: round(paint.median),
      paintP95Ms: round(paint.p95),
      paintMaxMs: round(paint.max),
      samples: measured.paints.length,
    })}`,
  )

  expect(measured.paints.length).toBeGreaterThan(0)
  expect(measured.paints.length).toBeGreaterThanOrEqual(100)
  expect(paint.p95).toBeLessThan(100)
  expect(paint.max).toBeLessThan(250)
}

test.describe('typing latency', () => {
  test('wide-1000', async ({ userDataDir }) => {
    await measureTyping(userDataDir, 'wide-1000', wideSeed(1_000))
  })

  test('large-10000', async ({ userDataDir }) => {
    await measureTyping(userDataDir, 'large-10000', largeSeed(100, 100))
  })
})
