import { expect, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §20.1
// @requirement PRODUCT.md §22.1
test('Tree scrolling retains content with bounded frame cost and mounted rows', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 10000 }, (_, index) => ({
        id: `scroll-${index}`,
        text: `Synthetic scrolling item ${index}`,
        children: [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 'scroll-0' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = window.locator('[data-node-id="scroll-0"] .node-input')
  await editor.focus()

  await expect(editor).toBeFocused()

  const measured = await window.evaluate(async () => {
    const viewport = document.querySelector<HTMLElement>('.scroll-viewport')!
    const maximum = viewport.scrollHeight - viewport.clientHeight
    const frames: number[] = []
    let emptyFrames = 0
    let mountedMax = 0
    let previous = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
    for (let index = 0; index < 120; index++) {
      const fraction = (index % 60) / 59
      viewport.scrollTop = maximum * (index < 60 ? fraction : 1 - fraction)
      const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
      frames.push(now - previous)
      previous = now
      const bounds = viewport.getBoundingClientRect()
      const rows = [...document.querySelectorAll<HTMLElement>('.node-row')]
      mountedMax = Math.max(mountedMax, rows.length)
      if (
        !rows.some((row) => {
          const rect = row.getBoundingClientRect()
          return rect.bottom > bounds.top && rect.top < bounds.bottom
        })
      )
        emptyFrames++
    }
    return { frames: frames.toSorted((a, b) => a - b), emptyFrames, mountedMax }
  })

  const p95 = measured.frames[Math.floor(measured.frames.length * 0.95)]!
  const maximum = measured.frames.at(-1)!
  recordPerfResult({
    kind: 'state',
    scenario: 'tree-10000-anchored-scroll',
    samples: measured.frames.length,
    metrics: {
      frameP95Ms: round(p95),
      frameMaxMs: round(maximum),
      emptyFrames: measured.emptyFrames,
      mountedMax: measured.mountedMax,
    },
  })

  expect(p95).toBeLessThan(50)
  expect(maximum).toBeLessThan(100)
  expect(measured.emptyFrames).toBe(0)
  expect(measured.mountedMax).toBeLessThan(100)
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('Synthetic scrolling item 0')
  await expect(window.locator('.current-parent')).toHaveCount(0)
})
