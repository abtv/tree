// @editing-modes: independent
import { test, expect, capture, primaryKey } from './fixtures.mjs'

const ready = (page) => page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
const saved = (page) =>
  page.waitForFunction(
    () => document.getElementById('prototype-save-status').textContent === 'Saved locally in this browser',
  )
const input = (page) => page.locator('[data-node-id="welcome"] .node-input')
const readHead = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('tree-browser-prototype')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('document')
        const r = tx.objectStore('document').get('head')
        tx.oncomplete = () => resolve(r.result)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  })
test('preserves browser storage through restart and failure recovery', async ({
  persistentContext: launch,
  baseURL,
}) => {
  let context = await launch()
  let page = context.pages()[0]
  page.setDefaultTimeout(6000)
  await page.goto(baseURL)
  await ready(page)
  await input(page).fill('Saved across a complete Chrome restart')
  await saved(page)
  await context.close()
  context = await launch()
  page = context.pages()[0]
  page.setDefaultTimeout(6000)
  await page.goto(baseURL)
  await ready(page)
  expect(await input(page).inputValue()).toBe('Saved across a complete Chrome restart')

  const blocked = await context.newPage()
  await blocked.goto(baseURL)
  await blocked.getByRole('alert').filter({ hasText: 'already open' }).waitFor()
  expect(await blocked.locator('.node-input').count()).toBe(0)
  await page.close()
  await blocked.reload()
  await ready(blocked)
  expect(await input(blocked).inputValue()).toBe('Saved across a complete Chrome restart')
  page = blocked

  const previous = await readHead(page)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    window.storageTest = { fail: true, writes: 0 }
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'document' && args[1] === 'head') {
        window.storageTest.writes++
        const request = put.apply(this, args)
        if (window.storageTest.fail) this.transaction.abort()
        return request
      }
      return put.apply(this, args)
    }
  })
  await input(page).fill('Unsaved work must remain in this tab')
  await page.locator('#prototype-problem').filter({ hasText: 'Save failed' }).waitFor()
  expect(await readHead(page)).toEqual(previous)
  expect(await input(page).inputValue()).toBe('Unsaved work must remain in this tab')
  await capture(page, 'storage-write-failure.png')
  await page.evaluate(() => {
    window.storageTest.fail = false
  })
  await page.evaluate(() => window.prototypeStore.flushPersistence())
  await saved(page)
  expect((await readHead(page)).document.roots[0].text).toBe('Unsaved work must remain in this tab')

  // Real typing followed by immediate close must offer a browser-level warning.
  await input(page).press('End')
  await input(page).press('x')
  const warning = page.waitForEvent('dialog', { timeout: 1500 })
  await page.close({ runBeforeUnload: true })
  const dialog = await warning
  expect(dialog.type()).toBe('beforeunload')
  await dialog.dismiss()
  expect(page.isClosed()).toBe(false)
  await saved(page)

  await page.locator('#tree-menu-button').click()
  await page.locator('#prototype-vim').click()
  await page.waitForFunction(() => document.getElementById('prototype-vim').getAttribute('aria-pressed') === 'true')
  await input(page).click()
  await input(page).press('Escape')
  await input(page).press('Home')
  await input(page).press('R')
  await input(page).press('Z')
  await page.waitForTimeout(800)
  const durableText = (await readHead(page)).document.roots[0].text
  const visibleText = await input(page).inputValue()

  expect(durableText).not.toBe(visibleText)
  expect(await page.locator('#prototype-save-status').textContent()).toBe('Editing — not saved yet')
  expect(await page.locator('.tree-app.vim-state-replace').count()).toBeTruthy()
  await page.keyboard.press(`${primaryKey}+Shift+p`)
  await page.getByRole('combobox', { name: 'Command', exact: true }).waitFor()
  await page.getByRole('combobox', { name: 'Command', exact: true }).fill('theme')
  expect(
    await page.locator('#prototype-save-status').textContent(),
    'Command palette focus must not hide the uncommitted Replace buffer',
  ).toBe('Editing — not saved yet')
  const replaceWarning = page.waitForEvent('dialog', { timeout: 1500 })
  await page.close({ runBeforeUnload: true })
  await (await replaceWarning).dismiss()
  expect(page.isClosed()).toBe(false)
  await saved(page)
  expect((await readHead(page)).document.roots[0].text).toBe(visibleText)

  await page.keyboard.press('Escape')

  const beforeInsert = await input(page).inputValue()
  await input(page).press('A')
  await input(page).pressSequentially(' continued')
  await saved(page)
  expect(await page.locator('.tree-app.vim-state-insert').count()).toBeTruthy()
  await input(page).press('Escape')
  await input(page).press('u')
  await saved(page)
  expect(await input(page).inputValue()).toBe(beforeInsert)

  // A store publication can precede removal of the old active DOM row.
  await page.evaluate(() => {
    window.prototypeStore.selectNode('second', 0)
  })
  const deleted = page.locator('[data-node-id="second"] .node-input')
  await deleted.click()
  await deleted.press('d')
  await deleted.press('d')
  await deleted.waitFor({ state: 'detached' })
  await saved(page)
  await page.reload()
  await ready(page)
  expect(await page.locator('[data-node-id="second"]').count()).toBe(0)

  await page.evaluate(() => {
    window.prototypeStore.selectNode('project', 0)
    window.prototypeStore.enter()
  })
  const parent = page.getByRole('textbox', { name: 'Current parent', exact: true })
  await parent.click()
  await parent.press('R')
  await parent.press('Q')
  await page.waitForTimeout(50)
  expect(await page.locator('#prototype-save-status').textContent()).toBe('Editing — not saved yet')
  await parent.press('Escape')
  await saved(page)
  expect((await readHead(page)).document.roots.find((node) => node.id === 'project').text).toBe(
    await parent.inputValue(),
  )
  await page.evaluate(() => window.prototypeStore.navigateToAncestor(null))
  await input(page).click()

  // Reload cleared the fault injector; restore it for the repeated-failure case.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    window.storageTest = { fail: false, writes: 0 }
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'document' && args[1] === 'head') {
        window.storageTest.writes++
        const request = put.apply(this, args)
        if (window.storageTest.fail) this.transaction.abort()
        return request
      }
      return put.apply(this, args)
    }
  })

  await page.evaluate(() => {
    window.storageTest.fail = true
    window.storageTest.writes = 0
  })
  await input(page).press('A')
  await input(page).pressSequentially(' retry me')
  await input(page).press('Escape')
  await page.waitForFunction(() => window.prototypeStore.getSnapshot().persistenceLocked === true)
  expect(await page.evaluate(() => window.storageTest.writes)).toBe(3)
  await page.waitForTimeout(700)
  expect(await page.evaluate(() => window.storageTest.writes)).toBe(3)
  await capture(page, 'storage-locked.png')
  const unsavedText = await input(page).inputValue()
  await page.evaluate(() => {
    window.storageTest.fail = false
  })
  const retryWarning = page.waitForEvent('dialog')
  await page.close({ runBeforeUnload: true })
  await (await retryWarning).dismiss()
  await saved(page)
  expect((await readHead(page)).document.roots[0].text).toBe(unsavedText)
  expect(await page.evaluate(() => window.prototypeStore.getSnapshot().persistenceLocked)).toBe(undefined)

  const writesBeforeIdle = await page.evaluate(() => window.storageTest.writes)
  await page.waitForTimeout(700)
  expect(await page.evaluate(() => window.storageTest.writes)).toBe(writesBeforeIdle)

  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('tree-browser-prototype')
      r.onsuccess = () => resolve(r.result)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('document', 'readwrite')
      tx.objectStore('document').put({ invalid: 'preserve this evidence' }, 'head')
      tx.oncomplete = resolve
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  })
  await page.reload()
  await page.waitForFunction(() => !window.prototypeStore || window.prototypeStore.getSnapshot().status !== 'loading')
  await page.locator('.node-input').waitFor({ state: 'hidden' })
  expect(await readHead(page)).toEqual({ invalid: 'preserve this evidence' })
  await capture(page, 'storage-invalid.png')
})
