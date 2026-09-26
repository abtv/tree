import type { ElectronApplication } from '@playwright/test'
import {
  allowRendererError,
  attachmentFiles,
  clickApplicationMenuQuit,
  expect,
  firePaste,
  launchTree,
  lockSystemClipboard,
  node,
  nodeTexts,
  readPersisted,
  setCursor,
  test,
  typeInto,
  writeClipboardImage,
  writeClipboardImageAndText,
  writeClipboardText,
} from './fixtures'

// Wrap the registered handler so a delayed write still exercises the real
// validation and native clipboard path. Injection is confined to the owned test app.
async function holdClipboardWrite(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const control = globalThis as typeof globalThis & { clipboardStarted?: boolean; releaseClipboard?: () => void }
    const gate = new Promise<void>((resolve) => {
      control.releaseClipboard = resolve
    })
    globalThis.__treeIpc.wrap('tree:write-clipboard', async (original, ...args) => {
      control.clipboardStarted = true
      await gate
      return original(...args)
    })
  })
}

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
    await expect(node(window, 1)).toHaveCSS('cursor', 'pointer')
    await expect(link).toHaveCSS('cursor', 'text')
    await window.keyboard.down('Meta')
    await expect(link).toHaveCSS('cursor', 'pointer')
    await window.keyboard.up('Meta')
    await expect(link).toHaveCSS('cursor', 'text')
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
    await firePaste(node(window, 2))

    await expect(node(window, 2)).toContainText('See https://example.com now')
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

  test('selects linked characters with the mouse', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)

    await editor.pressSequentially('see ')
    await writeClipboardText(app, 'https://example.com')
    await firePaste(editor)
    const link = window.getByRole('link', { name: 'https://example.com' })
    await expect(link).toHaveCount(1)

    await editor.click()
    const points = await editor.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rects = range.getClientRects()
      const first = rects[0]!
      const last = rects[rects.length - 1]!
      return {
        startX: first.left + 1,
        startY: first.top + first.height / 2,
        endX: last.right - 1,
        endY: last.top + last.height / 2,
      }
    })
    await window.mouse.move(points.startX, points.startY)
    await window.mouse.down()
    await window.mouse.move(points.endX, points.endY, { steps: 10 })
    await window.mouse.up()

    expect(await editor.evaluate((element) => element.ownerDocument.defaultView?.getSelection()?.toString())).toContain(
      'https://example.co',
    )
    await expect(link).not.toHaveClass(/link-selected/)
  })

  test('removes one linked character with Backspace at its end', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardText(app, 'https://example.com')
    const editor = node(window, 1)
    await firePaste(editor)
    await editor.press('Backspace')

    await expect(editor).toHaveText('https://example.co')
    await expect(window.getByRole('link', { name: 'https://example.co' })).toHaveAttribute('href', 'https://example.co')
  })

  test('keeps the caret within a hyperlink while editing before following text', async ({ userDataDir }) => {
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

    await expect(editor).toHaveText('Ahttps://example.coxB')
    await expect(window.getByRole('link', { name: 'https://example.cox' })).toHaveAttribute(
      'href',
      'https://example.cox',
    )
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

  test('cancels a cut when the node changes during the clipboard write', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await lockSystemClipboard()
    allowRendererError(/^Operation failed: The cut could not finish because the text changed\.$/)
    const editor = node(window, 1)

    await typeInto(editor, 'abc')
    await editor.evaluate((element) => {
      const field = element as HTMLTextAreaElement
      field.focus()
      field.setSelectionRange(1, 2)
    })
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
    await holdClipboardWrite(app)
    await window.keyboard.press('Meta+x')
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as typeof globalThis & { clipboardStarted?: boolean }).clipboardStarted),
      )
      .toBe(true)

    await setCursor(editor, 0)
    await editor.pressSequentially('X')
    await expect(editor).toHaveValue('Xabc')

    await app.evaluate(() => (globalThis as typeof globalThis & { releaseClipboard?: () => void }).releaseClipboard?.())
    await expect(editor).toHaveValue('Xabc')
    await expect(window.getByText('Operation failed: The cut could not finish because the text changed.')).toBeVisible()
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('b')

    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Xabc')
  })
})
