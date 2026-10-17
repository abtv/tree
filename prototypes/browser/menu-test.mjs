import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, colorScheme: 'light' })
  const page = await context.newPage()
  page.setDefaultTimeout(6000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(process.env.TREE_WEB_URL ?? 'http://127.0.0.1:5174/')
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  assert.equal(await page.title(), 'Tree')
  assert.equal(await page.locator('#prototype-toolbar').count(), 0)
  assert.equal(await page.evaluate(() => document.querySelector('.tree-app').getBoundingClientRect().height), 760)
  assert.equal(await page.evaluate(() => window.treeApi.getVimEnabled()), false)
  const open = () => page.getByRole('button', { name: 'Tree menu', exact: true }).click()
  const choose = async (name) => {
    await open()
    await page.getByRole('dialog', { name: 'Tree menu' }).getByRole('button', { name, exact: true }).click()
    await page.waitForFunction(() => !document.getElementById('tree-menu').matches(':popover-open'))
  }
  await page.screenshot({ path: '.scratch/web-prototype/menu-closed-light.png' })
  await open()
  await page.getByRole('dialog', { name: 'Tree menu' }).waitFor()
  await page.screenshot({ path: '.scratch/web-prototype/menu-open-light.png' })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.getElementById('tree-menu').matches(':popover-open'))
  await choose('Agenda')
  await page.waitForFunction(() => !!window.prototypeStore.getSnapshot().agenda)
  await choose('Tree')
  await page.waitForFunction(() => !window.prototypeStore.getSnapshot().agenda)
  await choose('Dark')
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#3f3f3f',
  )
  await open()
  assert.equal(await page.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.screenshot({ path: '.scratch/web-prototype/menu-open-dark.png' })
  await page.mouse.click(400, 400)
  await page.waitForFunction(() => !document.getElementById('tree-menu').matches(':popover-open'))
  await choose('Vim Editing')
  await page.waitForFunction(() => document.getElementById('prototype-vim').getAttribute('aria-pressed') === 'true')
  await choose('Vim Editing')
  await page.waitForFunction(() => document.getElementById('prototype-vim').getAttribute('aria-pressed') === 'false')
  await choose('Light')
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#fbf8f1',
  )
  await page.locator('[data-node-id="welcome"] .node-input').fill('Editing after using the menu')
  await page.waitForFunction(
    () => document.getElementById('prototype-save-status').textContent === 'Saved locally in this browser',
  )
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  assert.equal(await page.locator('[data-node-id="welcome"] .node-input').inputValue(), 'Editing after using the menu')
  const blocked = await context.newPage()
  await blocked.goto(process.env.TREE_WEB_URL ?? 'http://127.0.0.1:5174/')
  await blocked.getByRole('alert').filter({ hasText: 'already open' }).waitFor()
  await blocked.close()
  await page.setViewportSize({ width: 390, height: 760 })
  await open()
  const bounds = await page.getByRole('dialog', { name: 'Tree menu' }).boundingBox()
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390)
  await page.screenshot({ path: '.scratch/web-prototype/menu-narrow.png' })
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      mouseMenu: true,
      nonVim: true,
      agendaAndTree: true,
      vimToggle: true,
      appearance: true,
      escapeAndOutsideDismiss: true,
      editAndReload: true,
      blockedTabErrorVisible: true,
      narrowViewport: true,
      errors,
      status: 'passed',
    }),
  )
} finally {
  await browser.close()
}
