import { expect, launchTree, node, setCursor, test, typeInto } from './fixtures'

test.describe('Vim editing prototype', () => {
  test('switches modes and applies Normal-mode motions and edits', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await typeInto(editor, 'one two')
    await setCursor(editor, 0)
    await window.keyboard.press('Escape')
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
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

  test('yanks a Visual selection and puts it from the local register', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

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
