import { expect, launchTree, node, parent, test, typeInto } from './fixtures'

test.describe('Backspace on empty nodes', () => {
  test('deletes an empty node and focuses the previous sibling at the end', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)

    await window.keyboard.press('Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('A')
    await expect(node(window, 1)).toBeFocused()
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(1)
  })

  test('focuses the current parent when the empty first child is deleted', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await expect(node(window, 1)).toHaveValue('')

    await window.keyboard.press('Backspace')

    await expect(parent(window)).toHaveValue('Projects')
    await expect(parent(window)).toBeFocused()
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(0)
  })

  // @requirement PRODUCT.md §8.2
  // @requirement PRODUCT.md §19
  test('keeps the only root when Backspace is pressed', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await window.keyboard.press('Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 1)).toBeFocused()
  })

  test('selects the next root when the empty first root is deleted', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Second')
    await window.keyboard.press('ArrowUp')
    await expect(node(window, 1)).toHaveValue('')

    await window.keyboard.press('Backspace')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('Second')
    await expect(node(window, 1)).toBeFocused()
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
  })

  test('undoes a Backspace deletion', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await window.keyboard.press('Backspace')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)

    await window.keyboard.press('Meta+z')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
  })
})
