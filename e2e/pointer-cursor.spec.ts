// @editing-modes: pending
import type { Page } from '@playwright/test'
import { expect, launchTree, seedDocument, test } from './fixtures'

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

test.describe('pointer cursor', () => {
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
    // The breadcrumb has an ancestor link and the non-clickable current segment, and the status bar
    // shows the Vim mode indicator, so every kind of non-editable text in the editor view is present.
    await expect(page.locator('.location-current')).toHaveText('Parent')
    await expect(page.locator('.location-link')).toHaveText('Ancestor')
    await expect(page.getByLabel('Vim mode')).toBeVisible()

    expect(await textCursorOffenders(page)).toEqual([])
  })
})
