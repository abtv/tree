import { expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from '../results'

interface ProbeSample {
  phase: string
  type: string
  handlerMs: number
}

interface ProbeWindow extends Window {
  mediumPhase: string
  mediumSamples: ProbeSample[]
  mediumFrames: number[]
}

function summarize(samples: number[]): { p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number } {
  const sorted = samples.toSorted((left, right) => left - right)
  const at = (fraction: number): number => round(sorted[Math.floor(sorted.length * fraction)]!)
  return { p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: round(sorted.at(-1)!) }
}

// @requirement PRODUCT.md §20.1
// @requirement PRODUCT.md §22.2
test('medium Tree lists bound keyboard handler latency and mounted rows', async ({ userDataDir }) => {
  seedDocument(userDataDir, wideSeed(500))
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const input = window.locator('[data-node-id="c10"] .node-input')
  await input.focus()

  await expect(input).toBeFocused()
  expect(await window.locator('.node-row').count()).toBeLessThan(100)

  for (let index = 0; index < 10; index += 1) {
    await window.keyboard.press('j')
    await window.keyboard.press('k')
  }

  await window.evaluate(() => {
    const probe = window as unknown as ProbeWindow
    probe.mediumPhase = 'navigation'
    probe.mediumSamples = []
    probe.mediumFrames = []
    const starts = new WeakMap<Event, number>()
    for (const type of ['keydown', 'input']) {
      globalThis.addEventListener(type, (event) => starts.set(event, performance.now()), true)
      globalThis.addEventListener(type, (event) => {
        if (type === 'keydown' && !['j', 'k', 'Enter', 'Backspace'].includes((event as KeyboardEvent).key)) return
        probe.mediumSamples.push({ phase: probe.mediumPhase, type, handlerMs: performance.now() - starts.get(event)! })
        if (type === 'keydown' && probe.mediumPhase !== 'typing') {
          const start = event.timeStamp
          requestAnimationFrame(() => requestAnimationFrame(() => probe.mediumFrames.push(performance.now() - start)))
        }
      })
    }
  })

  for (let index = 0; index < 100; index += 1) {
    await window.keyboard.press('j')
    await window.keyboard.press('k')
  }

  await expect(input).toBeFocused()

  await window.keyboard.press('i')
  await input.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(element.value.length, element.value.length)
  })
  await window.evaluate(() => ((window as unknown as ProbeWindow).mediumPhase = 'typing'))
  const typed = 'abcdefghijklmnopqrstuvwxyz'.repeat(4)

  await window.keyboard.type(typed)

  await expect(input).toHaveValue(`Child 10${typed}`)
  await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Root')

  await window.evaluate(() => ((window as unknown as ProbeWindow).mediumPhase = 'split-merge'))
  for (let index = 0; index < 30; index += 1) {
    await window.keyboard.press('Enter')
    await window.keyboard.press('Backspace')
  }

  await expect(input).toBeFocused()
  await expect(input).toHaveValue(`Child 10${typed}`)
  await window.waitForFunction(() => (window as unknown as ProbeWindow).mediumFrames.length === 260)
  const measured = await window.evaluate(() => {
    const probe = window as unknown as ProbeWindow
    return { samples: probe.mediumSamples, frames: probe.mediumFrames }
  })

  for (const [phase, count] of [
    ['navigation', 200],
    ['typing', 104],
    ['split-merge', 60],
  ] as const) {
    const type = phase === 'typing' ? 'input' : 'keydown'
    const samples = measured.samples.filter((sample) => sample.phase === phase && sample.type === type)

    expect(samples).toHaveLength(count)

    const metrics = summarize(samples.map((sample) => sample.handlerMs))
    recordPerfResult({ kind: 'state', scenario: `medium-500-${phase}-handler`, samples: count, metrics })

    // Same-machine investigation: the previous unwindowed list had navigation p95 about 8 ms
    // and split/merge p95 about 15 ms. Windowed runs were around 1 ms, leaving headroom here.
    expect(metrics.p95Ms).toBeLessThan(5)
    expect(metrics.maxMs).toBeLessThan(30)
  }
  const frames = summarize(measured.frames)
  recordPerfResult({ kind: 'state', scenario: 'medium-500-key-to-two-raf', samples: 260, metrics: frames })

  // This is a frame-aligned observation, not paint completion or input-to-photon latency.
  expect(frames.p95Ms).toBeLessThan(50)
  expect(frames.maxMs).toBeLessThan(100)
})
