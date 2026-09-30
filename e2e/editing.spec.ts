import {
  expect,
  firePaste,
  launchTree,
  lockSystemClipboard,
  node,
  parent,
  setCursor,
  test,
  typeInto,
  writeClipboardText,
} from './fixtures'

test.describe('creating nodes with Enter', () => {
  test('Cmd+A selects all text in a link-free node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await typeInto(editor, 'Plain text')
    await window.keyboard.press('Meta+a')

    await expect
      .poll(() =>
        editor.evaluate((element) => [
          (element as HTMLTextAreaElement).selectionStart,
          (element as HTMLTextAreaElement).selectionEnd,
        ]),
      )
      .toEqual([0, 10])
  })

  test('Cmd+A and Cmd+C copy all text from a link-free node', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await lockSystemClipboard()
    const source = node(window, 1)

    await typeInto(source, 'Plain text')
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Meta+c')
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await firePaste(node(window, 2))

    await expect(node(window, 2)).toHaveValue('Plain text')
    await app.close()
  })

  test('Cmd+A and Cmd+C copy all text without the browser copy command', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const source = node(window, 1)

    await typeInto(source, 'Plain text')
    await writeClipboardText(app, 'sentinel')
    await window.evaluate(() => {
      document.addEventListener('copy', (event) => event.preventDefault(), true)
    })
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Meta+c')

    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Plain text')
  })

  test('Cmd+A and Cmd+X cut all text without the browser cut command', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await typeInto(editor, 'Plain text')
    await writeClipboardText(app, 'sentinel')
    await window.evaluate(() => {
      document.addEventListener(
        'cut',
        (event) => {
          event.preventDefault()
          event.stopImmediatePropagation()
        },
        true,
      )
    })
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Meta+x')

    await expect(editor).toHaveValue('')
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Plain text')
  })

  test('keeps plain text selected after Cmd+C', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await lockSystemClipboard()
    const editor = node(window, 1)

    await typeInto(editor, 'aaa')
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Meta+c')

    await expect
      .poll(() =>
        editor.evaluate((element) => [
          (element as HTMLTextAreaElement).selectionStart,
          (element as HTMLTextAreaElement).selectionEnd,
        ]),
      )
      .toEqual([0, 3])
  })

  test('Cmd+V pastes clipboard text without the browser paste command', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await writeClipboardText(app, 'Plain text')
    await window.evaluate(() => {
      document.addEventListener(
        'paste',
        (event) => {
          event.preventDefault()
          event.stopImmediatePropagation()
        },
        true,
      )
    })
    await window.keyboard.press('Meta+v')

    await expect(editor).toHaveValue('Plain text')
  })

  test('pastes copied plain text with Cmd+V after typing in the target node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await lockSystemClipboard()
    const source = node(window, 1)

    await typeInto(source, 'Plain text')
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Meta+c')
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await window.keyboard.type(' ')
    await window.keyboard.press('Meta+v')

    await expect(node(window, 2)).toHaveValue(' Plain text')
  })

  test('pastes copied plain text after typing a space in the copied node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    await lockSystemClipboard()
    const editor = node(window, 1)

    await typeInto(editor, 'Plain text')
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Meta+c')
    await window.keyboard.type(' ')
    await window.keyboard.press('Meta+v')

    await expect(editor).toHaveValue(' Plain text')
  })

  test('Enter at the end creates an empty sibling after the node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toHaveValue('Current')
    await expect(node(window, 2)).toHaveValue('')
    await expect(node(window, 2)).toBeFocused()
    expect(await node(window, 2).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
    await typeInto(node(window, 2), 'Next')
    await expect(node(window, 1)).toHaveValue('Current')
    await expect(node(window, 2)).toHaveValue('Next')
  })

  test('pressing Enter twice creates successive siblings after the current node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await window.keyboard.press('Enter')
    await window.keyboard.press('Enter')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(3)
    await expect(node(window, 1)).toHaveValue('Current')
    await expect(node(window, 2)).toHaveValue('')
    await expect(node(window, 3)).toHaveValue('')
    await expect(node(window, 3)).toBeFocused()
    expect(await node(window, 3).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
  })

  test('Enter at the end of a linked node focuses the new sibling', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardText(app, 'https://example.com')
    await firePaste(node(window, 1))
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toContainText('https://example.com')
    await expect(node(window, 2)).toHaveValue('')
    await expect(node(window, 2)).toBeFocused()
    expect(await node(window, 2).evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
    await typeInto(node(window, 2), 'Next')
    await expect(node(window, 1)).toContainText('https://example.com')
    await expect(node(window, 2)).toHaveValue('Next')
  })

  test('Enter at the beginning creates an empty sibling before the node', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 2)).toHaveValue('Current')
    await expect(node(window, 1)).toBeFocused()
  })

  test('Enter at the beginning preserves the selected node subtree', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Child')
    await window.keyboard.press('Meta+,')
    await setCursor(node(window, 1), 0)
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 2)).toHaveValue('Current')
    await window.getByRole('button', { name: 'Enter node 2' }).click()
    await expect(parent(window)).toHaveValue('Current')
    await expect(node(window, 1)).toHaveValue('Child')
  })

  // @requirement PRODUCT.md §5.1
  test('Enter in the middle splits the text at the cursor', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await setCursor(node(window, 1), 3)
    await window.keyboard.press('Enter')

    await expect(node(window, 1)).toHaveValue('Cur')
    await expect(node(window, 2)).toHaveValue('rent')
    await expect(node(window, 2)).toBeFocused()
  })
})
