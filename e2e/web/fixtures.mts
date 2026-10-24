import { test as base, expect, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test'
import { rm } from 'node:fs/promises'

export { expect }
export const primaryKey = process.platform === 'darwin' ? 'Meta' : 'Control'

type ContextOptions = BrowserContextOptions & { shortcutPlatform?: 'apple' | 'other' }
type BrowserFixtures = {
  newContext: (options?: ContextOptions) => Promise<BrowserContext>
  persistentContext: () => Promise<BrowserContext>
}

export const test = base.extend<BrowserFixtures>({
  newContext: async ({ browser, headless }, use) => {
    expect(headless, 'Chrome checks require headless mode to keep clipboard tests off the machine clipboard').toBe(true)
    const contexts: BrowserContext[] = []
    try {
      await use(async (options = {}) => {
        const { shortcutPlatform, ...contextOptions } = options
        const context = await browser.newContext({
          viewport: { width: 1100, height: 760 },
          colorScheme: 'light',
          ...contextOptions,
        })
        contexts.push(context)
        if (shortcutPlatform) {
          await context.addInitScript(
            (platform) => {
              Object.defineProperty(navigator, 'platform', { configurable: true, get: () => platform })
            },
            shortcutPlatform === 'apple' ? 'MacIntel' : 'Win32',
          )
        }
        return context
      })
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }
  },
  persistentContext: async ({ playwright, channel }, use, testInfo) => {
    const profile = testInfo.outputPath('chrome-profile')
    const contexts: BrowserContext[] = []
    try {
      await use(async () => {
        const context = await playwright.chromium.launchPersistentContext(profile, {
          ...(channel === undefined ? {} : { channel }),
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

// Send the native paste command for either profile, independent of the host's keyboard mapping.
export async function pressPaste(page: Page, modifier: 'Meta' | 'Control' = primaryKey) {
  const session = await page.context().newCDPSession(page)
  const key = { modifiers: modifier === 'Control' ? 2 : 4, key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86 }
  try {
    await page.keyboard.down(modifier)
    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', text: 'v', commands: ['paste'], ...key })
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  } finally {
    await page.keyboard.up(modifier)
    await session.detach()
  }
}

export async function capture(page: Page, name: string) {
  const path = test.info().outputPath(name)
  await page.screenshot({ path })
  await test.info().attach(name, { path, contentType: 'image/png' })
}
