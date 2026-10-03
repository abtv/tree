// @editing-modes: vim
import type { Page } from '@playwright/test'
import {
  allowRendererError,
  exactMessage,
  expect,
  launchTree as launchTreeBase,
  lockSystemClipboard,
  node,
  nodeTexts,
  pressShifted,
  seedDocument,
  setCursor,
  setMainWindowBounds,
  test,
  typeInto,
  writeClipboardText,
} from './fixtures'

const launchTree = (userDataDir: string) => launchTreeBase(userDataDir, { initialMode: 'normal' })

/** The visible rows' text, indented by two spaces per level below the shallowest visible row. */
const outline = (window: Page): Promise<string[]> =>
  window.locator('.node-row').evaluateAll((rows) => {
    const depths = rows.map((row) => Number((row as HTMLElement).dataset.depth))
    const base = Math.min(...depths)
    return rows.map((row, index) => {
      const input = row.querySelector('[aria-label^="Node "]')
      const text = input instanceof HTMLTextAreaElement ? input.value : (input?.textContent ?? '')
      return `${'  '.repeat(depths[index]! - base)}${text}`
    })
  })

const selectionColors = (field: ReturnType<typeof node>) =>
  field.evaluate((element) => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element, '::selection')
    return { background: style?.backgroundColor, color: style?.color }
  })

async function dragSelect(window: Page, field: ReturnType<typeof node>, fromX: number, toX: number): Promise<void> {
  const box = await field.boundingBox()
  if (box === null) throw new Error('The node was not rendered.')
  const y = box.y + box.height / 2
  await window.mouse.move(box.x + fromX, y)
  await window.mouse.down()
  await window.mouse.move(box.x + toX, y, { steps: 8 })
  await window.mouse.up()
}

