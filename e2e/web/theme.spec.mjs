// @editing-modes: independent
import { test, expect, capture } from './fixtures.mjs'

test('persists appearance and follows system changes', async ({ newContext, baseURL }) => {
  const context = await newContext({ colorScheme: 'light', viewport: { width: 1100, height: 760 } })
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const command = async (name) => {
    await page.keyboard.press('Meta+Shift+p')
    await page.getByRole('combobox', { name: 'Command', exact: true }).fill(name)
    await page.getByRole('combobox', { name: 'Command', exact: true }).press('Enter')
  }
  const background = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim())
  expect(await background()).toBe('#fbf8f1')
  await command('set-theme-dark')

  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#3f3f3f',
    undefined,
    { timeout: 2000 },
  )
  await capture(page, 'theme-dark-explicit.png')
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  expect(await background()).toBe('#3f3f3f')
  expect(await page.evaluate(() => window.treeApi.getAppearance())).toBe('dark')
  await page.emulateMedia({ colorScheme: 'dark' })
  await command('set-theme-light')
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#fbf8f1',
  )
  await capture(page, 'theme-light-explicit.png')
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  expect(await background()).toBe('#fbf8f1')
  await command('set-theme-auto')
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#3f3f3f',
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#fbf8f1',
  )
  expect(await page.evaluate(() => window.treeApi.getAppearance())).toBe('system')
  expect(await page.evaluate(() => window.prototypeStore.getSnapshot().operationError)).toBe(undefined)
  const empty = page.locator('[data-node-id="welcome"] .node-input')
  await empty.fill('')
  await page.evaluate(() => window.treeApi.setVimEnabled(true))
  await empty.focus()
  await page.waitForFunction(() => document.querySelector('.tree-app').classList.contains('vim-state-normal'))
  const emptyBlock = () => empty.evaluate((element) => getComputedStyle(element).backgroundImage)
  expect(await emptyBlock()).not.toBe('none')
  expect(await empty.evaluate((element) => getComputedStyle(element).caretColor)).toBe('rgba(0, 0, 0, 0)')
  await capture(page, 'empty-normal-light.png')
  await page.keyboard.press('i')
  expect(await emptyBlock()).toBe('none')
  await page.keyboard.press('Escape')
  expect(await emptyBlock()).not.toBe('none')
  await page.emulateMedia({ colorScheme: 'dark' })
  await capture(page, 'empty-normal-dark.png')
})
