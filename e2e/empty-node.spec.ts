// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  node,
  nodeTexts,
  parent,
  seedDocument,
  setCursor,
  test,
  typeInto,
} from './fixtures'

describeForEachEditingMode('Backspace on empty nodes', ({ mode }) => {
  // @requirement PRODUCT.md §8.3
  test('removes the preceding blank at a nonempty row’s start without moving its caret', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'blank', text: '', children: [] },
          { id: 'current', text: 'Bugfixes', children: [{ id: 'child', text: 'Child', children: [] }] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'current' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'insert' })
    await window.getByRole('button', { name: 'Expand node 2' }).click()
    await node(window, 2).focus()
    await setCursor(node(window, 2), 0)
    await window.keyboard.press('Backspace')
    await expect.poll(() => nodeTexts(window)).toEqual(['Bugfixes', 'Child'])
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 0)
    await expect(node(window, 1)).toHaveJSProperty('selectionEnd', 0)
    await window.screenshot({ path: test.info().outputPath(`remove-preceding-blank-${mode}.png`) })
    await window.keyboard.press('Meta+z')
    await expect.poll(() => nodeTexts(window)).toEqual(['', 'Bugfixes', 'Child'])
    await window.keyboard.press('Meta+Shift+z')
    await expect.poll(() => nodeTexts(window)).toEqual(['Bugfixes', 'Child'])
    await expect(node(window, 1)).toBeFocused()
    await window.keyboard.type('X')
    await expect(node(window, 1)).toHaveValue('XBugfixes')
  })

  test('keeps nonempty preceding text and removes no row for a text selection', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'previous', text: 'Previous', children: [] },
          { id: 'blank', text: '', children: [] },
          { id: 'current', text: 'Current', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'current' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'insert' })
    await node(window, 1).focus()
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('Backspace')
    await expect.poll(() => nodeTexts(window)).toEqual(['Previous', '', 'Current'])
    await node(window, 3).focus()
    await setCursor(node(window, 3), 0)
    await window.keyboard.press('Shift+ArrowRight')
    await window.keyboard.press('Backspace')
    await expect.poll(() => nodeTexts(window)).toEqual(['Previous', '', 'urrent'])
    await setCursor(node(window, 3), 0)
    await window.keyboard.press('Backspace')
    await expect.poll(() => nodeTexts(window)).toEqual(['Previous', 'urrent'])
    await window.keyboard.press('Backspace')
    await expect.poll(() => nodeTexts(window)).toEqual(['Previous', 'urrent'])
    await expect(node(window, 2)).toBeFocused()
  })

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
