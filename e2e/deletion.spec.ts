import { expect, launchTree, node, parent, test, typeInto } from './fixtures'

test.describe('deleting nodes', () => {
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

    await expect(window.locator('input[aria-label^="Node "]')).toHaveCount(2)
    await expect(node(window, 2)).toHaveValue('C')
    await expect(node(window, 2)).toBeFocused()
  })

  test('deleting the only root creates a new empty root', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Only')
    await window.keyboard.press('Meta+Backspace')

    await expect(window.locator('input[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 1)).toBeFocused()
  })

  test('deleting the current parent returns to the parent level', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')

    await parent(window).focus()
    await window.keyboard.press('Meta+Backspace')

    await expect(window.locator('input[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveCount(0)
  })
})
