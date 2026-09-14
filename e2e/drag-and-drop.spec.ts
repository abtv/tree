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
    await node(window, 3).press('End')

    const rows = window.locator('.node-row')
    await rows
      .nth(2)
      .locator('.node-input')
      .dragTo(rows.nth(1), { targetPosition: { x: 5, y: 1 } })

    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'C', 'B', 'D'])
    await expect(window.locator('.node-row').nth(2).locator('.node-input')).toHaveJSProperty('selectionStart', 1)
  })

  test('provides larger targets for moving a node before the first or after the last sibling', async ({
    userDataDir,
  }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'B')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'C')

    const startDropZone = window.getByLabel('Drop position 1')
    const endDropZone = window.getByLabel('Drop position 4')
    const firstRow = window.locator('.node-row').nth(0)
    const startBox = await startDropZone.boundingBox()
    const rowBox = await firstRow.boundingBox()
    const endBox = await endDropZone.boundingBox()
    expect(startBox?.height).toBeGreaterThan(rowBox?.height ?? 0)
    expect(endBox?.height).toBeGreaterThan(startBox?.height ?? 0)

    let rows = window.locator('.node-row')
    await rows.nth(1).locator('.node-input').dragTo(startDropZone)
    await expect.poll(() => nodeTexts(window)).toEqual(['B', 'A', 'C'])

    rows = window.locator('.node-row')
    await rows.nth(1).locator('.node-input').dragTo(endDropZone)
    await expect.poll(() => nodeTexts(window)).toEqual(['B', 'C', 'A'])
  })
})
