// @editing-modes: both
import type { Locator } from '@playwright/test'
import {
  closeApp,
  describeForEachEditingMode,
  expect,
  launchTree,
  node,
  parent,
  pressShifted,
  readPersisted,
  seedDocument,
  setCursor,
  test,
} from './fixtures'

function tasksSeed(currentParentId: string | null = null): { document: unknown; location: unknown } {
  return {
    document: {
      roots: [
        { id: 'a', text: 'Alpha', children: [{ id: 'a1', text: 'Alpha step', children: [] }] },
        { id: 'b', text: 'Bravo', children: [] },
        { id: 'c', text: 'Charlie', children: [] },
      ],
    },
    location: { currentParentId, selectedNodeId: currentParentId ?? 'a' },
  }
}

function caret(input: Locator): Promise<number> {
  return input.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)
}

// @requirement PRODUCT.md §2.5
describeForEachEditingMode('struck-through nodes', ({ mode, screenshotName }) => {
  test('toggles the selected node with Cmd+Enter, keeps the caret and typing, and keeps it after relaunch', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, tasksSeed())
    const first = await launchTree(userDataDir)
    const alpha = node(first.window, 1)
    await setCursor(alpha, 2)

    await first.window.keyboard.press('Meta+Enter')
    await expect(alpha).toHaveClass(/node-input-struck/)
    await expect(node(first.window, 2)).not.toHaveClass(/node-input-struck/)
    await expect(alpha).toBeFocused()
    expect(await caret(alpha)).toBe(2)
    if (mode === 'vim') await expect(first.window.getByLabel('Vim mode')).toHaveText('INSERT')

    // The text stays editable and keeps its strikethrough.
    await first.window.keyboard.type('X')
    await expect(alpha).toHaveValue('AlXpha')
    await expect(alpha).toHaveClass(/node-input-struck/)

    await closeApp(first.app)
    const persisted = readPersisted(userDataDir)
    expect(persisted.version).toBe(4)
    expect(persisted.document.roots[0]).toMatchObject({ id: 'a', text: 'AlXpha', struckThrough: true })
    expect(persisted.document.roots[0]!.children[0]).not.toHaveProperty('struckThrough')
    expect(persisted.document.roots[1]).not.toHaveProperty('struckThrough')

    const second = await launchTree(userDataDir)
    await expect(node(second.window, 1)).toHaveClass(/node-input-struck/)
    await second.window.keyboard.press('Meta+Enter')
    await expect(node(second.window, 1)).not.toHaveClass(/node-input-struck/)
  })

  test('undoes and redoes a Cmd+Enter toggle as one change', async ({ userDataDir }) => {
    seedDocument(userDataDir, tasksSeed())
    const { window } = await launchTree(userDataDir)
    await node(window, 2).focus()

    await window.keyboard.press('Meta+Enter')
    await expect(node(window, 2)).toHaveClass(/node-input-struck/)
    await window.keyboard.press('Meta+z')
    await expect(node(window, 2)).not.toHaveClass(/node-input-struck/)
    await expect(node(window, 2)).toBeFocused()
    expect(await caret(node(window, 2))).toBe(0)
    await window.keyboard.press('Meta+Shift+z')
    await expect(node(window, 2)).toHaveClass(/node-input-struck/)
    await expect(node(window, 2)).toHaveValue('Bravo')
  })

  test('strikes the editable current-parent heading and leaves its children normal', async ({ userDataDir }) => {
    seedDocument(userDataDir, tasksSeed('a'))
    const { window } = await launchTree(userDataDir)
    await parent(window).focus()

    await window.keyboard.press('Meta+Enter')

    await expect(parent(window)).toHaveClass(/node-input-struck/)
    await expect(node(window, 1)).toHaveValue('Alpha step')
    await expect(node(window, 1)).not.toHaveClass(/node-input-struck/)
  })

  test('draws the line through muted text in the light and dark appearance', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'Write the report', struckThrough: true, children: [] },
          { id: 'b', text: 'Review the report', children: [] },
          {
            id: 'c',
            text: 'Read https://example.com',
            links: [{ start: 5, end: 24, url: 'https://example.com' }],
            struckThrough: true,
            children: [{ id: 'c1', text: 'A normal step', children: [] }],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.getByRole('button', { name: 'Expand node 3' }).click()
    await node(window, 2).focus()

    const struck = await node(window, 1).evaluate((element) => {
      const style = getComputedStyle(element)
      const normal = getComputedStyle(element.closest('.node-list')!.querySelectorAll('.node-input')[1]!)
      return { line: style.textDecorationLine, color: style.color, normalColor: normal.color }
    })
    expect(struck.line).toBe('line-through')
    expect(struck.color).not.toBe(struck.normalColor)
    await expect(window.locator('.node-list')).toHaveScreenshot(screenshotName('strikethrough-light.png'))

    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot(screenshotName('strikethrough-dark.png'))
    await window.emulateMedia({ colorScheme: 'light' })
  })
})

