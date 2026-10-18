// @editing-modes: independent
import { test, expect, capture } from './fixtures.mjs'
import { onePixelPng } from '../../src/electron/main/png-test-utils.ts'

test('uses the menu, previews and mobile editing policy', async ({ newContext, baseURL }) => {
  const context = await newContext({ viewport: { width: 1100, height: 760 }, colorScheme: 'light' })
  const page = await context.newPage()
  page.setDefaultTimeout(6000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  expect(await page.title()).toBe('Tree')
  expect(await page.locator('#prototype-toolbar').count()).toBe(0)
  expect(await page.evaluate(() => document.querySelector('.tree-app').getBoundingClientRect().height)).toBe(760)
  expect(await page.evaluate(() => window.treeApi.getVimEnabled())).toBe(false)
  const open = () => page.getByRole('button', { name: 'Tree menu', exact: true }).click()
  const choose = async (name) => {
    await open()
    await page.getByRole('dialog', { name: 'Tree menu' }).getByRole('button', { name, exact: true }).click()
    await page.waitForFunction(() => !document.getElementById('tree-menu').matches(':popover-open'))
  }
  const checkPreviewMenu = async () => {
    await page.evaluate(
      async (bytes) => {
        await window.treeApi.writeAttachment('preview-menu-image', new Uint8Array(bytes))
        window.prototypeStore.pasteSubtree('welcome', 'after', {
          id: 'preview-source',
          text: 'Preview menu regression',
          attachment: { id: 'preview-menu-image', mimeType: 'image/png' },
          children: [],
        })
      },
      [...onePixelPng],
    )
    for (const appearance of ['Light', 'Dark']) {
      await choose(appearance)
      await page.getByRole('button', { name: 'Open image preview' }).click()
      const close = page.getByRole('button', { name: 'Close image preview' })
      await close.waitFor()
      expect(await page.locator('#tree-menu-button').isVisible(), 'Preview must hide the Tree menu button').toBe(false)
      const bounds = await close.boundingBox()
      expect(bounds.y).toBe(16)
      expect(bounds.x + bounds.width).toBe(1100 - 16)
      await capture(page, `preview-${appearance.toLowerCase()}.png`)
      await close.click()
      expect(await page.locator('#tree-menu-button').isVisible(), 'Closing preview must restore the menu').toBe(true)
    }
    await choose('Light')
  }
  await capture(page, 'menu-closed-light.png')
  await open()
  await page.getByRole('dialog', { name: 'Tree menu' }).waitFor()
  await capture(page, 'menu-open-light.png')
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
  expect(await page.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed')).toBe('true')
  await capture(page, 'menu-open-dark.png')
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
  expect(await page.locator('[data-node-id="welcome"] .node-input').inputValue()).toBe('Editing after using the menu')
  const blocked = await context.newPage()
  await blocked.goto(baseURL)
  await blocked.getByRole('alert').filter({ hasText: 'already open' }).waitFor()
  await blocked.close()
  await page.setViewportSize({ width: 390, height: 760 })
  await open()
  const bounds = await page.getByRole('dialog', { name: 'Tree menu' }).boundingBox()
  expect(bounds.x >= 0 && bounds.x + bounds.width <= 390).toBeTruthy()
  await capture(page, 'menu-narrow.png')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1100, height: 760 })
  await checkPreviewMenu()
  expect(errors).toEqual([])
  // Exercise the real adapter, saved preference, command panel and editor together.
  for (const [name, userAgent, platform, maxTouchPoints, width] of [
    ['iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5, 390],
    ['ipad-mobile', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'iPad', 5, 820],
    ['ipad-desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5, 820],
  ]) {
    const mobile = await newContext({ userAgent, viewport: { width, height: 760 }, hasTouch: true })
    await mobile.addInitScript(
      ({ platform, maxTouchPoints }) => {
        Object.defineProperty(navigator, 'platform', { get: () => platform })
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => maxTouchPoints })
      },
      { platform, maxTouchPoints },
    )
    const device = await mobile.newPage()
    const deviceErrors = []
    device.on('pageerror', (error) => deviceErrors.push(error.message))
    await device.goto(baseURL)
    await device.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    // @requirement PRODUCT.md §20.4
    const enter = device.locator('[data-node-id="welcome"] .node-enter-control')
    expect(await enter.evaluate((element) => getComputedStyle(element).webkitTapHighlightColor)).toBe(
      'rgba(0, 0, 0, 0)',
    )
    await enter.tap()
    await expect(device.locator('[data-node-id="welcome"] .node-enter-control')).toHaveCount(0)
    await device.getByRole('button', { name: 'Top level', exact: true }).tap()
    await device.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('tree-browser-prototype', 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('preferences', 'readwrite')
        tx.objectStore('preferences').put(true, 'vim')
        tx.oncomplete = resolve
        tx.onabort = () => reject(tx.error)
      })
      db.close()
    })
    await device.reload()
    await device.locator('.tree-app').waitFor()
    expect(await device.evaluate(() => window.treeApi.getVimEnabled())).toBe(false)
    await device.evaluate(() => window.treeApi.setVimEnabled(true))
    expect(await device.evaluate(() => window.treeApi.getVimEnabled())).toBe(false)
    expect(await device.locator('.vim-mode').count()).toBe(0)
    await device.getByRole('button', { name: 'Tree menu', exact: true }).click()
    expect(await device.getByRole('button', { name: 'Vim Editing', exact: true }).count()).toBe(0)
    await capture(device, `${name}-standard-menu.png`)
    await device.keyboard.press('Escape')
    const editor = device.locator('[data-node-id="welcome"] .node-input')
    await editor.fill('Standard editing on this device')
    await editor.press('Escape')
    await editor.press('End')
    await device.keyboard.type(' works')
    expect(await editor.inputValue()).toBe('Standard editing on this device works')
    await device.keyboard.press('Meta+Shift+p')
    await device.locator('.command-panel').waitFor()
    expect(await device.locator('.command-panel').getByText('toggle-vim-mode', { exact: true }).count()).toBe(0)
    await device.keyboard.type('toggle-vim-mode')
    expect(await device.locator('.command-panel [role="option"]').count()).toBe(0)
    await device.keyboard.press('Escape')
    await device.waitForFunction(
      () => document.getElementById('prototype-save-status').textContent === 'Saved locally in this browser',
    )
    await device.reload()
    await device.locator('.tree-app').waitFor()
    expect(await editor.inputValue()).toBe('Standard editing on this device works')
    expect(await device.locator('.vim-mode').count()).toBe(0)
    // A platform override must not erase an existing preference.
    expect(
      await device.evaluate(async () => {
        const request = indexedDB.open('tree-browser-prototype', 1)
        const db = await new Promise((resolve) => {
          request.onsuccess = () => resolve(request.result)
        })
        const tx = db.transaction('preferences')
        const value = tx.objectStore('preferences').get('vim')
        await new Promise((resolve) => {
          tx.oncomplete = resolve
        })
        db.close()
        return value.result
      }),
    ).toBe(true)
    expect(deviceErrors).toEqual([])
    await mobile.close()
  }
})
