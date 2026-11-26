// @editing-modes: vim
import type { Page } from '@playwright/test'
import { join } from 'node:path'
import {
  applicationMenuItemChecked,
  checkedApplicationSubmenuItems,
  clickApplicationMenuItem,
  clickApplicationSubmenuItem,
  closeApp,
  expect,
  launchTree,
  node,
  seedDocument,
  setAgendaToday,
  test,
} from './fixtures'

async function keys(window: Page, ...sequence: string[]): Promise<void> {
  for (const key of sequence) await window.keyboard.press(key)
}

// @requirement PRODUCT.md §20.2.32
test('runs Leader actions on the focused node without stealing literal spaces', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  const marker = window.getByRole('button', { name: 'Enter node 1', exact: true })
  const search = window.getByRole('searchbox', { name: 'Search query' })
  await expect(editor).toBeFocused()

  await window.keyboard.down('Space')
  await window.keyboard.down('Space')
  await window.keyboard.up('Space')
  await expect(search).toHaveCount(0)
  await keys(window, 'Escape', 'Space', 'm', 'Space', 's')
  await expect(marker).toHaveAttribute('data-marked', 'true')
  await expect(marker).toHaveAttribute('data-starred', 'true')
  await expect(editor).toBeFocused()

  await keys(window, 'Space', 'Space')
  await expect(search).toBeFocused()
  await keys(window, 'm', 'Space', 'b')
  await expect(search).toHaveValue('m b')
  await keys(window, 'Escape')
  await expect(editor).toBeFocused()

  await keys(window, 'Space', 't', 'm', 'Space', 't', 's')
  await expect(marker).not.toHaveAttribute('data-marked', 'true')
  await expect(marker).not.toHaveAttribute('data-starred', 'true')

  await keys(window, '0', 'f', 'Space', 'l', 'r', 'Space')
  await expect(editor).toHaveValue('alpha  eta')
  await keys(window, 'A', 'Space', 'Space', 'z', 'Escape')
  await expect(editor).toHaveValue('alpha  eta  z')
  await expect(search).toHaveCount(0)

  // A colon that follows Leader is discarded; had it opened the panel, the next colon would be typed into it.
  const command = window.getByRole('combobox', { name: 'Command' })
  await keys(window, 'Space', 'h', ':', ':')
  await expect(command).toBeFocused()
  await expect(command).toHaveValue('')
  await keys(window, 'Escape')
  await expect(editor).toBeFocused()

  await keys(window, 'Space', 'Control+l', 't', 'm')
  await expect(marker).not.toHaveAttribute('data-marked', 'true')
})

// @requirement PRODUCT.md §20.2.32
test('exports through the native save panel and still requires confirmation to import through Leader', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const archive = join(userDataDir, 'Leader Notes.zip')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, archive)
  const editor = node(window, 1)
  await expect(editor).toBeFocused()

  await keys(window, 'Space', 'f', 'e')

  await expect(window.getByRole('complementary', { name: 'Notes activity' })).toContainText(
    'Exported “Leader Notes.zip”.',
  )
  await expect(editor).toBeFocused()
  await keys(window, 'A')
  await window.keyboard.type(' newer')
  await keys(window, 'Escape')

  await keys(window, 'Space', 'f', 'i')
  const confirmation = window.getByRole('dialog', { name: 'Replace Current Notes?' })
  await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await expect(editor).toHaveValue('alpha beta newer')
  await keys(window, 'Escape')

  await expect(confirmation).toBeHidden()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('alpha beta newer')
  expect(await window.evaluate(() => document.defaultView!.treeApi.getCommandHistory())).toEqual([])
})

// @requirement PRODUCT.md §20.2.32
test('opens About and toggles the native pin without moving the editor caret', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  const about = window.locator('#app-about-dialog')
  const pinned = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop())
  await expect(editor).toBeFocused()
  await keys(window, '0', 'l', 'l')

  await keys(window, 'Space', 'h', 'a')
  await expect(about.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  // Inside About, Space activates the focused Close button instead of starting Leader.
  await keys(window, 'Space')

  await expect(about).toBeHidden()
  await expect(editor).toBeFocused()
  expect(await editor.evaluate((input) => (input as HTMLTextAreaElement).selectionStart)).toBe(2)
  expect(await pinned()).toBe(false)

  await keys(window, 'Space', 't', 'f')

  await expect.poll(pinned).toBe(true)
  await expect.poll(() => applicationMenuItemChecked(app, 'Window', 'Float on Top')).toBe(true)
  await expect(window.getByRole('button', { name: 'Unpin window from top' })).toBeVisible()

  await keys(window, ':')
  await window.getByRole('combobox', { name: 'Command' }).fill('toggle-always-on-top')
  await expect(window.getByRole('option', { selected: true })).toContainText('Float the window above other windows')
  await window.screenshot({ path: test.info().outputPath('float-on-top-command.png') })
  await keys(window, 'Escape')

  await keys(window, 'Space', 't', 'f')

  await expect.poll(pinned).toBe(false)
  await expect.poll(() => applicationMenuItemChecked(app, 'Window', 'Float on Top')).toBe(false)
  await expect(window.getByRole('button', { name: 'Pin window on top' })).toBeVisible()
  await expect(editor).toBeFocused()
  expect(await editor.evaluate((input) => (input as HTMLTextAreaElement).selectionStart)).toBe(2)
})

