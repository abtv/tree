import { collectRendererHeap, expect, largeSeed, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from './results'

const EXPANDED_TOP_LEVEL_COUNT = 250

/**
 * Expands the first `count` top-level roots by their own stable node id, not by rendered position:
 * each expansion inserts rows after it and shifts every later root's flattened index, so a
 * position-based label would drift mid-loop.
 */
async function expandFirstTopLevelRoots(
  window: Awaited<ReturnType<typeof launchTree>>['window'],
  count: number,
): Promise<void> {
  await window.evaluate((expandCount) => {
    for (let index = 0; index < expandCount; index += 1) {
      const row = document.querySelector(`[data-node-id="r${index}"]`)
      const button = row?.querySelector('.node-disclosure-triangle')
      if (button instanceof HTMLElement) button.click()
    }
  }, count)
}

test.describe('inline expansion at scale', () => {
  test('keeps vertical traversal responsive crossing many expanded branches', async ({ userDataDir }) => {
    const seed = largeSeed(600, 2)
    seed.location = { currentParentId: null, selectedNodeId: 'r0' }
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    await expect(input).toBeFocused()

    // Setup (expanding 250 of 600 top-level roots, producing 1,100 visible rows) is not measured;
    // only the subsequent keyboard traversal is.
    await expandFirstTopLevelRoots(window, EXPANDED_TOP_LEVEL_COUNT)
    expect(await window.locator('.node-list-spacer').count()).toBe(2)

    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { verticalPaints: number[] }).verticalPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (!['j', 'k'].includes(event.key)) return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    for (let index = 0; index < 20; index += 1) await window.keyboard.press('j')
    for (let index = 0; index < 20; index += 1) await window.keyboard.press('k')
    await window.waitForFunction(() => (window as unknown as { verticalPaints: number[] }).verticalPaints.length === 40)
    const samples = await window.evaluate(() =>
      (window as unknown as { verticalPaints: number[] }).verticalPaints.slice().sort((a, b) => a - b),
    )
    await expect(input).toBeFocused()

    const paintP95Ms = samples[Math.floor(samples.length * 0.95)]!
    const paintMaxMs = samples[samples.length - 1]!
    recordPerfResult({
      kind: 'state',
      scenario: 'inline-expansion-vertical-traversal-1100-visible-rows',
      samples: samples.length,
      metrics: { paintP95Ms: round(paintP95Ms), paintMaxMs: round(paintMaxMs) },
    })
    expect(paintP95Ms).toBeLessThan(50)
    expect(paintMaxMs).toBeLessThan(100)

    // Counted motion issues one visible-row scan per step (`vim-vertical-navigation.ts`), so a
    // 50-step count exercises the O(count × visible rows) path directly rather than 50 independent
    // single-step calls; single-step j/k above stay each below the windowing threshold's own cost.
    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { countedPaints: number[] }).countedPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (!['j', 'k'].includes(event.key)) return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    await window.keyboard.press('5')
    await window.keyboard.press('0')
    await window.keyboard.press('j')
    await window.keyboard.press('5')
    await window.keyboard.press('0')
    await window.keyboard.press('k')
    await window.waitForFunction(() => (window as unknown as { countedPaints: number[] }).countedPaints.length === 2)
    const countedSamples = await window.evaluate(() =>
      (window as unknown as { countedPaints: number[] }).countedPaints.slice().sort((a, b) => a - b),
    )
    await expect(input).toBeFocused()

    const countedMaxMs = countedSamples[countedSamples.length - 1]!
    recordPerfResult({
      kind: 'state',
      scenario: 'inline-expansion-counted-vertical-traversal-50-steps-1100-visible-rows',
      samples: countedSamples.length,
      metrics: { paintMaxMs: round(countedMaxMs) },
    })
    expect(countedMaxMs).toBeLessThan(100)
  })

  test('keeps fold-all keyboard commands responsive across many collapsed branches', async ({ userDataDir }) => {
    const seed = largeSeed(600, 2)
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    await expect(input).toBeFocused()

    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { foldPaints: number[] }).foldPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'R' && event.key !== 'M') return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    const foldPair = async (): Promise<void> => {
      await window.keyboard.press('z')
      await window.keyboard.press('R')
      await window.keyboard.press('z')
      await window.keyboard.press('M')
    }

    // The first open-all pushes the 1,800 visible rows past the windowing threshold; only the paint
    // after each fold command is measured, not the `z` prefix keypress. Four more pairs cover both
    // directions repeatedly.
    await foldPair()
    expect(await window.locator('.node-list-spacer').count()).toBe(2)
    expect(await window.locator('.node-row').count()).toBeLessThan(600 + 600 * 2)
    for (let index = 0; index < 4; index += 1) await foldPair()
    await window.waitForFunction(() => (window as unknown as { foldPaints: number[] }).foldPaints.length === 10)
    await expect(input).toBeFocused()
    const samples = await window.evaluate(() =>
      (window as unknown as { foldPaints: number[] }).foldPaints.slice().sort((a, b) => a - b),
    )

    const paintP95Ms = samples[Math.floor(samples.length * 0.95)]!
    const paintMaxMs = samples[samples.length - 1]!
    recordPerfResult({
      kind: 'state',
      scenario: 'fold-open-all-and-close-all-600-roots',
      samples: samples.length,
      metrics: { paintP95Ms: round(paintP95Ms), paintMaxMs: round(paintMaxMs) },
    })
    expect(paintP95Ms).toBeLessThan(50)
    expect(paintMaxMs).toBeLessThan(100)
  })

  test('does not grow the renderer heap unboundedly when expanding many branches', async ({ userDataDir }) => {
    // 400 top-level roots alone stay under the 500-row windowing threshold; expanding 100 of them
    // (400 + 100 * 2 = 600 visible rows) pushes past it, and collapsing them again must drop back
    // under it, not merely revert the same row count some other way.
    const topCount = 400
    const expandedCount = 100
    const seed = largeSeed(topCount, 2)
    seed.location = { currentParentId: null, selectedNodeId: 'r0' }
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal', memoryProbe: true })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    expect(await window.locator('.node-list-spacer').count()).toBe(0)

    const before = await collectRendererHeap(window)
    await expandFirstTopLevelRoots(window, expandedCount)
    expect(await window.locator('.node-list-spacer').count()).toBe(2)
    const afterExpand = await collectRendererHeap(window)

    // `zM` closes every fold in the location regardless of which rows are currently mounted (most of
    // the 100 expanded roots have scrolled out of the windowed viewport by now, so re-clicking their
    // own disclosure triangles is not an option). Closing them must release the flattened rows and
    // expansion-id bookkeeping; heap usage should return close to the pre-expansion baseline rather
    // than accumulate.
    await window.keyboard.press('z')
    await window.keyboard.press('M')
    await expect(window.locator('.node-list-spacer')).toHaveCount(0)
    const afterCollapse = await collectRendererHeap(window)

    const expandGrowthBytes = afterExpand - before
    const residualGrowthBytes = afterCollapse - before
    recordPerfResult({
      kind: 'state',
      scenario: 'inline-expansion-heap-growth-100-branches',
      metrics: {
        beforeBytes: before,
        afterExpandBytes: afterExpand,
        afterCollapseBytes: afterCollapse,
        expandGrowthBytes,
        residualGrowthBytes,
      },
    })
    expect(expandGrowthBytes).toBeLessThan(5_000_000)
    expect(residualGrowthBytes).toBeLessThan(2_000_000)
  })
})
