import { expect, launchTree, node, parent, test, typeInto } from './fixtures'

test.describe('navigation', () => {
  test('arrow keys move selection between siblings', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'B')

    await window.keyboard.press('ArrowUp')
    await expect(node(window, 1)).toBeFocused()

    await window.keyboard.press('ArrowDown')
    await expect(node(window, 2)).toBeFocused()
  })

  test('entering a childless node keeps the cursor in the current parent and Enter creates a first child', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')

    await expect(parent(window)).toHaveValue('Projects')
    await expect(parent(window)).toBeFocused()
    await expect(window.locator('input[aria-label^="Node "]')).toHaveCount(0)

    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')
    await expect(node(window, 1)).toHaveValue('Work')
  })

  test('leaving a node restores the parent level and selects the node that was entered', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')

    await window.keyboard.press('Meta+,')
    await expect(node(window, 1)).toHaveValue('Projects')
    await expect(node(window, 1)).toBeFocused()
  })

  test('the location path navigates to ancestors and the root', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Projects')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Task')

    await expect(window.locator('[aria-label="Current location"]')).toContainText('Projects')
    await expect(window.locator('[aria-label="Current location"]')).toContainText('Work')

    await window.getByRole('button', { name: 'Projects' }).click()
    await expect(parent(window)).toHaveValue('Projects')
    await expect(node(window, 1)).toHaveValue('Work')
    await expect(node(window, 1)).toBeFocused()

    await window.getByRole('button', { name: 'Top level' }).click()
    await expect(window.locator('input[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('Projects')
    await expect(node(window, 1)).toBeFocused()
  })
})
