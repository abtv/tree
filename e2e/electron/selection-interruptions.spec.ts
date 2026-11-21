// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SAVE_LOCKED_MESSAGE } from '../../src/domain/product-messages'
import {
  allowRendererError,
  attachmentPath,
  blockSaves,
  clickApplicationMenuQuit,
  exactMessage,
  expect,
  fireIdleSave,
  idleSavePoll,
  launchTree,
  node,
  readSaveAttempts,
  restoreSaves,
  seedDocument,
  setCursor,
  test,
} from './fixtures'

test.use({ editingMode: 'vim' })

// @requirement PRODUCT.md §20.2.20
test('continues a rich Visual selection after native window blur', async ({ userDataDir }) => {
  const text = 'alpha\nbeta https://example.com'
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text, links: [{ start: 11, end: text.length, url: 'https://example.com' }], children: [] },
        { id: 'neighbor', text: 'Unaffected neighbor', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  // A visible native window is required; Playwright otherwise emulates an always-focused document.
  // The test therefore needs exclusive macOS activation. Copies that run in parallel compete for
  // it and fail a focus poll, so repeat this test with `--workers=1`. An ordinary run starts one copy.
  const { app, window } = await launchTree(userDataDir, {
    initialMode: 'normal',
    windows: 'visible',
    shortcut: 'stub',
  })
  const nativeFocus = await window.context().newCDPSession(window)
  await nativeFocus.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  const main = await app.browserWindow(window)
  await main.evaluate((browserWindow) => browserWindow.focus())
  await expect.poll(() => window.evaluate(() => document.hasFocus())).toBe(true)
  const editor = node(window, 1)
  await setCursor(editor, 9)
  await window.keyboard.press('v')
  await window.keyboard.press('h')

  // Focusing another native window preserves Chromium's active editor on return. Calling
  // BrowserWindow.blur() directly instead resets native focus to the first focusable control.
  const other = await app.evaluateHandle(({ BrowserWindow }) => {
    const window = new BrowserWindow({ width: 200, height: 100, show: true })
    window.focus()
    return window
  })

  await expect.poll(() => window.evaluate(() => document.hasFocus())).toBe(false)

  await main.evaluate((browserWindow) => browserWindow.focus())
  await expect.poll(() => window.evaluate(() => document.hasFocus())).toBe(true)
  await expect(editor).toBeFocused()
  // Close the test-owned window through the ordinary close path; the application never destroys a second window.
  await other.evaluate(
    (browserWindow) =>
      new Promise<void>((resolve) => {
        browserWindow.once('closed', () => resolve())
        browserWindow.close()
      }),
  )
  await other.dispose()
  await window.keyboard.press('h')

  expect(await window.evaluate(() => getSelection()?.toString())).toBe('eta')

  await window.keyboard.press('d')

  await expect(editor).toHaveText('alpha\nb https://example.com')

  await window.keyboard.press('u')

  await expect(editor).toHaveText(text)
  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com')
})

// @requirement PRODUCT.md §17.1
// @requirement PRODUCT.md §20.2.20
test('continues a rich Visual selection after keyboard and pointer preview round trips @linux', async ({
  userDataDir,
}) => {
  const text = 'alpha\nbeta https://example.com'
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'one',
          text,
          links: [{ start: 11, end: text.length, url: 'https://example.com' }],
          attachment: { id: 'preview-image', mimeType: 'image/png' },
          children: [],
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(
    attachmentPath(userDataDir, 'preview-image'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAABmklEQVR4nO3TMRHAIADAQOSgqYpxBQZ6WWH44fcsGfNbG/g3bgfAywwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAOQJHaVsxH0sYAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)

  for (const pointer of [false, true]) {
    await editor.focus()
    await window.keyboard.press('0')
    await setCursor(editor, pointer ? 9 : 7)
    await window.keyboard.press('v')
    await window.keyboard.press(pointer ? 'h' : 'l')

    if (pointer) await window.getByRole('button', { name: 'Open image preview' }).click()
    else await window.keyboard.press('Meta+y')

    await expect(window.getByRole('button', { name: 'Close image preview' })).toBeFocused()

    if (pointer) await window.getByRole('button', { name: 'Close image preview' }).click()
    else await window.keyboard.press('Escape')
    await window.keyboard.press(pointer ? 'h' : 'l')

    await expect(editor).toBeFocused()
    expect(await window.evaluate(() => getSelection()?.toString())).toBe('eta')

    await window.keyboard.press('d')

    await expect(editor).toHaveText('alpha\nb https://example.com')

    await window.keyboard.press('u')

    await expect(editor).toHaveText(text)
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com')
  }
})

// @requirement PRODUCT.md §16.2
// @requirement PRODUCT.md §20.2.20
test('continues Visual motions after canceling quit confirmation @linux', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'alpha beta', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  allowRendererError(/^Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked$/)
  allowRendererError(/^Operation failed: Error invoking remote method 'tree:save': Error: save blocked$/)
  allowRendererError(exactMessage(SAVE_LOCKED_MESSAGE))
  await window.clock.install()
  await blockSaves(app, { countAttempts: true })
  const editor = node(window, 1)
  await window.keyboard.press('A')
  await window.keyboard.type('!')
  await window.keyboard.press('Escape')
  for (let attempt = 1; attempt <= 3; attempt++) {
    await fireIdleSave(window)
    await expect.poll(() => readSaveAttempts(app), idleSavePoll).toBe(attempt)
  }
  await expect(window.getByText(SAVE_LOCKED_MESSAGE, { exact: true })).toBeVisible()

  for (const escape of [false, true]) {
    await setCursor(editor, 1)
    await window.keyboard.press('v')
    await window.keyboard.press('l')
    await clickApplicationMenuQuit(app)

    await expect(window.getByRole('alertdialog', { name: 'Quit without saving' })).toBeVisible()

    if (escape) await window.keyboard.press('Escape')
    else await window.getByRole('button', { name: 'Cancel', exact: true }).click()
    await window.keyboard.press('l')

    await expect(editor).toBeFocused()
    expect(
      await editor.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return input.value.slice(input.selectionStart, input.selectionEnd)
      }),
    ).toBe('lph')

    await window.keyboard.press('Escape')
  }

  await restoreSaves(app)
})
