import {
  attachmentFiles,
  expect,
  firePaste,
  launchTree,
  node,
  nodeTexts,
  setCursor,
  test,
  typeInto,
  writeClipboardImage,
  writeClipboardImageAndText,
  writeClipboardText,
} from './fixtures'

test.describe('clipboard', () => {
  test('pastes plain text at the cursor', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'abcdef')
    await setCursor(node(window, 1), 3)
    await writeClipboardText(app, 'XYZ')
    await firePaste(node(window, 1))

    await expect(node(window, 1)).toHaveValue('abcXYZdef')
  })

  test('pastes an HTTP URL as a clickable hyperlink', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardText(app, 'https://example.com')
    await firePaste(node(window, 1))

    const link = window.getByRole('link', { name: 'https://example.com' })
    await expect(link).toHaveAttribute('href', 'https://example.com')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(node(window, 1)).toHaveCSS('cursor', 'text')
    await expect(link).toHaveCSS('cursor', 'pointer')
  })

  test('keeps adjacent pasted URLs as separate links', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await writeClipboardText(app, 'https://one.example')
    await firePaste(editor)
    await writeClipboardText(app, 'https://two.example')
    await firePaste(editor)

    await expect(window.getByRole('link')).toHaveCount(2)
    await expect(editor).toContainText('https://one.examplehttps://two.example')
  })

  test('creates links for valid URLs in multiline paste', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardText(app, 'https://one.example\nhttps://two.example')
    await firePaste(node(window, 1))

    await expect(window.getByRole('link')).toHaveCount(2)
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
  })

  test('cuts a hyperlink and pastes it into another node with its link preserved', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const first = node(window, 1)

    await first.pressSequentially('See ')
    await writeClipboardText(app, 'https://example.com')
    await firePaste(first)
    await expect(window.getByRole('link', { name: 'https://example.com' })).toHaveCount(1)
    await first.focus()
    await first.press('End')
    await first.pressSequentially(' now')
    await expect(first).toContainText('See https://example.com now')
    await window.keyboard.press('Meta+a')
    await expect(first).toHaveClass(/select-all/)
    await window.keyboard.press('Meta+x')
    await expect(window.getByRole('link')).toHaveCount(0)

    await node(window, 1).focus()
    await window.keyboard.press('Enter')
    await firePaste(node(window, 1))

    await expect(node(window, 1)).toContainText('See https://example.com now')
    await expect(window.getByRole('link', { name: 'https://example.com' })).toHaveCount(1)
  })

  test('copies a hyperlink and pastes it into another node with its link preserved', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const first = node(window, 1)

    await first.pressSequentially('See ')
    await writeClipboardText(app, 'https://example.com')
    await firePaste(first)
    await expect(window.getByRole('link', { name: 'https://example.com' })).toHaveCount(1)
    await first.focus()
    await first.press('End')
    await first.pressSequentially(' now')
    await expect(first).toContainText('See https://example.com now')
    await window.keyboard.press('Meta+a')
    await expect(first).toHaveClass(/select-all/)
    await window.keyboard.press('Meta+c')

    await first.focus()
    await first.press('End')
    await window.keyboard.press('Enter')
    await firePaste(node(window, 2))

    await expect(node(window, 2)).toContainText('See https://example.com now')
    await expect(node(window, 1)).toContainText('See https://example.com now')
    await expect(window.getByRole('link', { name: 'https://example.com' })).toHaveCount(2)
  })

  test('keeps the editor writable after a hyperlink is pasted', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardText(app, 'https://example.com')
    const editor = node(window, 1)
    await firePaste(editor)
    await editor.press('End')
    await editor.press('x')

    await expect(editor).toContainText('https://example.comx')
  })

  test('removes the whole hyperlink with Backspace at its end', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardText(app, 'https://example.com')
    const editor = node(window, 1)
    await firePaste(editor)
    await editor.press('Backspace')

    await expect(editor).toHaveText('')
    await expect(window.getByRole('link')).toHaveCount(0)
  })

  test('places the caret before following text after removing a hyperlink', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    const editor = node(window, 1)
    await typeInto(editor, 'A')
    await setCursor(editor, 1)
    await writeClipboardText(app, 'https://example.com')
    await firePaste(editor)
    await writeClipboardText(app, 'B')
    await firePaste(editor)
    await setCursor(editor, 20)
    await editor.press('Backspace')
    await editor.press('x')

    await expect(editor).toHaveText('AxB')
  })

  test('pastes multiline text as separate nodes', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'abcdef')
    await setCursor(node(window, 1), 3)
    await writeClipboardText(app, 'one\ntwo\nthree')
    await firePaste(node(window, 1))

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(3)
    expect(await nodeTexts(window)).toEqual(['abcone', 'two', 'threedef'])
  })

  test('pastes an image as an attachment', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImage(app)
    await firePaste(node(window, 1))

    await expect(window.getByAltText('Attached image')).toBeVisible()
    await expect(node(window, 1)).toHaveValue('')
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(1)
  })

  test('prefers the image representation over text', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageAndText(app)
    await firePaste(node(window, 1))

    await expect(window.getByAltText('Attached image')).toBeVisible()
    await expect(node(window, 1)).toHaveValue('')
  })

  test('pasting an image onto a node that already has one creates a sibling', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImage(app)
    await firePaste(node(window, 1))
    await expect(window.getByAltText('Attached image')).toHaveCount(1)

    await firePaste(node(window, 1))
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    await expect(window.getByAltText('Attached image')).toHaveCount(2)
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(2)
  })
})
