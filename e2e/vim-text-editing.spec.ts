// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  attachmentPath,
  expect,
  firePaste,
  launchTree as launchTreeBase,
  lockSystemClipboard,
  node,
  pressShifted,
  seedDocument,
  setCursor,
  test,
  typeInto,
  writeClipboardText,
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

test.describe('Vim editing: text editing', () => {
  // @requirement PRODUCT.md §20.2.17
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
    await pressShifted(window, '(')
    await expect(editor).toHaveValue('one  "three"')
    await setCursor(editor, 7)
    await window.keyboard.press('c')
    await window.keyboard.press('i')
    await window.keyboard.press('"')
    await typeInto(editor, 'four')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('one  "four"')
  })

  // @requirement PRODUCT.md §20.2.4
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

  // @requirement PRODUCT.md §20.2.9
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

  test('keeps the caret on the change that u and Ctrl+r apply', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcde', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 2)

    await window.keyboard.press('x')
    await expect(editor).toHaveValue('abde')
    await expect(editor).toHaveJSProperty('selectionStart', 2)

    await window.keyboard.press('u')
    await expect(editor).toHaveValue('abcde')
    await expect(editor).toHaveJSProperty('selectionStart', 2)
    await expect(editor).toHaveJSProperty('selectionEnd', 3)

    await window.keyboard.press('Control+r')
    await expect(editor).toHaveValue('abde')
    await expect(editor).toHaveJSProperty('selectionStart', 2)
    await expect(editor).toHaveJSProperty('selectionEnd', 3)

    // The caret jumps back to the change even when it moved away first, as Vim's undo does.
    await window.keyboard.press('0')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('abcde')
    await expect(editor).toHaveJSProperty('selectionStart', 2)
    await expect(editor).toHaveJSProperty('selectionEnd', 3)
  })

  test('returns to the level of the change when u applies it elsewhere', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'alpha', text: 'alpha', children: [{ id: 'inner', text: 'abcde', children: [] }] },
              { id: 'beta', text: 'beta', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'alpha', selectedNodeId: 'inner' },
    })
    const { window } = await launchTree(userDataDir)
    const heading = window.getByRole('textbox', { name: 'Current parent' })
    await expect(heading).toHaveValue('alpha')
    await node(window, 1).focus()
    await setCursor(node(window, 1), 2)
    await window.keyboard.press('x')
    await expect(node(window, 1)).toHaveValue('abde')

    // Leave the level the edit was made on, so undo has to come back to it.
    await window.keyboard.press('Control+o')
    await expect(heading).toHaveValue('Parent')
    await expect(node(window, 1)).toHaveValue('alpha')

    await window.keyboard.press('u')

    await expect(heading).toHaveValue('alpha')
    await expect(node(window, 1)).toHaveValue('abcde')
    await expect(node(window, 1)).toHaveJSProperty('selectionStart', 2)
    await expect(node(window, 1)).toHaveJSProperty('selectionEnd', 3)
  })

  test('blocks an unhandled Ctrl-modified key from reaching native text editing in Normal mode', async ({
    userDataDir,
  }) => {
    // The node stays a genuinely editable textarea in Normal mode, and macOS Chromium binds Ctrl+H to
    // its native "delete backward" text-editing command. Only Ctrl+d/u/o/r have an explicit Normal-mode
    // meaning, so an unblocked Ctrl+H would let that native command mutate the textarea directly,
    // deleting a character the application never asked to delete.
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await window.keyboard.press('Escape')
    await expect(editor).toHaveValue('abc')

    await window.keyboard.press('Control+h')
    await expect(editor).toHaveValue('abc')
  })

  test('drops an unfinished command before u and Ctrl+r instead of undoing or redoing', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcd', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 0)

    await editor.press('x')
    await expect(editor).toHaveValue('bcd')
    await editor.press('u')
    await expect(editor).toHaveValue('abcd')

    // A count is not a repeat for undo or redo, so it makes both commands no-ops instead of
    // applying to the next one.
    await editor.press('3')
    await editor.press('Control+r')
    await expect(editor).toHaveValue('abcd')
    await editor.press('2')
    await editor.press('u')
    await expect(editor).toHaveValue('abcd')

    // An unfinished operator aborts the same way, and the next motion starts a new command.
    await editor.press('d')
    await editor.press('Control+r')
    await expect(editor).toHaveValue('abcd')
    await editor.press('l')
    await expect(editor).toHaveJSProperty('selectionStart', 1)

    // Redo still works once nothing is pending.
    await editor.press('Control+r')
    await expect(editor).toHaveValue('bcd')
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
    await pressShifted(window, 'Z')
    await expect(editor).toHaveValue('qZ')

    await editor.press('u')
    await expect(editor).toHaveValue('qb')
    await editor.press('u')
    await expect(editor).toHaveValue('ab')
    await editor.press('Control+r')
    await expect(editor).toHaveValue('qb')
  })

  // @requirement PRODUCT.md §20.2.10
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

  // @requirement PRODUCT.md §20.2.21
  test('puts the local register after the current character with p', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.press('i')
    await typeInto(editor, 'abc')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await lockSystemClipboard()
    await window.keyboard.press('y')
    await window.keyboard.press('$')
    await window.keyboard.press('p')

    await expect(editor).toHaveValue('abcab')
  })

  // @requirement PRODUCT.md §20.2.16
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

  // @requirement PRODUCT.md §20.2.10
  // @requirement PRODUCT.md §20.2.11
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

  // @requirement PRODUCT.md §20.2.19
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

  test('repeats a completed Insert session in another node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'a', children: [] },
          { id: 'b', text: 'b', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    await first.focus()
    await setCursor(first, 0)
    await first.press('i')
    await typeInto(first, 'X')
    await window.keyboard.press('Escape')
    await expect(first).toHaveValue('Xa')

    const second = node(window, 2)
    await second.focus()
    await setCursor(second, 0)
    await window.keyboard.press('.')
    await expect(second).toHaveValue('Xb')
    await expect(first).toHaveValue('Xa')
  })

  test('repeats a completed change and substitute in another node', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'one two', children: [] },
          { id: 'b', text: 'three four', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    await first.focus()
    await setCursor(first, 0)
    await window.keyboard.press('c')
    await window.keyboard.press('w')
    await typeInto(first, 'X')
    await window.keyboard.press('Escape')
    await expect(first).toHaveValue('X two')

    const second = node(window, 2)
    await second.focus()
    await setCursor(second, 0)
    await window.keyboard.press('.')
    await expect(second).toHaveValue('X four')

    await setCursor(second, 0)
    await second.press('s')
    await typeInto(second, 'Q')
    await window.keyboard.press('Escape')
    await expect(second).toHaveValue('Q four')
    await first.focus()
    await setCursor(first, 0)
    await window.keyboard.press('.')
    await expect(first).toHaveValue('Q two')
  })

  test('does not repeat an Insert session interrupted by pointer focus', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'a', children: [] },
          { id: 'b', text: 'b', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    await first.focus()
    await setCursor(first, 0)
    await first.press('i')
    await typeInto(first, 'X')
    const second = node(window, 2)
    await second.click()
    await window.keyboard.press('Escape')
    await window.keyboard.press('.')
    // The pointer focus interrupted the session, so `.` records nothing and both nodes are unchanged.
    await expect(second).toHaveValue('b')
    await expect(first).toHaveValue('Xa')
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
    await lockSystemClipboard()
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

  for (const rich of [false, true]) {
    for (const pending of [false, true]) {
      test(`continues Replace after double-click word selection (${rich ? 'rich' : 'plain'}, pending ${pending})`, async ({
        userDataDir,
      }) => {
        const suffix = rich ? ' https://example.com' : ''
        seedDocument(userDataDir, {
          document: { roots: [{ id: 'root', text: `one word tail${suffix}`, children: [] }] },
          location: { currentParentId: null, selectedNodeId: 'root' },
        })
        const { window } = await launchTree(userDataDir)
        const editor = node(window, 1)
        await editor.focus()
        await setCursor(editor, 0)
        await window.keyboard.press('R')
        if (pending) await window.keyboard.type('X')
        await editor.dblclick({ position: { x: 55, y: 8 } })
        const selectedWord = () =>
          editor.evaluate((element) =>
            element instanceof HTMLTextAreaElement
              ? element.value.slice(element.selectionStart, element.selectionEnd)
              : document.getSelection()?.toString(),
          )
        await expect.poll(selectedWord).toBe('word')
        await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
        if (rich && pending)
          await expect(window.locator('.node-list')).toHaveScreenshot('vim-replace-word-selection.png')
        await window.keyboard.type('Y')
        const text = () =>
          editor.evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value : element.textContent))
        await expect.poll(text).toBe(`${pending ? 'X' : 'o'}ne Y tail${suffix}`)
        await window.keyboard.type('Z')
        await expect.poll(text).toBe(`${pending ? 'X' : 'o'}ne YZtail${suffix}`)
        await window.keyboard.press('Escape')
        await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
        await window.keyboard.press('Meta+z')
        await expect.poll(text).toBe(`${pending ? 'X' : 'o'}ne word tail${suffix}`)
        if (pending) {
          await window.keyboard.press('Meta+z')
          await expect.poll(text).toBe(`one word tail${suffix}`)
        }
      })
    }
  }

  for (const rich of [false, true]) {
    test(`continues Replace after double-clicking another node's word (${rich ? 'rich' : 'plain'})`, async ({
      userDataDir,
    }) => {
      const suffix = rich ? ' https://example.com' : ''
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'root', text: 'start', children: [] },
            { id: 'peer', text: `one word tail${suffix}`, children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'root' },
      })
      const { window } = await launchTree(userDataDir)
      const source = node(window, 1)
      await source.focus()
      await setCursor(source, 0)
      await window.keyboard.press('R')
      await window.keyboard.type('X')
      const destination = node(window, 2)
      await destination.dblclick({ position: { x: 55, y: 8 } })
      await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
      await expect(source).toHaveValue('Xtart')
      await window.keyboard.type('YZ')
      await expect
        .poll(() =>
          destination.evaluate((element) =>
            element instanceof HTMLTextAreaElement ? element.value : element.textContent,
          ),
        )
        .toBe(`one YZtail${suffix}`)
      await window.keyboard.press('Escape')
      await window.keyboard.press('Meta+z')
      await expect
        .poll(() =>
          destination.evaluate((element) =>
            element instanceof HTMLTextAreaElement ? element.value : element.textContent,
          ),
        )
        .toBe(`one word tail${suffix}`)
      await window.keyboard.press('Meta+z')
      await expect(source).toHaveValue('start')
    })
  }

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

  // @requirement PRODUCT.md §20.2.6
  test('continues Replace at the clicked caret of the same node and undoes each click-separated edit', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcdef', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 2)
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await editor.click({ position: { x: 1, y: 8 } })
    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
    await window.keyboard.type('Y')
    await expect(editor).toHaveValue('YbXdef')

    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('Meta+z')
    await expect(editor).toHaveValue('abXdef')
    await window.keyboard.press('Meta+z')
    await expect(editor).toHaveValue('abcdef')
  })

  // @requirement PRODUCT.md §20.2.6
  test('continues Replace in another node after committing the pending replacement', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'abcd', children: [] },
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
    await node(window, 2).click({ position: { x: 1, y: 8 } })
    await expect(node(window, 2)).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
    await window.keyboard.type('Y')

    await expect(editor).toHaveValue('Xbcd')
    await expect(node(window, 2)).toHaveValue('Yeer')
    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(node(window, 2)).toHaveValue('Yeer')
  })

  // @requirement PRODUCT.md §20.2.6
  test('continues Replace in another node when nothing was typed yet', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'abcd', children: [] },
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
    await node(window, 2).click({ position: { x: 1, y: 8 } })
    await window.keyboard.type('Y')

    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
    await expect(editor).toHaveValue('abcd')
    await expect(node(window, 2)).toHaveValue('Yeer')
  })

  // @requirement PRODUCT.md §20.2.6
  test('ends Replace when a press in another node drags a text selection', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'root', text: 'abcd', children: [] },
          { id: 'peer', text: 'peer text here', children: [] },
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
    const box = await node(window, 2).boundingBox()
    if (box === null) throw new Error('The peer node was not rendered.')
    await window.mouse.move(box.x + 2, box.y + box.height / 2)
    await window.mouse.down()
    await window.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 5 })
    await window.mouse.up()

    await expect(editor).toHaveValue('Xbcd')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
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
    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
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
    const nodeList = window.locator('.node-list')
    const nodeListBounds = await nodeList.boundingBox()
    expect(nodeListBounds).not.toBeNull()
    await expect(window).toHaveScreenshot('vim-replace-click-image-caret-light.png', { clip: nodeListBounds! })
    await window.emulateMedia({ colorScheme: 'dark' })
    const darkNodeListBounds = await nodeList.boundingBox()
    expect(darkNodeListBounds).not.toBeNull()
    await expect(window).toHaveScreenshot('vim-replace-click-image-caret-dark.png', { clip: darkNodeListBounds! })
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
    // The undone replacement started at offset 4, which is this node's image character, so the
    // caret lands back on the image the replacement was typed from.
    await expect(editor).toHaveClass(/node-input-image-caret/)
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

  test('commits a pending Replace session before Cmd+V pastes at the typed end', async ({ userDataDir }) => {
    await lockSystemClipboard()
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcd', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 2)
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await expect(editor).toHaveValue('abXd')
    await writeClipboardText(app, 'PASTED')
    // Suppress Chromium's native paste so only the application's command can change the text.
    await window.evaluate(() => {
      document.addEventListener('paste', (event) => event.preventDefault(), true)
    })

    await window.keyboard.press('Meta+v')

    await expect(editor).toHaveValue('abXPASTEDd')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('commits a pending Replace session before the native paste fallback', async ({ userDataDir }) => {
    await lockSystemClipboard()
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcd', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 2)
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await expect(editor).toHaveValue('abXd')
    await writeClipboardText(app, 'PASTED')

    await firePaste(editor)

    await expect(editor).toHaveValue('abXPASTEDd')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('commits a pending Replace session before Cmd+A selects all', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcd', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 2)
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await expect(editor).toHaveValue('abXd')

    await window.keyboard.press('Meta+a')

    // The select-all feedback render must not rewind the committed replacement to the stored text.
    await expect(editor).toHaveValue('abXd')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(editor).toHaveJSProperty('selectionStart', 0)
    await expect(editor).toHaveJSProperty('selectionEnd', 4)
  })

  test('commits a pending Replace session before Cmd+A and Cmd+X cut the visible selection', async ({
    userDataDir,
  }) => {
    await lockSystemClipboard()
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'abcd', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 2)
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await expect(editor).toHaveValue('abXd')
    await window.keyboard.press('Meta+a')
    // Suppress Chromium's native cut so the clipboard payload can only come from the application.
    await window.evaluate(() => {
      document.addEventListener('cut', (event) => event.preventDefault(), true)
    })

    await window.keyboard.press('Meta+x')

    await expect(editor).toHaveValue('')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('abXd')
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

  test('does not record an Insert session interrupted by Enter as repeatable', async ({ userDataDir }) => {
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

  // @requirement PRODUCT.md §20.2.18
  test('adds, changes, and deletes surrounding pairs in Normal mode', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one two three', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 4)
    await lockSystemClipboard()
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
    await pressShifted(window, ')')
    await expect(editor).toHaveValue('one (two) three')

    await setCursor(editor, 5)
    await window.keyboard.press('d')
    await window.keyboard.press('s')
    await pressShifted(window, ')')
    await expect(editor).toHaveValue('one two three')

    // The opening bracket pads the inside; its closing counterpart does not.
    await setCursor(editor, 4)
    await lockSystemClipboard()
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await pressShifted(window, '{')
    await expect(editor).toHaveValue('one { two } three')

    // Deleting with the opening key strips that padding again.
    await setCursor(editor, 6)
    await window.keyboard.press('d')
    await window.keyboard.press('s')
    await pressShifted(window, '{')
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
    await lockSystemClipboard()
    await window.keyboard.press('y')
    await window.keyboard.press('s')
    await window.keyboard.press('s')
    await pressShifted(window, ')')
    await expect(editor).toHaveValue('(alpha beta)')

    await window.keyboard.press('u')
    await expect(editor).toHaveValue('alpha beta')

    await setCursor(editor, 0)
    await lockSystemClipboard()
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

  // @requirement PRODUCT.md §20.2.11
  // @requirement PRODUCT.md §20.2.20
  test('changes case with gu, gU, g~, and Visual ~ around a hyperlink', async ({ userDataDir }) => {
    const url = 'https://example.test/Page'
    const text = `alpha ${url} beta gamma`
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'root',
            text,
            links: [{ start: 6, end: 6 + url.length, url }],
            children: [{ id: 'child', text: 'child', children: [] }],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    const mode = window.getByLabel('Vim mode')

    // Every check also proves the node still has its one link, with its original address.
    const expectText = async (expected: string): Promise<void> => {
      await expect(editor).toHaveText(expected)
      await expect(editor.getByRole('link')).toHaveCount(1)
      await expect(editor.getByRole('link')).toHaveAttribute('href', url)
      await expect(editor.getByRole('link')).toHaveText(url)
    }
    await expectText(text)

    // The whole-node forms rewrite everything around the link and leave its URL text alone.
    await setCursor(editor, 3)
    await window.keyboard.press('g')
    await pressShifted(window, 'U')
    await pressShifted(window, 'U')
    await expectText(`ALPHA ${url} BETA GAMMA`)
    await expect(mode).toHaveText('NORMAL')
    await window.keyboard.press('g')
    await window.keyboard.press('u')
    await window.keyboard.press('u')
    await expectText(text)
    await window.keyboard.press('g')
    await pressShifted(window, '~')
    await pressShifted(window, '~')
    await expectText(`ALPHA ${url} BETA GAMMA`)

    // A motion or a text object covers its own range; each command is one undoable change.
    await window.keyboard.press('u')
    await window.keyboard.press('u')
    await window.keyboard.press('u')
    await expectText(text)
    await setCursor(editor, 0)
    await window.keyboard.press('g')
    await pressShifted(window, 'U')
    await window.keyboard.press('w')
    await expectText(`ALPHA ${url} beta gamma`)
    await setCursor(editor, 2)
    await window.keyboard.press('g')
    await window.keyboard.press('u')
    await window.keyboard.press('i')
    await window.keyboard.press('w')
    await expectText(text)

    // Visual `~` toggles the selection and returns to Normal mode.
    await setCursor(editor, 0)
    await window.keyboard.press('v')
    await window.keyboard.press('e')
    await pressShifted(window, '~')
    await expectText(`ALPHA ${url} beta gamma`)
    await expect(mode).toHaveText('NORMAL')

    // One undo restores the previous text.
    await window.keyboard.press('u')
    await expectText(text)
  })

  // @requirement PRODUCT.md §20.2.13
  test('puts with gp and gP and leaves the caret on the character after the inserted text', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one two', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 4)
    await pressShifted(window, 'Y')
    await setCursor(editor, 0)
    await window.keyboard.press('g')
    await window.keyboard.press('p')
    await expect(editor).toHaveValue('otwone two')
    // The caret is on `n`, the character after the put text, so `x` removes it.
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('otwoe two')
    await window.keyboard.press('u')
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('one two')

    // `P` is typed with Shift after the `g` prefix; the caret lands on the character that followed.
    // The earlier `x` replaced the register, so yank `two` again.
    await setCursor(editor, 4)
    await pressShifted(window, 'Y')
    await setCursor(editor, 0)
    await window.keyboard.press('g')
    await pressShifted(window, 'P')
    await expect(editor).toHaveValue('twoone two')
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('twone two')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  // @requirement PRODUCT.md §20.2.13
  test('selects the node after a gp subtree put, or the last copy when none follows', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'A', children: [{ id: 'a1', text: 'A1', children: [] }] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    const first = node(window, 1)
    await first.focus()

    await lockSystemClipboard()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    // Put on the leaf B, since `p` on A would put the copy into A's own children.
    await node(window, 2).focus()
    await window.keyboard.press('g')
    await window.keyboard.press('p')
    // Folds are closed, so the rows are A, B, the copy of A, and C. C follows the copy and is selected.
    await expect(node(window, 4)).toHaveValue('C')
    await expect(node(window, 4)).toBeFocused()
    await window.keyboard.press('u')
    await expect(node(window, 3)).toHaveValue('C')

    // After the last sibling nothing follows, so the last inserted copy is selected.
    await node(window, 3).focus()
    await window.keyboard.press('2')
    await window.keyboard.press('g')
    await window.keyboard.press('p')
    await expect(node(window, 5)).toHaveValue('A')
    await expect(node(window, 5)).toBeFocused()
  })

  // @requirement PRODUCT.md §20.2.11
  // @requirement PRODUCT.md §20.2.19
  test('yanks to the end of the node with Y without disturbing the repeatable change', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'one two three', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    // `Y` copies from the caret through the end of the text and leaves the text alone.
    await setCursor(editor, 4)
    await pressShifted(window, 'Y')
    await expect(editor).toHaveValue('one two three')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await setCursor(editor, 0)
    await pressShifted(window, 'P')
    await expect(editor).toHaveValue('two threeone two three')
    await window.keyboard.press('u')
    await expect(editor).toHaveValue('one two three')

    // The yank did not replace the saved `x`, so dot still deletes one character.
    await setCursor(editor, 0)
    await window.keyboard.press('x')
    await expect(editor).toHaveValue('ne two three')
    await setCursor(editor, 3)
    await pressShifted(window, 'Y')
    await setCursor(editor, 0)
    await window.keyboard.press('.')
    await expect(editor).toHaveValue('e two three')
  })
})
