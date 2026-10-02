import { closeApp, expect, launchTree, test } from './fixtures'

test.describe('always-on-top window', () => {
  // @requirement PRODUCT.md §2.2
  test('toggles the native window flag and restores it after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)
    const toggle = first.window.getByRole('button', { name: 'Pin window on top' })

    const tooltip = first.window.locator('.status-tooltip-anchor', { has: toggle }).locator('.status-tooltip')
    await expect(tooltip).toBeHidden()
    await toggle.hover()
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toHaveText('Pin window on top')
    const tooltipBox = await tooltip.boundingBox()
    const windowSize = await first.window.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
    expect(tooltipBox!.x).toBeGreaterThanOrEqual(0)
    expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(windowSize.width)
    expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual((await toggle.boundingBox())!.y)
    await first.window.mouse.move(200, 200)
    await expect(tooltip).toBeHidden()
    const toggleBox = await toggle.boundingBox()
    const statusBox = await first.window.locator('.status-bar').boundingBox()
    const indicatorBox = await first.window.getByLabel('Vim mode').boundingBox()
    expect(toggleBox!.y).toBeGreaterThanOrEqual(statusBox!.y)
    expect(toggleBox!.y + toggleBox!.height).toBeLessThanOrEqual(statusBox!.y + statusBox!.height)
    expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(indicatorBox!.x)
    await toggle.click()
    await expect(first.window.getByRole('button', { name: 'Unpin window from top' })).toBeVisible()
    await expect
      .poll(() => first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop()))
      .toBe(true)

    await closeApp(first.app)
    const second = await launchTree(userDataDir)

    await expect(second.window.getByRole('button', { name: 'Unpin window from top' })).toBeVisible()
    await expect
      .poll(() => second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop()))
      .toBe(true)
  })
})