// @requirement PRODUCT.md §20.2.32
test('toggles the focused Tree branch and Agenda day with Leader e', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [{ id: 'one', text: 'alpha beta', children: [{ id: 'two', text: 'Task #2026-10-08', children: [] }] }],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setAgendaToday(window)
  const editor = node(window, 1)
  const child = window.locator('.node-row[data-node-id="two"]')
  const day = window.locator('.agenda-today')
  await expect(editor).toBeFocused()
  await keys(window, '0', 'l', 'l')

  await keys(window, 'Space', 'e')
  await expect(child).toBeVisible()
  await keys(window, 'Space', 'e')

  await expect(child).toHaveCount(0)
  await expect(editor).toBeFocused()
  expect(await editor.evaluate((input) => (input as HTMLTextAreaElement).selectionStart)).toBe(2)

  await keys(window, 'Space', 'p')
  await expect(day).toBeFocused()
  await keys(window, 'Space', 'h', 'a')
  await expect(window.locator('#app-about-dialog').getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await keys(window, 'Escape')

  await expect(day).toBeFocused()
  await expect(day.getByRole('button', { name: 'Collapse Thu Oct 8' })).toBeVisible()
  await keys(window, 'Space', 'e')
  await expect(day.getByRole('button', { name: 'Expand Thu Oct 8' })).toBeVisible()
  await keys(window, 'Space', 'e')

  await expect(day.getByRole('button', { name: 'Collapse Thu Oct 8' })).toBeVisible()
  await expect(day).toBeFocused()
})

// @requirement PRODUCT.md §20.2.32
test('cycles every appearance in alphabetical order and saves the choice', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  await expect(editor).toBeFocused()
  await expect(window.locator('html')).toHaveAttribute('data-appearance', 'system')

  for (const [label, value] of [
    ['Dark', 'dark'],
    ['Gray', 'gray'],
    ['Light', 'light'],
    ['White', 'white'],
    ['Automatic', 'system'],
    ['Dark', 'dark'],
  ] as const) {
    await keys(window, 'Space', 't', 't')

    await expect(window.locator('html')).toHaveAttribute('data-appearance', value)
    await expect
      .poll(() => checkedApplicationSubmenuItems(app, { menu: 'View', submenu: 'Appearance' }))
      .toEqual([label])
    await expect(editor).toBeFocused()
  }

  await closeApp(app)
  const restarted = await launchTree(userDataDir, { initialMode: 'normal' })
  await expect(restarted.window.locator('html')).toHaveAttribute('data-appearance', 'dark')
})

// @requirement PRODUCT.md §20.2.32
test('keeps the newer menu appearance check after a delayed Leader reply', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const menu = { menu: 'View', submenu: 'Appearance' }
  const gate = await app.evaluateHandle(() => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    globalThis.__treeIpc.wrap('tree:set-appearance', async (set, ...args) => {
      const result = await set(...args)
      await pending
      return result
    })
    return { release }
  })
  const editor = node(window, 1)
  const html = window.locator('html')
  await expect(editor).toBeFocused()

  await keys(window, 'Space', 't', 't')
  await expect(html).toHaveAttribute('data-appearance', 'dark')
  await clickApplicationSubmenuItem(app, { ...menu, label: 'White' })
  await expect(html).toHaveAttribute('data-appearance', 'white')
  await expect.poll(() => checkedApplicationSubmenuItems(app, menu)).toEqual(['White'])

  await keys(window, ':')
  await window.getByRole('combobox', { name: 'Command' }).fill('set-appearance')
  const white = window.locator('#command-set-appearance-white .command-state')
  const dark = window.locator('#command-set-appearance-dark .command-state')
  await expect(white).toHaveText('✓')
  await gate.evaluate(({ release }) => release())
  const actual = await window.evaluate(() => globalThis.window.treeApi.getAppearance())

  expect(actual).toBe('white')
  await expect(white).toHaveText('✓')
  await expect(dark).toHaveText('')
  await gate.dispose()
})

