// @editing-modes: independent
import { readFileSync } from 'node:fs'
import {
  test,
  expect,
  launchTree,
  clickApplicationMenuItem,
  closeMainWindow,
  seedDocument,
  setCursor,
  setMainWindowBounds,
} from './fixtures'

// @requirement PRODUCT.md §1.3
// @requirement PRODUCT.md §9
// @requirement PRODUCT.md §20.5
for (const appearance of ['light', 'dark'] as const) {
  test(`About Tree shares the renderer, uses the ${appearance} palette and restores focus`, async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'note', text: 'A synthetic note', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'note' },
    })
    const { app, window } = await launchTree(userDataDir, { appearance })
    // Playwright defaults to light media independently of Electron's nativeTheme.
    await window.emulateMedia({ colorScheme: appearance })
    await setMainWindowBounds(app, { x: 100, y: 100, width: 900, height: 650 })
    const editor = window.locator('.node-input').first()
    await editor.focus()
    await setCursor(editor, 3)
    const selection = () =>
      editor.evaluate((element) => ({
        anchor: document.getSelection()!.anchorOffset,
        focus: document.getSelection()!.focusOffset,
        active: document.activeElement === element,
      }))
    const before = await selection()
    const about = window.locator('#app-about-dialog')
    await window.keyboard.press('Meta+Shift+p')
    await window.getByRole('combobox', { name: 'Command' }).fill('about-tree')
    await window.keyboard.press('Enter')

    await expect(about).toBeVisible()
    expect(app.windows()).toHaveLength(1)
    await expect(about.getByRole('heading', { name: 'Tree', exact: true })).toBeVisible()
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string
    await expect(about.locator('#app-version')).toHaveText(
      new RegExp(`^Version ${version.replaceAll('.', '\\.')} · [A-Z][a-z]{2} \\d{1,2}, \\d{4}$`),
    )
    await expect(about.getByText('© 2026 Andrei Butov', { exact: true })).toBeVisible()
    await expect
      .poll(() => about.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
      .toBe(true)
    await expect(about).toHaveCSS('background-color', appearance === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)')
    const geometry = await about.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return { x: bounds.x + bounds.width / 2 - innerWidth / 2, y: bounds.y + bounds.height / 2 - innerHeight / 2 }
    })
    expect(Math.abs(geometry.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(geometry.y)).toBeLessThanOrEqual(1)
    await window.screenshot({ path: test.info().outputPath(`about-${appearance}.png`) })

    await app.evaluate(({ app }) => {
      app.emit('second-instance', {}, [], '')
    })
    await expect(about).toBeVisible()
    await expect(about.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    if (process.env['TREE_E2E_VISIBLE'] === '1') {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize())
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized()))
        .toBe(true)
      await app.evaluate(({ app }) => {
        app.emit('second-instance', {}, [], '')
      })
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized()))
        .toBe(false)
      await expect(about).toBeVisible()
      await expect(about.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    }
    const menuState = () =>
      app.evaluate(({ Menu }) => {
        const root = Menu.getApplicationMenu()!
        return ['Edit', 'Window'].map((label) => {
          const item = root.items
            .find((item) => item.label === label)!
            .submenu!.items.find((item) => item.type === 'checkbox')!
          return { label: item.label, checked: item.checked, enabled: item.enabled }
        })
      })
    await expect.poll(async () => (await menuState()).map((item) => item.enabled)).toEqual([false, false])
    const blocked = await menuState()
    await clickApplicationMenuItem(app, 'View', 'Agenda')
    await clickApplicationMenuItem(app, 'Edit', 'Vim Editing')
    await clickApplicationMenuItem(app, 'Window', 'Always on Top')
    await clickApplicationMenuItem(app, 'Edit', 'Find…')
    await clickApplicationMenuItem(app, 'File', 'Export Notes…')
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    expect(await menuState()).toEqual(blocked)
    await expect(window.locator('.agenda-list')).toHaveCount(0)

    if (appearance === 'light') {
      await app.evaluate(({ shell }) => {
        const opened: string[] = []
        ;(globalThis as unknown as { aboutLinks: string[] }).aboutLinks = opened
        shell.openExternal = async (url) => {
          opened.push(url)
        }
      })
      await about.getByRole('link', { name: 'MIT License' }).click()
      await about.getByRole('link', { name: 'GitHub repository' }).click()
      await expect
        .poll(() => app.evaluate(() => (globalThis as unknown as { aboutLinks: string[] }).aboutLinks))
        .toEqual(['https://github.com/abtv/tree/blob/main/LICENSE', 'https://github.com/abtv/tree'])
      expect(app.windows()).toHaveLength(1)
    }
    await clickApplicationMenuItem(app, 'Tree', 'About Tree')
    await expect(about.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    const opposite = appearance === 'light' ? 'dark' : 'light'
    await window.emulateMedia({ colorScheme: opposite })
    await expect(about).toHaveCSS('background-color', opposite === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)')
    await window.keyboard.press('Escape')
    await expect(about).not.toBeVisible()
    expect(await selection()).toEqual(before)
    await expect.poll(async () => (await menuState()).map((item) => item.enabled)).toEqual([true, true])

    await clickApplicationMenuItem(app, 'Tree', 'About Tree')
    await expect(about).toBeVisible()
    await window.mouse.click(10, 100)
    await expect(about).not.toBeVisible()
    expect(await selection()).toEqual(before)
    await expect(editor).toHaveText('A synthetic note')
    await clickApplicationMenuItem(app, 'Tree', 'About Tree')
    await about.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(about).not.toBeVisible()
    expect(await selection()).toEqual(before)

    await clickApplicationMenuItem(app, 'Tree', 'About Tree')
    await expect(about).toBeVisible()
    await window.reload()
    await expect(editor).toBeVisible()
    await expect(about).not.toBeVisible()
    await expect.poll(async () => (await menuState()).map((item) => item.enabled)).toEqual([true, true])
    await clickApplicationMenuItem(app, 'Tree', 'About Tree')
    await expect(about).toBeVisible()
    const exited = app.waitForEvent('close')
    await closeMainWindow(app)
    await exited
  })
}
