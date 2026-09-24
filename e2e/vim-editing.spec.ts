import {
  allowRendererError,
  exactMessage,
  expect,
  launchTree as launchTreeBase,
  node,
  seedDocument,
  setCursor,
  test,
  typeInto,
} from './fixtures'

const launchTree = (userDataDir: string) => launchTreeBase(userDataDir, { initialMode: 'normal' })

test.describe('Vim editing prototype', () => {
  test('uses word, quote, and bracket text objects in Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one (two) "three"', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 6)
    await window.keyboard.press('d')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await expect(editor).toHaveValue('one () "three"')
    await setCursor(editor, 5)
    await window.keyboard.press('d')
    await window.keyboard.press('a')
    await window.keyboard.press('(')
    await expect(editor).toHaveValue('one  "three"')
    await setCursor(editor, 7)
    await window.keyboard.press('c')
    await window.keyboard.press('i')
    await window.keyboard.press('"')
    await typeInto(editor, 'four')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('one  "four"')
  })

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
    await window.keyboard.press('(')
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
  test('starts in Normal mode', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveCSS('caret-color', 'rgb(55, 63, 67)')
    await expect(editor).toHaveCSS('caret-animation', 'manual')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 0)
  })

  test('shows the Normal-mode block caret at a hyperlink boundary without selecting the link', async ({
    userDataDir,
  }) => {
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

    await expect(link).toHaveClass(/normal-caret-before/)
    await expect(link).not.toHaveClass(/link-selected/)
    expect(
      await editor.evaluate((field) => {
        const selection = field.ownerDocument.defaultView?.getSelection()
        return selection?.isCollapsed
      }),
    ).toBe(true)

    await editor.press('$')

    await expect(link).toHaveClass(/normal-caret-after/)
    await expect(link).not.toHaveClass(/normal-caret-before/)
    await expect(link).not.toHaveClass(/link-selected/)
  })

  test('keeps the Normal-mode hyperlink boundary caret visible in dark appearance', async ({ userDataDir }) => {
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

    await expect(link).toHaveClass(/normal-caret-before/)
    await expect
      .poll(() =>
        link.evaluate(
          (element) => element.ownerDocument.defaultView?.getComputedStyle(element, '::before').backgroundColor,
        ),
      )
      .toBe('rgb(255, 255, 255)')
    await expect(editor).toHaveScreenshot('vim-normal-link-caret-dark.png')
  })

  test('shows the Normal-mode hyperlink caret only on the focused node', async ({ userDataDir }) => {
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
    const firstLink = first.getByRole('link')
    const secondLink = second.getByRole('link')

    await expect(firstLink).toHaveClass(/normal-caret-before/)
    await expect(secondLink).not.toHaveClass(/normal-caret-before|normal-caret-after/)
    await expect(first).toHaveScreenshot('vim-normal-link-caret-multi-node-focused-first.png')

    await second.focus()
    await expect(secondLink).toHaveClass(/normal-caret-before/)
    await expect(firstLink).not.toHaveClass(/normal-caret-before|normal-caret-after/)
    await expect(first).toHaveScreenshot('vim-normal-link-caret-multi-node-unfocused-first.png')
    await expect(second).toHaveScreenshot('vim-normal-link-caret-multi-node-focused-second.png')

    await first.focus()
    await expect(firstLink).toHaveClass(/normal-caret-before/)
    await expect(secondLink).not.toHaveClass(/normal-caret-before|normal-caret-after/)
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

  test('switches modes and applies Normal-mode motions and edits', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'one two')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
    await window.keyboard.press('Backspace')
    await expect(editor).toHaveValue('one two')

    await window.keyboard.press('w')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('one wo')

    await window.keyboard.press('i')
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await window.keyboard.type('T')
    await expect(editor).toHaveValue('one Two')
  })

  test('undoes with u and redoes with Ctrl+r in Normal mode', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await window.keyboard.press('Escape')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('ab')

    await window.keyboard.press('u')
    await expect(editor).toHaveValue('abc')
    await window.keyboard.press('Control+r')
    await expect(editor).toHaveValue('ab')
  })

  test('A enters Insert mode at the end of the node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'one two')
    await setCursor(editor, 1)
    await window.keyboard.press('Escape')
    await window.keyboard.press('A')
    await window.keyboard.type('!')

    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await expect(editor).toHaveValue('one two!')
    await expect(editor).toHaveJSProperty('selectionStart', 8)
    await expect(editor).toHaveJSProperty('selectionEnd', 8)
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

  test('I enters Insert mode at the first non-whitespace character', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, '  one')
    await setCursor(editor, 4)
    await window.keyboard.press('Escape')
    await window.keyboard.press('I')
    await window.keyboard.type('X')

    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await expect(editor).toHaveValue('  Xone')
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

  test('puts the local register after the current character with p', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('y')
    await window.keyboard.press('$')
    await window.keyboard.press('p')

    await expect(editor).toHaveValue('abcab')
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

  test('uses counted text operators while preserving the node and its subtree', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'one two three', children: [{ id: 'child', text: 'Child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('2')
    await window.keyboard.press('d')
    await window.keyboard.press('w')
    await expect(editor).toHaveValue('three')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('Child')
  })

  test('changes words, finds characters, and repeats the completed change', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'one.two three')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('w')
    await expect(editor).toHaveJSProperty('selectionStart', 3)
    await window.keyboard.press('f')
    await window.keyboard.press('o')
    await expect(editor).toHaveJSProperty('selectionStart', 6)
    await window.keyboard.press('b')
    await window.keyboard.press('c')
    await window.keyboard.press('w')
    await window.keyboard.type('NEW')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('one.NEW three')
    await window.keyboard.press('w')
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('one.NEW NEW')
  })

  test('replaces, substitutes, and changes through the end of node text', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'abc def')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('r')
    await window.keyboard.press('X')
    await expect(editor).toHaveValue('Xbc def')
    await window.keyboard.press('s')
    await window.keyboard.type('Y')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('Ybc def')
    await window.keyboard.press('w')
    await window.keyboard.press('C')
    await window.keyboard.type('tail')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('Ybc tail')
    await window.keyboard.press('D')
    await expect(editor).toHaveValue('Ybc tai')
  })

  test('repeats inserted text and honors a count before dot', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'abcdef')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('bcdef')
    for (const key of ['2', '.']) await window.keyboard.press(key)
    await expect(editor).toHaveValue('def')
    await window.keyboard.press('i')
    await window.keyboard.type('Q')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('QQdef')
  })

  test('changes whole-node text, deletes backward, and repeats counted text puts', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'parent', children: [{ id: 'child', text: 'child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await window.keyboard.press('c')
    await window.keyboard.press('c')
    await window.keyboard.type('new')
    await window.keyboard.press('Escape')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(node(window, 1)).toHaveValue('child')
    await window.keyboard.press('Control+o')

    await setCursor(node(window, 1), 2)
    await window.keyboard.press('X')
    await expect(node(window, 1)).toHaveValue('nw')
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('v')
    await window.keyboard.press('y')
    await window.keyboard.press('3')
    await window.keyboard.press('p')
    await expect(node(window, 1)).toHaveValue('nnnnw')
  })

  test('uses WORD, ge, and repeated character-find motions', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'foo.bar  baz.baz')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('W')
    await expect(editor).toHaveJSProperty('selectionStart', 9)
    await window.keyboard.press('f')
    await window.keyboard.press('.')
    await window.keyboard.press(';')
    await expect(editor).toHaveJSProperty('selectionStart', 12)
    await window.keyboard.press(',')
    await expect(editor).toHaveJSProperty('selectionStart', 3)
    await window.keyboard.press('W')
    await window.keyboard.press('g')
    await window.keyboard.press('e')
    await expect(editor).toHaveJSProperty('selectionStart', 6)
  })

  test('replaces text in Replace mode and repeats the completed session', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'abcd')
    await setCursor(editor, 2)
    await window.keyboard.press('Escape')
    await window.keyboard.press('R')
    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
    await window.keyboard.type('XY')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('aXYd')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await setCursor(editor, 0)
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('XYYd')
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

  test('repeats a deletion made inside an Insert session', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.press('i')
    await typeInto(editor, 'abcd')
    await setCursor(editor, 2)
    await window.keyboard.press('Escape')
    await window.keyboard.press('i')
    await window.keyboard.press('Backspace')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('bcd')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('bd')
  })

  test('does not record a cross-node Insert session as a repeatable text edit', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await node(window, 1).press('i')
    await typeInto(node(window, 1), 'one')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'two')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(node(window, 1)).toHaveValue('one')
    await expect(node(window, 2)).toHaveValue('two')
  })
})
