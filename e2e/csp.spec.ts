// @editing-modes: independent
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
    expect(policy).toContain("frame-src 'none'")
    expect(policy).toContain("child-src 'none'")
    expect(policy).toContain("worker-src 'none'")
    expect(policy).toContain("media-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")

    const violations: string[] = []
    window.on('console', (message) => {
      if (/frame-ancestors.+ignored when delivered via a <meta> element/i.test(message.text())) return
      if (/Content Security Policy|Refused to (load|execute|apply)/i.test(message.text())) {
        violations.push(message.text())
      }
    })

    await window.reload()
    await expect(window.locator('main.tree-app')).toBeVisible()

    expect(violations).toEqual([])
  })

  test('blocks an iframe from navigating to an external origin', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    const blockedUri = await window.evaluate(async () => {
      const policyViolation = new Promise<string>((resolve) => {
        document.addEventListener('securitypolicyviolation', (event) => resolve(event.blockedURI), { once: true })
      })
      const frame = document.createElement('iframe')
      frame.src = 'https://example.com/'
      document.body.append(frame)
      return Promise.race([
        policyViolation,
        new Promise<string>((resolve) => setTimeout(() => resolve('no policy violation'), 5000)),
      ])
    })

    expect(blockedUri).toBe('https://example.com/')
    await expect(node(window, 1)).toBeVisible()
  })

  test('blocks navigation away from the application renderer', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const initialUrl = window.url()

    await app.evaluate(({ BrowserWindow }) => {
      const webContents = BrowserWindow.getAllWindows()[0]?.webContents
      if (webContents === undefined) throw new Error('The main window is unavailable.')
      const control = globalThis as typeof globalThis & { __navigationPrevented?: boolean }
      webContents.once('will-frame-navigate', (event) => {
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
