import { expect, launchTree, node, seedDocument, setCursor, test, typeInto } from './fixtures'

test.describe('Vim editing prototype', () => {
  test('starts in Normal mode', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveCSS('caret-color', 'rgb(55, 63, 67)')
    await expect(editor).toHaveCSS('caret-animation', 'manual')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 0)
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
})
