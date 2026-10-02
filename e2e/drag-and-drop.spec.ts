// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  node,
  nodeTexts,
  seedDocument,
  startRowDrag,
  test,
  typeInto,
  type Launched,
} from './fixtures'

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

async function rowBox(
  window: Launched['window'],
  index: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await window.locator('.node-row').nth(index).boundingBox()
  if (box === null) throw new Error(`Node row ${index + 1} was not rendered.`)
  return box
}

const selectionColors = (field: ReturnType<typeof node>) =>
  field.evaluate((element) => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element, '::selection')
    return { background: style?.backgroundColor, color: style?.color }
  })

describeForEachEditingMode('drag and drop', ({ mode }) => {
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

  // @requirement PRODUCT.md §11
  test('reorders a focused sibling after holding the pointer and moving across a target', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    const source = window.locator('.node-row').nth(3)
    await startRowDrag(window, source.locator('.node-input'))

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

  test('keeps the caret and mode when a drag is cancelled', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    const source = window.locator('.node-row').nth(2).locator('.node-input')
    const box = await source.boundingBox()
    if (box === null) throw new Error('The third row was not rendered.')
    await window.mouse.click(box.x + box.width - 6, box.y + box.height / 2)
    await expect(source).toBeFocused()
    await expect(source).toHaveJSProperty('selectionStart', 1)

    await startRowDrag(window, source)
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    const frozen = await source.evaluate((element) => {
      const input = element as HTMLTextAreaElement
      return [input.selectionStart, input.selectionEnd]
    })
    expect(await source.evaluate((element) => document.activeElement === element)).toBe(false)

    await window.keyboard.press('Escape')
    expect(await source.evaluate((element) => document.activeElement === element)).toBe(false)

    await window.mouse.up()

    await expect(source).toBeFocused()
    expect(
      await source.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return [input.selectionStart, input.selectionEnd]
      }),
    ).toEqual(frozen)
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    else await expect(window.getByLabel('Vim mode')).toHaveCount(0)
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })

  test('keeps the mode and restores the caret when a drag starts on an unfocused row', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
          { id: 'd', text: 'D', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'd' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    else await expect(window.getByLabel('Vim mode')).toHaveCount(0)

    const first = window.locator('.node-row').nth(0).locator('.node-input')
    await first.click()
    await expect(first).toBeFocused()

    const source = window.locator('.node-row').nth(2).locator('.node-input')
    expect(await source.evaluate((element) => document.activeElement === element)).toBe(false)
    await startRowDrag(window, source)
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)

    const frozen = await source.evaluate((element) => {
      const input = element as HTMLTextAreaElement
      return [input.selectionStart, input.selectionEnd]
    })
    expect(frozen[0]).toBe(frozen[1])
    expect(await source.evaluate((element) => document.activeElement === element)).toBe(false)

    await window.keyboard.press('Escape')
    await window.mouse.up()

    await expect(source).toBeFocused()
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    else await expect(window.getByLabel('Vim mode')).toHaveCount(0)
    expect(
      await source.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return [input.selectionStart, input.selectionEnd]
      }),
    ).toEqual(frozen)
    await expect(first).not.toBeFocused()
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })

  test('cancels an active drag with Escape without moving', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    const source = window.locator('.node-row').nth(3).locator('.node-input')
    await startRowDrag(window, source)
    const target = await rowBox(window, 1)
    await window.mouse.move(target.x + 8, target.y + 4, { steps: 5 })
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(1)

    await window.keyboard.press('Escape')

    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(0)
    await expect(window.locator('body')).not.toHaveClass(/node-drag-active/)
    expect(await source.evaluate((element) => document.activeElement === element)).toBe(false)

    await window.mouse.move(target.x + 180, target.y + 40, { steps: 10 })
    expect(
      await source.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return input.selectionEnd - input.selectionStart
      }),
    ).toBe(0)

    await window.mouse.up()

    expect(await source.evaluate((element) => document.activeElement === element)).toBe(true)
    expect(
      await source.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return input.selectionEnd - input.selectionStart
      }),
    ).toBe(0)
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })

  test('keeps a pressed drag as a text selection instead of starting a node drag', async ({ userDataDir }) => {
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

    await window.waitForTimeout(HOLD_MS)
    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    await expect(window.locator('body')).not.toHaveClass(/node-drag-active/)
    expect(
      await source.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return input.selectionEnd - input.selectionStart
      }),
    ).toBeGreaterThan(0)

    await window.mouse.up()

    await expect.poll(() => nodeTexts(window)).toEqual(['Forest', 'Second', 'Third'])
    expect(
      await source.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return input.selectionEnd - input.selectionStart
      }),
    ).toBeGreaterThan(0)
  })

  test('keeps the selection collapsed while dragging a node across the text', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await typeInto(node(window, 1), 'Alpha text one')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Bravo text two')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'Charlie text three')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 4), 'Delta text four')

    await window.evaluate(() => {
      const control = globalThis as typeof globalThis & { __selectionDuringDrag?: unknown[] }
      control.__selectionDuringDrag = []
      const sample = (): void => {
        if (document.body.classList.contains('node-drag-active')) {
          for (const element of document.querySelectorAll('.node-input')) {
            if (element instanceof HTMLTextAreaElement && element.selectionStart !== element.selectionEnd) {
              control.__selectionDuringDrag!.push([element.selectionStart, element.selectionEnd])
            }
          }
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })

    const rows = window.locator('.node-row')
    const source = rows.nth(3).locator('.node-input')
    const box = await source.boundingBox()
    if (box === null) throw new Error('The fourth row was not rendered.')
    const x = box.x + 60
    const y = box.y + box.height / 2

    async function selectionState(): Promise<[number, number]> {
      return source.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return [input.selectionStart, input.selectionEnd]
      })
    }

    await startRowDrag(window, source, { xOffset: 60 })
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)

    const frozen = await selectionState()
    expect(frozen[0]).toBe(frozen[1])
    expect(await source.evaluate((element) => document.activeElement === element)).toBe(false)

    await window.mouse.move(x + 120, y, { steps: 20 })
    expect(await selectionState()).toEqual(frozen)
    await window.mouse.move(x - 60, y - 20, { steps: 20 })
    expect(await selectionState()).toEqual(frozen)

    const target = await rowBox(window, 0)
    await window.mouse.move(target.x + 10, target.y + 4, { steps: 5 })
    await window.mouse.up()

    await expect
      .poll(() => nodeTexts(window))
      .toEqual(['Delta text four', 'Alpha text one', 'Bravo text two', 'Charlie text three'])
    const moved = window.locator('.node-row').nth(0).locator('.node-input')
    const after = await moved.evaluate((element) => {
      const input = element as HTMLTextAreaElement
      return [input.selectionStart, input.selectionEnd]
    })
    expect(after[0]).toBe(after[1])
    expect(await moved.evaluate((element) => document.activeElement === element)).toBe(true)
    expect(
      await window.evaluate(
        () => (globalThis as typeof globalThis & { __selectionDuringDrag?: unknown[] }).__selectionDuringDrag,
      ),
    ).toEqual([])
  })
})

