import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'

const url = 'http://127.0.0.1:5174/'
const profile = resolve(`.scratch/web-prototype/storage-profile-${Date.now()}`)
const launch = () =>
  chromium.launchPersistentContext(profile, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1100, height: 760 },
  })
let context
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
try {
  context = await launch()
  let page = context.pages()[0]
  page.setDefaultTimeout(6000)
  await page.goto(url)
  await ready(page)
  await input(page).fill('Saved across a complete Chrome restart')
  await saved(page)
  await context.close()
  context = await launch()
  page = context.pages()[0]
  page.setDefaultTimeout(6000)
  await page.goto(url)
  await ready(page)
  assert.equal(await input(page).inputValue(), 'Saved across a complete Chrome restart')
  console.log('PASS full browser restart with a separate synthetic disk profile')

  const blocked = await context.newPage()
  await blocked.goto(url)
  await blocked.getByRole('alert').filter({ hasText: 'already open' }).waitFor()
  assert.equal(await blocked.locator('.node-input').count(), 0)
  await page.close()
  await blocked.reload()
  await ready(blocked)
  assert.equal(await input(blocked).inputValue(), 'Saved across a complete Chrome restart')
  page = blocked
  console.log('PASS second writer blocked, then ownership handed over after close')

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
  assert.deepEqual(await readHead(page), previous)
  assert.equal(await input(page).inputValue(), 'Unsaved work must remain in this tab')
  await page.screenshot({ path: '.scratch/web-prototype/storage-write-failure.png' })
  await page.evaluate(() => {
    window.storageTest.fail = false
  })
  await page.evaluate(() => window.prototypeStore.flushPersistence())
  await saved(page)
  assert.equal((await readHead(page)).document.roots[0].text, 'Unsaved work must remain in this tab')
  console.log('PASS transaction abort preserves previous head and in-memory edit; retry succeeds')

  // Real typing followed by immediate close must offer a browser-level warning.
  await input(page).press('End')
  await input(page).press('x')
  const warning = page.waitForEvent('dialog', { timeout: 1500 })
  await page.close({ runBeforeUnload: true })
  const dialog = await warning
  assert.equal(dialog.type(), 'beforeunload')
  await dialog.dismiss()
  assert.equal(page.isClosed(), false)
  await saved(page)
  console.log('PASS immediate dirty-close warning and cancel keep the editor open')

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
  console.log(JSON.stringify({ visibleReplace: visibleText, durableReplace: durableText }))
  assert.notEqual(durableText, visibleText)
  assert.equal(await page.locator('#prototype-save-status').textContent(), 'Editing — not saved yet')
  assert(await page.locator('.tree-app.vim-state-replace').count())
  await page.keyboard.press('Meta+Shift+p')
  await page.getByRole('combobox', { name: 'Command', exact: true }).waitFor()
  await page.getByRole('combobox', { name: 'Command', exact: true }).fill('theme')
  assert.equal(
    await page.locator('#prototype-save-status').textContent(),
    'Editing — not saved yet',
    'Command palette focus must not hide the uncommitted Replace buffer',
  )
  const replaceWarning = page.waitForEvent('dialog', { timeout: 1500 })
  await page.close({ runBeforeUnload: true })
  await (await replaceWarning).dismiss()
  assert.equal(page.isClosed(), false)
  await saved(page)
  assert.equal((await readHead(page)).document.roots[0].text, visibleText)
  console.log('PASS buffered Vim Replace is marked unsaved, warns on close, and saves after canceled close')
  await page.keyboard.press('Escape')

  const beforeInsert = await input(page).inputValue()
  await input(page).press('A')
  await input(page).pressSequentially(' continued')
  await saved(page)
  assert(await page.locator('.tree-app.vim-state-insert').count())
  await input(page).press('Escape')
  await input(page).press('u')
  await saved(page)
  assert.equal(await input(page).inputValue(), beforeInsert)
  console.log('PASS autosave preserves Insert mode and its single undo session')

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
  assert.equal(await page.locator('[data-node-id="second"]').count(), 0)
  console.log('PASS focused node deletion saves and reloads without a stale-DOM exception')

  await page.evaluate(() => {
    window.prototypeStore.selectNode('project', 0)
    window.prototypeStore.enter()
  })
  const parent = page.getByRole('textbox', { name: 'Current parent', exact: true })
  await parent.click()
  await parent.press('R')
  await parent.press('Q')
  await page.waitForTimeout(50)
  assert.equal(await page.locator('#prototype-save-status').textContent(), 'Editing — not saved yet')
  await parent.press('Escape')
  await saved(page)
  assert.equal(
    (await readHead(page)).document.roots.find((node) => node.id === 'project').text,
    await parent.inputValue(),
  )
  await page.evaluate(() => window.prototypeStore.navigateToAncestor(null))
  await input(page).click()
  console.log('PASS current-parent buffered editing is tracked and saved')

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
  assert.equal(await page.evaluate(() => window.storageTest.writes), 3)
  await page.waitForTimeout(700)
  assert.equal(await page.evaluate(() => window.storageTest.writes), 3)
  await page.screenshot({ path: '.scratch/web-prototype/storage-locked.png' })
  const unsavedText = await input(page).inputValue()
  await page.evaluate(() => {
    window.storageTest.fail = false
  })
  const retryWarning = page.waitForEvent('dialog')
  await page.close({ runBeforeUnload: true })
  await (await retryWarning).dismiss()
  await saved(page)
  assert.equal((await readHead(page)).document.roots[0].text, unsavedText)
  assert.equal(await page.evaluate(() => window.prototypeStore.getSnapshot().persistenceLocked), undefined)
  console.log('PASS three failures stop automatic retries; canceled close retries and unlocks')

  const writesBeforeIdle = await page.evaluate(() => window.storageTest.writes)
  await page.waitForTimeout(700)
  assert.equal(await page.evaluate(() => window.storageTest.writes), writesBeforeIdle)
  console.log('PASS idle editor performs no repeated document writes')

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
  assert.deepEqual(await readHead(page), { invalid: 'preserve this evidence' })
  await page.screenshot({ path: '.scratch/web-prototype/storage-invalid.png' })
  console.log('PASS invalid stored document remains intact; sample is not substituted')
} finally {
  await context?.close()
}
