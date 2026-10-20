// @editing-modes: independent
// @requirement PRODUCT.md §24.6
import { test, expect, capture } from './fixtures.mjs'
import { onePixelPng } from '../../src/electron/main/png-test-utils.ts'
import { serializeState } from '../../src/domain/document.ts'
import {
  blobKeys,
  chooseMenuItem,
  installBackupPicker,
  noisePng,
  readBackup,
  readStored,
  ready,
  saved,
  seedImageNodes,
  writeFolder,
  writeStored,
} from './data-helpers.mjs'

const confirmation = (page) => page.getByRole('dialog', { name: 'Replace Current Notes?' })
const activity = (page) => page.locator('#data-activity')
const activityText = (page) => page.locator('#data-activity-text')

const folderHead = serializeState(
  {
    roots: [
      { id: 'restored', text: 'Restored notes', children: [] },
      { id: 'node-new-a', text: 'New A', attachment: { id: 'new-a', mimeType: 'image/png' }, children: [] },
    ],
  },
  { currentParentId: null, selectedNodeId: 'restored' },
  { expandedIds: [] },
)
const twoImageHead = serializeState(
  {
    roots: [
      ...folderHead.document.roots,
      { id: 'node-new-b', text: 'New B', attachment: { id: 'new-b', mimeType: 'image/png' }, children: [] },
    ],
  },
  { currentParentId: null, selectedNodeId: 'restored' },
  { expandedIds: [] },
)

test('restores a backup folder into a browser profile whose storage was cleared', async ({ newContext }) => {
  const context = await newContext()
  await installBackupPicker(context)
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await ready(page)
  const png = await noisePng(page, 16)
  await seedImageNodes(page, [{ id: 'backed-up-image', bytes: png }])
  await page.locator('[data-node-id="welcome"] .node-input').pressSequentially('Typed before backing up ')
  await chooseMenuItem(page, 'Back Up to Folder…')
  await expect(page.locator('#backup-status')).toHaveText('Backed up to “Tree Backup”.')
  const backup = JSON.parse((await readBackup(page))['document.json'])
  expect(backup.document.roots[0].text).toMatch(/^Typed before backing up /)

  // Deleting the database closes this session, which reloads into a clean start.
  const cleared = page.waitForEvent('load')
  await page.evaluate(() => {
    indexedDB.deleteDatabase('tree-browser-prototype')
  })
  await cleared
  await ready(page)
  await saved(page)
  expect(await blobKeys(page)).toEqual([])
  await expect(page.locator('#backup-status')).toHaveText('Folder backup is off.')
  const cleanHead = await readStored(page, 'document', 'head')

  await chooseMenuItem(page, 'Restore from Folder…')
  const dialog = confirmation(page)
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  expect(await page.evaluate(() => window.backupPickerOptions)).toEqual({ mode: 'read', id: 'tree-backup' })
  await expect(dialog.locator('#import-confirm-incoming')).toHaveText(
    /^“Tree Backup” \(\d+(\.\d)? KB\) contains 7 nodes and 1 image\.$/,
  )
  await expect(dialog.locator('#import-confirm-current')).toHaveText(
    'Your current notes have 5 nodes and 0 images. Restoring replaces them, and this cannot be undone.',
  )
  await capture(page, 'restore-confirm.png')
  expect(await readStored(page, 'document', 'head')).toEqual(cleanHead)

  const reloaded = page.waitForEvent('load')
  await dialog.getByRole('button', { name: 'Replace Notes', exact: true }).click()
  await reloaded
  await ready(page)
  expect(await readStored(page, 'document', 'head')).toEqual(backup)
  expect(await readStored(page, 'blobs', 'backed-up-image')).toEqual(png)
  await expect(page.locator('[data-node-id="welcome"] .node-input')).toHaveValue(/^Typed before backing up /)
  // Restoring does not turn folder backup on.
  await expect(page.locator('#backup-status')).toHaveText('Folder backup is off.')
  expect(await readStored(page, 'preferences', 'backup-folder')).toBeUndefined()
  expect(errors).toEqual([])
})

