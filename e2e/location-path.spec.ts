import { expect, launchTree, node, parent, test } from './fixtures'

test.describe('location path overflow', () => {
  // @requirement PRODUCT.md §2.2
  test('preserves short segments while truncating long ones', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const shortRoot = 'Test'
    const longAncestor = `Ancestor ${'a'.repeat(160)}`
    const longCurrent = `Current ${'b'.repeat(160)}`

    await node(window, 1).fill(shortRoot)
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await node(window, 1).fill(longAncestor)
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await node(window, 1).fill(longCurrent)
    await window.keyboard.press('Meta+.')

    const bar = window.locator('[aria-label="Current location"]')
    const shortSegment = bar.locator('.location-link').first()
    const longSegment = bar.locator('.location-link').nth(1)
    const currentSegment = bar.locator('.location-current')

    await expect(shortSegment).toHaveText(shortRoot)
    await expect(shortSegment).toHaveAttribute('title', shortRoot)
    await expect(longSegment).toHaveAttribute('title', longAncestor)
    await expect(currentSegment).toHaveAttribute('title', longCurrent)
    await expect(currentSegment).toBeVisible()

    const shortOverflow = await shortSegment.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(shortOverflow).toBeLessThanOrEqual(2)

    const longOverflow = await longSegment.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(longOverflow).toBeGreaterThan(1)

    const currentOverflow = await currentSegment.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(currentOverflow).toBeGreaterThan(1)

    const barOverflow = await bar.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(barOverflow).toBeLessThanOrEqual(1)

    const pageOverflow = await window.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(pageOverflow).toBeLessThanOrEqual(1)

    await expect(parent(window)).toHaveValue(longCurrent)
    const headingHeight = await parent(window).evaluate((element) => element.getBoundingClientRect().height)
    expect(headingHeight).toBeGreaterThan(40)
  })
})
