import { expect, launchTree, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §20.14
test('complete-document search keeps rendered results bounded and accepts fresh input', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'parent',
          text: 'Parent',
          children: Array.from({ length: 10_000 }, (_, i) => ({
            id: `n${i}`,
            text: `Needle ${i} #work`,
            children: [],
          })),
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'parent' },
  })
  const { window } = await launchTree(userDataDir)
  await window.keyboard.press('Meta+;')
  const input = window.getByRole('searchbox')
  await expect(input).toBeFocused()
  const start = performance.now()
  await input.fill('Needle')
  await expect(window.getByRole('option').first()).toContainText('Needle 0')
  const completeMs = performance.now() - start
  expect(await window.getByRole('option').count()).toBeLessThanOrEqual(40)
  await window.keyboard.press('ArrowUp')
  await expect(window.locator('[role="option"][aria-selected="true"]')).toContainText('Needle 9999')
  await window.keyboard.press('ArrowDown')
  const arrowPaint = await input.evaluate(async (element) => {
    const samples: number[] = []
    for (let step = 0; step < 24; step++) {
      const start = performance.now()
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    return { p95Ms: samples[Math.floor(samples.length * 0.95)]!, maxMs: samples.at(-1)! }
  })
  await expect(window.locator('[role="option"][aria-selected="true"]')).toContainText('Needle 24')
  const scroll = await window.locator('.node-search-results').evaluate(async (element) => {
    const maximum = element.scrollHeight - element.clientHeight
    const frames: number[] = []
    let mountedMax = 0
    let previous = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
    for (let step = 0; step < 60; step++) {
      const fraction = (step % 30) / 29
      element.scrollTop = maximum * (step < 30 ? fraction : 1 - fraction)
      const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
      frames.push(now - previous)
      previous = now
      mountedMax = Math.max(mountedMax, element.querySelectorAll('[role="option"]').length)
    }
    frames.sort((a, b) => a - b)
    return { p95Ms: frames[Math.floor(frames.length * 0.95)]!, maxMs: frames.at(-1)!, mountedMax }
  })
  const paintMs = await input.evaluate(async (element) => {
    const start = performance.now()
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, 'missing')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return performance.now() - start
  })
  await expect(window.getByText('No results', { exact: true })).toBeVisible()
  await expect(window.locator('[data-node-id="parent"] .node-input')).toHaveValue('Parent')
  recordPerfResult({
    kind: 'node-search',
    scenario: 'wide-10000-results',
    samples: 1,
    metrics: {
      completeMs,
      paintMs,
      arrowPaintP95Ms: arrowPaint.p95Ms,
      arrowPaintMaxMs: arrowPaint.maxMs,
      scrollFrameP95Ms: scroll.p95Ms,
      scrollFrameMaxMs: scroll.maxMs,
      scrollMountedMax: scroll.mountedMax,
    },
  })
  expect(completeMs).toBeLessThan(2000)
  expect(paintMs).toBeLessThan(150)
  expect(arrowPaint.p95Ms).toBeLessThan(80)
  expect(scroll.p95Ms).toBeLessThan(50)
  expect(scroll.maxMs).toBeLessThan(100)
  expect(scroll.mountedMax).toBeLessThanOrEqual(40)
})
