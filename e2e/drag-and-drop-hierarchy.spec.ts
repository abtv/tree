// @editing-modes: both
import {
  allowRendererError,
  closeApp,
  describeForEachEditingMode,
  exactMessage,
  expect,
  launchTree,
  node,
  nodeTexts,
  seedDocument,
  startRowDrag,
  test,
} from './fixtures'

function hierarchySeed(): { document: unknown; location: unknown } {
  return {
    document: {
      roots: [
        {
          id: 'a',
          text: 'Alpha',
          children: [
            { id: 'a1', text: 'Alpha child one', children: [] },
            { id: 'a2', text: 'Alpha child two', children: [] },
          ],
        },
        { id: 'b', text: 'Bravo', children: [] },
        { id: 'c', text: 'Charlie', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'b' },
  }
}

async function openAlpha(window: Parameters<typeof node>[0]): Promise<void> {
  if ((await window.getByRole('button', { name: 'Collapse node 1' }).count()) === 0)
    await window.getByRole('button', { name: 'Expand node 1' }).click()
}

async function dragToGap(
  window: Parameters<typeof node>[0],
  sourceId: string,
  targetId: string,
  edge: 'top' | 'bottom',
  horizontalSteps: number,
): Promise<void> {
  const source = window.locator(`.node-row[data-node-id="${sourceId}"] .node-input`)
  const sourceBox = await source.boundingBox()
  const targetBox = await window.locator(`.node-row[data-node-id="${targetId}"]`).boundingBox()
  if (sourceBox === null || targetBox === null) throw new Error('A drag row was not rendered.')
  const pressX = sourceBox.x + 8
  await startRowDrag(window, source, { xOffset: 8 })
  const clientY = edge === 'top' ? targetBox.y + 2 : targetBox.y + targetBox.height - 2
  await window.mouse.move(pressX + horizontalSteps * 20, clientY, { steps: 5 })
}

// @requirement PRODUCT.md §2.4
// @requirement PRODUCT.md §11
describeForEachEditingMode('hierarchy drag and drop', ({ mode }) => {
  test('nests at the selected gap level, supports undo and redo, and survives restart', async ({ userDataDir }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)

    await node(window, 4).focus()
    if (mode === 'vim') await window.keyboard.press('V')
    await dragToGap(window, 'b', 'b', 'top', 1)
    const movedRow = window.locator('.node-row[data-node-id="b"]')
    await expect(movedRow).toHaveClass(/node-row-drop-before/)
    await expect(window.locator('.node-list')).toHaveScreenshot(`hierarchy-level-marker-${mode}-light.png`)

    const geometry = await movedRow.evaluate((row) => {
      const listBox = row.closest('.node-list')!.getBoundingClientRect()
      const rowBox = row.getBoundingClientRect()
      const left = Number.parseFloat(getComputedStyle(row, '::before').left)
      return { listLeft: listBox.left, rowLeft: rowBox.left, markerLeft: left }
    })
    expect(geometry.rowLeft + geometry.markerLeft).toBeCloseTo(geometry.listLeft + 48, 0)
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot(`hierarchy-level-marker-${mode}-dark.png`)
    await window.emulateMedia({ colorScheme: 'light' })
    await window.mouse.up()

    await expect(movedRow).toHaveAttribute('data-depth', '1')
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('Meta+z')
    await expect(movedRow).toHaveAttribute('data-depth', '0')
    await window.keyboard.press('Meta+Shift+z')
    await expect(movedRow).toHaveAttribute('data-depth', '1')

    await closeApp(app)
    const reopened = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(reopened.window)
    await expect(reopened.window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
  })

  test('outdents a visible child to the root at the selected gap level', async ({ userDataDir }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)

    await dragToGap(window, 'a1', 'c', 'bottom', -1)
    await window.mouse.up()

    await expect
      .poll(() => nodeTexts(window))
      .toEqual(['Alpha', 'Alpha child two', 'Bravo', 'Charlie', 'Alpha child one'])
    await expect(window.locator('.node-row[data-node-id="a1"]')).toHaveAttribute('data-depth', '0')
  })

  test('moves a distant root node into the expanded branch after its hidden sibling block', async ({ userDataDir }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)

    await dragToGap(window, 'c', 'b', 'top', 1)
    await window.mouse.up()

    await expect
      .poll(() => nodeTexts(window))
      .toEqual(['Alpha', 'Alpha child one', 'Alpha child two', 'Charlie', 'Bravo'])
    await expect(window.locator('.node-row[data-node-id="c"]')).toHaveAttribute('data-depth', '1')
  })

  test('shows a prohibiting cursor over a gap inside the dragged subtree and changes nothing', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)
    const before = await nodeTexts(window)

    await dragToGap(window, 'a', 'a1', 'top', 0)
    await expect(window.locator('body')).toHaveClass(/node-drag-invalid/)
    await window.mouse.up()

    expect(await nodeTexts(window)).toEqual(before)
    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
  })

  test('Escape cancels a gap move without changing hierarchy', async ({ userDataDir }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)

    await dragToGap(window, 'b', 'b', 'top', 1)
    await expect(window.locator('.node-row[data-node-id="b"]')).toHaveClass(/node-row-drop-before/)
    await window.keyboard.press('Escape')
    await window.mouse.up()

    await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '0')
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('preserves whole-node Visual mode for a same-parent reorder', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'Alpha', children: [] },
          { id: 'b', text: 'Bravo', children: [] },
          { id: 'c', text: 'Charlie', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    if (mode === 'vim') {
      await node(window, 2).focus()
      await window.keyboard.press('V')
      await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    }

    await dragToGap(window, 'b', 'a', 'top', 0)
    await window.mouse.up()

    await expect.poll(() => nodeTexts(window)).toEqual(['Bravo', 'Alpha', 'Charlie'])
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
  })
})

// @requirement PRODUCT.md §2.3
// @requirement PRODUCT.md §11
test.describe('hierarchy drag depth limit', () => {
  test('reports an over-depth gap drop and preserves the document', async ({ userDataDir }) => {
    const branch = (depth: number): { id: string; text: string; children: unknown[] } => ({
      id: `level-${depth}`,
      text: `Level ${depth}`,
      children: depth === 20 ? [] : [branch(depth + 1)],
    })
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'source', text: 'Source', children: [] }, branch(1)] },
      location: { currentParentId: null, selectedNodeId: 'source' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    for (let depth = 1; depth < 20; depth += 1) {
      await window.locator(`.node-row[data-node-id="level-${depth}"] .node-disclosure-triangle`).click()
    }
    allowRendererError(exactMessage('Operation failed: Nodes cannot be nested deeper than 20 levels.'))

    const last = window.locator('.node-row[data-node-id="level-20"]')
    const source = window.locator('.node-row[data-node-id="source"] .node-input')
    const sourceBox = await source.boundingBox()
    const lastBox = await last.boundingBox()
    if (sourceBox === null || lastBox === null) throw new Error('The depth-limit drag rows were not rendered.')
    await startRowDrag(window, source, { xOffset: 8 })
    await window.mouse.move(sourceBox.x + 8 + 20 * 20, lastBox.y + lastBox.height - 2, { steps: 5 })
    await window.mouse.up()

    await expect(window.getByRole('alert')).toHaveText(
      'Operation failed: Nodes cannot be nested deeper than 20 levels.',
    )
    await expect(source).toHaveValue('Source')
    await expect(window.locator('.node-row[data-node-id="source"]')).toHaveAttribute('data-depth', '0')
  })
})
