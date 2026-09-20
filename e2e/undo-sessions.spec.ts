import {
  configureHiddenParallelTests,
  expect,
  firePaste,
  launchTree,
  node,
  test,
  typeInto,
  writeClipboardText,
} from './fixtures'

test.describe('text edit sessions', () => {
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
