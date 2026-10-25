// @editing-modes: independent
import { test, _electron as electron, chromium, expect } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { happyPath, type SmokeDriver } from './scenario.mts'
import { createStaticServer } from '../../scripts/web/static-server.mts'
import { clickApplicationMenuItem, closeApp } from '../electron/fixtures.ts'

test('edits, persists a child, reopens and types in Vim', async ({ playwright }, testInfo) => {
  const errors: string[] = []
  const observe = (page: import('@playwright/test').Page) => {
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('crash', () => errors.push('Renderer crashed'))
    const driver: SmokeDriver = {
      waitFor: async (script) => {
        await page.waitForFunction(`(async () => { ${script} })()`)
      },
      fill: (selector, text) => page.locator(selector).first().fill(text),
      press: (selector, key) => page.locator(selector).press(key),
      type: (selector, text) => page.locator(selector).pressSequentially(text),
      enableVim: async () => {
        await page.locator('#tree-menu-button').click()
        await page.locator('#prototype-vim').click()
      },
      reload: async () => {
        await page.reload()
        return driver
      },
    }
    return driver
  }

  if (testInfo.project.name === 'electron') {
    const profile = await mkdtemp(join(tmpdir(), `tree-smoke-p${process.pid}-`))
    let app: Awaited<ReturnType<typeof electron.launch>> | undefined
    const stop = async () => {
      if (!app) return undefined
      const child = app.process()
      await closeApp(app)
      expect(
        child.exitCode !== null || child.signalCode !== null,
        `Smoke process still running; retained ${profile}`,
      ).toBe(true)
      app = undefined
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
        timeout: 5000,
      })
      // Own the process before waiting for renderer readiness, including failed startup.
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
        reload: async () => {
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
      await happyPath(await launch())
      expect(errors).toEqual([])
    } finally {
      await stop()
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
      const page = await browser.newPage()
      const driver = observe(page)
      await page.goto(`http://localhost:${address.port}`)
      await happyPath(driver)
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
