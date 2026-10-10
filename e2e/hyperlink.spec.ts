// @editing-modes: both
import {
  closeApp,
  describeForEachEditingMode,
  expect,
  firePaste,
  launchTree,
  node,
  readPersisted,
  seedDocument,
  setCursor,
  test,
  typeInto,
  writeClipboardText,
} from './fixtures'

describeForEachEditingMode('external hyperlinks', ({ screenshotName }) => {
  test('edits linked characters with immediate styling and destination updates', async ({ userDataDir }, testInfo) => {
    const url = 'https://example.com'
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: url, links: [{ start: 0, end: url.length, url }], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 2)
    await editor.press('Backspace')
    await expect(editor).toHaveText('htps://example.com')
    await expect(editor.getByRole('link')).toHaveCount(0)
    await expect(editor).toHaveAttribute('contenteditable', 'true')
    await editor.screenshot({ path: testInfo.outputPath('invalid-link-light.png') })

    await editor.press('t')
    const link = editor.getByRole('link', { name: url })
    await expect(link).toHaveAttribute('href', url)
    await expect(link).toHaveCSS('text-decoration-line', 'underline')
    await expect(link).toHaveCSS('color', 'rgb(58, 110, 165)')
    await setCursor(editor, url.length)
    await editor.press('/')
    await editor.press('a')
    await expect(editor.getByRole('link', { name: `${url}/a` })).toHaveAttribute('href', `${url}/a`)
    await editor.screenshot({ path: testInfo.outputPath('editable-link-light.png') })
    await expect(editor).toHaveScreenshot(screenshotName('editable-link-insert-light.png'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(editor.getByRole('link')).toHaveCSS('color', 'rgb(140, 208, 211)')
    await editor.screenshot({ path: testInfo.outputPath('editable-link-dark.png') })
    await expect(editor).toHaveScreenshot(screenshotName('editable-link-insert-dark.png'))
  })

  test('restores a corrected link beside plain text without linking its neighbors', async ({ userDataDir }) => {
    const url = 'https://example.com'
    const text = `A${url}B`
    seedDocument(userDataDir, {
      document: {
        roots: [{ id: 'root', text, links: [{ start: 1, end: 1 + url.length, url }], children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await setCursor(editor, 3)
    await editor.press('Backspace')
    await expect(editor.getByRole('link')).toHaveCount(0)
    await editor.press('t')
    await expect(editor.getByRole('link', { name: url })).toHaveAttribute('href', url)
    await expect(editor).toHaveText(text)
  })

  // @requirement PRODUCT.md §13
  test('turns a typed URL into a link while typing and follows later edits', async ({ userDataDir }, testInfo) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: '', links: [], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await typeInto(editor, 'see http://www.google.com test')
    await expect(editor).toHaveText('see http://www.google.com test')
    const link = editor.getByRole('link')
    await expect(link).toHaveCount(1)
    await expect(link).toHaveText('http://www.google.com')
    await expect(link).toHaveAttribute('href', 'http://www.google.com')
    await expect(link).toHaveCSS('text-decoration-line', 'underline')
    await expect(link).toHaveCSS('color', 'rgb(58, 110, 165)')
    await expect(editor).toBeFocused()
    await editor.screenshot({ path: testInfo.outputPath('typed-link-light.png') })

    // Editing the link into an invalid URL removes the link styling at once.
    await setCursor(editor, 'see http:'.length)
    await editor.press('Backspace')
    await expect(editor).toHaveText('see http//www.google.com test')
    await expect(editor.getByRole('link')).toHaveCount(0)

    // Typing the missing character back restores it.
    await editor.press(':')
    await expect(editor).toHaveText('see http://www.google.com test')
    await expect(editor.getByRole('link')).toHaveText('http://www.google.com')
    await editor.screenshot({ path: testInfo.outputPath('restored-link-light.png') })
    // Link edits save on the idle and quit triggers (PRODUCT.md §13), so quit to flush them.
    await closeApp(app)
    expect(readPersisted(userDataDir).document.roots[0]?.links).toEqual([
      { start: 4, end: 25, url: 'http://www.google.com' },
    ])
  })

  // @requirement PRODUCT.md §13
  test('keeps the link of a URL typed in front of an existing word once a space follows', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'ab cd', links: [], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await typeInto(editor, '')
    await setCursor(editor, 3)
    await editor.pressSequentially('http://x.com')
    // Before the space the URL and the following word are one word, so the whole word is the link.
    await expect(editor.getByRole('link')).toHaveText('http://x.comcd')
    await editor.pressSequentially(' Z')
    await expect(editor).toHaveText('ab http://x.com Zcd')
    await expect(editor.getByRole('link')).toHaveCount(1)
    await expect(editor.getByRole('link')).toHaveText('http://x.com')
    await expect(editor).toBeFocused()
  })

  // @requirement PRODUCT.md §13
  test('keeps typing in the next node after a URL is typed and Enter creates a sibling', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: '', links: [], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    await typeInto(node(window, 1), 'http://x.com')
    await node(window, 1).press('Enter')
    await window.keyboard.type('next http://y.org')
    await expect(node(window, 1)).toHaveText('http://x.com')
    await expect(node(window, 1).getByRole('link')).toHaveCount(1)
    await expect(node(window, 2)).toHaveText('next http://y.org')
    await expect(node(window, 2).getByRole('link')).toHaveCount(1)
    await expect(node(window, 2)).toBeFocused()
  })

  test('keeps every character when a URL typed at speed becomes a link', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: '', links: [], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    const text = 'http://localhost:8080/path?q=1 and https://example.com/a/b done'
    await typeInto(editor, text)
    await expect(editor).toHaveText(text)
    await expect(editor.getByRole('link')).toHaveCount(2)
  })

  test('edits on plain click and opens on Cmd+click through the main process', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await app.evaluate(({ shell }) => {
      const control = globalThis as typeof globalThis & { __openedUrls?: string[] }
      control.__openedUrls = []
      shell.openExternal = async (url: string): Promise<void> => {
        control.__openedUrls!.push(url)
      }
    })

    await writeClipboardText(app, 'https://example.com')
    await firePaste(node(window, 1))
    const initialUrl = window.url()

    await window.getByRole('link', { name: 'https://example.com' }).click()
    await expect(node(window, 1)).toBeFocused()
    expect(await app.evaluate(() => (globalThis as { __openedUrls?: string[] }).__openedUrls ?? [])).toEqual([])
    await window.getByRole('link', { name: 'https://example.com' }).click({ modifiers: ['Meta'] })

    await expect
      .poll(() => app.evaluate(() => (globalThis as { __openedUrls?: string[] }).__openedUrls ?? []))
      .toEqual(['https://example.com/'])
    expect(window.url()).toBe(initialUrl)
  })
})

test.describe('external hyperlinks (mode-independent)', () => {
  test('drops a link when pasted text makes its covered text invalid', async ({ userDataDir }, testInfo) => {
    const url = 'https://example.com'
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: url, links: [{ start: 0, end: url.length, url }], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 5)
    await writeClipboardText(app, 'XYZ')
    await firePaste(editor)

    await expect(editor).toHaveText('httpsXYZ://example.com')
    await expect(editor.getByRole('link')).toHaveCount(0)
    await expect(editor).toHaveAttribute('contenteditable', 'true')
    await editor.screenshot({ path: testInfo.outputPath('paste-inside-link-invalid-light.png') })
  })

  test('recomputes the destination when pasted text keeps the covered text a valid URL', async ({
    userDataDir,
  }, testInfo) => {
    const url = 'https://example.com'
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: url, links: [{ start: 0, end: url.length, url }], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await editor.focus()

    await setCursor(editor, 15)
    await writeClipboardText(app, 'x')
    await firePaste(editor)

    await expect(editor).toHaveText('https://examplex.com')
    const link = editor.getByRole('link', { name: 'https://examplex.com' })
    await expect(link).toHaveAttribute('href', 'https://examplex.com')
    await expect(link).toHaveCSS('text-decoration-line', 'underline')
    await editor.screenshot({ path: testInfo.outputPath('paste-inside-link-valid-light.png') })
  })
})

