// @editing-modes: both
import type { Page } from '@playwright/test'
import { describeForEachEditingMode, expect, launchTree, node, seedDocument, test } from './fixtures'

// Lists every rendered text run outside a node editor whose pointer would be the text-editing
// I-beam: `auto` resolves to the I-beam over text, and `text` requests it explicitly.
function textCursorOffenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      const content = text.textContent?.trim() ?? ''
      const element = text.parentElement
      if (content === '' || element === null) continue
      if (element.closest('textarea, [contenteditable="true"]') !== null) continue
      const cursor = getComputedStyle(element).cursor
      if (cursor === 'auto' || cursor === 'text') {
        offenders.push(`${element.tagName.toLowerCase()}.${element.className} "${content}": ${cursor}`)
      }
    }
    return offenders
  })
}

describeForEachEditingMode('pointer cursor', ({ mode }) => {
  // @requirement PRODUCT.md §20
  test('uses a text pointer only over the focused editor in text-entry modes', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First node', children: [] },
          { id: 'second', text: 'Second node', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(window, 1)
    const other = node(window, 2)
    const modes =
      mode === 'vim'
        ? [
            { label: 'NORMAL', keys: [], cursor: 'default' },
            { label: 'INSERT', keys: ['i'], cursor: 'text' },
            { label: 'REPLACE', keys: ['Escape', 'R'], cursor: 'text' },
            { label: 'VISUAL', keys: ['Escape', 'v', 'l'], cursor: 'default' },
            { label: 'VISUAL NODE', keys: ['Escape', 'V'], cursor: 'default' },
          ]
        : [{ label: null, keys: [], cursor: 'text' }]

    for (const { label, keys, cursor } of modes) {
      for (const key of keys) await window.keyboard.press(key)
      if (label !== null) await expect(window.getByLabel('Vim mode')).toHaveText(label)
      await expect(editor).toBeFocused()

      await editor.hover({ position: { x: 11, y: 10 } })
      await expect(editor, `pointer in ${label ?? 'standard editing'}`).toHaveCSS('cursor', cursor)
      await other.hover({ position: { x: 11, y: 10 } })
      await expect(other).toHaveCSS('cursor', 'default')
      await expect(editor).toBeFocused()
    }
  })

  // @requirement PRODUCT.md §20
  test('shows the default arrow rather than the text-editing cursor over text the user cannot edit', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'ancestor',
            text: 'Ancestor',
            children: [{ id: 'parent', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }],
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'child' },
    })
    const { window: page } = await launchTree(userDataDir)

    // The breadcrumb has an ancestor link and the non-clickable current segment, and in Vim editing
    // the status bar shows the mode indicator, so every kind of non-editable text in the editor view
    // is present. Standard editing has no indicator.
    await expect(page.locator('.location-current')).toHaveText('Parent')
    await expect(page.locator('.location-link')).toHaveText('Ancestor')
    await expect(page.getByLabel('Vim mode')).toHaveCount(mode === 'vim' ? 1 : 0)

    expect(await textCursorOffenders(page)).toEqual([])
  })
})
