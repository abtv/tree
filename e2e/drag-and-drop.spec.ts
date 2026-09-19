import { expect, launchTree, node, nodeTexts, test, typeInto, type Launched } from './fixtures'

const HOLD_MS = 500

async function seedSiblings(window: Launched['window']): Promise<void> {
  await typeInto(node(window, 1), 'A')
  await window.keyboard.press('Enter')
  await typeInto(node(window, 2), 'B')
  await window.keyboard.press('Enter')
  await typeInto(node(window, 3), 'C')
  await window.keyboard.press('Enter')
  await typeInto(node(window, 4), 'D')
}

async function pressAndHold(
  window: Launched['window'],
  target: ReturnType<Launched['window']['locator']>,
): Promise<void> {
  const box = await target.boundingBox()
  if (box === null) throw new Error('The drag source was not rendered.')
  await window.mouse.move(box.x + 8, box.y + box.height / 2)
  await window.mouse.down()
  await window.waitForTimeout(HOLD_MS)
}

async function rowBox(
  window: Launched['window'],
  index: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await window.locator('.node-row').nth(index).boundingBox()
  if (box === null) throw new Error(`Node row ${index + 1} was not rendered.`)
  return box
}

test.describe('drag and drop', () => {
  test('places the caret on a quick click without reordering', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    const input = window.locator('.node-row').nth(2).locator('.node-input')
    const box = await input.boundingBox()
    if (box === null) throw new Error('The third row was not rendered.')

    await window.mouse.click(box.x + box.width - 6, box.y + box.height / 2)

    await expect(input).toBeFocused()
    await expect(input).toHaveJSProperty('selectionStart', 1)
    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })

  test('reorders a focused sibling after holding the pointer and moving across a target', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    const source = window.locator('.node-row').nth(3)
    await pressAndHold(window, source.locator('.node-input'))

    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    await expect(window.locator('body')).toHaveClass(/node-drag-active/)
    await expect(source).toHaveCSS('cursor', 'grabbing')

    const target = await rowBox(window, 1)
    await window.mouse.move(target.x + 8, target.y + 4, { steps: 5 })
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(1)

    await window.mouse.up()

    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'D', 'B', 'C'])
    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    await expect(window.locator('body')).not.toHaveClass(/node-drag-active/)
    const moved = window.locator('.node-row').nth(1).locator('.node-input')
    await expect(moved).toBeFocused()
    await expect(moved).toHaveValue('D')
  })

  test('does not start a drag when the pointer moves before the hold threshold', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    const source = window.locator('.node-row').nth(3)
    const box = await source.locator('.node-input').boundingBox()
    if (box === null) throw new Error('The fourth row was not rendered.')
    await window.mouse.move(box.x + 8, box.y + box.height / 2)
    await window.mouse.down()
    const target = await rowBox(window, 1)
    await window.mouse.move(target.x + 8, target.y + 4, { steps: 2 })
    await window.waitForTimeout(HOLD_MS)

    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(0)
    await window.mouse.up()

    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })

  test('cancels an active drag with Escape without moving', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    await pressAndHold(window, window.locator('.node-row').nth(3).locator('.node-input'))
    const target = await rowBox(window, 1)
    await window.mouse.move(target.x + 8, target.y + 4, { steps: 5 })
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(1)

    await window.keyboard.press('Escape')

    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(0)
    await expect(window.locator('body')).not.toHaveClass(/node-drag-active/)
    await window.mouse.up()

    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })

  test('clears an incidental text selection when drag mode activates', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await typeInto(node(window, 1), 'Forest')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Second')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'Third')

    const rows = window.locator('.node-row')
    const source = rows.nth(2).locator('.node-input')
    const box = await source.boundingBox()
    if (box === null) throw new Error('The third row was not rendered.')
    await window.mouse.move(box.x + 10, box.y + box.height / 2)
    await window.mouse.down()
    await window.mouse.move(box.x + 55, box.y + box.height / 2, { steps: 4 })
    await expect
      .poll(() => source.evaluate((element) => (element as HTMLTextAreaElement).selectionEnd))
      .toBeGreaterThan(0)

    await window.waitForTimeout(HOLD_MS)
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    expect(
      await source.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return input.selectionStart === input.selectionEnd
      }),
    ).toBe(true)

    const target = await rowBox(window, 0)
    await window.mouse.move(target.x + 10, target.y + 4, { steps: 5 })
    await window.mouse.up()

    await expect.poll(() => nodeTexts(window)).toEqual(['Third', 'Forest', 'Second'])
    const moved = window.locator('.node-row').nth(0).locator('.node-input')
    expect(
      await moved.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return [input.selectionStart, input.selectionEnd]
      }),
    ).toEqual([0, 0])
  })

  test('releases in place without reordering', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    await pressAndHold(window, window.locator('.node-row').nth(1).locator('.node-input'))
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    await window.mouse.up()

    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })
})
