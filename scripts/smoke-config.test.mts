import { afterEach, expect, it, vi } from 'vitest'

const platform = process.platform

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.resetModules()
})

it.each(['darwin', 'linux'])('isolates the longer Electron budget on %s', async (target) => {
  Object.defineProperty(process, 'platform', { value: target })
  vi.resetModules()

  const { default: electron } = await import('../config/testing/playwright.smoke-electron.config')
  const { default: browser } = await import('../config/testing/playwright.smoke.config')

  expect(electron.timeout).toBe(target === 'darwin' ? 45_000 : 15_000)
  expect(electron.globalTimeout).toBe(target === 'darwin' ? 60_000 : 20_000)
  expect(electron.projects).toEqual([{ name: 'electron' }])
  expect(electron.retries).toBe(0)
  expect(browser.timeout).toBe(15_000)
  expect(browser.globalTimeout).toBe(20_000)
})