// @requirement PRODUCT.md §20.2.32
test('keeps the newer menu appearance when a Leader read returns an older value', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const menu = { menu: 'View', submenu: 'Appearance' }
  const html = window.locator('html')
  await expect(node(window, 1)).toBeFocused()
  const gate = await app.evaluateHandle(() => {
    let release!: () => void
    let read!: (value: unknown) => void
    const previous = new Promise<unknown>((resolve) => {
      read = resolve
    })
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let first = true
    globalThis.__treeIpc.wrap('tree:get-appearance', async (get, ...args) => {
      const result = await get(...args)
      if (first) {
        first = false
        read(result)
        await pending
      }
      return result
    })
    return { previous, release }
  })

  await keys(window, 'Space', 't', 't')
  expect(await gate.evaluate(({ previous }) => previous)).toBe('system')
  await clickApplicationSubmenuItem(app, { ...menu, label: 'White' })
  await expect(html).toHaveAttribute('data-appearance', 'white')
  await gate.evaluate(({ release }) => release())
  await keys(window, 'Space', 't', 't')

  // Only the new cycle runs, starting with White rather than the discarded read of Automatic.
  await expect(html).toHaveAttribute('data-appearance', 'system')
  await expect.poll(() => checkedApplicationSubmenuItems(app, menu)).toEqual(['Automatic'])
  await gate.dispose()
})

// @requirement PRODUCT.md §20.2.32
test('switches views once per Leader press and opens Global Search from the Agenda row', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  await expect(editor).toBeFocused()
  await keys(window, '0', 'y', 'i', 'w', 'l', 'l')

  await keys(window, 'Space', 'p')
  const row = window.locator('.agenda-row[aria-selected="true"]')
  await expect(row).toBeFocused()

  await keys(window, 'Space', 'Space')
  await expect(window.getByRole('searchbox', { name: 'Search query' })).toBeFocused()
  await keys(window, 'Escape')
  await expect(row).toBeFocused()

  await keys(window, 'Space')
  await window.keyboard.down('p')
  await expect(editor).toBeFocused()
  await window.keyboard.down('p')
  await window.keyboard.up('p')

  await expect(editor).toHaveValue('alpha beta')
  expect(await editor.evaluate((input) => (input as HTMLTextAreaElement).selectionStart)).toBe(2)

  // An independent p still puts the yanked word. The held Leader key must not do so.
  await keys(window, 'p')
  await expect(editor).toHaveValue('alpalphaha beta')
})

// @requirement PRODUCT.md §20.2.32
test('discards Tab after Leader but allows a fresh Tab to indent', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: 'one', children: [] },
        { id: 'two', text: 'two', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'two' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await expect(node(window, 2)).toBeFocused()
  const row = window.locator('.node-row[data-node-id="two"]')

  await keys(window, 'Space', 'Tab')
  await expect(row).toHaveAttribute('data-depth', '0')
  await keys(window, 'Tab')
  await expect(row).toHaveAttribute('data-depth', '1')
})

// @requirement PRODUCT.md §20.2.32
test('keeps held Leader keys from editing a node or typing into the opened popup', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  await expect(editor).toBeFocused()
  const search = window.getByRole('searchbox', { name: 'Search query' })

  await keys(window, 'Space')
  await window.keyboard.down('x')
  await window.keyboard.down('x')
  await window.keyboard.up('x')
  await expect.soft(editor).toHaveValue('alpha')

  await keys(window, 'Space')
  await window.keyboard.down('Space')
  await expect(search).toBeFocused()
  await window.keyboard.down('Space')
  await window.keyboard.up('Space')
  await expect(search).toHaveValue('')
  await keys(window, 'Space')
  await expect(search).toHaveValue(' ')
})

// @requirement PRODUCT.md §20.14.4
test('keeps Leader Search safe through composition keys and the native clear button', async ({ userDataDir }) => {
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  const search = window.getByRole('searchbox', { name: 'Search query' })
  await expect(editor).toBeFocused()
  await keys(window, 'Space', 'Space')
  await expect(search).toBeFocused()
  const ime = await window.context().newCDPSession(window)
  await ime.send('Input.imeSetComposition', { text: '日', selectionStart: 1, selectionEnd: 1 })
  await expect(search).toHaveValue('日')

  await keys(window, 'Tab', 'Escape')

  await expect(search).toBeFocused()
  await expect(search).toHaveValue('日')
  await ime.send('Input.insertText', { text: '日本' })
  await expect(search).toHaveValue('日本')
  await ime.send('Input.imeSetComposition', { text: '語', selectionStart: 1, selectionEnd: 1 })
  await expect(search).toHaveValue('日本語')
  const field = (await search.boundingBox())!
  await window.mouse.click(field.x + field.width - 14, field.y + field.height / 2)
  await expect(search).toHaveValue('')
  await search.fill('#work')
  await expect(window.locator('.node-search-input-mirror .node-search-match')).toHaveText('#work')
  await keys(window, 'Escape')
  await expect(editor).toBeFocused()
  await ime.detach()
})

