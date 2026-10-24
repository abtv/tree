// @editing-modes: independent
import { test, expect, capture, primaryKey } from './fixtures.mts'
import type { Page } from '@playwright/test'
import { onePixelPng } from '../../src/electron/main/png-test-utils.ts'
import { serializeState } from '../../src/domain/document.ts'
import {
  blobKeys,
  chooseImportFile,
  chooseMenuItem,
  noisePng,
  readDownloadedArchive,
  readStored,
  ready,
  saved,
  seedImageNodes,
  writeExportedArchive,
  writeStored,
  writeZip,
} from './data-helpers.mts'

const confirmation = (page: Page) => page.getByRole('dialog', { name: 'Replace Current Notes?' })
const activity = (page: Page) => page.locator('#data-activity')
const activityText = (page: Page) => page.locator('#data-activity-text')
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const archiveHead = serializeState(
  {
    roots: [
      { id: 'imported', text: 'Imported notes', children: [] },
      { id: 'node-new-a', text: 'New A', attachment: { id: 'new-a', mimeType: 'image/png' }, children: [] },
      { id: 'node-new-b', text: 'New B', attachment: { id: 'new-b', mimeType: 'image/png' }, children: [] },
    ],
  },
  { currentParentId: null, selectedNodeId: 'node-new-b' },
  { expandedIds: [] },
)
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

// @requirement PRODUCT.md §24.4
test('imports an exported archive into another browser profile after confirmation', async ({ newContext, baseURL }) => {
  const source = await (await newContext()).newPage()
  source.setDefaultTimeout(8000)
  await source.goto(baseURL!)
  await ready(source)
  const noise = await noisePng(source, 24)
  await seedImageNodes(source, [
    { id: 'image-a', bytes: noise },
    { id: 'image-b', bytes: [...onePixelPng] },
    { id: 'gone' },
  ])
  await source.locator('[data-node-id="welcome"] .node-input').pressSequentially('Typed before exporting ')
  const downloading = source.waitForEvent('download')
  await chooseMenuItem(source, 'Export Notes…')
  const archivePath = test.info().outputPath(`Tree Notes ${today()}.zip`)
  await (await downloading).saveAs(archivePath)
  const sourceHead = await readStored(source, 'document', 'head')
  expect(sourceHead.document.roots[0]!.text).toContain('Typed before exporting')

  const target = await (await newContext()).newPage()
  target.setDefaultTimeout(8000)
  const errors: string[] = []
  target.on('pageerror', (error) => errors.push(error.message))
  await target.goto(baseURL!)
  await ready(target)
  await saved(target)
  const targetHead = await readStored(target, 'document', 'head')

  await target.keyboard.press(`${primaryKey}+Shift+p`)
  await target.getByRole('combobox', { name: 'Command' }).fill('import-notes')
  const choosing = target.waitForEvent('filechooser')
  await target.keyboard.press('Enter')
  await (await choosing).setFiles(archivePath)
  const dialog = confirmation(target)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await expect(dialog.locator('p')).toHaveText([
    new RegExp(`^“Tree Notes ${today()}\\.zip” \\(\\d+(\\.\\d)? KB\\) contains 9 nodes and 2 images\\.$`),
    'Your current notes have 5 nodes and 0 images. Importing replaces them, and this cannot be undone.',
    '1 image that the notes use is not in the archive. Its node will show “Image could not be loaded.”',
    '',
  ])
  // Preparing stages the images but leaves the stored notes alone.
  expect(await readStored(target, 'document', 'head')).toEqual(targetHead)
  expect(await blobKeys(target)).toEqual(['image-a', 'image-b'])
  await capture(target, 'data-import-confirm.png')
  await target.setViewportSize({ width: 390, height: 760 })
  const narrow = (await dialog.boundingBox())!
  expect(narrow.x >= 0 && narrow.x + narrow.width <= 390).toBe(true)
  await capture(target, 'data-import-confirm-narrow.png')
  await target.setViewportSize({ width: 1100, height: 760 })
  await target.emulateMedia({ colorScheme: 'dark' })
  await capture(target, 'data-import-confirm-dark.png')
  await target.emulateMedia({ colorScheme: 'light' })

  // Export Current Notes First keeps the dialog open and downloads the notes that will be replaced.
  const firstExport = target.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export Current Notes First', exact: true }).click()
  const current = await readDownloadedArchive(await firstExport)
  expect(current.names).toEqual(['document.json'])
  expect(JSON.parse(new TextDecoder().decode(current.entries.get('document.json')))).toEqual(targetHead)
  await expect(dialog.locator('#import-confirm-status')).toHaveText(`Exported “Tree Notes ${today()}.zip”.`)

  const reloaded = target.waitForEvent('load')
  await dialog.getByRole('button', { name: 'Replace Notes', exact: true }).click()
  await reloaded
  await ready(target)
  expect(await readStored(target, 'document', 'head')).toEqual(sourceHead)
  expect(await target.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).document)).toEqual(
    sourceHead.document,
  )
  await expect(target.locator('[data-node-id="welcome"] .node-input')).toHaveValue(/^Typed before exporting /)
  expect(await readStored(target, 'blobs', 'image-a')).toEqual(noise)
  expect(await readStored(target, 'blobs', 'image-b')).toEqual([...onePixelPng])
  expect(errors).toEqual([])
})

