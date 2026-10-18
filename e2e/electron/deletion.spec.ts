// @editing-modes: both
import { describeForEachEditingMode, expect, launchTree, node, parent, test, typeInto } from './fixtures'

describeForEachEditingMode('deleting nodes', () => {
  // @requirement PRODUCT.md §8.1
  test('deleting a middle sibling selects the next sibling', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'B')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'C')

    await window.keyboard.press('ArrowUp')
    await expect(node(window, 2)).toHaveValue('B')
    await window.keyboard.press('Meta+Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    await expect(node(window, 2)).toHaveValue('C')
    await expect(node(window, 2)).toBeFocused()
  })

  test('deleting the only root creates a new empty root', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Only')
    await window.keyboard.press('Meta+Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 1)).toBeFocused()
  })

  test('does not delete the current parent when its heading is focused', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')

    await parent(window).focus()
    await window.keyboard.press('Meta+Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('Work')
    await expect(parent(window)).toHaveValue('Projects')
  })
})
