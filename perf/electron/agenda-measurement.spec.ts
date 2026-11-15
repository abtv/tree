import { expect, launchTree, seedDocument, setCalendarDate, test } from './fixtures'
import { recordPerfResult } from '../results'

for (const count of [80, 10000]) {
  // @requirement PRODUCT.md §22.1
  // @requirement PRODUCT.md §23.6
  test(`Agenda batches rich-row measurement with ${count} entries`, async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: count }, (_, index) => ({
          id: `measure-${index}`,
          text: `2026-11-11 Item ${index} ${'Wrapped synthetic review text. '.repeat(index % 3 === 0 ? 1 : 12)}`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'measure-0' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await setCalendarDate(window, new Date(2026, 10, 11, 12))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1000, 750))
    const settle = () =>
      window.evaluate(
        () =>
          new Promise<void>((resolve) => {
            let remaining = 6
            const frame = (): void => {
              if (--remaining === 0) resolve()
              else requestAnimationFrame(frame)
            }
            requestAnimationFrame(frame)
          }),
      )
    await settle()
    const session = await window.context().newCDPSession(window)
    await session.send('Performance.enable')
    const layouts = async (): Promise<number> => {
      const { metrics } = await session.send('Performance.getMetrics')
      return metrics.find(({ name }) => name === 'LayoutCount')!.value
    }

    const beforeOpen = await layouts()
    await window.keyboard.press('Meta+p')
    await settle()
    const openLayouts = (await layouts()) - beforeOpen

    const selected = window.locator('.agenda-row[aria-selected="true"]')
    await expect(selected).toBeFocused()

    await window.keyboard.press('Meta+e')
    await settle()
    expect(await window.locator('.agenda-row[data-node-id]').count()).toBe(0)

    const beforeUnfold = await layouts()
    await window.keyboard.press('Meta+e')
    await settle()
    const unfoldLayouts = (await layouts()) - beforeUnfold
    const beforeScroll = await layouts()
    for (const fraction of [0.3, 0.6, 0.1, 0.8, 0.4, 0.9, 0.2, 0.7, 0.5, 1, 0.4, 0]) {
      await window.evaluate((fraction) => {
        const viewport = document.querySelector<HTMLElement>('.scroll-viewport')!
        viewport.scrollTop = fraction * (viewport.scrollHeight - viewport.clientHeight)
      }, fraction)
      await settle()
    }
    const scrollLayouts = (await layouts()) - beforeScroll

    recordPerfResult({
      kind: 'state',
      scenario: `agenda-${count}-rich-row-measurement`,
      samples: 14,
      metrics: { openLayouts, unfoldLayouts, scrollLayouts },
    })

    // Six macOS runs per version: immediate refs used 85/27 opening layouts, 80/38 unfolding
    // layouts and 0/800 scrolling layouts. Batched refs used 5/8, 1/2 and 0/80 respectively.
    // These count guards leave room for lifecycle variation without accepting per-row layout.
    expect(openLayouts).toBeLessThan(16)
    expect(unfoldLayouts).toBeLessThan(12)
    expect(scrollLayouts).toBeLessThan(count === 80 ? 12 : 160)
    await expect(selected).toBeFocused()
    expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
    await session.detach()
  })
}
