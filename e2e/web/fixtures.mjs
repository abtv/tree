import { test as base, expect } from '@playwright/test'
import { rm } from 'node:fs/promises'

export { expect }

export const test = base.extend({
  newContext: async ({ browser, headless }, use) => {
    expect(headless, 'Chrome checks require headless mode to keep clipboard tests off the machine clipboard').toBe(true)
    const contexts = []
    try {
      await use(async (options = {}) => {
        const context = await browser.newContext({
          viewport: { width: 1100, height: 760 },
          colorScheme: 'light',
          ...options,
        })
        contexts.push(context)
        return context
      })
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }
  },
  persistentContext: async ({ playwright, channel }, use, testInfo) => {
    const profile = testInfo.outputPath('chrome-profile')
    const contexts = []
    try {
      await use(async () => {
        const context = await playwright.chromium.launchPersistentContext(profile, {
          channel,
          headless: true,
          viewport: { width: 1100, height: 760 },
        })
        contexts.push(context)
        return context
      })
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
      await rm(profile, { recursive: true, force: true })
    }
  },
})

// Presses Command+V with the native paste command. Playwright attaches that command itself only on a
// macOS host; Chromium on Linux binds paste to Ctrl+V, so the same key event is sent through CDP there.
export async function pressPaste(page) {
  if (process.platform === 'darwin') {
    await page.keyboard.press('Meta+v')
    return
  }
  const session = await page.context().newCDPSession(page)
  const key = { modifiers: 4, key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86 }
  try {
    await page.keyboard.down('Meta')
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', text: 'v', commands: ['paste'], ...key })
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  } finally {
    await page.keyboard.up('Meta')
    await session.detach()
  }
}

export async function capture(page, name) {
  const path = test.info().outputPath(name)
  await page.screenshot({ path })
  await test.info().attach(name, { path, contentType: 'image/png' })
}
