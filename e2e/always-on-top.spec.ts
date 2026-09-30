import { closeApp, expect, launchTree, test } from './fixtures'

test.describe('always-on-top window', () => {
  // @requirement PRODUCT.md §2.2
  test('toggles the native window flag and restores it after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)
    const toggle = first.window.getByRole('button', { name: 'Pin window on top' })

    await expect(toggle).toHaveAttribute('title', 'Pin window on top')
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
