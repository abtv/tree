// @editing-modes: independent
import { test, expect, capture, primaryKey } from './fixtures.mts'

test('selects White from the menu and restores it after reload under a dark system appearance', async ({
  newContext,
  baseURL,
}) => {
  const context = await newContext({ colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')

  await page.getByRole('button', { name: 'Tree menu' }).click()
  await expect(page.locator('#tree-menu')).toBeVisible()
  await page.getByRole('button', { name: 'White', exact: true }).click()

  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'white')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator('meta[name="theme-color"][media="all"]')).toHaveAttribute('content', '#ffffff')
  await page.locator('.node-input').first().click()
  expect(await page.evaluate(() => window.treeApi.getAppearance())).toBe('white')

  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  await page.getByRole('button', { name: 'Tree menu' }).click()
  await expect(page.getByRole('button', { name: 'White', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Automatic', exact: true }).click()

  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(63, 63, 63)')
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  expect(await page.evaluate(() => window.treeApi.getAppearance())).toBe('system')
})

test('persists appearance and follows system changes', async ({ newContext, baseURL }) => {
  const context = await newContext({ colorScheme: 'light', viewport: { width: 1100, height: 760 } })
  const page = await context.newPage()

  page.setDefaultTimeout(5000)
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const command = async (name: string) => {
    await page.keyboard.press(`${primaryKey}+Shift+p`)
    await page.getByRole('combobox', { name: 'Command', exact: true }).fill(name)
    await page.getByRole('combobox', { name: 'Command', exact: true }).press('Enter')
  }
  const background = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim())
  const assertShadows = async () => {
    await expect(page.locator('#tree-menu')).toHaveCSS('box-shadow', 'rgba(0, 0, 0, 0.2) 0px 6px 24px 0px')
    for (const selector of ['#import-confirm', '#backup-confirm']) {
      await expect(page.locator(selector)).toHaveCSS('box-shadow', 'rgba(0, 0, 0, 0.267) 0px 10px 40px 0px')
    }
  }

  expect(await background()).toBe('#fbf8f1')

  await command('set-theme-gray')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(221, 221, 221)')
  await assertShadows()
  await capture(page, 'theme-gray-explicit.png')
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')

  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(221, 221, 221)')
  expect(await page.evaluate(() => window.treeApi.getAppearance())).toBe('gray')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(221, 221, 221)')
  await page.emulateMedia({ colorScheme: 'light' })

  await command('set-theme-dark')

  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#3f3f3f',
    undefined,
    { timeout: 2000 },
  )

  await assertShadows()
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

  await assertShadows()
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
  expect(await page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).operationError)).toBe(
    undefined,
  )

  const empty = page.locator('[data-node-id="welcome"] .node-input')

  await empty.fill('')
  await page.evaluate(() => window.treeApi.setVimEnabled(true))
  await empty.focus()
  await page.waitForFunction(() => document.querySelector('.tree-app')!.classList.contains('vim-state-normal'))
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
