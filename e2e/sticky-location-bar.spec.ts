// @editing-modes: both
import { describeForEachEditingMode, expect, launchTree, seedDocument, test } from './fixtures'

test.describe('sticky location toolbar', () => {
  // @requirement PRODUCT.md §2.2
  test('stays at the top while only the content below it scrolls and owns the scrollbar', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: Array.from({ length: 200 }, (_, index) => ({
              id: `c${index}`,
              text: `Child ${index}`,
              children: [],
            })),
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'c0' },
    })
    const { window: page } = await launchTree(userDataDir)
    const bar = page.locator('.location-bar')
    await expect(bar).toBeVisible()

    await page.evaluate(() => {
      document.querySelector('.scroll-viewport')?.scrollTo(0, 1500)
    })
    await expect
      .poll(() => page.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0))
      .toBeGreaterThan(500)

    // The document itself never scrolls, so no scrollbar spans the toolbar.
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
    const box = await bar.boundingBox()
    const viewport = await page.locator('.scroll-viewport').boundingBox()
    // The toolbar sits directly below the window title strip (§20.5).
    const strip = await page.locator('.title-bar').boundingBox()
    expect(strip?.y).toBe(0)
    expect(box?.y).toBe(strip?.height)
    expect(viewport?.y).toBe(box === null ? undefined : box.y + box.height)
    // The scrollbar occupies the right edge of the content area only, never the toolbar row.
    const barRight = await page.evaluate(() => document.querySelector('.location-bar')?.clientWidth ?? 0)
    const windowWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(barRight).toBe(windowWidth)
  })
})

describeForEachEditingMode('sticky status bar', ({ mode }) => {
  // @requirement PRODUCT.md §20.2
  test('keeps the status bar below the scrolling content', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 200 }, (_, index) => ({ id: `r${index}`, text: `Root ${index}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'r0' },
    })
    const { window: page } = await launchTree(userDataDir)
    await page.evaluate(() => {
      document.querySelector('.scroll-viewport')?.scrollTo(0, 1500)
    })

    const status = await page.locator('.status-bar').boundingBox()
    const viewport = await page.locator('.scroll-viewport').boundingBox()
    const innerHeight = await page.evaluate(() => window.innerHeight)
    expect(status).not.toBeNull()
    expect(status!.y + status!.height).toBe(innerHeight)
    // The content area ends exactly where the status bar begins, so its scrollbar never reaches it.
    expect(viewport!.y + viewport!.height).toBe(status!.y)
    if (mode === 'vim') {
      const indicator = await page.getByLabel('Vim mode').boundingBox()
      expect(indicator!.y).toBeGreaterThanOrEqual(status!.y)
      expect(indicator!.y + indicator!.height).toBeLessThanOrEqual(status!.y + status!.height)
      // The indicator is not editable text, so the pointer over it must not become the text-editing I-beam.
      await expect(page.getByLabel('Vim mode')).toHaveCSS('cursor', 'default')
    } else {
      await expect(page.getByLabel('Vim mode')).toHaveCount(0)
    }
  })
})
