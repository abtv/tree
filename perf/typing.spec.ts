import { expect, launchTree, largeSeed, round, seedDocument, test, wideSeed, type Seed } from './fixtures'
import { recordPerfResult } from './results'

const TYPED = 'abcdefghijklmnopqrstuvwxyz'.repeat(4)

interface TypingTarget {
  label: string
  initialText: string
  parentLabel?: string
}

function summarize(samples: number[]): { median: number; p95: number; max: number } {
  const sorted = [...samples].sort((left, right) => left - right)
  const at = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!
  return { median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]! }
}

async function measureTyping(userDataDir: string, scenario: string, seed: Seed, target: TypingTarget): Promise<number> {
  seedDocument(userDataDir, seed)
  const { window } = await launchTree(userDataDir)
  const expected = window.getByRole('textbox', { name: target.label, exact: true })
  const parentHeading =
    target.parentLabel === undefined
      ? undefined
      : window.getByRole('textbox', { name: target.parentLabel, exact: true })
  await expected.focus()
  await expect(expected).toBeFocused()
  await expect(expected).toHaveValue(target.initialText)
  const parentBefore = parentHeading === undefined ? undefined : await parentHeading.inputValue()

  await expected.evaluate((element) => {
    const inputTurnaround: number[] = []
    const paints: number[] = []
    const store = window as unknown as { inputTurnaround: number[]; paints: number[] }
    store.inputTurnaround = inputTurnaround
    store.paints = paints
    element.addEventListener('input', (event) => {
      const start = event.timeStamp
      queueMicrotask(() => inputTurnaround.push(performance.now() - start))
      requestAnimationFrame(() => requestAnimationFrame(() => paints.push(performance.now() - start)))
    })
  })

  const typingStart = performance.now()
  await window.keyboard.type(TYPED)
  const typingMs = performance.now() - typingStart
  await window.waitForFunction(
    (count) => (window as unknown as { paints: number[] }).paints.length >= count,
    TYPED.length,
  )
  const measured = await window.evaluate(() => {
    const store = window as unknown as { inputTurnaround: number[]; paints: number[] }
    return { inputTurnaround: store.inputTurnaround.slice(), paints: store.paints.slice() }
  })

  await expect(expected).toHaveValue(new RegExp(TYPED))
  if (parentHeading !== undefined && parentBefore !== undefined) {
    await expect(parentHeading).toHaveValue(parentBefore)
  }

  const turnaround = summarize(measured.inputTurnaround)
  const paint = summarize(measured.paints)

  recordPerfResult({
    kind: 'typing',
    scenario,
    samples: measured.paints.length,
    metrics: {
      typingMs: round(typingMs),
      inputTurnaroundMedianMs: round(turnaround.median),
      inputTurnaroundP95Ms: round(turnaround.p95),
      paintMedianMs: round(paint.median),
      paintP95Ms: round(paint.p95),
      paintMaxMs: round(paint.max),
    },
  })

  expect(measured.paints.length).toBeGreaterThan(0)
  expect(measured.paints.length).toBeGreaterThanOrEqual(100)
  expect(paint.p95).toBeLessThan(100)
  expect(paint.max).toBeLessThan(250)
  return typingMs
}

test.describe('typing latency', () => {
  test('wide-1000', async ({ userDataDir }) => {
    await measureTyping(userDataDir, 'wide-1000', wideSeed(1_000), {
      label: 'Node 1',
      initialText: 'Child 0',
      parentLabel: 'Current parent',
    })
  })

  test('wide-10000', async ({ userDataDir }) => {
    const typingMs = await measureTyping(userDataDir, 'wide-10000', wideSeed(10_000), {
      label: 'Node 1',
      initialText: 'Child 0',
      parentLabel: 'Current parent',
    })
    expect(typingMs).toBeLessThan(8_000)
  })

  test('large-10000', async ({ userDataDir }) => {
    await measureTyping(userDataDir, 'large-10000', largeSeed(100, 100), {
      label: 'Node 1',
      initialText: 'Root 0',
    })
  })

  test('large-100000', async ({ userDataDir }) => {
    const seed = largeSeed(316, 316)
    seed.location = { currentParentId: 'r315', selectedNodeId: 'r315c315' }
    const typingMs = await measureTyping(userDataDir, 'large-100000', seed, {
      label: 'Node 316',
      initialText: 'Node 315.315',
      parentLabel: 'Current parent',
    })
    expect(typingMs).toBeLessThan(1_500)
  })
})
