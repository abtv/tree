import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  attachmentPath,
  expect,
  launchTree as launchTreeBase,
  node,
  seedDocument,
  setCursor,
  test,
  typeInto,
} from './fixtures'

const launchTree = (userDataDir: string) => launchTreeBase(userDataDir, { initialMode: 'normal' })

const attachmentImageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAABmklEQVR4nO3TMRHAIADAQOSgqYpxBQZ6WWH44fcsGfNbG/g3bgfAywwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAOQJHaVsxH0sYAAAAASUVORK5CYII=',
  'base64',
)

function seedAttachmentImage(userDataDir: string, attachmentId: string): void {
  const directory = join(userDataDir, 'data', 'attachments')
  mkdirSync(directory, { recursive: true })
  writeFileSync(attachmentPath(userDataDir, attachmentId), attachmentImageBytes)
}

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

  test('undoes two separate Vim character replacements without an empty history step', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'ab', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)

    await editor.press('r')
    await editor.press('q')
    await expect(editor).toHaveValue('qb')
    await editor.press('l')
    await editor.press('r')
    await editor.press('Z')
    await expect(editor).toHaveValue('qZ')

    await editor.press('u')
    await expect(editor).toHaveValue('qb')
    await editor.press('u')
    await expect(editor).toHaveValue('ab')
    await editor.press('Control+r')
    await expect(editor).toHaveValue('qb')
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

  test('repeats a deletion-only Insert edit at the same relative caret', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcd', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('i')
    await editor.press('Delete')
    await editor.press('Escape')
    await expect(editor).toHaveValue('acd')
    await expect(editor).toHaveJSProperty('selectionStart', 0)

    await editor.press('l')
    await editor.press('.')
    await expect(editor).toHaveValue('ad')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
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
    await expect(editor).toHaveJSProperty('selectionStart', 2)
    await expect(editor).toHaveJSProperty('selectionEnd', 3)
    await setCursor(editor, 0)
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('XYYd')
  })

  test('leaves an image caret on replacement text after Escape', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('j')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await window.keyboard.press('R')
    await window.keyboard.type('XY')
    await window.keyboard.press('Escape')

    await expect(editor).toHaveValue('abcdXY')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 6)
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await editor.press('h')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 6)
  })

  test('clears the image caret when a pending Replace session commits on blur', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
          { id: 'peer', text: 'peer', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('j')
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await node(window, 2).click()

    await expect(editor).toHaveValue('abcdX')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(node(window, 2)).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('activates the image caret when a same-node pointer click commits a Replace session', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('j')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await editor.click()
    await window.keyboard.press('Escape')

    await expect(editor).toHaveValue('abcdX')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-replace-click-image-caret-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot('vim-replace-click-image-caret-dark.png')
  })

  test('undoes a pending Replace-mode edit and focuses the restored text', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
          { id: 'peer', text: 'peer', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('j')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await window.keyboard.press('R')
    await window.keyboard.type('XY')
    await expect(editor).toHaveValue('abcdXY')

    await window.keyboard.press('Meta+z')

    await expect(editor).toHaveValue('abcd')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 1)
    const restoredList = window.locator('.node-list')
    await expect(restoredList).toHaveScreenshot('vim-replace-undo-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(restoredList).toHaveScreenshot('vim-replace-undo-dark.png')
  })

  test('ends a pending Replace session on Cmd+Shift+Z with a valid Normal caret', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'abcd', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    seedAttachmentImage(userDataDir, 'image')
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 1)
    await editor.press('j')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await window.keyboard.press('R')
    await window.keyboard.type('XY')

    await window.keyboard.press('Meta+Shift+z')

    await expect(editor).toHaveValue('abcdXY')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 6)
    await editor.press('l')
    await expect(editor).toHaveClass(/node-input-image-caret/)
    await editor.press('h')
    await expect(editor).not.toHaveClass(/node-input-image-caret/)
    await expect(editor).toHaveJSProperty('selectionStart', 5)
    await expect(editor).toHaveJSProperty('selectionEnd', 6)
  })

  test('commits a pending Replace session before entering the node with its enter control', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', children: [{ id: 'child', text: 'child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('R')
    await window.keyboard.type('X')

    await window.getByRole('button', { name: 'Enter node 1' }).click()

    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveValue('Xb')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('commits a pending Replace session before Cmd+Backspace deletes the node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'ab', children: [] },
          { id: 'peer', text: 'peer', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await window.keyboard.press('R')
    await window.keyboard.type('X')

    await window.keyboard.press('Meta+Backspace')
    await expect(node(window, 1)).toHaveValue('peer')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('Xb')
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
  test('does not record a plain Insert session as repeatable after entering the node with its enter control', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'ab', children: [{ id: 'child', text: 'child', children: [] }] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await editor.press('i')
    await window.keyboard.type('X')

    await window.getByRole('button', { name: 'Enter node 1' }).click()

    const childEditor = node(window, 1)
    await expect(childEditor).toHaveValue('child')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(childEditor).toHaveValue('child')
    const parent = window.getByRole('textbox', { name: 'Current parent' })
    await expect(parent).toHaveValue('Xab')
  })

  test('does not record a plain Insert session as repeatable after a breadcrumb navigates to an ancestor', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'ab', children: [] }] }],
      },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)
    await editor.press('i')
    await window.keyboard.type('X')

    await window.getByRole('button', { name: 'Top level' }).click()

    const rootEditor = node(window, 1)
    await expect(rootEditor).toHaveValue('Root')
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    await expect(rootEditor).toHaveValue('Root')
  })

  test('adds, changes, and deletes surrounding pairs in Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one two three', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 4)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await window.keyboard.press('"')
    await expect(editor).toHaveValue('one "two" three')

    await setCursor(editor, 5)
    await window.keyboard.press('c')
    await window.keyboard.press('s')
    await window.keyboard.press('"')
    await window.keyboard.press(')')
    await expect(editor).toHaveValue('one (two) three')

    await setCursor(editor, 5)
    await window.keyboard.press('d')
    await window.keyboard.press('s')
    await window.keyboard.press(')')
    await expect(editor).toHaveValue('one two three')

    // The opening bracket pads the inside; its closing counterpart does not.
    await setCursor(editor, 4)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await window.keyboard.press('{')
    await expect(editor).toHaveValue('one { two } three')

    // Deleting with the opening key strips that padding again.
    await setCursor(editor, 6)
    await window.keyboard.press('d')
    await window.keyboard.press('s')
    await window.keyboard.press('{')
    await expect(editor).toHaveValue('one two three')
  })

  test('surrounds the whole node with yss and repeats a surround with dot', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'alpha beta', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 3)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('s')
    await window.keyboard.press(')')
    await expect(editor).toHaveValue('(alpha beta)')

    await window.keyboard.press('u')
    await expect(editor).toHaveValue('alpha beta')

    await setCursor(editor, 0)
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await window.keyboard.press(']')
    await expect(editor).toHaveValue('[alpha] beta')

    // The repeat re-derives the word at the new caret instead of replaying fixed offsets.
    await setCursor(editor, 8)
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('[alpha] [beta]')

    // One surround is one undoable change.
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('[alpha] beta')
  })

  test('surrounds a Visual selection with S', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'see it now', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await window.keyboard.press('l')
    await window.keyboard.press('S')
    await window.keyboard.press('"')
    await expect(editor).toHaveValue('"see" it now')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })
})
