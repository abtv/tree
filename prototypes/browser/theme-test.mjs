import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1100, height: 760 } })
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  await page.goto('http://127.0.0.1:5174/')
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const command = async (name) => {
    await page.keyboard.press('Meta+Shift+p')
    await page.getByRole('combobox', { name: 'Command', exact: true }).fill(name)
    await page.getByRole('combobox', { name: 'Command', exact: true }).press('Enter')
  }
  const background = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim())
  assert.equal(await background(), '#fbf8f1')
  await command('set-theme-dark')
  console.log(
    JSON.stringify({
      afterDarkCommand: await background(),
      operationError: await page.evaluate(() => window.prototypeStore.getSnapshot().operationError),
    }),
  )
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#3f3f3f',
    undefined,
    { timeout: 2000 },
  )
  await page.screenshot({ path: '.scratch/web-prototype/theme-dark-explicit.png' })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  assert.equal(await background(), '#3f3f3f')
  assert.equal(await page.evaluate(() => window.treeApi.getAppearance()), 'dark')
  await page.emulateMedia({ colorScheme: 'dark' })
  await command('set-theme-light')
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#fbf8f1',
  )
  await page.screenshot({ path: '.scratch/web-prototype/theme-light-explicit.png' })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  assert.equal(await background(), '#fbf8f1')
  await command('set-theme-auto')
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#3f3f3f',
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#fbf8f1',
  )
  assert.equal(await page.evaluate(() => window.treeApi.getAppearance()), 'system')
  assert.equal(await page.evaluate(() => window.prototypeStore.getSnapshot().operationError), undefined)
  console.log(
    JSON.stringify({
      darkUnderLightSystem: true,
      persistedAfterReload: true,
      lightUnderDarkSystem: true,
      automaticFollowsSystem: true,
      status: 'passed',
    }),
  )
} finally {
  await browser.close()
}
