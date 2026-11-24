// @editing-modes: independent
import { expect, launchTree, node, nodeTexts, seedDocument, setCursor, test } from './fixtures'

// @requirement PRODUCT.md §20
test('keeps editor focus and the Visual selection when blank areas are pressed', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: 'alpha', children: [] },
        { id: 'two', text: 'beta', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  const size = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  const row = (await editor.boundingBox())!
  const last = (await node(window, 2).boundingBox())!
  const status = (await window.locator('.status-bar').boundingBox())!
  const topLevel = (await window.getByRole('button', { name: 'Top level' }).boundingBox())!
  // The left list margin, the space below the rows, and the status and location bars around their controls.
  const blankAreas = [
    { x: 4, y: row.y + row.height / 2 },
    { x: size.width / 2, y: last.y + last.height + 60 },
    { x: size.width / 2, y: status.y + status.height / 2 },
    { x: topLevel.x + topLevel.width + 200, y: topLevel.y + topLevel.height / 2 },
  ]
  const blank = await window.evaluate(
    (points) =>
      points.every(({ x, y }) => {
        const target = document.elementFromPoint(x, y)
        return target !== null && target.closest('.node-row, button, input, textarea, [role="status"]') === null
      }),
    blankAreas,
  )
  expect(blank).toBe(true)
  await setCursor(editor, 1)
  await window.keyboard.press('v')
  await window.keyboard.press('l')

  for (const area of blankAreas) await window.mouse.click(area.x, area.y)

  await expect(editor).toBeFocused()
  expect(
    await editor.evaluate((element) => {
      const input = element as HTMLTextAreaElement
      return input.value.slice(input.selectionStart, input.selectionEnd)
    }),
  ).toBe('lp')
  await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')

  await window.keyboard.press('l')
  await window.keyboard.press('d')

  await expect(editor).toHaveValue('aa')
  await expect(node(window, 2)).toHaveValue('beta')
})

for (const kind of ['plain', 'rich'] as const) {
  // @requirement PRODUCT.md §20
  test(`keeps the ${kind} editor's selection and caret through secondary blank presses`, async ({ userDataDir }) => {
    const text = kind === 'rich' ? 'alpha #tag' : 'alpha'
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'one', text, children: [] },
          { id: 'two', text: 'beta', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const editor = node(window, 1)
    if (kind === 'rich') await expect(editor).toHaveAttribute('contenteditable', 'true')
    const size = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    const row = (await editor.boundingBox())!
    const last = (await node(window, 2).boundingBox())!
    const leftMargin = { x: 4, y: row.y + row.height / 2 }
    const belowRows = { x: size.width / 2, y: last.y + last.height + 60 }
    const value = (): Promise<string> =>
      editor.evaluate((element) =>
        element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
      )
    await setCursor(editor, 1)
    await window.keyboard.press('v')
    await window.keyboard.press('l')

    await window.mouse.click(leftMargin.x, leftMargin.y, { button: 'right' })
    await window.mouse.click(belowRows.x, belowRows.y, { button: 'right' })

    await expect(editor).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')

    await window.keyboard.press('d')

    await expect.poll(value).toBe(text.replace('lp', ''))

    await setCursor(editor, 2)
    await window.keyboard.press('i')
    await window.mouse.click(leftMargin.x, leftMargin.y, { button: 'right' })
    await window.keyboard.type('Z')

    await expect.poll(value).toBe(`${text.replace('lp', '').slice(0, 2)}Z${text.replace('lp', '').slice(2)}`)
  })
}

// @requirement PRODUCT.md §11
// @requirement PRODUCT.md §20
test('keeps the focused editor usable after cancelling a drag from another row blank edge', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: ['alpha', 'beta', 'gamma', 'delta'].map((text) => ({ id: text, text, children: [] })),
    },
    location: { currentParentId: null, selectedNodeId: 'alpha' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)
  const row = (await window.locator('.node-row').nth(2).boundingBox())!
  // The strip below the third row's single text line belongs to the row, not its editor.
  const edge = { x: row.x + 60, y: row.y + row.height - 2 }
  const owner = await window.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y)
    return target?.closest('.node-input, button') === null
      ? target.closest('.node-row')?.getAttribute('data-node-id')
      : null
  }, edge)
  expect(owner).toBe('gamma')
  await setCursor(editor, 1)

  await window.mouse.move(edge.x, edge.y)
  await window.mouse.down()

  await expect(window.locator('.node-row-dragging')).toHaveCount(1)

  await window.keyboard.press('Escape')
  await window.mouse.up()

  await expect(window.locator('.node-row-dragging')).toHaveCount(0)
  await expect(editor).toBeFocused()

  await window.keyboard.press('x')

  await expect.poll(() => nodeTexts(window)).toEqual(['apha', 'beta', 'gamma', 'delta'])
})

// @requirement PRODUCT.md §20
test('keeps native scrollbar dragging while an editor has focus', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 120 }, (_, index) => ({ id: `n${index}`, text: `node ${index}`, children: [] })),
    },
    location: { currentParentId: null, selectedNodeId: 'n0' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
  const viewport = window.locator('.scroll-viewport')
  const box = (await viewport.boundingBox())!
  await setCursor(editor, 0)
  // Overlay scrollbars reserve no width, so a press on them is a blank press whose default is prevented;
  // dragging must still scroll. They appear only while scrolling.
  await window.mouse.move(box.x + box.width / 2, box.y + 100)
  await window.mouse.wheel(0, 200)
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(200)
  const x = box.x + box.width - 5

  await window.mouse.move(x, box.y + 40)
  await window.mouse.down()
  await window.mouse.move(x, box.y + 190, { steps: 10 })
  await window.mouse.up()

  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(400)
  await expect(editor).toBeFocused()
})
