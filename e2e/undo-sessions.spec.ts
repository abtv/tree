// @editing-modes: both
import {
  configureHiddenParallelTests,
  describeForEachEditingMode,
  expect,
  firePaste,
  launchTree,
  node,
  test,
  typeInto,
  writeClipboardText,
} from './fixtures'

describeForEachEditingMode('text edit sessions', () => {
  configureHiddenParallelTests()

  test('starts a new undo entry after five seconds without a text change', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'first')
    await window.waitForTimeout(5_200)
    await typeInto(node(window, 1), ' second')
    await expect(node(window, 1)).toHaveValue('first second')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('first')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('')
  })

  test('ends the edit session on cursor movement, paste, and structural commands', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    // An explicit cursor move separates the following edit from the previous session.
    await typeInto(node(window, 1), 'ab')
    await window.keyboard.press('ArrowLeft')
    await typeInto(node(window, 1), 'X')
    await expect(node(window, 1)).toHaveValue('aXb')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('ab')
    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('')

    // Paste is recorded separately from the preceding typing session.
    await typeInto(node(window, 1), 'ab')
    await window.keyboard.press('End')
    await writeClipboardText(app, 'Z')
    await firePaste(node(window, 1))
    await expect(node(window, 1)).toHaveValue('abZ')
    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('ab')

    // A structural command is recorded separately from the text-editing session.
    await window.keyboard.press('Enter')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    await window.keyboard.press('Meta+z')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('ab')
    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('')
  })

  test('ends the edit session when focus switches to another node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'ab')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'cd')
    await window.keyboard.press('ArrowUp')
    await expect(node(window, 1)).toBeFocused()

    await typeInto(node(window, 1), 'X')
    await expect(node(window, 1)).toHaveValue('abX')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('ab')
    await expect(node(window, 2)).toHaveValue('cd')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 2)).toHaveValue('')
  })
})

test.describe('Escape in standard editing', () => {
  test.use({ editingMode: 'standard' })

  test('leaves the text, caret, selection, and undo grouping unchanged', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const selection = () =>
      editor.evaluate((element) => [
        (element as HTMLTextAreaElement).selectionStart,
        (element as HTMLTextAreaElement).selectionEnd,
      ])

    await typeInto(editor, 'ab')
    await window.keyboard.press('ArrowLeft')
    await window.keyboard.press('Escape')
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue('ab')
    expect(await selection()).toEqual([1, 1])

    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Escape')
    await expect(editor).toBeFocused()
    expect(await selection()).toEqual([0, 2])

    // Escape does not end the text session, so the edits before and after it undo together.
    await window.keyboard.press('End')
    await window.keyboard.type('c')
    await window.keyboard.press('Escape')
    await window.keyboard.type('d')
    await expect(editor).toHaveValue('abcd')
    await window.keyboard.press('Meta+z')
    await expect(editor).toHaveValue('ab')
  })
})
