// @editing-modes: independent
import type { ElectronApplication } from '@playwright/test'
import {
  checkedApplicationSubmenuItems,
  clickApplicationSubmenuItem,
  closeApp,
  expect,
  launchTree,
  test,
} from './fixtures'

const appearanceMenu = { menu: 'View', submenu: 'Appearance' }

const themeSource = (app: ElectronApplication): Promise<string> =>
  app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)

// Playwright emulates the page's color scheme independently of nativeTheme (see window-appearance.spec.ts),
// so the renderer's prefers-color-scheme is checked through the value Electron derives it from.
const usesDarkColors = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)

const windowBackground = (app: ElectronApplication): Promise<string> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor().toLowerCase())

test.describe('appearance preference', () => {
  // @requirement PRODUCT.md §9.3
  // @requirement PRODUCT.md §20.5
  test('starts Automatic, applies a manual choice at once and restores it after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)
    expect(await checkedApplicationSubmenuItems(first.app, appearanceMenu)).toEqual(['Automatic'])
    expect(await themeSource(first.app)).toBe('system')

    await clickApplicationSubmenuItem(first.app, { ...appearanceMenu, label: 'Dark' })
    expect(await checkedApplicationSubmenuItems(first.app, appearanceMenu)).toEqual(['Dark'])
    await expect.poll(() => windowBackground(first.app)).toBe('#3f3f3f')
    expect(await usesDarkColors(first.app)).toBe(true)

    await clickApplicationSubmenuItem(first.app, { ...appearanceMenu, label: 'Light' })
    expect(await checkedApplicationSubmenuItems(first.app, appearanceMenu)).toEqual(['Light'])
    await expect.poll(() => windowBackground(first.app)).toBe('#fbf8f1')
    expect(await usesDarkColors(first.app)).toBe(false)
    await clickApplicationSubmenuItem(first.app, { ...appearanceMenu, label: 'Dark' })
    await closeApp(first.app)

    const second = await launchTree(userDataDir)
    expect(await checkedApplicationSubmenuItems(second.app, appearanceMenu)).toEqual(['Dark'])
    expect(await themeSource(second.app)).toBe('dark')
    expect(await windowBackground(second.app)).toBe('#3f3f3f')
    expect(await usesDarkColors(second.app)).toBe(true)

    await clickApplicationSubmenuItem(second.app, { ...appearanceMenu, label: 'Automatic' })
    expect(await themeSource(second.app)).toBe('system')
    await closeApp(second.app)

    const third = await launchTree(userDataDir)
    expect(await checkedApplicationSubmenuItems(third.app, appearanceMenu)).toEqual(['Automatic'])
    expect(await themeSource(third.app)).toBe('system')
    await closeApp(third.app)
  })

  // @requirement PRODUCT.md §20.5
  test('draws the window title strip in the document background in both appearances', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const strip = window.locator('.title-bar')
    const colors = () =>
      window.evaluate(() => ({
        strip: getComputedStyle(document.querySelector('.title-bar')!).backgroundColor,
        document: getComputedStyle(document.documentElement).backgroundColor,
      }))
    await expect(strip).toHaveText('Tree')
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getContentBounds().y)).toBe(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds().y),
    )

    for (const label of ['Light', 'Dark']) {
      await clickApplicationSubmenuItem(app, { ...appearanceMenu, label })
      await expect.poll(async () => (await colors()).strip).toBe((await colors()).document)
    }
    await closeApp(app)
  })
})
