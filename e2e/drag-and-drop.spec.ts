import { expect, launchTree, node, nodeTexts, test, typeInto } from './fixtures'

test.describe('drag and drop', () => {
  test('reorders siblings on the displayed level', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'B')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'C')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 4), 'D')

    const rows = window.locator('.node-row')
    await rows
      .nth(2)
      .locator('.node-input')
      .dragTo(rows.nth(1), { targetPosition: { x: 5, y: 1 } })

    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'C', 'B', 'D'])
  })
})
