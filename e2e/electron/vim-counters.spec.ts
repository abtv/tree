// @editing-modes: vim
import { expect, launchTree, node, seedDocument, setCursor, test } from './fixtures'

// @requirement PRODUCT.md §20.2.10
test('changes numbers through real keys, repeats, undoes and projects the final digit caret', async ({
  userDataDir,
}, testInfo) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'counter', text: 'Count 009', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'counter' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  await editor.focus()
  await setCursor(editor, 0)

  await window.keyboard.press('5')
  await window.keyboard.press('Control+a')

  await expect(editor).toHaveValue('Count 014')
  await expect(editor).toHaveJSProperty('selectionStart', 8)
  await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  await window.screenshot({ path: testInfo.outputPath('counter-normal.png') })

  await window.keyboard.press('.')
  await expect(editor).toHaveValue('Count 019')
  await window.keyboard.press('Control+x')
  await expect(editor).toHaveValue('Count 018')
  await window.keyboard.press('u')
  await expect(editor).toHaveValue('Count 019')
  await window.keyboard.press('u')
  await expect(editor).toHaveValue('Count 014')
  await window.keyboard.press('Control+r')
  await expect(editor).toHaveValue('Count 019')

  await window.keyboard.press('$')
  await window.keyboard.press('l')
  await window.keyboard.press('Control+a')
  await expect(editor).toHaveValue('Count 020')
})

// @requirement PRODUCT.md §20.2.10
// @requirement PRODUCT.md §23.10
test('changes a rich Agenda match and leaves read-only day text unchanged', async ({ userDataDir }, testInfo) => {
  const url = 'https://example.com'
  const text = `2026-10-14 ${url} Count 9`
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'counter',
          text,
          children: [],
          links: [{ start: 11, end: 11 + url.length, url }],
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'counter' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.keyboard.press('Meta+p')
  const editor = window.locator('.agenda-row[data-agenda-key$=":counter"] .node-input').first()
  await editor.click()
  await setCursor(editor, text.length - 1)

  await window.keyboard.press('Control+a')

  await expect(editor).toHaveText(text.slice(0, -1) + '10')
  await expect(editor.locator('a')).toHaveAttribute('href', url)
  await expect(editor).toBeFocused()
  await window.screenshot({ path: testInfo.outputPath('counter-agenda-rich.png') })

  await window.keyboard.press('Control+x')
  await expect(editor).toHaveText(text)
  await window.keyboard.press('k')
  const day = window.locator('.agenda-row[aria-selected="true"]')
  const before = await day.textContent()
  await window.keyboard.press('Control+a')
  await expect(day).toHaveText(before!)
  await expect(editor).toHaveText(text)
})