test.describe('Vim editing: navigation and Visual modes', () => {
  test('replays counted dd with complete subtrees and one undo per successful iteration', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: ['A', 'B', 'C', 'D', 'E'].map((text) => ({
          id: text,
          text,
          children: [{ id: `${text}1`, text: `${text} child`, children: [] }],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'A' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    for (const key of ['2', 'd', 'd']) await window.keyboard.press(key)
    await expect.poll(() => nodeTexts(window)).toEqual(['C', 'D', 'E'])
    await window.keyboard.press('3')
    await window.keyboard.press('.')
    await expect.poll(() => nodeTexts(window)).toEqual(['E'])
    await expect(node(window, 1)).toBeFocused()
    await window.keyboard.press('u')
    await expect.poll(() => nodeTexts(window)).toEqual(['C', 'D', 'E'])
    await window.keyboard.press('p')
    await expect.poll(() => nodeTexts(window)).toEqual(['C', 'C', 'D', 'D', 'E'])
    await window.keyboard.press('z')
    await pressShifted(window, 'R')
    await expect
      .poll(() => outline(window))
      .toEqual(['C', '  C child', 'C', '  C child', 'D', '  D child', 'D', '  D child', 'E', '  E child'])
  })

  test('replays shifts and joins with exact sibling spans and stops counted dot on failure', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: ['A', 'B', 'C', 'D'].map((text) => ({ id: text, text, children: [] })) },
      location: { currentParentId: null, selectedNodeId: 'C' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 3).focus()
    await pressShifted(window, 'V')
    await window.keyboard.press('k')
    await pressShifted(window, '>')
    await expect.poll(() => outline(window)).toEqual(['A', '  B', '  C', 'D'])
    await window.keyboard.press('Escape')
    await window.keyboard.press('u')
    await node(window, 2).focus()
    await window.getByRole('button', { name: 'Disable Vim editing' }).click()
    await window.getByRole('button', { name: 'Enable Vim editing' }).click()
    await node(window, 2).focus()
    await window.keyboard.press('3')
    await window.keyboard.press('.')
    await expect.poll(() => outline(window)).toEqual(['A', '  B', '  C', 'D'])
    await expect(node(window, 2)).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-repeat-shift-light.png')
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(['A', 'B', 'C', 'D'])
    // The original join clamps to three siblings. Dot requires all three, rather than a partial join.
    await node(window, 2).focus()
    await window.keyboard.press('9')
    await pressShifted(window, 'J')
    await window.keyboard.press('u')
    await node(window, 1).focus()
    await window.keyboard.press('3')
    await window.keyboard.press('.')
    await expect.poll(() => outline(window)).toEqual(['A B C', 'D'])
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 1)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-repeat-join-light.png')
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(['A', 'B', 'C', 'D'])
    await window.keyboard.press('Control+r')
    await expect.poll(() => outline(window)).toEqual(['A B C', 'D'])
  })

  test('replays counted gp and gP with captured incoming subtrees and their destination', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: ['A', 'B', 'C'].map((text) => ({ id: text, text, children: [] })) },
      location: { currentParentId: null, selectedNodeId: 'A' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await node(window, 2).focus()
    await window.keyboard.press('2')
    await window.keyboard.press('g')
    await window.keyboard.press('p')
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'B', 'A', 'A', 'C'])
    await expect(node(window, 5)).toBeFocused()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('.')
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'B', 'A', 'A', 'C', 'A', 'A'])
    await expect(node(window, 7)).toBeFocused()
    await window.keyboard.press('u')
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'B', 'A', 'A', 'C'])
    // gP retains the original target as its destination, even across several dot iterations.
    await node(window, 5).focus()
    await window.keyboard.press('2')
    await window.keyboard.press('g')
    await pressShifted(window, 'P')
    await expect(node(window, 7)).toBeFocused()
    await window.keyboard.press('2')
    await window.keyboard.press('.')
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'B', 'A', 'A', 'C', 'C', 'C', 'C', 'C', 'C', 'C'])
    await expect(node(window, 11)).toBeFocused()
    await window.keyboard.press('u')
    await expect(window.locator('.node-row')).toHaveCount(9)
  })

  test('replays Visual puts and case after register exchanges, then repeats vertical changes', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: ['red', 'blue', 'grey', 'one two', 'THREE four', 'last', 'end'].map((text, index) => ({
          id: `n${index}`,
          text,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('0')
    await pressShifted(window, 'Y')
    await node(window, 2).focus()
    await window.keyboard.press('0')
    await window.keyboard.press('v')
    await pressShifted(window, '$')
    await window.keyboard.press('2')
    await window.keyboard.press('p')
    await expect(node(window, 2)).toHaveValue('redred')
    await node(window, 3).focus()
    await window.keyboard.press('0')
    await pressShifted(window, 'Y')
    await window.keyboard.press('.')
    await expect(node(window, 3)).toHaveValue('redred')
    await expect(node(window, 3)).toHaveJSProperty('selectionStart', 5)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-repeat-visual-put-light.png')
    await node(window, 4).focus()
    await window.keyboard.press('0')
    await window.keyboard.press('g')
    await pressShifted(window, 'U')
    await window.keyboard.press('w')
    await node(window, 5).focus()
    await window.keyboard.press('0')
    await window.keyboard.press('g')
    await pressShifted(window, 'U')
    await window.keyboard.press('w')
    await pressShifted(window, 'Y')
    await window.keyboard.press('w')
    await window.keyboard.press('.')
    await expect(node(window, 5)).toHaveValue('THREE FOUR')
    await node(window, 4).focus()
    await window.keyboard.press('c')
    await window.keyboard.press('j')
    await typeInto(node(window, 4), 'changed')
    await window.keyboard.press('Escape')
    await node(window, 5).focus()
    await window.keyboard.press('.')
    await expect.poll(() => nodeTexts(window)).toEqual(['red', 'redred', 'redred', 'changed', 'changed'])
    await window.keyboard.press('u')
    await expect.poll(() => nodeTexts(window)).toEqual(['red', 'redred', 'redred', 'changed', 'last', 'end'])
  })

  test('uses o to create and focus a child node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'ancestor', text: 'Ancestor', children: [{ id: 'parent', text: 'Parent', children: [] }] }],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    })
    const { window } = await launchTree(userDataDir)
    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await parent.focus()
    await window.keyboard.press('o')
    await typeInto(node(window, 1), 'Child')
    await window.keyboard.press('Escape')

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Parent')
    await expect(node(window, 1)).toHaveValue('Child')
  })

  test('uses o to create a sibling below a selected child node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'parent', text: 'Parent', children: [{ id: 'first', text: 'First', children: [] }] }],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('o')
    await typeInto(node(window, 2), 'Second')
    await window.keyboard.press('Escape')

    await expect(node(window, 1)).toHaveValue('First')
    await expect(node(window, 2)).toHaveValue('Second')
  })

  test('applies a counted Normal-mode node motion before the next command', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First', children: [] },
          { id: 'second', text: 'Second', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await window.keyboard.press('2')
    await window.keyboard.press('j')
    await expect(node(window, 2)).toBeFocused()
    await window.keyboard.press('l')

    await expect(node(window, 2)).toHaveJSProperty('selectionStart', 1)
  })

  test('applies counts to node motions and subtree puts', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 12 }, (_, index) => ({
          id: `node-${index + 1}`,
          text: `Node ${index + 1}`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'node-1' },
    })
    const { window } = await launchTree(userDataDir)
    const countedNode = (index: number) => window.getByRole('textbox', { name: `Node ${index}`, exact: true })
    await countedNode(1).focus()

    await window.keyboard.press('3')
    await window.keyboard.press('j')
    await expect(countedNode(4)).toBeFocused()
    await window.keyboard.press('5')
    await window.keyboard.press('k')
    await expect(countedNode(1)).toBeFocused()
    await window.keyboard.press('1')
    await window.keyboard.press('0')
    await window.keyboard.press('G')
    await expect(countedNode(10)).toBeFocused()

    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await window.keyboard.press('2')
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('3')
    await window.keyboard.press('p')
    await expect(window.locator('.node-row')).toHaveCount(18)
  })

  test('deletes a counted forward sibling range with dd', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First', children: [] },
          { id: 'second', text: 'Second', children: [] },
          { id: 'third', text: 'Third', children: [] },
          { id: 'fourth', text: 'Fourth', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('3')
    await window.keyboard.press('d')
    await window.keyboard.press('d')

    await expect(window.locator('.node-row')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('Fourth')

    // One counted deletion is one undoable command (PRODUCT §20.2.1 T1).
    await window.keyboard.press('u')
    await expect(window.locator('.node-row')).toHaveCount(4)
    await expect(node(window, 3)).toHaveValue('Third')
  })

  test('does nothing when O is pressed on the current-parent heading', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'parent', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    })
    const { window } = await launchTree(userDataDir)
    const heading = window.getByRole('textbox', { name: 'Current parent' })
    await heading.focus()
    await window.keyboard.press('O')

    await expect(heading).toHaveValue('Parent')
    await expect(window.locator('.node-row')).toHaveCount(1)
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('focuses the current parent with gg from a nested level', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'first', text: 'First child', children: [] },
              { id: 'second', text: 'Second child', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'second' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 2).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('g')

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Parent')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toBeFocused()
  })

  // @requirement PRODUCT.md §20.2
  for (const nested of [false, true]) {
    test(`scrolls to the first row with gg after wheel scrolling away (${nested ? 'nested' : 'top level'})`, async ({
      userDataDir,
    }) => {
      const children = Array.from({ length: 90 }, (_, index) => ({
        id: `c${index}`,
        text: `Child ${index}`,
        children: [],
      }))
      seedDocument(userDataDir, {
        document: { roots: nested ? [{ id: 'p', text: 'Parent', children }] : children },
        location: { currentParentId: nested ? 'p' : null, selectedNodeId: 'c60' },
      })
      const { window } = await launchTree(userDataDir)
      await expect(window.getByRole('textbox', { name: 'Node 61', exact: true })).toBeFocused()
      await window.mouse.move(400, 300)
      await window.mouse.wheel(0, 3000)
      // Wait for the wheel's smooth scrolling to settle, so it cannot move the content after gg.
      let previous = -1
      await expect
        .poll(async () => {
          const top = await window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0)
          const settled = top === previous && top > 1000
          previous = top
          return settled
        })
        .toBe(true)

      await window.keyboard.press('g')
      await window.keyboard.press('g')

      const target = nested
        ? window.getByRole('textbox', { name: 'Current parent' })
        : window.getByRole('textbox', { name: 'Node 1', exact: true })
      await expect(target).toBeFocused()
      await expect(target).toBeInViewport({ ratio: 1 })
    })
  }

  test('selects an inner text object in character Visual mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one (two)', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 6)
    await window.keyboard.press('v')
    await window.keyboard.press('i')
    await pressShifted(window, '(')
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 8)
    await window.keyboard.press('y')
    await window.keyboard.press('P')
    await expect(editor).toHaveValue('one (twotwo)')
  })

  test('repeats dd and subtree puts with fresh IDs', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [{ id: 'child', text: 'child', children: [] }] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('G')
    await window.keyboard.press('p')
    const firstCopyId = await window.locator('.node-row').last().getAttribute('data-node-id')
    await window.keyboard.press('.')
    await expect(node(window, 5)).toHaveValue('A')
    const secondCopyId = await window.locator('.node-row').last().getAttribute('data-node-id')
    expect(secondCopyId).not.toBe(firstCopyId)
    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await window.keyboard.press('.')
    await expect(node(window, 1)).toHaveValue('C')
  })

  test('selects complete sibling subtrees with V and repeats their deletion', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [{ id: 'a-child', text: 'child', children: [] }] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
          { id: 'd', text: 'D', children: [] },
          { id: 'e', text: 'E', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.keyboard.press('j')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('C')
    await window.keyboard.press('.')
    await expect(node(window, 1)).toHaveValue('E')
    await window.keyboard.press('u')
    await expect(node(window, 1)).toHaveValue('C')
    await expect(node(window, 2)).toHaveValue('D')
  })

  test('uses the whole-node yellow highlight for character-wise Visual mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'Visual selection', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await window.keyboard.press('V')
    const wholeNodeBackground = await window
      .locator('.node-row-visual-selected')
      .evaluate((element) => element.ownerDocument.defaultView?.getComputedStyle(element).backgroundColor)
    const wholeNodeColors = await window.locator('.node-row-visual-selected').evaluate((element) => {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      return { background: style?.backgroundColor, color: style?.color }
    })
    const visualNodeLabelColors = await window.getByLabel('Vim mode').evaluate((element) => {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      return { background: style?.backgroundColor, color: style?.color }
    })
    expect(visualNodeLabelColors).toEqual(wholeNodeColors)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    const characterSelectionBackground = await editor.evaluate(
      (element) => element.ownerDocument.defaultView?.getComputedStyle(element, '::selection').backgroundColor,
    )
    const visualLabel = window.getByLabel('Vim mode')
    const visualLabelColors = await visualLabel.evaluate((element) => {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      return { background: style?.backgroundColor, color: style?.color }
    })
    expect(characterSelectionBackground).toBe(wholeNodeBackground)
    expect(visualLabelColors).toEqual(wholeNodeColors)
    await expect(editor).toHaveScreenshot('vim-visual-selection-yellow-light.png')
    await expect(visualLabel).toHaveScreenshot('vim-visual-label-yellow-light.png')

    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(editor).toHaveScreenshot('vim-visual-selection-yellow-dark.png')
    await expect(visualLabel).toHaveScreenshot('vim-visual-label-yellow-dark.png')
  })

  test('yanks reverse V ranges, puts node forests, and replaces a V range with fresh IDs', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [{ id: 'a-child', text: 'child', children: [] }] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 2).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('k')
    await window.keyboard.press('y')
    await window.keyboard.press('G')
    await window.keyboard.press('P')
    await expect(node(window, 3)).toHaveValue('A')
    await expect(node(window, 4)).toHaveValue('B')
    const firstCopyId = await window.locator('.node-row').nth(2).getAttribute('data-node-id')
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await window.keyboard.press('p')
    await expect(node(window, 3)).toHaveValue('A')
    await expect(node(window, 4)).toHaveValue('B')
    expect(await window.locator('.node-row').nth(2).getAttribute('data-node-id')).not.toBe(firstCopyId)
    await window.keyboard.press('.')
    await expect(node(window, 3)).toHaveValue('A')
    await expect(node(window, 4)).toHaveValue('B')
  })

  test('changes whole selected subtrees and keeps the current-parent heading out of V', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'a', text: 'one', children: [{ id: 'grandchild', text: 'mixed', children: [] }] },
              { id: 'b', text: 'two', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await parent.focus()
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await window.keyboard.press('U')
    await expect(node(window, 1)).toHaveValue('ONE')
    await expect(node(window, 2)).toHaveValue('TWO')
    await node(window, 1).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('MIXED')
  })

  test('repeats open-sibling text and rejects a subtree put into its descendant', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    allowRendererError(exactMessage('Operation failed: Cannot paste a node into one of its descendants.'))
    await window.keyboard.press('p')
    await expect(window.getByText('Operation failed: Cannot paste a node into one of its descendants.')).toBeVisible()
    await expect(node(window, 1)).toHaveValue('Child')
    await window.keyboard.press('Control+o')
    await window.keyboard.press('o')
    await typeInto(node(window, 2), 'New')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(node(window, 2)).toHaveValue('New')
    await expect(node(window, 3)).toHaveValue('New')
  })
  test('captures structural text typed in its own node when a pointer click lands elsewhere', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [] },
          { id: 'b', text: 'bee', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('o')
    await typeInto(node(window, 2), 'Opened')
    await node(window, 3).click()
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(node(window, 2)).toHaveValue('Opened')
    await expect(node(window, 3)).toHaveValue('bee')
    await expect(node(window, 4)).toHaveValue('Opened')
  })
  test('starts in Normal mode', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveCSS('caret-color', 'rgb(55, 63, 67)')
    await expect(editor).toHaveCSS('caret-animation', 'manual')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 0)
  })

  test('shows the Normal-mode block caret on individual hyperlink characters', async ({ userDataDir }) => {
    const text = 'https://example.test'
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text,
            links: [{ start: 0, end: text.length, url: text }],
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const link = editor.getByRole('link')

    await expect(link).not.toHaveClass(/link-selected/)
    expect(
      await editor.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        return selection?.toString()
      }),
    ).toBe('h')
    expect(await selectionColors(link)).toEqual({ background: 'rgb(55, 63, 67)', color: 'rgb(255, 255, 255)' })
    expect(await selectionColors(editor)).toEqual({ background: 'rgb(55, 63, 67)', color: 'rgb(255, 255, 255)' })
    await expect(editor).toHaveScreenshot('vim-normal-link-character-light.png')

    await editor.press('$')

    expect(await editor.evaluate((field) => field.ownerDocument.defaultView?.getSelection()?.toString())).toBe('t')
    await expect(link).not.toHaveClass(/link-selected/)
  })

  test('uses the highlight pair for a deliberate Normal-mode text selection', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'With images', children: [] },
          { id: 'second', text: 'Next node', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    const second = node(window, 2)

    // The one-character block caret is not a deliberate selection and keeps the ink block.
    await expect(first).toBeFocused()
    await expect(first).not.toHaveClass(/node-input-text-selected/)
    expect(await selectionColors(first)).toEqual({ background: 'rgb(55, 63, 67)', color: 'rgb(255, 255, 255)' })

    // A pointer drag wider than the block caret is a deliberate text selection and uses the
    // highlight pair, in both appearances.
    await dragSelect(window, first, 6, 70)
    expect(
      await first.evaluate(
        (element) => (element as HTMLTextAreaElement).selectionEnd - (element as HTMLTextAreaElement).selectionStart,
      ),
    ).toBeGreaterThan(1)
    await expect(first).toHaveClass(/node-input-text-selected/)
    expect(await selectionColors(first)).toEqual({ background: 'rgb(241, 228, 189)', color: 'rgb(59, 56, 51)' })
    await expect(first).toHaveScreenshot('vim-normal-text-selection-light.png')

    await window.emulateMedia({ colorScheme: 'dark' })
    expect(await selectionColors(first)).toEqual({ background: 'rgb(43, 43, 43)', color: 'rgb(240, 223, 175)' })
    await expect(first).toHaveScreenshot('vim-normal-text-selection-dark.png')
    await window.emulateMedia({ colorScheme: 'light' })

    // Moving focus keeps the unfocused selection on the highlight while the newly focused row
    // shows its ink block caret.
    await second.focus()
    await expect(second).not.toHaveClass(/node-input-text-selected/)
    expect(await selectionColors(second)).toEqual({ background: 'rgb(55, 63, 67)', color: 'rgb(255, 255, 255)' })
    expect(await selectionColors(first)).toEqual({ background: 'rgb(241, 228, 189)', color: 'rgb(59, 56, 51)' })

    // Collapsing back to the block caret removes the deliberate-selection highlight.
    await first.click({ position: { x: 20, y: 10 } })
    await expect(first).not.toHaveClass(/node-input-text-selected/)
    expect(await selectionColors(first)).toEqual({ background: 'rgb(55, 63, 67)', color: 'rgb(255, 255, 255)' })

    // Select-all is also a deliberate selection, not the one-character block caret.
    await window.keyboard.press('Meta+a')
    await expect(first).toHaveClass(/node-input-text-selected/)
    expect(await selectionColors(first)).toEqual({ background: 'rgb(241, 228, 189)', color: 'rgb(59, 56, 51)' })
  })

  test('crosses a hyperlink one character at a time', async ({ userDataDir }) => {
    const url = 'https://example.test/a/very/long/path/that/does/not/fit/on/one/line'
    const text = `before ${url} after`
    const start = text.indexOf(url)
    const end = start + url.length
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start, end, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const caret = () =>
      editor.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        if (!selection || selection.rangeCount === 0) return -1
        const range = selection.getRangeAt(0)
        const before = field.ownerDocument.createRange()
        before.selectNodeContents(field)
        before.setEnd(range.startContainer, range.startOffset)
        return before.toString().length
      })

    await editor.focus()
    await editor.press('0')
    await editor.press(String(start))
    await editor.press('l')
    expect(await caret()).toBe(start)
    await editor.press('l')
    expect(await caret()).toBe(start + 1)

    await editor.press('h')
    expect(await caret()).toBe(start)
    await editor.press('$')
    expect(await caret()).toBe(text.length - 1)
    await setCursor(editor, end - 1)
    await editor.press('l')
    expect(await caret()).toBe(end)
  })

  test('keeps the Normal caret on the selected linked node while h and l traverse it', async ({ userDataDir }) => {
    const url = 'https://example.test/usage'
    const text = `test ${url}\n${url} after`
    const firstStart = text.indexOf(url)
    const secondStart = text.indexOf(url, firstStart + url.length)
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'empty', text: '', children: [] },
          {
            id: 'linked',
            text,
            links: [
              { start: firstStart, end: firstStart + url.length, url },
              { start: secondStart, end: secondStart + url.length, url },
            ],
            children: [],
          },
          { id: 'next', text: 'next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'empty' },
    })
    const { window } = await launchTree(userDataDir)
    const empty = node(window, 1)
    const linked = node(window, 2)
    const links = linked.getByRole('link')
    const caret = () =>
      linked.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        if (!selection || selection.rangeCount === 0) return -1
        const range = selection.getRangeAt(0)
        const before = field.ownerDocument.createRange()
        before.selectNodeContents(field)
        before.setEnd(range.startContainer, range.startOffset)
        return before.toString().length
      })
    await expect(empty).toBeFocused()
    await empty.press('j')
    await expect(linked).toBeFocused()
    await expect(window.locator('.node-row').nth(1).locator('.node-focus-marker')).toHaveCount(1)
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(0)

    await linked.press('l')
    expect(await caret()).toBe(1)
    await setCursor(linked, firstStart)
    await linked.press('h')
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(firstStart - 1)
    await linked.press('l')
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(firstStart)
    await linked.press('l')
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(firstStart + 1)
    await linked.press('h')
    await expect(links.first()).not.toHaveClass(/link-selected/)
    expect(await caret()).toBe(firstStart)
    await expect(empty).not.toBeFocused()
    await linked.press('k')
    await expect(empty).toBeFocused()
    await expect(links.first()).not.toHaveClass(/link-selected/)
    await empty.press('j')
    await expect(linked).toBeFocused()
    await expect(links.first()).not.toHaveClass(/link-selected/)
  })

  test('keeps the Normal-mode linked character visible in dark appearance', async ({ userDataDir }) => {
    const text = 'https://example.test'
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start: 0, end: text.length, url: text }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTreeBase(userDataDir, { initialMode: 'normal' })
    await window.emulateMedia({ colorScheme: 'dark' })
    const editor = node(window, 1)
    const link = editor.getByRole('link')

    await expect(link).not.toHaveClass(/link-selected/)
    await expect
      .poll(() =>
        link.evaluate(
          (element) => element.ownerDocument.defaultView?.getComputedStyle(element, '::selection').backgroundColor,
        ),
      )
      .toBe('rgb(220, 220, 204)')
    expect(await selectionColors(link)).toEqual({ background: 'rgb(220, 220, 204)', color: 'rgb(63, 63, 63)' })
    expect(await selectionColors(editor)).toEqual({ background: 'rgb(220, 220, 204)', color: 'rgb(63, 63, 63)' })
    await expect(editor).toHaveScreenshot('vim-normal-link-character-dark.png')
  })

  test('matches the Visual-mode selection color across a selected hyperlink', async ({ userDataDir }) => {
    const url = 'https://example.test'
    const text = `go to ${url} now`
    const start = text.indexOf(url)
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start, end: start + url.length, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const link = editor.getByRole('link')

    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('$')

    await expect(link).toHaveClass(/link-selected/)
    const linkBackground = await link.evaluate(
      (element) => element.ownerDocument.defaultView?.getComputedStyle(element).backgroundColor,
    )
    const textSelectionBackground = await editor.evaluate(
      (element) => element.ownerDocument.defaultView?.getComputedStyle(element, '::selection').backgroundColor,
    )
    expect(linkBackground).toBe(textSelectionBackground)
  })

  test('keeps a character Visual selection inside a hyperlink on the highlight pair', async ({ userDataDir }) => {
    const url = 'https://example.test'
    const text = `go to ${url} now`
    const start = text.indexOf(url)
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start, end: start + url.length, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const link = editor.getByRole('link')

    await editor.focus()
    await setCursor(editor, start)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('l')

    expect(await editor.evaluate((field) => field.ownerDocument.defaultView?.getSelection()?.toString())).toBe('http')
    expect(await editor.evaluate((field) => field.ownerDocument.defaultView?.getSelection()?.isCollapsed)).toBe(false)
    await expect(link).not.toHaveClass(/link-selected/)
    expect(await selectionColors(editor)).toEqual({ background: 'rgb(241, 228, 189)', color: 'rgb(59, 56, 51)' })
    expect(await selectionColors(link)).toEqual({ background: 'rgb(241, 228, 189)', color: 'rgb(59, 56, 51)' })
    await expect(editor).toHaveScreenshot('vim-visual-link-selection-light.png')

    await window.emulateMedia({ colorScheme: 'dark' })
    expect(await selectionColors(editor)).toEqual({ background: 'rgb(43, 43, 43)', color: 'rgb(240, 223, 175)' })
    expect(await selectionColors(link)).toEqual({ background: 'rgb(43, 43, 43)', color: 'rgb(240, 223, 175)' })
    await expect(editor).toHaveScreenshot('vim-visual-link-selection-dark.png')
  })

  test('keeps a spanning character Visual selection on the highlight pair', async ({ userDataDir }) => {
    const url = 'https://example.test'
    const text = `go to ${url} now`
    const start = text.indexOf(url)
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start, end: start + url.length, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const link = editor.getByRole('link')

    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('l')

    expect(await editor.evaluate((field) => field.ownerDocument.defaultView?.getSelection()?.toString())).toBe(
      'go to htt',
    )
    expect(await editor.evaluate((field) => field.ownerDocument.defaultView?.getSelection()?.isCollapsed)).toBe(false)
    await expect(link).not.toHaveClass(/link-selected/)
    expect(await selectionColors(editor)).toEqual({ background: 'rgb(241, 228, 189)', color: 'rgb(59, 56, 51)' })
    expect(await selectionColors(link)).toEqual({ background: 'rgb(241, 228, 189)', color: 'rgb(59, 56, 51)' })
    await expect(editor).toHaveScreenshot('vim-visual-spanning-selection-light.png')

    await window.emulateMedia({ colorScheme: 'dark' })
    expect(await selectionColors(editor)).toEqual({ background: 'rgb(43, 43, 43)', color: 'rgb(240, 223, 175)' })
    expect(await selectionColors(link)).toEqual({ background: 'rgb(43, 43, 43)', color: 'rgb(240, 223, 175)' })
    await expect(editor).toHaveScreenshot('vim-visual-spanning-selection-dark.png')
  })

  test('keeps the Normal-mode linked selection on the focused node', async ({ userDataDir }) => {
    const firstText = 'Start https://first.example end'
    const secondText = 'Open https://second.example now'
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'first',
            text: firstText,
            links: [{ start: 6, end: 27, url: 'https://first.example' }],
            children: [],
          },
          {
            id: 'second',
            text: secondText,
            links: [{ start: 5, end: 27, url: 'https://second.example' }],
            children: [],
          },
          { id: 'third', text: 'A neighboring plain node', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    const second = node(window, 2)
    const hasLinkedSelection = (field: HTMLElement): boolean => {
      const selection = field.ownerDocument.defaultView?.getSelection()
      return (
        selection?.anchorNode !== null && selection?.anchorNode !== undefined && field.contains(selection.anchorNode)
      )
    }

    await first.press('6')
    await first.press('l')
    expect(await first.evaluate(hasLinkedSelection)).toBe(true)
    expect(await second.evaluate(hasLinkedSelection)).toBe(false)

    await second.focus()
    await second.press('0')
    await second.press('5')
    await second.press('l')
    expect(await first.evaluate(hasLinkedSelection)).toBe(false)
    expect(await second.evaluate(hasLinkedSelection)).toBe(true)

    await first.focus()
    await first.press('0')
    await first.press('6')
    await first.press('l')
    expect(await first.evaluate(hasLinkedSelection)).toBe(true)
    expect(await second.evaluate(hasLinkedSelection)).toBe(false)
  })

  test('keeps the Normal-mode linked character on one line through wrapping and resize', async ({ userDataDir }) => {
    const firstUrl = `https://example.test/${'wrapped-segment-'.repeat(10)}`
    const secondUrl = `https://sample.test/${'neighbor-segment-'.repeat(10)}`
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: firstUrl, links: [{ start: 0, end: firstUrl.length, url: firstUrl }], children: [] },
          {
            id: 'second',
            text: secondUrl,
            links: [{ start: 0, end: secondUrl.length, url: secondUrl }],
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { app, window } = await launchTree(userDataDir)
    const first = node(window, 1)
    const second = node(window, 2)
    const firstLink = first.getByRole('link')
    const selectedCharacter = () =>
      first.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        if (!selection || selection.rangeCount === 0) return undefined
        const rects = selection.getRangeAt(0).getClientRects()
        const rect = rects[0]
        return { text: selection.toString(), width: rect?.width ?? 0, height: rect?.height ?? 0 }
      })

    expect(await firstLink.evaluate((link) => link.getClientRects().length)).toBeGreaterThan(1)
    expect(await selectedCharacter()).toMatchObject({ text: 'h' })
    expect((await selectedCharacter())?.width).toBeGreaterThan(0)
    await first.press('$')
    expect(await selectedCharacter()).toMatchObject({ text: '-' })
    expect((await selectedCharacter())?.width).toBeGreaterThan(0)

    await second.focus()
    await expect(second).toBeFocused()
    await first.focus()
    await window.emulateMedia({ colorScheme: 'dark' })
    await first.press('$')
    await setMainWindowBounds(app, { width: 680 })
    await expect.poll(async () => (await selectedCharacter())?.width ?? 0).toBeGreaterThan(0)
    expect((await selectedCharacter())?.height).toBeLessThanOrEqual(21)
  })

  test('leaves the current node with Ctrl+o', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Root')
    await expect(node(window, 1)).toHaveValue('Child')
    await node(window, 1).focus()

    await window.keyboard.press('Control+o')

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveCount(0)
    await expect(node(window, 1)).toHaveValue('Root')
    await expect(node(window, 1)).toBeFocused()
  })

  test('supports line and viewport motions', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await node(window, 1).press('i')
    await typeInto(node(window, 1), 'one')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'two')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'three')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 4), 'four')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 5), 'five')
    await window.keyboard.press('Escape')

    await window.keyboard.press('g')
    await window.keyboard.press('g')
    await expect(node(window, 1)).toBeFocused()

    await window.keyboard.press('G')
    await expect(node(window, 5)).toBeFocused()
    await window.keyboard.press('H')
    await expect(node(window, 1)).toBeFocused()
    await window.keyboard.press('M')
    await expect(node(window, 3)).toBeFocused()
    await window.keyboard.press('L')
    await expect(node(window, 5)).toBeFocused()
    await window.keyboard.press('Control+u')
    await expect(node(window, 3)).toBeFocused()
    await window.keyboard.press('Control+d')
    await expect(node(window, 5)).toBeFocused()
  })

  test('o and O open empty siblings below and above', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'middle')
    await window.keyboard.press('Escape')
    await window.keyboard.press('o')
    await window.keyboard.type('below')
    await expect(node(window, 1)).toHaveValue('middle')
    await expect(node(window, 2)).toHaveValue('below')

    await window.keyboard.press('Escape')
    await window.keyboard.press('O')
    await window.keyboard.type('above')
    await expect(node(window, 1)).toHaveValue('middle')
    await expect(node(window, 2)).toHaveValue('above')
    await expect(node(window, 3)).toHaveValue('below')
  })

  test('yanks a Visual selection and puts it from the local register', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('y')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('$')
    await window.keyboard.press('P')

    await expect(editor).toHaveValue('ababc')
  })

  test('Visual p exchanges the register with the replaced text and P keeps the incoming text', async ({
    userDataDir,
  }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'red blue')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('y')

    await window.keyboard.press('w')
    await window.keyboard.press('v')
    await window.keyboard.press('e')
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('red red')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    // The register now holds the replaced `blue`.
    await window.keyboard.press('$')
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('red redblue')

    // `P` replaces with the register but keeps it, so the same text can be put again.
    await window.keyboard.press('0')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await pressShifted(window, 'P')
    await expect(editor).toHaveValue('blue redblue')
    await window.keyboard.press('$')
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('blue redblueblue')

    // One edit per put: three undos return through the document states in reverse.
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('blue redblue')
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('red redblue')
  })

  test('applies a count to a Visual put and leaves the selection when the register is empty', async ({
    userDataDir,
  }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'x yz')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    // An empty register changes nothing and keeps the Visual selection.
    await window.keyboard.press('v')
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('x yz')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
    await window.keyboard.press('Escape')

    await window.keyboard.press('$')
    await window.keyboard.press('v')
    await window.keyboard.press('y')
    await window.keyboard.press('0')
    await window.keyboard.press('v')
    await window.keyboard.press('3')
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('zzz yz')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    // The caret is on the final inserted character, and the register holds the replaced `x`.
    await expect(editor).toHaveJSProperty('selectionStart', 2)
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('zzzx yz')
  })

  test('whole-node Visual p exchanges the node register, P keeps it, and both accept a count', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [] },
          { id: 'bravo', text: 'Bravo', children: [] },
          { id: 'charlie', text: 'Charlie', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('y')

    await node(window, 2).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('2')
    await window.keyboard.press('p')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect.poll(() => outline(window)).toEqual(['Alpha', 'Alpha', 'Alpha', 'Charlie'])
    // The register now holds `Bravo`: a Normal put inserts it after the first copy.
    await window.keyboard.press('p')
    await expect.poll(() => outline(window)).toEqual(['Alpha', 'Alpha', 'Bravo', 'Alpha', 'Charlie'])

    // `P` replaces but keeps the register, so the same `Bravo` replaces another node afterwards.
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await pressShifted(window, 'P')
    await expect.poll(() => outline(window)).toEqual(['Bravo', 'Alpha', 'Bravo', 'Alpha', 'Charlie'])
    await node(window, 5).focus()
    await window.keyboard.press('V')
    await pressShifted(window, 'P')
    await expect.poll(() => outline(window)).toEqual(['Bravo', 'Alpha', 'Bravo', 'Alpha', 'Bravo'])

    // Each command was one undo step.
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(['Bravo', 'Alpha', 'Bravo', 'Alpha', 'Charlie'])
  })

  test('yanks and puts a node subtree with yy, p, and P', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'child', text: 'Child', children: [{ id: 'grandchild', text: 'Grandchild', children: [] }] },
              { id: 'sibling', text: 'Sibling', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('p')
    await expect(node(window, 2)).toHaveValue('Child')

    await window.keyboard.press('P')
    await expect(node(window, 2)).toHaveValue('Child')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Child')
    await expect(node(window, 1)).toHaveValue('Grandchild')
  })

  test('does nothing when p or P puts a subtree on the current-parent heading', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'child', text: 'Child', children: [] },
              { id: 'sibling', text: 'Sibling', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()

    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.keyboard.press('g')
    await window.keyboard.press('g')
    const heading = window.getByRole('textbox', { name: 'Current parent' })
    await expect(heading).toBeFocused()

    await window.keyboard.press('p')
    await window.keyboard.press('P')
    await expect(heading).toBeFocused()
    await expect(heading).toHaveValue('Root')
    await expect(node(window, 1)).toHaveValue('Child')
    await expect(node(window, 2)).toHaveValue('Sibling')
    await expect(node(window, 3)).toHaveCount(0)

    // A sibling of the heading would be invisible here, so leave the location and look for it.
    await window.keyboard.press('Meta+,')
    await expect.poll(() => nodeTexts(window)).toEqual(['Root'])
  })

  test('keeps backward Visual selections inclusive and $ on the final character', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await setCursor(editor, 2)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('h')
    await window.keyboard.press('d')
    await expect(editor).toHaveValue('c')

    await window.keyboard.press('$')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('')
  })

  test('changes, replaces, swaps, and cases a Visual selection', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'AbCd')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('o')
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('abCd')
    // Vim leaves the caret at the start of the operated range for a Visual-mode case change.
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
    await expect(editor).toHaveScreenshot('vim-visual-case-caret-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(editor).toHaveScreenshot('vim-visual-case-caret-dark.png')
    await window.emulateMedia({ colorScheme: 'light' })

    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('y')
    await window.keyboard.press('$')
    await window.keyboard.press('v')
    await window.keyboard.press('h')
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('abab')

    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('c')
    await window.keyboard.type('Z')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('Zab')
  })

  test('keeps a hyperlink intact when a surround wraps it', async ({ userDataDir }) => {
    const url = 'https://example.test/page'
    const text = `see ${url} now`
    const start = text.indexOf(url)
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'linked', text, links: [{ start, end: start + url.length, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'linked' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await expect(editor.getByRole('link')).toHaveCount(1)

    await setCursor(editor, start + 2)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await pressShifted(window, 'W')
    await pressShifted(window, ')')

    await expect(editor).toHaveText(`see (${url}) now`)
    const link = editor.getByRole('link')
    await expect(link).toHaveCount(1)
    await expect(link).toHaveAttribute('href', url)
    await expect(link).toHaveText(url)
  })

  test('clears stale Visual state on a focus-changing shortcut and a whole-node Visual exit', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [] },
          { id: 'bravo', text: 'Bravo', children: [] },
          { id: 'charlie', text: 'Charlie', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { window } = await launchTree(userDataDir)
    const alpha = node(window, 1)
    await alpha.focus()
    await setCursor(alpha, 0)

    // A focus-changing shortcut during character Visual mode keeps the mode but drops the stale
    // endpoints, so the next motion anchors at the reached node's caret instead of the old focus.
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await expect(alpha).toHaveJSProperty('selectionStart', 0)
    await expect(alpha).toHaveJSProperty('selectionEnd', 2)

    await window.keyboard.press('Meta+.')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
    const heading = window.getByRole('textbox', { name: 'Current parent' })
    await expect(heading).toHaveValue('Alpha')
    await window.keyboard.press('l')
    await expect(heading).toHaveJSProperty('selectionStart', 0)
    await expect(heading).toHaveJSProperty('selectionEnd', 2)

    // A whole-node Visual g prefix must not survive Escape and turn the next Normal d into gd.
    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('Meta+,')
    await expect(heading).toHaveCount(0)
    const alphaAgain = node(window, 1)
    await expect(alphaAgain).toHaveValue('Alpha')
    await alphaAgain.focus()
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.keyboard.press('g')
    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')

    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await expect(window.locator('.node-row')).toHaveCount(2)
    await expect(node(window, 1)).toHaveValue('Bravo')
  })

  test('drops a pending Normal-mode command before Cmd+A and undo', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'alpha', text: 'one two three', children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { window } = await launchTree(userDataDir)
    const alpha = node(window, 1)
    await alpha.focus()
    await setCursor(alpha, 0)

    // Cmd+A replaces the selection but runs on the same input, so it must drop a pending operator
    // before the next motion can consume it.
    await window.keyboard.press('d')
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('w')
    await expect(alpha).toHaveValue('one two three')

    // The undo shortcut also runs on the same input without blurring.
    await window.keyboard.press('d')
    await window.keyboard.press('Meta+z')
    await window.keyboard.press('$')
    await expect(alpha).toHaveValue('one two three')
  })

  test('nests and un-nests a whole-node Visual range with > and <, keeping the range and undoing each step', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [] },
          { id: 'bravo', text: 'Bravo', children: [{ id: 'bravo1', text: 'Bravo1', children: [] }] },
          { id: 'charlie', text: 'Charlie', children: [] },
          { id: 'delta', text: 'Delta', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'bravo' },
    })
    const { window } = await launchTree(userDataDir)
    const flat = ['Alpha', 'Bravo', 'Charlie', 'Delta']
    const nested = ['Alpha', '  Bravo', '  Charlie', 'Delta']
    const bravo = node(window, 2)
    await bravo.focus()
    await setCursor(bravo, 0)
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)

    await pressShifted(window, '>')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    // Alpha opened to show the moved range; Bravo stays collapsed, so its child is still hidden.
    await expect.poll(() => outline(window)).toEqual(nested)

    // The range kept its direction: `<` moves the same two nodes back out after Alpha.
    await pressShifted(window, '<')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    await expect.poll(() => outline(window)).toEqual(flat)

    // Neither a first sibling nor a root can move: nothing changes and no error is shown.
    await window.keyboard.press('Escape')
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await pressShifted(window, '>')
    await pressShifted(window, '<')
    await expect(window.getByRole('alert')).toHaveCount(0)
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    expect(await outline(window)).toEqual(flat)
    await window.keyboard.press('Escape')

    // Each shift is one undo step, and undo is not blocked by the failed attempts above.
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(nested)
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(flat)
  })

  test('applies a count to whole-node Visual > and refuses an impossible count without a change', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [{ id: 'alpha1', text: 'Alpha1', children: [] }] },
          { id: 'bravo', text: 'Bravo', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'bravo' },
    })
    const { window } = await launchTree(userDataDir)
    const bravo = node(window, 2)
    await bravo.focus()
    await setCursor(bravo, 0)
    await window.keyboard.press('V')
    // Three levels are impossible (Alpha1 has no child to receive Bravo a third time).
    await window.keyboard.press('3')
    await pressShifted(window, '>')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.getByRole('alert')).toHaveCount(0)
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(1)
    expect(await outline(window)).toEqual(['Alpha', 'Bravo'])
    await window.keyboard.press('2')
    await pressShifted(window, '>')
    await expect.poll(() => outline(window)).toEqual(['Alpha', '  Alpha1', '    Bravo'])
    // Both levels are one undo step.
    await window.keyboard.press('Escape')
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(['Alpha', '  Alpha1', 'Bravo'])
  })

  test('joins siblings with J and gJ, keeps every child, and undoes each join as one step', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha  ', children: [{ id: 'alpha1', text: 'A1', children: [] }] },
          { id: 'bravo', text: '  Bravo', children: [{ id: 'bravo1', text: 'B1', children: [] }] },
          { id: 'charlie', text: 'Charlie', children: [] },
          { id: 'delta', text: 'Delta', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { window } = await launchTree(userDataDir)
    const before = ['Alpha  ', '  Bravo', 'Charlie', 'Delta']
    await node(window, 1).focus()
    await setCursor(node(window, 1), 0)

    // `J` trims the whitespace at the join, inserts one space, keeps the first ID, and puts the caret on it.
    await pressShifted(window, 'J')
    await expect.poll(() => outline(window)).toEqual(['Alpha Bravo', 'Charlie', 'Delta'])
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 5)
    await expect(window.getByRole('alert')).toHaveCount(0)
    // Both nodes' children now follow under the retained node, in sibling order.
    await window.keyboard.press('z')
    await window.keyboard.press('o')
    await expect.poll(() => outline(window)).toEqual(['Alpha Bravo', '  A1', '  B1', 'Charlie', 'Delta'])
    await window.keyboard.press('u')
    // The fold choice is not part of the document history, so Alpha stays open after the undo.
    await expect.poll(() => outline(window)).toEqual(['Alpha  ', '  A1', '  Bravo', 'Charlie', 'Delta'])
    await window.keyboard.press('z')
    await window.keyboard.press('c')
    await expect.poll(() => outline(window)).toEqual(before)

    // `gJ` concatenates the texts unchanged.
    await node(window, 1).focus()
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('g')
    await pressShifted(window, 'J')
    await expect.poll(() => outline(window)).toEqual(['Alpha    Bravo', 'Charlie', 'Delta'])
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 7)
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(before)

    // A count joins that many siblings as one undo step, clamped at the last sibling.
    await node(window, 1).focus()
    await window.keyboard.press('3')
    await pressShifted(window, 'J')
    await expect.poll(() => outline(window)).toEqual(['Alpha Bravo Charlie', 'Delta'])
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(before)
    await node(window, 3).focus()
    await window.keyboard.press('9')
    await pressShifted(window, 'J')
    await expect.poll(() => outline(window)).toEqual(['Alpha  ', '  Bravo', 'Charlie Delta'])

    // The last sibling has nothing to join: no change and no error.
    await node(window, 3).focus()
    await pressShifted(window, 'J')
    await expect(window.getByRole('alert')).toHaveCount(0)
    expect(await outline(window)).toEqual(['Alpha  ', '  Bravo', 'Charlie Delta'])
  })

  test('joins a whole-node Visual range with J and gJ and returns to Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: ['Alpha ', ' Bravo', 'Charlie', 'Delta'].map((text, index) => ({ id: `n${index}`, text, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n2' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 3).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('k')
    await window.keyboard.press('k')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(3)
    await pressShifted(window, 'J')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(0)
    await expect.poll(() => outline(window)).toEqual(['Alpha Bravo Charlie', 'Delta'])
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 5)

    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(['Alpha ', ' Bravo', 'Charlie', 'Delta'])
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await window.keyboard.press('g')
    await pressShifted(window, 'J')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect.poll(() => outline(window)).toEqual(['Alpha  Bravo', 'Charlie', 'Delta'])

    // A one-node range has nothing to join: the mode and the selection stay.
    await node(window, 3).focus()
    await window.keyboard.press('V')
    await pressShifted(window, 'J')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(1)
    await expect(window.getByRole('alert')).toHaveCount(0)
  })

  test('restores the latest whole-node Visual selection with gv and ignores one that was invalidated', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((text, index) => ({ id: `n${index}`, text, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n1' },
    })
    const { window } = await launchTree(userDataDir)
    const mode = window.getByLabel('Vim mode')
    await node(window, 2).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await window.keyboard.press('Escape')
    await expect(mode).toHaveText('NORMAL')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(0)

    await node(window, 4).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('v')
    await expect(mode).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    await expect(node(window, 3)).toBeFocused()

    // The direction is part of the memory: after `o` the focus end is the upper node.
    await window.keyboard.press('o')
    await window.keyboard.press('Escape')
    await node(window, 4).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('v')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    await expect(node(window, 2)).toBeFocused()

    // Deleting a remembered node invalidates the memory: `gv` changes nothing.
    await window.keyboard.press('Escape')
    await node(window, 2).focus()
    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await expect.poll(() => outline(window)).toEqual(['Alpha', 'Charlie', 'Delta'])
    await window.keyboard.press('g')
    await window.keyboard.press('v')
    await expect(mode).toHaveText('NORMAL')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(0)
  })

  test('restores a character-wise Visual selection with gv in another node, keeping its direction', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'foo bar', children: [] },
          { id: 'b', text: 'xyz', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    const mode = window.getByLabel('Vim mode')
    await node(window, 1).focus()
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('o')
    await window.keyboard.press('Escape')
    await expect(mode).toHaveText('NORMAL')

    await node(window, 2).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('v')
    await expect(mode).toHaveText('VISUAL')
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 0)
    await expect(node(window, 1)).toHaveJSProperty('selectionEnd', 3)
    // The anchor stayed at the right end, so moving the focus right shortens the selection.
    await window.keyboard.press('l')
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 1)
    await expect(node(window, 1)).toHaveJSProperty('selectionEnd', 3)
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('f bar')
  })

  test('selects the incoming nodes after a Visual put and the moved range after a shift', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((text, index) => ({ id: `n${index}`, text, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { window } = await launchTree(userDataDir)
    const mode = window.getByLabel('Vim mode')
    await node(window, 1).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await node(window, 2).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await window.keyboard.press('p')
    await expect.poll(() => outline(window)).toEqual(['Alpha', 'Alpha', 'Delta'])
    await node(window, 3).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('v')
    await expect(mode).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(1)
    await expect(node(window, 2)).toBeFocused()

    await window.keyboard.press('Escape')
    await node(window, 2).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await pressShifted(window, '>')
    await expect.poll(() => outline(window)).toEqual(['Alpha', '  Alpha', '  Delta'])
    await window.keyboard.press('Escape')
    await node(window, 1).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('v')
    await expect(mode).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
  })

  test('deletes, yanks, and changes sibling subtrees with dj, d2j, dk, yj, and cj, each as one undo', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [] },
          { id: 'bravo', text: 'Bravo', children: [{ id: 'bravo1', text: 'Bravo1', children: [] }] },
          { id: 'charlie', text: 'Charlie', children: [] },
          { id: 'delta', text: 'Delta', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 1).focus()
    const before = await outline(window)

    // `dj` takes Alpha and Bravo with its child; the descendant row is not a separate member.
    await window.keyboard.press('d')
    await window.keyboard.press('j')
    await expect.poll(() => outline(window)).toEqual(['Charlie', 'Delta'])
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(before)

    // `d2j` covers the current node and the following two siblings; one undo restores all three.
    await node(window, 1).focus()
    await window.keyboard.press('d')
    await window.keyboard.press('2')
    await window.keyboard.press('j')
    await expect.poll(() => outline(window)).toEqual(['Delta'])
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(before)

    // `dk` from Charlie removes Bravo and Charlie, and the register keeps them in ascending order.
    await window.keyboard.press('G')
    await window.keyboard.press('k')
    await window.keyboard.press('d')
    await window.keyboard.press('k')
    await expect.poll(() => outline(window)).toEqual(['Alpha', 'Delta'])
    await window.keyboard.press('p')
    await expect.poll(() => outline(window)).toEqual(['Alpha', 'Delta', 'Bravo', 'Charlie'])
    await window.keyboard.press('u')
    await window.keyboard.press('u')
    await expect.poll(() => outline(window)).toEqual(before)

    // `yj` changes nothing in the document; `cj` replaces the pair with one empty node in Insert mode.
    await node(window, 1).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('j')
    await expect.poll(() => outline(window)).toEqual(before)
    await window.keyboard.press('c')
    await window.keyboard.press('j')
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await window.keyboard.type('New')
    await window.keyboard.press('Escape')
    await expect.poll(() => outline(window)).toEqual(['New', 'Charlie', 'Delta'])
  })

  test('extends whole-node Visual by a count with j and k', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((text) => ({ id: text, text, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'Bravo' },
    })
    const { window } = await launchTree(userDataDir)
    await node(window, 2).focus()
    await window.keyboard.press('V')
    await window.keyboard.press('2')
    await window.keyboard.press('j')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(3)
    await window.keyboard.press('9')
    await window.keyboard.press('k')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    await window.keyboard.press('d')
    await expect.poll(() => outline(window)).toEqual(['Charlie', 'Delta'])
  })

  test('moves the current node with a character Visual > and < and keeps its character selection', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [] },
          { id: 'bravo', text: 'Bravo', children: [] },
          { id: 'charlie', text: 'Charlie', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'charlie' },
    })
    const { window } = await launchTree(userDataDir)
    const charlie = node(window, 3)
    await charlie.focus()
    await setCursor(charlie, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await expect(charlie).toHaveJSProperty('selectionEnd', 3)

    await pressShifted(window, '>')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
    await expect.poll(() => outline(window)).toEqual(['Alpha', 'Bravo', '  Charlie'])
    await expect(node(window, 3)).toBeFocused()
    await expect(node(window, 3)).toHaveJSProperty('selectionStart', 0)
    await expect(node(window, 3)).toHaveJSProperty('selectionEnd', 3)

    await pressShifted(window, '<')
    await expect.poll(() => outline(window)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    await expect(node(window, 3)).toHaveJSProperty('selectionStart', 0)
    await expect(node(window, 3)).toHaveJSProperty('selectionEnd', 3)
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
  })

  test('shows the displayed location one level up when whole-node Visual < leaves it', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'bravo',
            text: 'Bravo',
            children: [
              { id: 'one', text: 'One', children: [] },
              { id: 'two', text: 'Two', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'bravo', selectedNodeId: 'one' },
    })
    const { window } = await launchTree(userDataDir)
    const one = node(window, 1)
    await one.focus()
    await setCursor(one, 0)
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Bravo')

    await pressShifted(window, '<')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveCount(0)
    await expect.poll(() => nodeTexts(window)).toEqual(['Bravo', 'One', 'Two'])
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
  })

  test('exits whole-node Visual on a focus-changing shortcut', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [] },
          { id: 'bravo', text: 'Bravo', children: [] },
          { id: 'charlie', text: 'Charlie', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { window } = await launchTree(userDataDir)
    const alpha = node(window, 1)
    await alpha.focus()
    await setCursor(alpha, 0)

    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)

    // The range belongs to the displayed level, so entering the focused node must end the mode
    // instead of leaving a range that the new level cannot resolve.
    await window.keyboard.press('Meta+.')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveValue('Bravo')

    await window.keyboard.press('Meta+,')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(0)
    await expect(node(window, 1)).toHaveValue('Alpha')

    // Cmd+A also ends whole-node Visual, and the full selection it applies must survive the exit.
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.keyboard.press('Meta+a')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 0)
    await expect(node(window, 1)).toHaveJSProperty('selectionEnd', 5)
  })

  test('exits whole-node Visual on a breadcrumb click and an enter-control click', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'child', text: 'Child', children: [] },
              { id: 'other', text: 'Other', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)
    const child = node(window, 1)
    await child.focus()
    await setCursor(child, 0)

    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)

    // A breadcrumb click changes the displayed level, so the level-relative range must not survive.
    await window.getByRole('button', { name: 'Top level' }).click()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(0)
    await expect(node(window, 1)).toHaveValue('Root')

    // The node's own enter control changes the level too.
    await node(window, 1).focus()
    await window.keyboard.press('V')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.getByRole('button', { name: 'Enter node 1' }).click()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(0)
  })

  test('re-anchors character Visual after a breadcrumb click and an enter-control click', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [{ id: 'child', text: 'Child', children: [] }],
          },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)
    const child = node(window, 1)
    await child.focus()
    await setCursor(child, 0)

    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await expect(child).toHaveJSProperty('selectionStart', 0)
    await expect(child).toHaveJSProperty('selectionEnd', 2)

    // Character Visual keeps its mode across a level change but must drop the stale endpoints so
    // the next motion anchors at the reached caret.
    await window.getByRole('button', { name: 'Top level' }).click()
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
    const root = node(window, 1)
    await expect(root).toHaveValue('Root')
    await window.keyboard.press('l')
    await expect(root).toHaveJSProperty('selectionStart', 0)
    await expect(root).toHaveJSProperty('selectionEnd', 2)

    // The enter control drops the endpoints the same way while the mode stays active. Entering a
    // node with children focuses its first child, so the next motion anchors there.
    await window.getByRole('button', { name: 'Enter node 1' }).click()
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
    const entered = node(window, 1)
    await expect(entered).toHaveValue('Child')
    await window.keyboard.press('l')
    await expect(entered).toHaveJSProperty('selectionStart', 0)
    await expect(entered).toHaveJSProperty('selectionEnd', 2)
  })

  test('re-anchors character Visual after a paste at the resulting caret', async ({ userDataDir }) => {
    await lockSystemClipboard()
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'alpha', text: 'Alpha', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 3)
    await writeClipboardText(app, 'PASTED')
    await window.evaluate(() => {
      document.addEventListener('paste', (event) => event.preventDefault(), true)
    })

    await window.keyboard.press('Meta+v')

    await expect(editor).toHaveValue('PASTEDAlpha')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
    // The paste drops the stale endpoints, so the next motion anchors at the paste end rather than
    // re-selecting from the pre-paste anchor.
    await window.keyboard.press('l')
    await expect(editor).toHaveJSProperty('selectionStart', 6)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-visual-paste-anchor-light.png')
  })

  test('keeps whole-node Visual mode and its range across a paste', async ({ userDataDir }) => {
    await lockSystemClipboard()
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'alpha', text: 'Alpha', children: [] },
          { id: 'bravo', text: 'Bravo', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'alpha' },
    })
    const { app, window } = await launchTree(userDataDir)
    const alpha = node(window, 1)
    await alpha.focus()
    await setCursor(alpha, 0)
    await window.keyboard.press('V')
    await window.keyboard.press('j')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    await writeClipboardText(app, 'X')

    await window.keyboard.press('Meta+v')

    // A paste is not a focus-changing command, so the whole-node range survives and the paste lands
    // in the focused node's text.
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await expect(window.locator('.node-row-visual-selected')).toHaveCount(2)
    await expect(node(window, 2)).toHaveValue('XBravo')
    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })
})