test.describe('external hyperlinks (Vim editing only)', () => {
  // @requirement PRODUCT.md §20.2.12
  test('opens the hyperlink under the Normal-mode caret with Enter', async ({ userDataDir }) => {
    const url = 'https://example.com/page'
    const text = `A${url}B`
    const link = { start: 1, end: 1 + url.length, url }
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text, links: [link], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    // Normal mode is the editor's real startup state; most other E2E tests opt into an
    // Insert-mode session instead, so this test asks for the default explicitly.
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', vimPreference: true })
    await app.evaluate(({ shell }) => {
      const control = globalThis as typeof globalThis & { __openedUrls?: string[] }
      control.__openedUrls = []
      shell.openExternal = async (openedUrl: string): Promise<void> => {
        control.__openedUrls!.push(openedUrl)
      }
    })
    const editor = node(window, 1)
    await expect(editor).toHaveCSS('cursor', 'default')
    const openedUrls = () => app.evaluate(() => (globalThis as { __openedUrls?: string[] }).__openedUrls ?? [])

    // Adjacent-before ("A", index 0): no link there, Enter does nothing.
    await setCursor(editor, 0)
    await window.keyboard.press('Enter')
    await expect.poll(openedUrls).toEqual([])

    // First character of the link.
    await setCursor(editor, link.start)
    await window.keyboard.press('Enter')
    await expect.poll(openedUrls).toEqual([url])

    // Last character of the link.
    await setCursor(editor, link.end - 1)
    await window.keyboard.press('Enter')
    await expect.poll(openedUrls).toEqual([url, url])

    // Adjacent-after ("B", index link.end): no link there, Enter does nothing.
    await setCursor(editor, link.end)
    await window.keyboard.press('Enter')
    await expect.poll(openedUrls).toEqual([url, url])
  })
})
