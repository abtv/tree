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
  persistentContext: async ({ playwright }, use, testInfo) => {
    const profile = testInfo.outputPath('chrome-profile')
    const contexts = []
    try {
      await use(async () => {
        const context = await playwright.chromium.launchPersistentContext(profile, {
          channel: 'chrome',
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

export async function capture(page, name) {
  const path = test.info().outputPath(name)
  await page.screenshot({ path })
  await test.info().attach(name, { path, contentType: 'image/png' })
}
