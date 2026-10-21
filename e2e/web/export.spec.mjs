// @editing-modes: independent
import { test, expect, capture } from './fixtures.mjs'
import { onePixelPng } from '../../src/electron/main/png-test-utils.ts'
import {
  chooseMenuItem,
  noisePng,
  openMenu,
  readDownloadedArchive,
  readStored,
  ready,
  saved,
  seedImageNodes,
  writeStored,
} from './data-helpers.mjs'

const activity = (page) => page.locator('#data-activity')
const activityText = (page) => page.locator('#data-activity-text')
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// @requirement PRODUCT.md §24.3
test('exports the saved notes and referenced images from a worker', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const workers = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await page.goto(baseURL)
  await ready(page)

  const noise = await noisePng(page, 24)
  await seedImageNodes(page, [
    { id: 'image-b', bytes: [...onePixelPng] },
    { id: 'image-a', bytes: noise },
    { id: 'image-missing' },
  ])
  await page.evaluate(
    (bytes) => window.treeApi.writeAttachment('image-unreferenced', new Uint8Array(bytes)),
    [...onePixelPng],
  )
  await saved(page)

  // @requirement PRODUCT.md §24
  const menu = await openMenu(page)
  await expect(menu.getByText('Data', { exact: true })).toBeVisible()
  // PRODUCT §24.1: the browser decides the storage line; installability.spec.mjs covers both texts.
  const storage = page.locator('#storage-status')
  await expect(storage).toHaveText(/^Storage is (?:not )?protected from automatic clearing\.$/)
  const storageText = await storage.textContent()
  expect(
    await menu.evaluate((element) =>
      [...element.querySelectorAll('button, .menu-label, [role="status"]')].map((item) => item.textContent),
    ),
  ).toEqual([
    'Tree',
    'Agenda',
    'Vim Editing',
    'Appearance',
    'Automatic',
    'Light',
    'Dark',
    'Data',
    'Export Notes…',
    'Import Notes…',
    'Back Up to Folder…',
    'Restore from Folder…',
    'Saved locally in this browser',
    storageText,
    'Folder backup is off.',
  ])
  await capture(page, 'data-menu-light.png')
  await page.setViewportSize({ width: 390, height: 760 })
  const narrow = await menu.boundingBox()
  expect(narrow.x >= 0 && narrow.x + narrow.width <= 390).toBe(true)
  await capture(page, 'data-menu-narrow.png')
  await page.setViewportSize({ width: 1100, height: 760 })
  await menu.getByRole('button', { name: 'Dark', exact: true }).click()
  await openMenu(page)
  await capture(page, 'data-menu-dark.png')
  await page.keyboard.press('Escape')

  // An edit that has not been saved yet must be in the archive.
  await page.locator('[data-node-id="welcome"] .node-input').pressSequentially('Typed just before exporting ')
  const downloading = page.waitForEvent('download')
  await chooseMenuItem(page, 'Export Notes…')
  const download = await downloading
  expect(download.suggestedFilename()).toBe(`Tree Notes ${today()}.zip`)
  await expect(activityText(page)).toHaveText(
    `Exported “Tree Notes ${today()}.zip”. 1 image could not be found and was not included.`,
  )
  const panelBox = await activity(page).boundingBox()
  const statusBarBox = await page.locator('.status-bar').boundingBox()
  expect(panelBox.y + panelBox.height, 'The panel must not cover the status bar').toBeLessThanOrEqual(statusBarBox.y)
  expect(panelBox.x + panelBox.width).toBeCloseTo(1100 - 16, 0)
  await capture(page, 'data-export-result.png')
  expect(workers.some((url) => /archive\.worker/.test(url))).toBe(true)

  // @requirement PRODUCT.md §24.2
  const archive = await readDownloadedArchive(download)
  expect(archive.names).toEqual(['document.json', 'attachments/image-a.png', 'attachments/image-b.png'])
  const head = await readStored(page, 'document', 'head')
  expect(head.document.roots[0].text).toContain('Typed just before exporting')
  expect(head.document).toEqual(await page.evaluate(() => window.prototypeStore.getSnapshot().document))
  const documentJson = new TextDecoder().decode(archive.entries.get('document.json'))
  expect(documentJson).toBe(JSON.stringify(head))
  expect([...archive.entries.get('attachments/image-a.png')]).toEqual(await readStored(page, 'blobs', 'image-a'))
  expect([...archive.entries.get('attachments/image-b.png')]).toEqual([...onePixelPng])

  await activity(page).getByRole('button', { name: 'OK', exact: true }).click()
  await expect(activity(page)).toBeHidden()
  expect(errors).toEqual([])
})

