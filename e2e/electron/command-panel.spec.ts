// @editing-modes: both
import type { Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QUIT_WITHOUT_SAVING_PROMPT, SAVE_LOCKED_MESSAGE } from '../../src/domain/product-messages'
import {
  applicationMenuItemChecked,
  checkedApplicationSubmenuItems,
  clickApplicationSubmenuItem,
  clickApplicationMenuItem,
  closeApp,
  expect,
  launchTree,
  node,
  readPersisted,
  seedDocument,
  setCursor,
  test,
  typeInto,
  allowRendererError,
  blockSaves,
  documentPath,
  exactMessage,
  fireIdleSave,
  describeForEachEditingMode,
} from './fixtures'

const names = (page: Page) => page.locator('.command-name').allTextContents()
async function open(page: Page, query = ''): Promise<void> {
  await page.keyboard.press(':')
  await expect(page.getByRole('combobox', { name: 'Command' })).toBeFocused()
  await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')
  if (query !== '') await page.getByRole('combobox').pressSequentially(query)
}
async function run(page: Page, query: string): Promise<void> {
  await open(page, query)
  await page.keyboard.press('Enter')
  await expect(page.locator('.command-panel')).toHaveCount(0)
}

test.describe('Normal command panel', () => {
  test.use({ editingMode: 'vim' })
  // @requirement PRODUCT.md §20.2.28
  test('filters, wraps selection, cancels pending commands and restores native text focus and caret', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'one', text: 'alpha beta', children: [] },
          { id: 'two', text: 'second row', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 2)
    const selection = () =>
      editor.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return [input.selectionStart, input.selectionEnd]
      })
    const before = await selection()
    await window.keyboard.press('3')
    await window.keyboard.press('d')
    await open(window)
    await expect(window.locator('.command-count')).toHaveText('10 of 10')
    await window.keyboard.press('ArrowUp')
    await expect(window.getByRole('option', { selected: true })).toContainText('toggle-vim-mode')
    await window.keyboard.press('Control+n')
    await expect(window.getByRole('option', { selected: true })).toContainText('export-notes')
    await window.keyboard.press('ArrowDown')
    await window.keyboard.press('Control+p')
    await expect(window.getByRole('option', { selected: true })).toContainText('export-notes')
    await window.getByRole('combobox').pressSequentially('theme')
    expect(await names(window)).toEqual(['set-theme-auto', 'set-theme-dark', 'set-theme-light'])
    await window.keyboard.press('Escape')
    await expect(editor).toBeFocused()
    expect(await selection()).toEqual(before)
    await window.keyboard.press('l')
    await expect(editor).toHaveValue('alpha beta')
    await open(window)
    await window.keyboard.press('Backspace')
    await expect(editor).toBeFocused()
    await window.clock.install()
    await window.clock.pauseAt(new Date(Date.now() + 1000))
    await run(window, 'unknown')
    await expect(window.locator('.command-error')).toHaveText('Not a command: unknown')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.clock.runFor(1999)
    await expect(window.locator('.command-error')).toHaveText('Not a command: unknown')
    await window.clock.runFor(1)
    await expect(window.locator('.command-error')).toHaveCount(0)
    await expect(editor).toBeFocused()
    await run(window, 'unknown')
    await window.keyboard.press('h')
    await expect(window.locator('.command-error')).toHaveCount(0)
    await open(window)
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function (options) {
        options?.callback?.()
      }
    })
    await node(window, 2).click({ button: 'right' })
    await expect(window.locator('.command-panel')).toHaveCount(0)
    // A right-button dismissal must not consume the next control click.
    await window.getByRole('button', { name: 'Pin window on top' }).click()
    await expect(window.getByRole('button', { name: 'Unpin window from top' })).toBeVisible()
    await open(window)
    await window.evaluate(() => globalThis.dispatchEvent(new Event('blur')))
    await expect(window.locator('.command-panel')).toHaveCount(0)
    await expect(editor).toBeFocused()
  })

  // @requirement PRODUCT.md §20.2.28
  // @requirement PRODUCT.md §20.5
  test('runs preference services, follows menu state, and restores history after restart without document edits', async ({
    userDataDir,
  }) => {
    const first = await launchTree(userDataDir, { initialMode: 'normal' })
    const { app, window } = first
    await node(window, 1).focus()
    const before = await window.evaluate(() =>
      (globalThis as unknown as { treeApi: import('../../src/shared/ipc').TreeApi }).treeApi.load(),
    )
    await window.clock.install()
    for (const [query, value, label] of [
      ['dark', 'dark', 'Dark'],
      ['light', 'light', 'Light'],
      ['auto', 'system', 'Automatic'],
    ] as const) {
      await run(window, query)
      expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe(value)
      expect(await checkedApplicationSubmenuItems(app, { menu: 'View', submenu: 'Appearance' })).toEqual([label])
      await expect(node(window, 1)).toBeFocused()
    }
    await clickApplicationSubmenuItem(app, { menu: 'View', submenu: 'Appearance', label: 'Dark' })
    await open(window, 'dark')
    await expect(window.locator('.command-state')).toHaveText('✓')
    await window.keyboard.press('Escape')
    await open(window, 'toggle')
    await window.getByRole('option', { selected: true }).click()
    await expect(window.getByRole('button', { name: 'Unpin window from top' })).toBeVisible()
    expect(await applicationMenuItemChecked(app, 'Window', 'Always on Top')).toBe(true)
    await fireIdleSave(window)
    expect(
      await window.evaluate(() =>
        (globalThis as unknown as { treeApi: import('../../src/shared/ipc').TreeApi }).treeApi.load(),
      ),
    ).toEqual(before)
    await closeApp(app)
    const second = await launchTree(userDataDir, { initialMode: 'normal' })
    await node(second.window, 1).focus()
    await open(second.window)
    expect(await names(second.window)).toEqual([
      'toggle-always-on-top',
      'set-theme-auto',
      'set-theme-light',
      'set-theme-dark',
      'export-notes',
      'import-notes',
      'quit',
      'show-agenda',
      'show-tree',
      'toggle-vim-mode',
    ])
    expect(JSON.parse(readFileSync(join(userDataDir, 'data', 'command-history.json'), 'utf8'))).toEqual([
      'toggle-always-on-top',
      'set-theme-auto',
      'set-theme-light',
      'set-theme-dark',
    ])
  })

  // @requirement PRODUCT.md §20.2.28
  test('surfaces a history write failure and permits the next command to persist', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await app.evaluate(() => {
      const registry = (
        globalThis as unknown as {
          __treeIpc: {
            wrap(
              channel: string,
              wrapper: (original: (...args: unknown[]) => unknown, ...args: unknown[]) => unknown,
            ): void
          }
        }
      ).__treeIpc
      let fail = true
      registry.wrap('tree:set-command-history', (original, ...args) => {
        if (fail) {
          fail = false
          throw new Error('history blocked')
        }
        return original(...args)
      })
    })
    allowRendererError(
      exactMessage("Operation failed: Error invoking remote method 'tree:set-command-history': Error: history blocked"),
    )
    await node(window, 1).focus()
    await run(window, 'dark')
    await expect(window.getByText(/Operation failed:.*history blocked/)).toBeVisible()
    await run(window, 'light')
    await expect
      .poll(() => JSON.parse(readFileSync(join(userDataDir, 'data', 'command-history.json'), 'utf8')))
      .toEqual(['set-theme-light', 'set-theme-dark'])
  })

  // @requirement PRODUCT.md §20.2.28
  test('quits through the save-before-quit handshake with the exact q alias', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await typeInto(node(window, 1), 'saved by command quit')
    await window.keyboard.press('Escape')
    await open(window, 'q')
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await window.keyboard.press('Enter')
    await closed
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('saved by command quit')
  })

  // @requirement PRODUCT.md §20.2.28
  // @requirement PRODUCT.md §20.2.1
  test('toggles Vim editing through its existing service, preserving caret and restoring the saved choice', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const first = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(first.window, 1)
    await editor.focus()
    await setCursor(editor, 2)
    await open(first.window, 'toggle-vim-mode')
    await expect(first.window.locator('.command-state')).toHaveText('✓')
    await first.window.keyboard.press('Enter')
    await expect(first.window.getByLabel('Vim mode')).toHaveCount(0)
    await expect(first.window.locator('.vim-toggle')).toHaveCount(0)
    await expect(editor).toBeFocused()
    expect(
      await editor.evaluate((element) => [
        (element as HTMLTextAreaElement).selectionStart,
        (element as HTMLTextAreaElement).selectionEnd,
      ]),
    ).toEqual([2, 2])
    expect(await applicationMenuItemChecked(first.app, 'Edit', 'Vim Editing')).toBe(false)
    await expect
      .poll(() => JSON.parse(readFileSync(join(userDataDir, 'data', 'command-history.json'), 'utf8')))
      .toEqual(['toggle-vim-mode'])
    await closeApp(first.app)
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('alpha beta')
    const second = await launchTree(userDataDir, { vimPreference: 'saved' })
    await expect(second.window.getByLabel('Vim mode')).toHaveCount(0)
    expect(await applicationMenuItemChecked(second.app, 'Edit', 'Vim Editing')).toBe(false)
    await clickApplicationMenuItem(second.app, 'Edit', 'Vim Editing')
    await expect(second.window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await node(second.window, 1).focus()
    await open(second.window)
    await expect(second.window.getByRole('option').first()).toContainText('toggle-vim-mode')
    await expect(second.window.getByRole('option').first().locator('.command-state')).toHaveText('✓')
  })

  // @requirement PRODUCT.md §20.2.28
  test('toggles Vim editing from an Agenda row without an editor and keeps row focus', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'one', text: '2026-10-17 review', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.keyboard.press('Meta+p')
    const row = window.locator('.agenda-row').first()
    await row.click()
    await run(window, 'toggle-vim-mode')
    await expect(window.getByLabel('Vim mode')).toHaveCount(0)
    await expect(row).toBeFocused()
    await clickApplicationMenuItem(app, 'Edit', 'Vim Editing')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(row).toBeFocused()
  })

  // @requirement PRODUCT.md §20.2.28
  // @requirement PRODUCT.md §16.2
  test('keeps preferences available while locked and uses quit-without-saving confirmation', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)
    await expect.poll(() => existsSync(documentPath(userDataDir))).toBe(true)
    allowRendererError(
      exactMessage("Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked"),
    )
    allowRendererError(exactMessage("Operation failed: Error invoking remote method 'tree:save': Error: save blocked"))
    allowRendererError(exactMessage(SAVE_LOCKED_MESSAGE))
    await window.clock.install()
    await blockSaves(app)
    await typeInto(node(window, 1), 'one two three four five six seven eight nine ten eleven')
    await expect(window.getByText(/Changes could not be saved:/)).toBeVisible()
    await fireIdleSave(window)
    await fireIdleSave(window)
    await expect(window.getByText(SAVE_LOCKED_MESSAGE)).toBeVisible()
    await window.keyboard.press('Escape')
    await run(window, 'dark')
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
    await run(window, 'toggle')
    expect(await applicationMenuItemChecked(app, 'Window', 'Always on Top')).toBe(true)
    await run(window, 'toggle-vim-mode')
    await expect(window.getByLabel('Vim mode')).toHaveCount(0)
    await clickApplicationMenuItem(app, 'Edit', 'Vim Editing')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await run(window, 'quit')
    await expect(window.getByText(QUIT_WITHOUT_SAVING_PROMPT)).toBeVisible()
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await window.getByRole('button', { name: 'Quit without saving' }).click()
    await closed
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('')
  })

  // @requirement PRODUCT.md §20.2.28
  test('opens on Agenda read-only rows and rich editors and restores their selection', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'one',
            text: '2026-10-17 https://example.com',
            links: [{ start: 11, end: 30, url: 'https://example.com' }],
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(window, 1)
    await editor.focus()
    await window.keyboard.press('l')
    const selected = () => window.evaluate(() => globalThis.getSelection()?.toString())
    const before = await selected()
    await open(window)
    await window.keyboard.press('Escape')
    await expect(editor).toBeFocused()
    expect(await selected()).toBe(before)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row').first().click()
    const row = window.locator('.agenda-row').first()
    await expect(row).toBeFocused()
    await open(window, 'theme')
    await window.keyboard.press('Escape')
    await expect(row).toBeFocused()
  })

  for (const appearance of ['light', 'dark'] as const) {
    // @requirement PRODUCT.md §20.2.28
    test(`overlays the document without changing geometry in ${appearance}`, async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'one', text: 'Command panel review', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'one' },
      })
      const { window } = await launchTree(userDataDir, { initialMode: 'normal', appearance })
      await window.emulateMedia({ colorScheme: appearance })
      const editor = node(window, 1)
      await editor.focus()
      const before = await editor.boundingBox()
      await open(window)
      const panel = await window.locator('.command-panel').boundingBox()
      const status = await window.locator('.status-bar').boundingBox()
      const mode = await window.getByLabel('Vim mode').boundingBox()
      const pin = await window.locator('.always-on-top-toggle').boundingBox()
      expect(mode!.x + mode!.width + 12).toBe(pin!.x)
      await expect(window.locator('.vim-toggle')).toHaveCount(0)
      expect(panel!.y + panel!.height).toBe(status!.y)
      expect(panel!.x).toBe(0)
      expect(panel!.width).toBe(status!.width)
      expect(await editor.boundingBox()).toEqual(before)
      await window.screenshot({ path: `.scratch/command-panel/final-${appearance}.png` })
      await expect(window).toHaveScreenshot(`command-panel-${appearance}.png`)
    })
  }

  // @requirement PRODUCT.md §20.2.7
  // @requirement PRODUCT.md §20.2.28
  test('keeps the right-side mode visible beside the pin during long command feedback', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.clock.install()
    await window.clock.pauseAt(new Date(Date.now() + 1000))
    await node(window, 1).focus()
    await open(window)
    await window.getByRole('combobox').fill('invalid-command-'.repeat(100))
    await window.keyboard.press('Enter')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    const error = await window.locator('.command-error').boundingBox()
    const mode = await window.getByLabel('Vim mode').boundingBox()
    const pin = await window.locator('.always-on-top-toggle').boundingBox()
    expect(error!.x + error!.width).toBeLessThanOrEqual(mode!.x)
    expect(mode!.x + mode!.width + 12).toBe(pin!.x)
    expect(
      await window.locator('.command-error').evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.screenshot({ path: `.scratch/command-panel/feedback-${appearance}.png` })
    }
  })
})

