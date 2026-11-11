// @editing-modes: independent
import { test, _electron as electron, chromium, expect } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { browserEditing, happyPath, type SmokeDriver } from './scenario.mts'
import { createStaticServer } from '../../scripts/web/static-server.mts'
import { clickApplicationMenuItem, clickApplicationMenuQuit, closeApp } from '../electron/fixtures.ts'
import { imageToTextSmoke } from './image-to-text.mts'

test('edits, undoes, navigates, persists and searches Tree and Agenda', async ({ playwright }, testInfo) => {
  async function phase<T>(name: string, action: () => Promise<T>): Promise<T> {
    const started = performance.now()
    console.log(`Smoke: starting ${name}`)
    try {
      return await test.step(name, action)
    } finally {
      console.log(`Smoke: finished ${name} after ${Math.round(performance.now() - started)}ms`)
    }
  }
  const errors: string[] = []
  // Electron injects the Apple shortcut profile even in the Linux smoke container.
  const primaryKey = testInfo.project.name === 'electron' || process.platform === 'darwin' ? 'Meta' : 'Control'
  const observe = (page: import('@playwright/test').Page) => {
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('crash', () => errors.push('Renderer crashed'))
    const driver: Omit<SmokeDriver, 'quitAndReopen'> = {
      click: (selector) => page.locator(selector).click(),
      waitFor: async (script) => {
        await expect.poll(() => page.evaluate(`(async () => { ${script} })()`), { message: script }).toBe(true)
      },
      countRows: () => page.locator('.node-row').count(),
      fill: (selector, text) => page.locator(selector).first().fill(text),
      press: (selector, key) => page.locator(selector).press(key.replace('Primary', primaryKey)),
      type: (selector, text) => page.locator(selector).pressSequentially(text),
      enableVim: async () => {
        await page.locator('#tree-menu-button').click()
        await page.locator('#prototype-vim').click()
      },
      showView: async (view) => {
        await page.locator('#tree-menu-button').click()
        await page.locator(`#prototype-${view}`).click()
      },
    }
    return driver
  }

  if (testInfo.project.name === 'electron') {
    const profile = await mkdtemp(join(tmpdir(), `tree-smoke-p${process.pid}-`))
    let app: Awaited<ReturnType<typeof electron.launch>> | undefined
    let appProcess: import('node:child_process').ChildProcess | undefined
    const stop = async () => {
      if (!app) return undefined
      const child = appProcess!

      await closeApp(app)

      expect(
        child.exitCode !== null || child.signalCode !== null,
        `Smoke process still running; retained ${profile}`,
      ).toBe(true)

      app = undefined
      appProcess = undefined
      return child
    }
    const launch = async (): Promise<SmokeDriver> => {
      app = await electron.launch({
        args: [
          ...(process.platform === 'linux' && process.env['CI'] ? ['--no-sandbox'] : []),
          '--force-device-scale-factor=1',
          `--user-data-dir=${profile}`,
          resolve('e2e/electron/electron-entry.cjs'),
        ],
        env: { ...process.env, TREE_E2E_HIDDEN: '1', TREE_E2E_SHORTCUT_STUB: '1' } as Record<string, string>,
        // Let cold CI startup use the scenario budget; the test/global deadlines still bound the run.
        timeout: testInfo.timeout,
      })
      // Own the process before waiting for renderer readiness, including failed startup.
      appProcess = app.process()
      const page = await app.firstWindow({ timeout: 5000 })

      expect(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.isVisible())),
      ).toEqual([false])
      expect(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+0'))).toBe(false)
      expect(await page.evaluate(() => devicePixelRatio)).toBe(1)

      const owned = app
      return {
        ...observe(page),
        enableVim: () => clickApplicationMenuItem(owned, 'Edit', 'Vim Editing'),
        showView: (view) => clickApplicationMenuItem(owned, 'View', view === 'tree' ? 'Tree' : 'Agenda'),
        quitAndReopen: async () => {
          const child = owned.process()
          await clickApplicationMenuQuit(owned)
          // Observe production Quit before invoking fixture cleanup, which also requests closure.
          await expect.poll(() => child.exitCode, { timeout: 5000 }).toBe(0)
          const previous = await stop()

          // A forced teardown must not count as a successful normal quit.
          expect(previous?.exitCode).toBe(0)

          const driver = await launch()

          expect(app!.process().pid).not.toBe(previous?.pid)

          return driver
        },
      }
    }
    try {
      await mkdir(join(profile, 'data'))
      await writeFile(join(profile, 'data/vim-enabled.json'), 'false')
      const driver = await phase('Electron startup', launch)
      await phase('Tree and Agenda happy path', () => happyPath(driver))
      if (process.platform === 'darwin' && process.arch === 'arm64') {
        await phase('Apple Vision OCR and persistence', async () => imageToTextSmoke(await app!.firstWindow()))
      }

      expect(errors).toEqual([])
    } finally {
      await phase('Electron cleanup', stop)
      // Playwright owns cleanup when launch rejects; otherwise closeApp confirmed process exit.
      await rm(profile, { recursive: true, force: true })
    }
  } else {
    const server = createStaticServer()
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    try {
      await new Promise<void>((done, fail) => {
        server.once('error', fail)
        server.listen(0, '127.0.0.1', done)
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing smoke server port')
      browser = await playwright.chromium.launch({ channel: process.platform === 'darwin' ? 'chrome' : 'chromium' })
      const opener = await browser.newPage()
      await opener.setContent(`<a href="http://localhost:${address.port}" target="_blank">Open Tree</a>`)
      const launch = async (): Promise<SmokeDriver> => {
        const opened = opener.waitForEvent('popup')
        await opener.getByRole('link', { name: 'Open Tree' }).click()
        const page = await opened
        const driver = observe(page)
        return {
          ...driver,
          quitAndReopen: async () => {
            const closed = page.waitForEvent('close', { timeout: 5000 })
            await page.keyboard.press(`${primaryKey}+q`).catch((error) => {
              if (!page.isClosed()) throw error
            })
            await closed
            return launch()
          },
        }
      }
      await browserEditing(await happyPath(await launch()))

      expect(errors).toEqual([])
    } finally {
      try {
        await browser?.close()
      } finally {
        server.closeAllConnections()
        if (server.listening) await new Promise<void>((done) => server.close(() => done()))
      }
    }
  }
})