// @requirement PRODUCT.md §2.5
test.describe('struck-through nodes: Vim editing only', () => {
  test('toggles in Normal mode and keeps Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, tasksSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await window.keyboard.press('Meta+Enter')

    await expect(node(window, 1)).toHaveClass(/node-input-struck/)
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('draws a struck row inside the whole-node Visual highlight with the highlight colors', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'Write the report', struckThrough: true, children: [] },
          { id: 'b', text: 'Review the report', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await pressShifted(window, 'V')
    await window.keyboard.press('j')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')

    const colors = await window.locator('.node-input').evaluateAll((inputs) =>
      inputs.map((input) => {
        const style = getComputedStyle(input)
        return { color: style.color, line: style.textDecorationLine }
      }),
    )
    expect(colors[0]!.color).toBe(colors[1]!.color)
    expect(colors[0]!.line).toBe('line-through')
    expect(colors[1]!.line).toBe('none')
    await expect(window.locator('.node-list')).toHaveScreenshot('strikethrough-visual-node-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot('strikethrough-visual-node-dark.png')
    await window.emulateMedia({ colorScheme: 'light' })
  })

  test('keeps a Normal-mode select-all highlighted across a toggle', async ({ userDataDir }) => {
    seedDocument(userDataDir, tasksSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.keyboard.press('Meta+a')
    await expect(node(window, 1)).toHaveClass(/node-input-text-selected/)

    await window.keyboard.press('Meta+Enter')

    await expect(node(window, 1)).toHaveClass(/node-input-struck/)
    await expect(node(window, 1)).toHaveClass(/node-input-text-selected/)
    expect(await node(window, 1).evaluate((element) => (element as HTMLTextAreaElement).selectionEnd)).toBe(5)
  })

  test('commits a pending Replace edit before toggling and returns to Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, tasksSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await pressShifted(window, 'R')
    await window.keyboard.type('Ze')
    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')

    await window.keyboard.press('Meta+Enter')

    await expect(node(window, 1)).toHaveClass(/node-input-struck/)
    await expect(node(window, 1)).toHaveValue('Zepha')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    // The replacement is one edit of its own: undo removes the toggle first, then the replacement.
    await window.keyboard.press('u')
    await expect(node(window, 1)).not.toHaveClass(/node-input-struck/)
    await expect(node(window, 1)).toHaveValue('Zepha')
    await window.keyboard.press('u')
    await expect(node(window, 1)).toHaveValue('Alpha')
  })

  test('toggles the whole-node Visual range and the current node in character Visual mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, tasksSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await node(window, 2).focus()
    await window.keyboard.press('Meta+Enter')
    await expect(node(window, 2)).toHaveClass(/node-input-struck/)

    // A mixed range becomes struck through; the same range again returns to normal.
    await node(window, 1).focus()
    await pressShifted(window, 'V')
    await window.keyboard.press('j')
    await window.keyboard.press('j')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.keyboard.press('Meta+Enter')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    for (const index of [1, 2, 3]) await expect(node(window, index)).toHaveClass(/node-input-struck/)

    await pressShifted(window, 'V')
    await window.keyboard.press('k')
    await window.keyboard.press('k')
    await window.keyboard.press('Meta+Enter')
    for (const index of [1, 2, 3]) await expect(node(window, index)).not.toHaveClass(/node-input-struck/)

    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
    await window.keyboard.press('Meta+Enter')
    await expect(node(window, 1)).toHaveClass(/node-input-struck/)
    await expect(node(window, 2)).not.toHaveClass(/node-input-struck/)
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
  })
})
