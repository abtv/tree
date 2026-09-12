import { expect, launchTree, node, parent, setCursor, test, typeInto } from './fixtures'

test.describe('creating nodes with Enter', () => {
  test('Enter at the end creates an empty sibling after the node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toHaveValue('Current')
    await expect(node(window, 2)).toHaveValue('')
    await expect(node(window, 2)).toBeFocused()
  })

  test('Enter at the beginning creates an empty sibling before the node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 2)).toHaveValue('Current')
    await expect(node(window, 1)).toBeFocused()
  })

  test('Enter at the beginning preserves the selected node subtree', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Child')
    await window.keyboard.press('Meta+,')
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 2)).toHaveValue('Current')
    await window.getByRole('button', { name: 'Enter node 2' }).click()
    await expect(parent(window)).toHaveValue('Current')
    await expect(node(window, 1)).toHaveValue('Child')
  })

  test('Enter in the middle splits the text at the cursor', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await setCursor(node(window, 1), 3)
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toHaveValue('Cur')
    await expect(node(window, 2)).toHaveValue('rent')
    await expect(node(window, 2)).toBeFocused()
  })
})
