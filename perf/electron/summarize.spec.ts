import { freemem } from 'node:os'
import { expect, launchTree, seedDocument, test } from './fixtures'
import { lockSystemClipboard, unlockSystemClipboard } from '../../e2e/electron/fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §15.2
// @requirement PRODUCT.md §22.1
test('typing and memory during real hierarchical on-device summarization', async ({ userDataDir }) => {
  test.skip(process.platform !== 'darwin' || process.arch !== 'arm64', 'Apple Silicon model required')
  test.setTimeout(180_000)
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'project',
          text: 'Reading club project',
          children: Array.from({ length: 80 }, (_, index) => ({
            id: `note-${index}`,
            text: `Meeting note ${index}: Alice brings the books on Friday. Bob reserves the room. The budget is 50 dollars.`,
            children: [],
          })),
        },
        { id: 'typing', text: 'Independent typing: ', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'project' },
  })
  const { app, window } = await launchTree(userDataDir)
  const available = await window.evaluate(() => globalThis.window.treeApi.summarization!.available())
  test.skip(!available, 'Model unavailable; no real inference performance evidence')
  const target = window.getByRole('textbox', { name: 'Node 2', exact: true })
  const source = window.getByRole('textbox', { name: 'Node 1', exact: true })
  const typed = 'abcdefghijklmnopqrstuvwxyz'.repeat(4)
  await target.focus()
  await expect(target).toBeFocused()
  await target.evaluate((element) => {
    const runtime = globalThis as typeof globalThis & { summaryPaints: number[] }
    runtime.summaryPaints = []
    element.addEventListener('input', (event) => {
      const start = event.timeStamp
      requestAnimationFrame(() => requestAnimationFrame(() => runtime.summaryPaints.push(performance.now() - start)))
    })
  })
  const sample = async (): Promise<number[]> => {
    await window.evaluate(() => {
      ;(globalThis as typeof globalThis & { summaryPaints: number[] }).summaryPaints = []
    })
    await window.keyboard.type(typed)
    await window.waitForFunction(
      (count) => (globalThis as typeof globalThis & { summaryPaints: number[] }).summaryPaints.length >= count,
      typed.length,
    )
    return window.evaluate(() => (globalThis as typeof globalThis & { summaryPaints: number[] }).summaryPaints)
  }
  const baseline = await sample()
  const memory = () =>
    app.evaluate(
      ({ app }) => app.getAppMetrics().reduce((total, process) => total + process.memory.workingSetSize, 0) / 1024,
    )
  const beforeMiB = await memory()
  const systemFreeBeforeMiB = freemem() / 1024 / 1024
  let peakMiB = beforeMiB
  await source.click()
  await lockSystemClipboard()
  try {
    const start = performance.now()
    await window.keyboard.press('Meta+Shift+p')
    await window.getByRole('combobox', { name: 'Command' }).fill('summarize')
    await window.keyboard.press('Enter')
    await expect(window.getByRole('button', { name: 'Cancel summarization' })).toBeVisible()
    await target.click()
    await expect(target).toBeFocused()
    const during = await sample()
    await expect(source).toHaveValue('Reading club project')
    await expect(window.getByRole('button', { name: 'Cancel summarization' })).toBeVisible()
    await expect
      .poll(
        async () => {
          peakMiB = Math.max(peakMiB, await memory())
          return window.locator('.summary-status').textContent()
        },
        { timeout: 120_000 },
      )
      .toBe('Summary copied.')
    const elapsedMs = performance.now() - start
    const afterMiB = await memory()
    const p95 = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)]!
    recordPerfResult({
      kind: 'summarization',
      scenario: 'apple-model-hierarchical-80-notes',
      samples: during.length,
      metrics: {
        baselinePaintP95Ms: p95(baseline),
        activePaintP95Ms: p95(during),
        activePaintMaxMs: Math.max(...during),
        elapsedMs,
        electronBeforeMiB: beforeMiB,
        electronPeakMiB: peakMiB,
        electronAfterMiB: afterMiB,
        systemFreeBeforeMiB,
        systemFreeAfterMiB: freemem() / 1024 / 1024,
      },
    })
    expect(p95(during)).toBeLessThan(50)
    expect(Math.max(...during)).toBeLessThan(100)
    expect(peakMiB - beforeMiB).toBeLessThan(256)
  } finally {
    const cancel = window.getByRole('button', { name: 'Cancel summarization' })
    if (await cancel.count()) await cancel.click()
    unlockSystemClipboard()
  }
})