// @requirement PRODUCT.md §24.3
test('reports a stopped worker and cancels a worker that is sending the archive', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const downloads = []
  page.on('download', (download) => downloads.push(download))
  await page.goto(baseURL)
  await ready(page)
  const replaceWorker = (body) =>
    page.route(/archive\.worker/, (route) => route.fulfill({ contentType: 'text/javascript', body }))

  await replaceWorker("throw new Error('Synthetic worker failure')")
  await chooseMenuItem(page, 'Export Notes…')
  await expect(activityText(page)).toHaveText('Export failed. The export stopped unexpectedly.')
  await activity(page).getByRole('button', { name: 'OK', exact: true }).click()
  await page.unroute(/archive\.worker/)

  // The stand-in worker sends part of an archive, then keeps sending until it is terminated.
  await replaceWorker(`
    self.onmessage = () => {
      postMessage({ type: 'progress', imagesDone: 1, imageCount: 2 })
      setInterval(() => postMessage({ type: 'chunk', chunk: new ArrayBuffer(8) }), 20)
      setTimeout(() => postMessage({ type: 'done', summary: { imageCount: 2, missingImageCount: 0, archiveBytes: 8 } }), 1500)
    }
  `)
  await chooseMenuItem(page, 'Export Notes…')
  await expect(activityText(page)).toHaveText('Exporting Notes… 1 of 2 images')
  await activity(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(activity(page)).toBeHidden()
  // A done message from a worker that kept running would start a download and show the result.
  await page.waitForTimeout(2000)
  expect(downloads).toEqual([])
  await expect(activity(page)).toBeHidden()
})

// @requirement PRODUCT.md §24.3
test('cancels, refuses invalid notes, stays responsive and is unavailable while locked', async ({
  newContext,
  baseURL,
}) => {
  const context = await newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const downloads = []
  page.on('download', (download) => downloads.push(download))
  await page.goto(baseURL)
  await ready(page)

  // Typing stays responsive while a large archive is written.
  const large = await noisePng(page, 1024)
  await seedImageNodes(
    page,
    Array.from({ length: 24 }, (_, index) => ({ id: `large-${String(index).padStart(2, '0')}`, bytes: large })),
  )
  const editor = page.locator('[data-node-id="welcome"] .node-input')
  await editor.click()
  await editor.press('End')
  const largeDownload = page.waitForEvent('download', { timeout: 30_000 })
  await chooseMenuItem(page, 'Export Notes…')
  await expect(activityText(page)).toHaveText(/^Exporting Notes…/)
  await editor.pressSequentially(' typed during export')
  await expect(editor).toHaveValue(/ typed during export$/)
  const archive = await readDownloadedArchive(await largeDownload)
  expect(archive.names).toHaveLength(25)
  expect(archive.bytes.byteLength).toBeGreaterThan(24 * large.length)
  await activity(page).getByRole('button', { name: 'OK', exact: true }).click()
  downloads.length = 0

  // Cancel while the worker script is still loading.
  let release
  const loading = new Promise((resolve) => {
    release = resolve
  })
  const requested = new Promise((resolve) =>
    page.route(/archive\.worker/, async (route) => {
      resolve()
      await loading
      await route.continue().catch(() => {})
    }),
  )
  await chooseMenuItem(page, 'Export Notes…')
  await requested
  await expect(activityText(page)).toHaveText('Exporting Notes…')
  await capture(page, 'data-export-progress.png')
  await activity(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(activity(page)).toBeHidden()
  release()
  await page.waitForTimeout(1000)
  await page.unroute(/archive\.worker/)
  expect(downloads).toEqual([])
  await expect(activity(page)).toBeHidden()

  // An invalid saved head is refused instead of exported.
  const valid = await readStored(page, 'document', 'head')
  await writeStored(page, 'document', 'head', { invalid: 'preserve this evidence' })
  await chooseMenuItem(page, 'Export Notes…')
  await expect(activityText(page)).toHaveText('Export failed. The saved notes are invalid, so they cannot be exported.')
  await capture(page, 'data-export-failed.png')
  expect(await readStored(page, 'document', 'head')).toEqual({ invalid: 'preserve this evidence' })
  expect(downloads).toEqual([])
  await activity(page).getByRole('button', { name: 'OK', exact: true }).click()
  await writeStored(page, 'document', 'head', valid)

  // The locked save-failure state disables export.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args)
      if (this.name === 'document') this.transaction.abort()
      return request
    }
  })
  await editor.press('End')
  await editor.pressSequentially(' never saved')
  // A failed flush refuses the export; the save-failure banner and the panel stay visible together.
  await chooseMenuItem(page, 'Export Notes…')
  await expect(activityText(page)).toHaveText(/^Export failed\. Your latest changes could not be saved: /)
  const problem = page.locator('#prototype-problem')
  await expect(problem).toBeVisible()
  const panelBox = await activity(page).boundingBox()
  const problemBox = await problem.boundingBox()
  expect(
    panelBox.y + panelBox.height <= problemBox.y || problemBox.y + problemBox.height <= panelBox.y,
    'The problem banner must not cover the export panel',
  ).toBe(true)
  await capture(page, 'data-export-save-failed.png')
  expect(downloads).toEqual([])
  await activity(page).getByRole('button', { name: 'OK', exact: true }).click()
  await page.waitForFunction(() => window.prototypeStore.getSnapshot().persistenceLocked === true, undefined, {
    timeout: 20_000,
  })
  const menu = await openMenu(page)
  await expect(menu.getByRole('button', { name: 'Export Notes…', exact: true })).toBeDisabled()
  // @requirement PRODUCT.md §24.4
  await expect(menu.getByRole('button', { name: 'Import Notes…', exact: true })).toBeDisabled()
  expect(errors).toEqual([])
})