test.describe('drag and drop (mode-independent)', () => {
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

  test('keeps dragging when the pointer moves within the hold tolerance', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await typeInto(node(window, 1), 'Forest')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Second')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'Third')

    const rows = window.locator('.node-row')
    const source = rows.nth(2).locator('.node-input')
    await startRowDrag(window, source, {
      xOffset: 10,
      duringHold: async (box) => {
        await window.mouse.move(box.x + 13, box.y + box.height / 2)
      },
    })
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)

    const target = await rowBox(window, 0)
    await window.mouse.move(target.x + 10, target.y + 4, { steps: 5 })
    await window.mouse.up()

    await expect.poll(() => nodeTexts(window)).toEqual(['Third', 'Forest', 'Second'])
  })

  test('releases in place without reordering', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    await startRowDrag(window, window.locator('.node-row').nth(1).locator('.node-input'))
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    await window.mouse.up()

    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })

  test('keeps a pending hold through a browser hover reset', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await seedSiblings(window)

    // Chromium resets the hovered element when the window loses focus and reports the reset with
    // no buttons pressed. The reset must not cancel the pending hold, so the drag still activates
    // and releases in place.
    const source = window.locator('.node-row').nth(1)
    const target = source.locator('.node-input')
    const box = await target.boundingBox()
    if (box === null) throw new Error('The drag source was not rendered.')
    await window.mouse.move(box.x + 8, box.y + box.height / 2)
    await window.mouse.down()
    await source.evaluate((element) => {
      element.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }))
    })

    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    await window.mouse.up()

    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])
  })
})

test.describe('drag and drop (Vim editing only)', () => {
  test('keeps Normal mode after clicking or moving a node with the mouse', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
          { id: 'd', text: 'D', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'd' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal', vimPreference: true })
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')

    const source = window.locator('.node-row').nth(3)
    const sourceBox = await source.locator('.node-input').boundingBox()
    if (sourceBox === null) throw new Error('The fourth row was not rendered.')
    await window.mouse.click(sourceBox.x + 8, sourceBox.y + sourceBox.height / 2)
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')

    await startRowDrag(window, source.locator('.node-input'))
    const target = await rowBox(window, 1)
    await window.mouse.move(target.x + 8, target.y + 4, { steps: 5 })
    await window.mouse.up()

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })
})

test.describe('text selection highlight in standard editing', () => {
  test.use({ editingMode: 'standard' })

  // @requirement PRODUCT.md §20.2
  test('renders a multi-character text selection with the shared highlight pair in both appearances', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'first', text: 'With images', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    const box = await editor.boundingBox()
    if (box === null) throw new Error('The node was not rendered.')
    const y = box.y + box.height / 2
    await window.mouse.move(box.x + 6, y)
    await window.mouse.down()
    await window.mouse.move(box.x + 70, y, { steps: 8 })
    await window.mouse.up()

    expect(
      await editor.evaluate(
        (element) => (element as HTMLTextAreaElement).selectionEnd - (element as HTMLTextAreaElement).selectionStart,
      ),
    ).toBeGreaterThan(1)
    expect(await selectionColors(editor)).toEqual({ background: 'rgb(255, 240, 179)', color: 'rgb(55, 63, 67)' })
    await expect(editor).toHaveScreenshot('standard-text-selection-light.png')

    await window.emulateMedia({ colorScheme: 'dark' })
    expect(await selectionColors(editor)).toEqual({ background: 'rgb(74, 64, 35)', color: 'rgb(245, 233, 183)' })
    await expect(editor).toHaveScreenshot('standard-text-selection-dark.png')
    await window.emulateMedia({ colorScheme: 'light' })
  })
})