test.describe('Command panel application shortcut', () => {
  describeForEachEditingMode('named views and editing preference', ({ mode }) => {
    // @requirement PRODUCT.md §20.2.28
    test('restores a selection, toggles Vim and selects named views idempotently', async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'one' },
      })
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const editor = node(window, 1)
      await editor.focus()
      await editor.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(2, 7, 'backward'))
      const shortcut = async (query: string) => {
        await window.keyboard.press('Meta+Shift+p')
        await expect(window.getByRole('combobox')).toBeFocused()
        await window.getByRole('combobox').fill(query)
      }
      await shortcut('show-tree')
      await expect(window.locator('.command-state')).toHaveText('✓')
      await window.keyboard.press('Enter')
      await expect(editor).toBeFocused()
      expect(
        await editor.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          return [input.selectionStart, input.selectionEnd, input.selectionDirection]
        }),
      ).toEqual([2, 7, 'backward'])
      await shortcut('show-agenda')
      await window.keyboard.press('Enter')
      await expect(window.locator('.agenda-list')).toBeVisible()
      const selected = await window.locator('.agenda-row[aria-selected="true"]').getAttribute('data-agenda-key')
      await shortcut('show-agenda')
      await expect(window.locator('.command-state')).toHaveText('✓')
      await window.keyboard.press('Enter')
      expect(await window.locator('.agenda-row[aria-selected="true"]').getAttribute('data-agenda-key')).toBe(selected)
      await shortcut('show-tree')
      await window.keyboard.press('Enter')
      await expect(window.locator('.agenda-list')).toHaveCount(0)
      await expect(editor).toBeFocused()
      await window.keyboard.press('Meta+p')
      await expect(window.locator('.agenda-list')).toBeVisible()
      await window.keyboard.press('Meta+p')
      await expect(window.locator('.agenda-list')).toHaveCount(0)
      await shortcut('toggle-vim-mode')
      await window.keyboard.press('Enter')
      if (mode === 'standard') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      else await expect(window.getByLabel('Vim mode')).toHaveCount(0)
      await expect(editor).toHaveValue('alpha beta')
    })
  })

  test.describe('Vim mode suspension', () => {
    test.use({ editingMode: 'vim' })
    for (const [mode, key] of [
      ['INSERT', 'i'],
      ['REPLACE', 'R'],
      ['VISUAL', 'v'],
      ['VISUAL NODE', 'V'],
    ] as const) {
      // @requirement PRODUCT.md §20.2.28
      test(`resumes ${mode} and its selection after shortcut cancellation`, async ({ userDataDir }) => {
        seedDocument(userDataDir, {
          document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
          location: { currentParentId: null, selectedNodeId: 'one' },
        })
        const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
        const editor = node(window, 1)
        await editor.focus()
        await setCursor(editor, 2)
        await window.keyboard.press(key)
        if (mode === 'REPLACE') await window.keyboard.type('X')
        if (mode === 'VISUAL') await window.keyboard.press('l')
        const selection = () =>
          editor.evaluate((element) => {
            const input = element as HTMLTextAreaElement
            return [input.selectionStart, input.selectionEnd]
          })
        const before = await selection()
        await window.keyboard.press('Meta+Shift+p')
        await expect(window.getByRole('combobox')).toBeFocused()
        await window.keyboard.press('Escape')
        await expect(window.getByLabel('Vim mode')).toHaveText(mode)
        await expect(editor).toBeFocused()
        expect(await selection()).toEqual(before)
        if (mode === 'REPLACE') {
          await window.keyboard.type('Z')
          await window.keyboard.press('Escape')
          await expect(editor).toHaveValue('alXZa beta')
        } else if (mode === 'VISUAL') {
          await window.keyboard.press('l')
          const after = await selection()
          expect(after[1]! - after[0]!).toBe(before[1]! - before[0]! + 1)
        }
      })
    }

    // @requirement PRODUCT.md §20.2.28
    test('preserves a rich Replace buffer while open and resolves it when changing views', async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            {
              id: 'one',
              text: '2026-10-17 https://example.com',
              links: [{ start: 11, end: 30, url: 'https://example.com' }],
              children: [],
            },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'one' },
      })
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const editor = node(window, 1)
      await editor.focus()
      await setCursor(editor, 5)
      await window.keyboard.press('v')
      await window.keyboard.press('h')
      const directionalSelection = () =>
        window.evaluate(() => {
          const selection = globalThis.getSelection()!
          return [selection.anchorOffset, selection.focusOffset, selection.toString()]
        })
      const backward = await directionalSelection()
      await window.keyboard.press('Meta+Shift+p')
      await window.keyboard.press('Escape')
      expect(await directionalSelection()).toEqual(backward)
      await window.keyboard.press('Escape')
      await setCursor(editor, 11)
      await window.keyboard.press('R')
      await window.keyboard.type('X')
      await window.keyboard.press('Meta+Shift+p')
      await window.getByRole('combobox').fill('show-agenda')
      await window.keyboard.press('Enter')
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      await expect(window.locator('.agenda-list')).toBeVisible()
      await window.keyboard.press('Meta+Shift+p')
      await window.getByRole('combobox').fill('show-tree')
      await window.keyboard.press('Enter')
      await expect(editor).toHaveText('2026-10-17 Xttps://example.com')
      await expect(editor).toBeFocused()
      await window.keyboard.press('u')
      await expect(editor).toHaveText('2026-10-17 https://example.com')
    })
  })
})
