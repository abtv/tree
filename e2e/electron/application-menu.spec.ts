// @editing-modes: both
import {
  clickApplicationMenuItem,
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  test,
} from './fixtures'

function seed(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'note', text: 'alpha 2026-10-14', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'note' },
  })
}

describeForEachEditingMode('Native view menu', ({ mode }) => {
  // @requirement PRODUCT.md §9.3
  // @requirement PRODUCT.md §23.1
  test('switches views idempotently, retains the origin caret and reconnects after reload', async ({ userDataDir }) => {
    seed(userDataDir)
    const { app, window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    const editor = window.locator('.node-input').first()
    await editor.focus()
    await setCursor(editor, 3)
    await clickApplicationMenuItem(app, 'View', 'Tree')
    await expect(editor).toBeFocused()
    await window.keyboard.press('Meta+Shift+p')
    await expect(window.locator('.command-input-line input')).toBeFocused()
    await clickApplicationMenuItem(app, 'View', 'Agenda')
    await expect(window.locator('.agenda-list')).toBeVisible()
    await expect(window.getByRole('listbox', { name: 'Application commands' })).toHaveCount(0)
    await clickApplicationMenuItem(app, 'View', 'Agenda')
    await expect(window.locator('.agenda-list')).toBeVisible()
    await clickApplicationMenuItem(app, 'View', 'Tree')
    await expect(editor).toBeFocused()
    expect(
      await editor.evaluate((element) => {
        if (element instanceof HTMLTextAreaElement) return element.selectionStart
        const selection = element.ownerDocument.getSelection()!
        const range = element.ownerDocument.createRange()
        range.selectNodeContents(element)
        range.setEnd(selection.focusNode!, selection.focusOffset)
        return range.toString().length
      }),
    ).toBe(3)
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('0')
      await window.keyboard.press('R')
      await window.keyboard.type('X')
      await window.keyboard.press('Meta+Shift+p')
      await expect(window.locator('.command-input-line input')).toBeFocused()
      await clickApplicationMenuItem(app, 'View', 'Agenda')
      await expect(window.getByRole('listbox', { name: 'Application commands' })).toHaveCount(0)
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      await clickApplicationMenuItem(app, 'View', 'Tree')
      await expect(editor).toHaveText('Xlpha 2026-10-14')
      await expect(editor).toBeFocused()
    }
    await window.reload()
    await expect(editor).toBeVisible()
    await clickApplicationMenuItem(app, 'View', 'Agenda')
    await expect(window.locator('.agenda-list')).toBeVisible()
    await clickApplicationMenuItem(app, 'View', 'Tree')
    await expect(editor).toBeFocused()
  })
})
