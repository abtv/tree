import { expect, firePaste, launchTree, node, test, writeClipboardText } from './fixtures'

test.describe('external hyperlinks', () => {
  test('opens a pasted hyperlink through the main process without navigating the application', async ({
    userDataDir,
  }) => {
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

    await expect
      .poll(() => app.evaluate(() => (globalThis as { __openedUrls?: string[] }).__openedUrls ?? []))
      .toEqual(['https://example.com/'])
    expect(window.url()).toBe(initialUrl)
  })
})
