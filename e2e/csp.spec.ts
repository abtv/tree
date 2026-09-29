import { expect, launchTree, node, test, typeInto } from './fixtures'

test.describe('content security policy', () => {
  test('is present and does not block application resources', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    const policy = await window.evaluate(
      () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '',
    )
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("img-src 'self' blob: data:")
    expect(policy).toContain("object-src 'none'")

    const violations: string[] = []
    window.on('console', (message) => {
      if (/Content Security Policy|Refused to (load|execute|apply)/i.test(message.text())) {
        violations.push(message.text())
      }
    })

    await window.reload()
    await expect(window.locator('main.tree-app')).toBeVisible()

    expect(violations).toEqual([])
  })

  test('blocks navigation away from the application renderer', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const initialUrl = window.url()

    await app.evaluate(({ BrowserWindow }) => {
      const webContents = BrowserWindow.getAllWindows()[0]?.webContents
      if (webContents === undefined) throw new Error('The main window is unavailable.')
      const control = globalThis as typeof globalThis & { __navigationPrevented?: boolean }
      webContents.once('will-navigate', (event) => {
        control.__navigationPrevented = event.defaultPrevented
      })
    })

    await window.evaluate(() => {
      document.location.href = 'https://example.com/'
    })
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as typeof globalThis & { __navigationPrevented?: boolean }).__navigationPrevented,
        ),
      )
      .toBe(true)

    expect(window.url()).toBe(initialUrl)
  })

  test('blocks external renderer requests while the editor remains usable', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    const result = await app.evaluate(async ({ BrowserWindow, session }) => {
      const probe = new BrowserWindow({
        show: false,
        webPreferences: {
          session: session.defaultSession,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      const requestError = new Promise<string>((resolve) => {
        session.defaultSession.webRequest.onErrorOccurred({ urls: ['https://example.com/*'] }, (details) => {
          resolve(details.error)
        })
      })

      try {
        await probe.loadURL('data:text/html,<title>request-probe</title>')
        const requestResult = await probe.webContents.executeJavaScript(
          "fetch('https://example.com/', { mode: 'no-cors' }).then(() => 'loaded', () => 'rejected')",
        )
        const error = await Promise.race([
          requestError,
          new Promise<string>((resolve) => setTimeout(() => resolve('no request error event'), 5000)),
        ])
        return { requestResult, error }
      } finally {
        session.defaultSession.webRequest.onErrorOccurred({ urls: ['https://example.com/*'] }, null)
        probe.destroy()
      }
    })

    expect(result).toEqual({ requestResult: 'rejected', error: 'net::ERR_BLOCKED_BY_CLIENT' })

    const editor = node(window, 1)
    await typeInto(editor, 'Still editable')
    await expect(editor).toHaveValue('Still editable')
  })
})
