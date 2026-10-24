// @editing-modes: independent
import { test, expect, capture, primaryKey } from './fixtures.mts'
import { ready, installBackupPicker, writeFolder } from './data-helpers.mts'
import { onePixelPng } from '../../src/electron/main/png-test-utils.ts'

// @requirement PRODUCT.md §1.4
test('Escape from the browser menu restores editing and backward selection without an extra Tab', async ({
  newContext,
}) => {
  const page = await (await newContext()).newPage()
  await page.goto('/')
  await ready(page)
  const editor = page.locator('[data-node-id="welcome"] .node-input')
  await editor.fill('Menu focus sample')
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 7, 'backward'))
  await page.locator('#tree-menu-button').click()
  await expect(page.locator('#tree-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
  expect(
    await editor.evaluate((element: HTMLTextAreaElement) => [
      element.selectionStart,
      element.selectionEnd,
      element.selectionDirection,
    ]),
  ).toEqual([2, 7, 'backward'])
  await page.keyboard.type('X')
  await expect(editor).toHaveValue('MeXcus sample')
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 2))
  await page.locator('#tree-menu-button').click()
  await page.locator('#tree-menu-button').click()
  await expect(editor).toBeFocused()
  await page.locator('#tree-menu-button').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#tree-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(2)
})

// @requirement PRODUCT.md §1.4
test('setting actions restore rich selections and preserve buffered Vim Replace through menu cancellation', async ({
  newContext,
}) => {
  const page = await (await newContext()).newPage()
  await page.goto('/')
  await ready(page)
  await page.evaluate(() =>
    window.prototypeStore.pasteSubtree('welcome', 'after', {
      id: 'menu-rich',
      text: 'alpha https://example.com omega',
      links: [{ start: 6, end: 25, url: 'https://example.com' }],
      children: [],
    }),
  )
  const editor = page.getByRole('textbox', { name: 'Node 2', exact: true })
  await editor.focus()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.evaluate((element: HTMLElement) => {
    const text = element.firstChild!
    window.getSelection()!.setBaseAndExtent(text, 5, text, 1)
  })
  await page.locator('#tree-menu-button').click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(editor).toBeFocused()
  expect(await editor.evaluate(() => [getSelection()!.anchorOffset, getSelection()!.focusOffset])).toEqual([5, 1])
  await page.keyboard.type('X')
  await expect(editor).toHaveText('aX https://example.com omega')
  await page.evaluate(() => window.treeApi.setVimEnabled(true))
  await editor.focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('0')
  await page.keyboard.press('R')
  await page.keyboard.type('ZZ')
  await expect(page.getByLabel('Vim mode')).toHaveText('REPLACE')
  await page.locator('#tree-menu-button').click()
  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
  await expect(page.getByLabel('Vim mode')).toHaveText('REPLACE')
  await page.keyboard.type('Y')
  await page.keyboard.press('Escape')
  await expect(editor).toHaveText('ZZYhttps://example.com omega')
  await capture(page, 'menu-return-rich-normal.png')
})

// @requirement PRODUCT.md §1.4
test('Tab keeps menu navigation and explicit outside clicks keep their destination', async ({ newContext }) => {
  const page = await (await newContext()).newPage()
  await page.goto('/')
  await ready(page)
  const editor = page.locator('[data-node-id="welcome"] .node-input')
  await editor.focus()
  await page.locator('#tree-menu-button').click()
  await page.keyboard.press('Tab')
  await expect(page.locator('#prototype-tree')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('#prototype-agenda')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('#prototype-tree')).toBeFocused()
  const other = page.locator('[data-node-id="project"] .node-input')
  await other.click()
  await expect(other).toBeFocused()
  await expect(page.locator('#tree-menu')).toBeHidden()
  await page.keyboard.type('New ')
  await expect(other).toHaveValue(/New /)
  await expect(editor).not.toBeFocused()
})

// @requirement PRODUCT.md §1.4
test('backup confirmation owns focus and returns it with the saved caret on cancel', async ({ newContext }) => {
  const context = await newContext()
  await installBackupPicker(context)
  const page = await context.newPage()
  await page.goto('/')
  await ready(page)
  await writeFolder(page, 'Tree Backup', { 'document.json': '{}' })
  const editor = page.locator('[data-node-id="welcome"] .node-input')
  await editor.fill('dialog return')
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(3, 3))
  await page.locator('#tree-menu-button').click()
  await page.getByRole('button', { name: 'Back Up to Folder…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'This Folder Already Contains Notes' })
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
  expect(
    await editor.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd]),
  ).toEqual([3, 3])
  await page.keyboard.type('X')
  await expect(editor).toHaveValue('diaXlog return')
  await page.keyboard.press(`${primaryKey}+Shift+p`)
  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
})

// @requirement PRODUCT.md §1.4
test('view actions own the destination and cancellation restores a readonly Agenda row', async ({ newContext }) => {
  const page = await (await newContext()).newPage()
  await page.goto('/')
  await ready(page)
  const editor = page.locator('[data-node-id="welcome"] .node-input')
  await page.evaluate(() => {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    window.prototypeStore.editText('welcome', `${date} Menu return`)
  })
  await editor.focus()
  await page.locator('#tree-menu-button').click()
  await page.getByRole('button', { name: 'Agenda', exact: true }).click()
  const row = page.locator('.agenda-today')
  await expect(row).toBeFocused()
  await page.evaluate(() => window.treeApi.setVimEnabled(true))
  await editor.click()
  await page.keyboard.press('R')
  await expect(page.getByLabel('Vim mode')).toHaveText('REPLACE')
  await row.locator('.agenda-label').click()
  await expect(row).toBeFocused()
  await page.locator('#tree-menu-button').click()
  await expect(page.getByLabel('Vim mode')).toHaveText('REPLACE')
  await page.keyboard.press('Escape')
  await expect(row).toBeFocused()
  await expect(page.getByLabel('Vim mode')).toHaveText('REPLACE')
  await page.locator('#tree-menu-button').click()
  await page.getByRole('button', { name: 'Tree', exact: true }).click()
  await expect(editor).toBeFocused()
  await expect(page.locator('.agenda-list')).toHaveCount(0)
})