test('a cancelled or failed restore leaves the notes unchanged', async ({ newContext }) => {
  const context = await newContext()
  await installBackupPicker(context)
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  await page.goto('/')
  await ready(page)
  await seedImageNodes(page, [{ id: 'kept', bytes: [...onePixelPng] }])
  await saved(page)
  const head = await readStored(page, 'document', 'head')
  const unchanged = async () => {
    expect(await readStored(page, 'document', 'head')).toEqual(head)
    await expect.poll(() => blobKeys(page)).toEqual(['kept'])
  }
  const restoreFrom = async (name) => {
    await page.evaluate((name) => {
      window.backupFolderName = name
    }, name)
    await chooseMenuItem(page, 'Restore from Folder…')
  }
  await writeFolder(page, 'Tree Backup', {
    'document.json': JSON.stringify(folderHead),
    'attachments/new-a.png': [...onePixelPng],
    'notes.txt': 'Other folder content is ignored.',
  })

  // Cancelling the confirmation removes the image that the restore had stored.
  await restoreFrom('Tree Backup')
  await expect(confirmation(page)).toBeVisible()
  expect(await blobKeys(page)).toEqual(['kept', 'new-a'])
  await page.keyboard.press('Escape')
  await expect(confirmation(page)).toBeHidden()
  await unchanged()

  // Cancelling the picker shows nothing.
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      throw new DOMException('The user aborted a request.', 'AbortError')
    }
  })
  await chooseMenuItem(page, 'Restore from Folder…')
  await expect(activity(page)).toBeHidden()
  await page.reload()
  await ready(page)

  await writeFolder(page, 'Empty Folder', { 'notes.txt': 'No notes here.' })
  await restoreFrom('Empty Folder')
  await expect(activityText(page)).toHaveText(
    'Restore failed. “Empty Folder” does not contain document.json. Choose the folder that Tree backed up to.',
  )
  await capture(page, 'restore-failed.png')
  await activity(page).getByRole('button', { name: 'OK', exact: true }).click()
  await unchanged()

  // A damaged image after a stored one removes the stored image.
  await writeFolder(page, 'Damaged Backup', {
    'document.json': JSON.stringify(twoImageHead),
    'attachments/new-a.png': [...onePixelPng],
    'attachments/new-b.png': [1, 2, 3],
  })
  await restoreFrom('Damaged Backup')
  await expect(activityText(page)).toHaveText(/^Restore failed\. “attachments\/new-b\.png” is not a usable image\. /)
  await activity(page).getByRole('button', { name: 'OK', exact: true }).click()
  await unchanged()
})

test('restores a folder over invalid stored notes', async ({ newContext }) => {
  const context = await newContext()
  await installBackupPicker(context)
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  await page.goto('/')
  await ready(page)
  const png = await noisePng(page, 8)
  await writeFolder(page, 'Tree Backup', { 'document.json': JSON.stringify(folderHead), 'attachments/new-a.png': png })
  await writeStored(page, 'document', 'head', { invalid: 'stored before the restore' })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'error')

  await chooseMenuItem(page, 'Restore from Folder…')
  const dialog = confirmation(page)
  await expect(dialog.locator('#import-confirm-current')).toHaveText(
    'The notes saved in this browser are invalid and cannot be opened. Restoring replaces them.',
  )
  await expect(dialog.getByRole('button', { name: 'Export Current Notes First' })).toBeHidden()
  const reloaded = page.waitForEvent('load')
  await dialog.getByRole('button', { name: 'Replace Notes', exact: true }).click()
  await reloaded
  await ready(page)
  expect(await readStored(page, 'document', 'head')).toEqual(folderHead)
  expect(await readStored(page, 'blobs', 'new-a')).toEqual(png)
  await expect(page.locator('[data-node-id="restored"] .node-input')).toHaveValue('Restored notes')
})
