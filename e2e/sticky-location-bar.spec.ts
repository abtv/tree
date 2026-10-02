import { expect, launchTree, seedDocument, test } from './fixtures'

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
    expect(box?.y).toBe(0)
    expect(viewport?.y).toBe(box === null ? undefined : box.y + box.height)
    // The scrollbar occupies the right edge of the content area only, never the toolbar row.
    const barRight = await page.evaluate(() => document.querySelector('.location-bar')?.clientWidth ?? 0)
    const windowWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(barRight).toBe(windowWidth)
  })
})
