import { expect, firePaste, launchTree, node, seedDocument, setCursor, test, writeClipboardText } from './fixtures'

test.describe('external hyperlinks', () => {
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
    await expect(link).toHaveCSS('color', 'rgb(23, 105, 170)')
    await setCursor(editor, url.length)
    await editor.press('/')
    await editor.press('a')
    await expect(editor.getByRole('link', { name: `${url}/a` })).toHaveAttribute('href', `${url}/a`)
    await editor.screenshot({ path: testInfo.outputPath('editable-link-light.png') })
    await expect(editor).toHaveScreenshot('editable-link-insert-light.png')
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(editor.getByRole('link')).toHaveCSS('color', 'rgb(115, 183, 255)')
    await editor.screenshot({ path: testInfo.outputPath('editable-link-dark.png') })
    await expect(editor).toHaveScreenshot('editable-link-insert-dark.png')
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
