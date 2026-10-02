import { expect, launchTree, seedDocument, test } from './fixtures'

test.describe('sticky location toolbar', () => {
  // @requirement PRODUCT.md §2.2
  test('stays at the top of the window while the content scrolls', async ({ userDataDir }) => {
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

    await page.evaluate(() => window.scrollTo(0, 1500))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)

    const box = await bar.boundingBox()
    expect(box?.y).toBe(0)
    const topElementIsBar = await page.evaluate(
      () => document.elementFromPoint(window.innerWidth / 2, 5)?.closest('.location-bar') !== null,
    )
    expect(topElementIsBar).toBe(true)
  })
})
