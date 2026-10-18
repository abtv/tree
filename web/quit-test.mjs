import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext()
  const opener = await context.newPage()
  const dialogs = []
  context.on('page', (page) => {
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      await dialog.dismiss()
    })
  })
  const open = async () => {
    const popup = opener.waitForEvent('popup')
    await opener.evaluate((url) => window.open(url), process.env.TREE_WEB_URL ?? 'http://127.0.0.1:5174/')
    const page = await popup
    page.setDefaultTimeout(6000)
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    return page
  }
  let page = await open()
  const input = () => page.locator('[data-node-id="welcome"] .node-input')
  const pressToClose = async (key) => {
    const closed = page.waitForEvent('close', { timeout: 6000 })
    // A successful close can destroy the keyboard dispatch's target before its
    // acknowledgement arrives. Only accept that error when the page did close.
    await page.keyboard.press(key).catch((error) => {
      if (!page.isClosed()) throw error
    })
    await closed
  }
  await input().fill('Quit must save this pending edit')
  await page.keyboard.press('Meta+Shift+p')
  await page.getByRole('combobox', { name: 'Command', exact: true }).fill('quit')
  await pressToClose('Enter')
  assert.deepEqual(dialogs, [], 'A successful quit must not show an informational alert')
  page = await open()
  assert.equal(await input().inputValue(), 'Quit must save this pending edit')

  await page.locator('#tree-menu-button').click()
  await page.locator('#prototype-vim').click()
  await input().click()
  await input().press('Escape')
  await input().press('Home')
  await input().press('R')
  await input().press('Z')
  const bufferedText = await input().inputValue()
  assert.equal(await page.locator('#prototype-save-status').textContent(), 'Editing — not saved yet')
  await pressToClose('Meta+q')
  page = await open()
  assert.equal(await input().inputValue(), bufferedText, 'Keyboard quit must flush the pending Replace buffer')
  await page.locator('#tree-menu-button').click()
  await page.locator('#prototype-vim').click()

  // A failed flush must not call close, even if the document was already saved.
  await page.evaluate(() => {
    const flush = window.prototypeStore.flushPersistence.bind(window.prototypeStore)
    window.prototypeStore.flushPersistence = async () => {
      throw new Error('Synthetic quit flush failure')
    }
    window.restoreQuitFlush = () => {
      window.prototypeStore.flushPersistence = flush
    }
    window.quitCloseCalls = 0
    window.close = () => window.quitCloseCalls++
  })
  await page.evaluate(() => window.treeApi.quit())
  assert.equal(await page.evaluate(() => window.quitCloseCalls), 0)
  await page.getByRole('alert').filter({ hasText: 'Synthetic quit flush failure' }).waitFor()
  assert.equal(page.isClosed(), false)
  await page.evaluate(() => window.restoreQuitFlush())
  await input().fill('Retry saves without a success dialog')
  await page.evaluate(() => window.treeApi.quit())
  assert.equal(await page.evaluate(() => window.quitCloseCalls), 1)
  assert.deepEqual(dialogs, [], 'A browser refusing close must remain modal-free')
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  assert.equal(await input().inputValue(), 'Retry saves without a success dialog')
  await page.screenshot({ path: '.scratch/web-prototype/quit-without-alert.png' })
  console.log(
    'PASS quit saves and closes without alerts; failed flush stays open; retry and refused close preserve edits',
  )
} finally {
  await browser.close()
}