// @requirement PRODUCT.md §1.4
test('menu cancellation preserves the image caret and its text return position', async ({ newContext }) => {
  const page = await (await newContext()).newPage()
  await page.goto('/')
  await ready(page)
  await page.evaluate(
    async (bytes) => {
      await window.treeApi.writeAttachment('menu-image', new Uint8Array(bytes))
      window.prototypeStore.pasteSubtree('welcome', 'after', {
        id: 'image-source',
        text: 'abc',
        children: [],
        attachment: { id: 'menu-image', mimeType: 'image/png' },
      })
      await window.treeApi.setVimEnabled(true)
    },
    [...onePixelPng],
  )
  const editor = page.getByRole('textbox', { name: 'Node 2', exact: true })
  await editor.focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('0')
  await page.keyboard.type('lll')
  await expect(editor).toHaveClass(/node-input-image-caret/)
  await page.locator('#tree-menu-button').click()
  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveClass(/node-input-image-caret/)
  await page.keyboard.press('h')
  await expect(editor).not.toHaveClass(/node-input-image-caret/)
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(2)
})

// @requirement PRODUCT.md §1.4
test('dismissing a focused export failure returns to editing', async ({ newContext }) => {
  const page = await (await newContext()).newPage()
  await page.route(/archive\.worker/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("Synthetic archive failure")' }),
  )
  await page.goto('/')
  await ready(page)
  const editor = page.locator('[data-node-id="welcome"] .node-input')
  await editor.fill('activity return')
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(3, 3))
  await page.locator('#tree-menu-button').click()
  await page.getByRole('button', { name: 'Export Notes…', exact: true }).click()
  await expect(page.locator('#data-activity-text')).toContainText('Export failed.')
  await page.locator('#data-activity-action').click()
  await expect(editor).toBeFocused()
  await page.keyboard.type('X')
  await expect(editor).toHaveValue('actXivity return')
})

// @requirement PRODUCT.md §1.4
test('leaving the menu for another node commits the previous Replace buffer', async ({ newContext }) => {
  const page = await (await newContext()).newPage()
  await page.goto('/')
  await ready(page)
  const source = page.locator('[data-node-id="welcome"] .node-input')
  await source.fill('alpha beta')
  await page.evaluate(() => window.treeApi.setVimEnabled(true))
  await source.focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('0')
  await page.keyboard.press('R')
  await page.keyboard.type('X')
  await page.locator('#tree-menu-button').click()
  const other = page.locator('[data-node-id="project"] .node-input')
  await other.click()
  await expect(other).toBeFocused()
  await page.keyboard.type('Y')
  await page.keyboard.press('Escape')
  expect(
    await page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).document.roots[0]!.text),
  ).toBe('Xlpha beta')
  await expect(source).toHaveValue('Xlpha beta')
})

// @requirement PRODUCT.md §1.4
test('Tab leaving the menu commits the borrowed editor before another editing destination', async ({ newContext }) => {
  const page = await (await newContext()).newPage()
  await page.goto('/')
  await ready(page)
  const source = page.locator('[data-node-id="project"] .node-input')
  await page.evaluate(() => window.prototypeStore.editText('project', 'alpha beta'))
  await page.evaluate(() => window.treeApi.setVimEnabled(true))
  await source.focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('0')
  await page.keyboard.press('R')
  await page.keyboard.type('X')
  await page.locator('#tree-menu-button').click()
  await page.getByRole('button', { name: 'Restore from Folder…', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('#tree-menu')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Top level', exact: true })).toBeFocused()
  expect(
    await page.evaluate(
      () =>
        (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).document.roots.find(
          (node) => node.id === 'project',
        )!.text,
    ),
  ).toBe('Xlpha beta')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const destination = page.locator('[data-node-id="welcome"] .node-input')
  await expect(destination).toBeFocused()
  await page.keyboard.type('Y')
  await expect(source).toHaveValue('Xlpha beta')
})

// @requirement PRODUCT.md §1.4
test('Tree and Agenda menu actions finish buffered Replace before switching views', async ({ newContext }) => {
  const page = await (await newContext()).newPage()
  await page.goto('/')
  await ready(page)
  await page.evaluate(async () => {
    window.prototypeStore.editText('welcome', 'alpha #2026-10-24')
    await window.treeApi.setVimEnabled(true)
  })
  const editor = page.locator('[data-node-id="welcome"] .node-input')
  for (const [letter, view, text] of [
    ['X', 'Agenda', 'Xlpha #2026-10-24'],
    ['Y', 'Tree', 'Ylpha #2026-10-24'],
  ] as const) {
    await editor.click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('0')
    await page.keyboard.press('R')
    await page.keyboard.type(letter)
    await page.locator('#tree-menu-button').click()
    await page.getByRole('button', { name: view, exact: true }).click()
    await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')
    expect(
      await page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).document.roots[0]!.text),
    ).toBe(text)
  }
  await expect(editor).toBeFocused()
})
