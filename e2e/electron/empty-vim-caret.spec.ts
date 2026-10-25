// @editing-modes: vim
import { expect, launchTree, node, seedDocument, test } from './fixtures'

// @requirement PRODUCT.md §20.2.4
test('paints the empty Normal caret without native block-caret support', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'empty', text: '', children: [{ id: 'child', text: '2026-10-17', children: [] }] },
        { id: 'other', text: 'Neighbor', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'empty' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal', vimPreference: true })

  // Safari can ignore caret-shape. Force that capability boundary in Chromium.
  await window.evaluate(() => {
    document.styleSheets[0]!.insertRule('.node-input { caret-shape: auto !important; }')
  })
  const empty = node(window, 1)

  await expect(empty).toBeFocused()
  await expect(empty).not.toHaveCSS('background-image', 'none')
  await expect(empty).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)')
  await expect(window.locator('[data-node-id="empty"]')).toHaveScreenshot('empty-normal-light.png')

  await window.keyboard.press('i')

  await expect(empty).toHaveCSS('background-image', 'none')

  await window.keyboard.press('Escape')

  await expect(empty).not.toHaveCSS('background-image', 'none')

  await window.keyboard.press('i')
  await window.keyboard.type('x')
  await window.keyboard.press('Escape')

  await expect(empty).toHaveCSS('background-image', 'none')

  await window.keyboard.press('x')

  await expect(empty).not.toHaveCSS('background-image', 'none')

  await node(window, 2).click()

  await expect(empty).toHaveCSS('background-image', 'none')

  await empty.click()
  await window.emulateMedia({ colorScheme: 'dark' })

  await expect(empty).toHaveCSS('background-image', 'linear-gradient(rgb(220, 220, 204), rgb(220, 220, 204))')
  await expect(window.locator('[data-node-id="empty"]')).toHaveScreenshot('empty-normal-dark.png')

  await window.keyboard.press('Meta+.')
  const heading = window.getByRole('textbox', { name: 'Current parent', exact: true })

  await heading.click()

  await expect(heading).not.toHaveCSS('background-image', 'none')

  const block = await heading.evaluate((element) => getComputedStyle(element).backgroundSize.split(' ').map(parseFloat))

  expect(block[0]).toBeCloseTo(14.4, 1)
  expect(block[1]).toBe(30)
  await expect(heading).toHaveScreenshot('empty-parent-normal-dark.png')

  const rich = node(window, 1)

  await rich.click()
  await window.keyboard.press('i')
  await window.keyboard.press('Meta+a')
  await window.keyboard.press('Backspace')
  await window.keyboard.press('Escape')

  await expect(rich).toHaveAttribute('contenteditable', 'true')
  await expect(rich).not.toHaveCSS('background-image', 'none')
  await expect(heading).toHaveCSS('background-image', 'none')
  await expect(rich).toHaveScreenshot('empty-rich-normal-dark.png')
})