// @requirement PRODUCT.md §20.2.27
// @requirement PRODUCT.md §20.2.32
test('resumes Leader when switching views removes an editor mid-composition', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  await expect(editor).toBeFocused()
  const input = await window.context().newCDPSession(window)
  await input.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  await expect(editor).toHaveValue(/に/u)
  const search = window.getByRole('searchbox', { name: 'Search query' })

  await clickApplicationMenuItem(app, 'Edit', 'Search All Nodes…')
  await expect(search).toHaveCount(0)
  await expect(editor).toBeFocused()

  await clickApplicationMenuItem(app, 'View', 'Agenda')
  const row = window.locator('.agenda-row[aria-selected="true"]')
  await expect(row).toBeFocused()
  await keys(window, 'Space', 'Space')
  await expect(search).toBeFocused()
  await keys(window, 'Escape')
  await clickApplicationMenuItem(app, 'View', 'Tree')
  await expect(editor).toBeFocused()
  const text = await editor.inputValue()

  await keys(window, 'Space', 't', 'm')
  await expect(window.getByRole('button', { name: 'Enter node 1', exact: true })).toHaveAttribute('data-marked', 'true')
  await keys(window, 'Space', 'Space')
  await expect(search).toBeFocused()
  await expect(editor).toHaveValue(text)
  await input.detach()
})

// @requirement PRODUCT.md §20.2.27
// @requirement PRODUCT.md §20.2.32
test('keeps the IME editor through a new Find match and restores focus on commit', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'first', text: 'begin 日本 end', children: [] },
        { id: 'second', text: 'alpha beta', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'first' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const find = window.getByRole('textbox', { name: 'Search', exact: true })
  const editor = node(window, 2)
  await keys(window, 'Meta+f')
  await find.fill('日本')
  await find.press('Enter')
  await expect(node(window, 1).locator('.search-match')).toHaveText('日本')
  await keys(window, 'j', '0', 'l', 'l')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveJSProperty('selectionStart', 2)
  await expect(editor).toHaveJSProperty('selectionEnd', 3)
  const ime = await window.context().newCDPSession(window)

  await ime.send('Input.imeSetComposition', { text: '日本', selectionStart: 2, selectionEnd: 2 })
  await expect(editor).toHaveJSProperty('tagName', 'TEXTAREA')
  await expect(editor).toHaveValue('al日本ha beta')
  await expect(editor).toBeFocused()
  await ime.send('Input.imeSetComposition', { text: '日本語', selectionStart: 3, selectionEnd: 3 })
  await ime.send('Input.insertText', { text: '日本語' })

  await expect(editor).toHaveText('al日本語ha beta')
  await expect(editor.locator('.search-match')).toHaveText('日本')
  await expect(editor).toBeFocused()
  await keys(window, 'Space', 't', 'm')
  await expect(window.getByRole('button', { name: 'Enter node 2', exact: true })).toHaveAttribute('data-marked', 'true')
  await keys(window, 'Space', 'Space')
  await expect(window.getByRole('searchbox', { name: 'Search query' })).toBeFocused()
  await ime.detach()
})

// @requirement PRODUCT.md §20.2.27
// @requirement PRODUCT.md §23.4
test('keeps a newer Agenda caret after a composition and an unrelated renderer update', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: '2026-10-08 alpha', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setAgendaToday(window)
  await clickApplicationMenuItem(app, 'View', 'Agenda')
  await keys(window, 'j')
  const editor = window.getByRole('textbox', { name: 'Agenda node one', exact: true })
  await expect(editor).toBeFocused()
  await keys(window, 'A')
  const ime = await window.context().newCDPSession(window)
  await ime.send('Input.imeSetComposition', { text: '日本語', selectionStart: 3, selectionEnd: 3 })
  await expect(editor).toHaveText('2026-10-08 alpha日本語')
  await ime.send('Input.insertText', { text: '日本語' })

  await keys(window, 'ArrowLeft', 'ArrowLeft')
  await clickApplicationSubmenuItem(app, { menu: 'View', submenu: 'Appearance', label: 'White' })
  await expect(window.locator('html')).toHaveAttribute('data-appearance', 'white')
  await window.keyboard.insertText('X')

  await expect(editor).toHaveText('2026-10-08 alpha日X本語')
  await keys(window, 'Escape', 'Space', 'Space')
  await expect(window.getByRole('searchbox', { name: 'Search query' })).toBeFocused()
  await ime.detach()
})
