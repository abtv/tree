// @editing-modes: both
import { describeForEachEditingMode, expect, launchTree, node, parent, seedDocument, test } from './fixtures'

describeForEachEditingMode('deleting nodes', () => {
  // @requirement PRODUCT.md §8.1
  test('deleting a middle sibling selects the next sibling', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: ['A', 'B', 'C'].map((text) => ({ id: text, text, children: [] })) },
      location: { currentParentId: null, selectedNodeId: 'B' },
    })
    const { window } = await launchTree(userDataDir)

    await expect(node(window, 2)).toHaveValue('B')
    await expect(node(window, 2)).toBeFocused()

    await window.keyboard.press('Meta+Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    await expect(node(window, 2)).toHaveValue('C')
    await expect(node(window, 2)).toBeFocused()
  })

  test('deleting the only root creates a new empty root', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'only', text: 'Only', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'only' },
    })
    const { window } = await launchTree(userDataDir)

    await expect(node(window, 1)).toHaveValue('Only')
    await expect(node(window, 1)).toBeFocused()
    await window.keyboard.press('Meta+Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 1)).toBeFocused()
  })

  test('does not delete the current parent when its heading is focused', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'projects', text: 'Projects', children: [{ id: 'work', text: 'Work', children: [] }] }],
      },
      location: { currentParentId: 'projects', selectedNodeId: 'work' },
    })
    const { window } = await launchTree(userDataDir)

    await parent(window).focus()
    await expect(parent(window)).toBeFocused()

    await window.keyboard.press('Meta+Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('Work')
    await expect(parent(window)).toHaveValue('Projects')
  })
})
