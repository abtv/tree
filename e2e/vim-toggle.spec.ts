// @editing-modes: explicit
import {
  applicationMenuItemChecked,
  clickApplicationMenuItem,
  closeApp,
  expect,
  launchTree,
  node,
  readPersisted,
  readVimPreference,
  seedDocument,
  setCursor,
  test,
} from './fixtures'

const seed = {
  document: { roots: [{ id: 'root', text: 'abc', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

test.describe('Vim editing toggle', () => {
  // @requirement PRODUCT.md §20.2
  test('starts a first run with standard editing and no Vim mode indicator', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir, { vimPreference: 'saved' })
    const editor = node(window, 1)
    const toggle = window.getByRole('button', { name: 'Enable Vim editing' })

    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(window.getByLabel('Vim mode')).toHaveCount(0)
    await expect(editor).toBeFocused()
    await window.keyboard.type('ijk')
    await window.keyboard.press('Escape')
    await window.keyboard.type('x')
    await expect(editor).toHaveValue('ijkx')
    await expect(window.getByLabel('Vim mode')).toHaveCount(0)
    expect(readVimPreference(userDataDir)).toBeUndefined()

    // The toggle sits left of the pin, and the pin ends the status bar while the indicator is absent.
    const statusBox = (await window.locator('.status-bar').boundingBox())!
    const toggleBox = (await toggle.boundingBox())!
    const pinBox = (await window.getByRole('button', { name: 'Pin window on top' }).boundingBox())!
    expect(toggleBox.y).toBeGreaterThanOrEqual(statusBox.y)
    expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(statusBox.y + statusBox.height)
    expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(pinBox.x)
    expect(statusBox.x + statusBox.width - (pinBox.x + pinBox.width)).toBeLessThanOrEqual(13)

    const tooltip = window.locator('.status-tooltip-anchor', { has: toggle }).locator('.status-tooltip')
    await expect(tooltip).toBeHidden()
    await toggle.hover()
    await expect(tooltip).toHaveText('Enable Vim editing')
    await expect(tooltip).toBeVisible()
    const tooltipBox = (await tooltip.boundingBox())!
    expect(tooltipBox.x).toBeGreaterThanOrEqual(0)
    expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(toggleBox.y)
  })

  // @requirement PRODUCT.md §9.3
  test('switches Vim editing from the Edit menu and keeps the menu and status bar in step', async ({ userDataDir }) => {
    seedDocument(userDataDir, seed)
    const first = await launchTree(userDataDir, { vimPreference: 'saved' })
    const editor = node(first.window, 1)
    await setCursor(editor, 1)
    expect(await applicationMenuItemChecked(first.app, 'Edit', 'Vim Editing')).toBe(false)

    await clickApplicationMenuItem(first.app, 'Edit', 'Vim Editing')

    await expect(first.window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(first.window.getByRole('button', { name: 'Disable Vim editing' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(editor).toBeFocused()
    await first.window.keyboard.press('x')
    await expect(editor).toHaveValue('ac')
    await expect.poll(() => readVimPreference(userDataDir)).toBe(true)

    await first.window.getByRole('button', { name: 'Disable Vim editing' }).click()
    await expect(first.window.getByLabel('Vim mode')).toHaveCount(0)
    await expect.poll(() => applicationMenuItemChecked(first.app, 'Edit', 'Vim Editing')).toBe(false)
    await first.window.getByRole('button', { name: 'Enable Vim editing' }).click()
    await expect.poll(() => applicationMenuItemChecked(first.app, 'Edit', 'Vim Editing')).toBe(true)
    await closeApp(first.app)

    const second = await launchTree(userDataDir, { vimPreference: 'saved', initialMode: 'normal' })
    expect(await applicationMenuItemChecked(second.app, 'Edit', 'Vim Editing')).toBe(true)
    await clickApplicationMenuItem(second.app, 'Edit', 'Vim Editing')
    await expect(second.window.getByLabel('Vim mode')).toHaveCount(0)
    await expect.poll(() => readVimPreference(userDataDir)).toBe(false)
  })

  // @requirement PRODUCT.md §20.2
  test('switches Vim editing on and off, keeps the caret, and restores the choice after restart', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, seed)
    const first = await launchTree(userDataDir, { vimPreference: 'saved' })
    const editor = node(first.window, 1)
    await setCursor(editor, 1)

    await first.window.getByRole('button', { name: 'Enable Vim editing' }).click()

    await expect(first.window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toBeFocused()
    await first.window.keyboard.press('x')
    await expect(editor).toHaveValue('ac')
    await expect.poll(() => readVimPreference(userDataDir)).toBe(true)
    await closeApp(first.app)

    const second = await launchTree(userDataDir, { vimPreference: 'saved', initialMode: 'normal' })
    await expect(second.window.getByLabel('Vim mode')).toHaveText('NORMAL')
    const toggle = second.window.getByRole('button', { name: 'Disable Vim editing' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect(second.window.getByLabel('Vim mode')).toHaveCount(0)
    await expect(node(second.window, 1)).toBeFocused()
    await second.window.keyboard.type('j')
    await expect(node(second.window, 1)).toHaveValue('jac')
    await expect.poll(() => readVimPreference(userDataDir)).toBe(false)
    await closeApp(second.app)

    const third = await launchTree(userDataDir, { vimPreference: 'saved' })
    await expect(third.window.getByRole('button', { name: 'Enable Vim editing' })).toBeVisible()
    await expect(third.window.getByLabel('Vim mode')).toHaveCount(0)
  })

  // @requirement PRODUCT.md §20.2
  test('commits a pending replacement when Vim editing is switched off', async ({ userDataDir }) => {
    seedDocument(userDataDir, seed)
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('Shift+R')
    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
    await window.keyboard.type('X')

    await window.getByRole('button', { name: 'Disable Vim editing' }).click()

    await expect(editor).toHaveValue('Xbc')
    await expect(window.getByLabel('Vim mode')).toHaveCount(0)
    await window.keyboard.press('Meta+z')
    await expect(editor).toHaveValue('abc')
    await window.keyboard.press('Meta+Shift+z')
    await expect(editor).toHaveValue('Xbc')
    await closeApp(app)
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Xbc')
  })

  // @requirement PRODUCT.md §20.5
  test('uses the Zenburn palette for every dark Vim mode indicator', async ({ userDataDir }) => {
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { vimPreference: true, initialMode: 'normal' })
    await window.emulateMedia({ colorScheme: 'dark' })
    await window.mouse.move(5, 5)
    const indicator = window.getByLabel('Vim mode')
    const states = [
      { label: 'NORMAL', keys: [], color: 'rgb(143, 178, 143)' },
      { label: 'INSERT', keys: ['i'], color: 'rgb(140, 208, 211)' },
      { label: 'VISUAL', keys: ['Escape', 'v'], color: 'rgb(240, 223, 175)' },
      { label: 'VISUAL NODE', keys: ['Escape', 'V'], color: 'rgb(240, 223, 175)' },
      { label: 'REPLACE', keys: ['Escape', 'R'], color: 'rgb(204, 147, 147)' },
    ]
    for (const { label, keys, color } of states) {
      for (const key of keys) await window.keyboard.press(key)
      await expect(indicator).toHaveText(label)
      await expect(indicator).toHaveCSS('background-color', 'rgb(43, 43, 43)')
      await expect(indicator).toHaveCSS('color', color)
      await expect(indicator).toHaveScreenshot(`vim-mode-${label.toLowerCase().replaceAll(' ', '-')}-dark.png`)
    }
  })

  // @requirement PRODUCT.md §20.5
  test('draws the active toggle from the palette of each appearance', async ({ userDataDir }) => {
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { vimPreference: true })
    const toggle = window.getByRole('button', { name: 'Disable Vim editing' })
    await window.mouse.move(5, 5)

    await expect(toggle).toHaveCSS('background-color', 'rgb(227, 220, 203)')
    await expect(toggle).toHaveCSS('color', 'rgb(59, 56, 51)')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(toggle).toHaveCSS('background-color', 'rgb(95, 95, 95)')
    await expect(toggle).toHaveCSS('color', 'rgb(220, 220, 204)')
  })

  test('renders the status bar toggle in both states and appearances', async ({ userDataDir }) => {
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { vimPreference: false })
    const statusBar = window.locator('.status-bar')
    await window.mouse.move(5, 5)

    await expect(statusBar).toHaveScreenshot('vim-toggle-off-light.png')
    await window.getByRole('button', { name: 'Enable Vim editing' }).click()
    await window.mouse.move(5, 5)
    await expect(statusBar).toHaveScreenshot('vim-toggle-on-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(statusBar).toHaveScreenshot('vim-toggle-on-dark.png')
    await window.getByRole('button', { name: 'Disable Vim editing' }).click()
    await window.mouse.move(5, 5)
    await expect(statusBar).toHaveScreenshot('vim-toggle-off-dark.png')
  })
})