// @requirement PRODUCT.md §24.4
test('cancel, rejected archives and a failed replacement leave the notes unchanged', async ({
  newContext,
  baseURL,
}) => {
  const page = await (await newContext()).newPage()
  page.setDefaultTimeout(8000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL!)
  await ready(page)
  await seedImageNodes(page, [{ id: 'kept', bytes: [...onePixelPng] }])
  // Vim Normal mode, so the dialog check below can press a command key.
  await chooseMenuItem(page, 'Vim Editing')
  await page.locator('[data-node-id="welcome"] .node-input').click()
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.prototypeStore.flushPersistence())
  await saved(page)
  const head = await readStored(page, 'document', 'head')
  const unchanged = async () => {
    expect(await readStored(page, 'document', 'head')).toEqual(head)
    await expect.poll(() => blobKeys(page)).toEqual(['kept'])
  }
  const valid = await writeExportedArchive(test.info().outputPath('valid.zip'), archiveHead, {
    'new-a': onePixelPng,
    'new-b': onePixelPng,
  })
  const dialog = confirmation(page)

  // Vim Normal-mode keys stay with the modal dialog; Enter activates its default Cancel.
  await chooseImportFile(page, valid)
  await expect(dialog).toBeVisible()
  expect(await blobKeys(page)).toEqual(['kept', 'new-a', 'new-b'])
  await page.keyboard.press(':')
  await expect(page.locator('#command-panel')).toHaveCount(0)
  await page.keyboard.press('h')
  await expect(dialog.getByRole('button', { name: 'Replace Notes', exact: true })).toBeFocused()
  await page.keyboard.press('h')
  await page.keyboard.press('h')
  await expect(dialog.getByRole('button', { name: 'Export Current Notes First' })).toBeFocused()
  await page.keyboard.press('l')
  await page.keyboard.press('l')
  await page.keyboard.press('l')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await unchanged()
  await chooseImportFile(page, valid)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await unchanged()

  // Cancel, and a tab that reloads, while images are being stored remove them and their journal.
  await page.route(/archive\.worker/, async (route) => {
    const response = await route.fetch()
    const patch = `{
      const decode = self.createImageBitmap
      let calls = 0
      self.createImageBitmap = (...args) => (++calls > 1 ? new Promise(() => {}) : decode(...args))
    }\n`
    await route.fulfill({ response, body: patch + (await response.text()) })
  })
  await chooseImportFile(page, valid)
  await expect.poll(() => blobKeys(page)).toEqual(['kept', 'new-a'])
  await activity(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await unchanged()
  expect(await readStored(page, 'preferences', 'import-staged:new-a')).toBeUndefined()
  await chooseImportFile(page, valid)
  await expect.poll(() => blobKeys(page)).toEqual(['kept', 'new-a'])
  expect(await readStored(page, 'preferences', 'import-staged:new-a')).toBe(true)
  await page.reload()
  await ready(page)
  await unchanged()
  expect(await readStored(page, 'preferences', 'import-staged:new-a')).toBeUndefined()
  await page.unroute(/archive\.worker/)

  // An archive re-packed by the Finder is rejected by its first foreign entry.
  const repacked = await writeZip(test.info().outputPath('repacked.zip'), [
    { name: '__MACOSX/._document.json', data: new Uint8Array([0]) },
    { name: 'document.json', data: json(archiveHead) },
  ])
  await chooseImportFile(page, repacked)
  await expect(activityText(page)).toHaveText(
    'Import failed. The archive contains “__MACOSX/._document.json”, which a Tree notes archive cannot contain. Import the original file that Tree exported.',
  )
  await capture(page, 'data-import-failed.png')
  await activity(page).getByRole('button', { name: 'OK', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(activity(page)).toBeHidden()
  await unchanged()

  // A damaged image after a staged one removes the staged image.
  const damaged = await writeZip(test.info().outputPath('damaged.zip'), [
    { name: 'document.json', data: json(archiveHead) },
    { name: 'attachments/new-a.png', data: onePixelPng },
    { name: 'attachments/new-b.png', data: onePixelPng, crc32: 1 },
  ])
  await chooseImportFile(page, damaged)
  await expect(activityText(page)).toHaveText('Import failed. “attachments/new-b.png” is damaged.')
  await activity(page).getByRole('button', { name: 'OK', exact: true }).click()
  await unchanged()

  // The worker fails to write the head; the staged images go and this session saves again.
  await page.route(/archive\.worker/, async (route) => {
    const response = await route.fetch()
    const patch = `{
      const put = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args)
        if (this.name === 'document') this.transaction.abort()
        return request
      }
    }\n`
    await route.fulfill({ response, body: patch + (await response.text()) })
  })
  await chooseImportFile(page, valid)
  await dialog.getByRole('button', { name: 'Replace Notes', exact: true }).click()
  await expect(activityText(page)).toHaveText(/^Import failed\. Your notes could not be replaced: /)
  await expect(dialog).toBeHidden()
  await page.unroute(/archive\.worker/)
  await unchanged()
  await chooseMenuItem(page, 'Vim Editing')
  const editor = page.locator('[data-node-id="welcome"] .node-input')
  await editor.click()
  await editor.press('End')
  await editor.pressSequentially(' still editing')
  await page.evaluate(() => window.prototypeStore.flushPersistence())
  await saved(page)
  expect((await readStored(page, 'document', 'head')).document.roots[0]!.text).toMatch(/ still editing$/)
  expect(errors).toEqual([])
})

// @requirement PRODUCT.md §24.4
test('replaces invalid stored notes with an imported archive', async ({ newContext, baseURL }) => {
  const page = await (await newContext()).newPage()
  page.setDefaultTimeout(8000)
  await page.goto(baseURL!)
  await ready(page)
  await writeStored(page, 'document', 'head', { invalid: 'stored before the import' })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'error')
  const valid = await writeExportedArchive(test.info().outputPath('recovery.zip'), archiveHead, {
    'new-a': onePixelPng,
  })

  await chooseImportFile(page, valid)
  const dialog = confirmation(page)
  await expect(dialog.locator('#import-confirm-current')).toHaveText(
    'The notes saved in this browser are invalid and cannot be opened. Importing replaces them.',
  )
  await expect(dialog.getByRole('button', { name: 'Export Current Notes First' })).toBeHidden()
  const reloaded = page.waitForEvent('load')
  await dialog.getByRole('button', { name: 'Replace Notes', exact: true }).click()
  await reloaded
  await ready(page)
  expect(await readStored(page, 'document', 'head')).toEqual(archiveHead)
  expect(await blobKeys(page)).toEqual(['new-a'])
  await expect(page.locator('[data-node-id="imported"] .node-input')).toHaveValue('Imported notes')
})
