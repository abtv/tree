// @editing-modes: independent
// @requirement PRODUCT.md §24.5
import { chromium } from '@playwright/test'
import { test, expect, capture, primaryKey } from './fixtures.mts'
import {
  chooseMenuItem,
  installBackupPicker,
  noisePng,
  openMenu,
  readBackup,
  readStored,
  ready,
  saved,
  seedImageNodes,
} from './data-helpers.mts'

// Linux arm64 Playwright Chromium (1243) stops the browser process with SIGTRAP when a new
// document reads a stored OPFS directory handle from IndexedDB. The picker stub returns OPFS
// handles, so cases that reload with a stored backup folder run only on macOS Chrome. The
// canary below fails once Chromium is fixed; then remove these marks and the canary.
const storedHandleCrash = process.platform === 'linux'
const storedHandleCrashReason = 'Linux Chromium crashes when a new document reads a stored OPFS handle'

test('canary: Linux Chromium still crashes when a new document reads a stored OPFS handle', async ({ baseURL }) => {
  test.skip(!storedHandleCrash, 'Only Linux Chromium has the stored-handle crash')
  // A separate browser keeps the expected crash away from the shared test browser.
  const browser = await chromium.launch({ channel: 'chromium', headless: true })
  try {
    const page = await (await browser.newContext({ baseURL: baseURL! })).newPage()

    await page.goto('/')
    await ready(page)
    const readStoredHandle = (store: boolean) =>
      page.evaluate(async (store) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('stored-handle-canary', 1)
          request.onupgradeneeded = () => request.result.createObjectStore('handles')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const folder = store
          ? await (await navigator.storage.getDirectory()).getDirectoryHandle('canary', { create: true })
          : undefined
        const value = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
          const tx = db.transaction('handles', 'readwrite')
          const request = store
            ? tx.objectStore('handles').put(folder, 'folder')
            : tx.objectStore('handles').get('folder')
          tx.oncomplete = () => resolve(request.result)
          tx.onabort = () => reject(tx.error)
        })
        db.close()
        return store ? 'stored' : value?.kind
      }, store)
    await readStoredHandle(true)

    await page.reload()
    await ready(page)

    await expect(readStoredHandle(false)).rejects.toThrow(/closed/)
    expect(browser.isConnected()).toBe(false)
  } finally {
    await browser.close().catch(() => {})
  }
})

test('folder handles persist and a same-origin module worker can write through them', async ({ newContext }) => {
  const context = await newContext()
  const page = await context.newPage()

  // The response is a synthetic, same-origin worker. The built page retains its real meta CSP.
  await page.route('**/folder-capability-probe.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `self.onmessage = async ({ data: folder }) => {
        try {
          const file = await folder.getFileHandle('probe.txt', { create: true });
          const writable = await file.createWritable();
          await writable.write('worker write');
          await writable.close();
          self.postMessage({ text: await (await file.getFile()).text() });
        } catch (error) { self.postMessage({ error: String(error) }); }
      };`,
    }),
  )
  await page.goto('/')
  await ready(page)

  const result = await page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('probe', { create: true })
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tree-browser-prototype')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const loaded = await new Promise<FileSystemDirectoryHandle>((resolve, reject) => {
      const tx = db.transaction('preferences', 'readwrite')
      const store = tx.objectStore('preferences')
      store.put(folder, 'probe-folder')
      const read = store.get('probe-folder')
      store.delete('probe-folder')
      tx.oncomplete = () => resolve(read.result)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
    return new Promise((resolve, reject) => {
      const worker = new Worker('/folder-capability-probe.js', { type: 'module' })
      worker.onmessage = ({ data }) => {
        worker.terminate()
        resolve(data)
      }
      worker.onerror = (error) => {
        worker.terminate()
        reject(new Error(error.message))
      }
      worker.postMessage(loaded)
    })
  })

  expect(result).toEqual({ text: 'worker write' })
})

test('backs up saved notes and images, coalesces edits, resumes on reload, and stops without deleting files', async ({
  newContext,
}) => {
  test.fixme(storedHandleCrash, storedHandleCrashReason)
  const context = await newContext()

  await installBackupPicker(context)
  const page = await context.newPage()

  await page.goto('/')
  await ready(page)
  const png = await noisePng(page, 16)
  await seedImageNodes(page, [{ id: 'backup-image', bytes: png }, { id: 'missing-image' }])

  await page.locator('[data-node-id="welcome"] .node-input').pressSequentially('Pending before backup ')
  await chooseMenuItem(page, 'Back Up to Folder…')

  await expect(page.locator('#backup-status')).toContainText('Backed up to “Tree Backup”. 1 image could not be found')

  let files = await readBackup(page)

  expect(JSON.parse(files['document.json'])).toEqual(await readStored(page, 'document', 'head'))
  expect(files['document.json']).toContain('Pending before backup ')
  expect(files['attachments/backup-image.png']).toEqual(png)
  expect(Object.keys(files).sort()).toEqual(['attachments/backup-image.png', 'document.json'])

  const original = files['document.json']
  for (let index = 0; index < 5; index += 1) {
    await page.evaluate(async (index) => {
      window.prototypeStore.editText('welcome', `Saved version ${index}`)
      await window.prototypeStore.flushPersistence()
    }, index)
  }

  expect((await readBackup(page))['document.json']).toBe(original)
  await expect
    .poll(async () => JSON.parse((await readBackup(page))['document.json']).document.roots[0]!.text, {
      timeout: 15_000,
    })
    .toBe('Saved version 4')

  // New images must be present by the time the new document names them.
  await seedImageNodes(page, [{ id: 'second-image', bytes: png }])

  await expect
    .poll(
      async () => {
        files = await readBackup(page)
        return files['document.json'].includes('second-image')
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  expect(files['attachments/second-image.png']).toEqual(png)

  await saved(page)
  await page.reload()
  await ready(page)

  await expect(page.locator('#backup-status')).toContainText('Backed up to “Tree Backup”.')
  expect(await page.evaluate(() => window.backupPickerCalls)).toBe(0)

  files = await readBackup(page)

  await chooseMenuItem(page, 'Stop Backing Up')

  await expect(page.locator('#backup-status')).toHaveText('Folder backup is off.')
  expect(await readStored(page, 'preferences', 'backup-folder')).toBeUndefined()
  expect(await readBackup(page)).toEqual(files)
})

test('pauses without prompting on reload and requests permission only from the Resume click', async ({
  newContext,
}) => {
  test.fixme(storedHandleCrash, storedHandleCrashReason)
  const context = await newContext()

  await installBackupPicker(context)
  const page = await context.newPage()

  await page.goto('/')
  await ready(page)

  await chooseMenuItem(page, 'Vim Editing')
  await chooseMenuItem(page, 'Back Up to Folder…')

  await expect(page.locator('#backup-status')).toContainText('Backed up')

  await context.addInitScript(() => {
    window.backupRequests = 0
    window.backupPermission = 'prompt'
    FileSystemHandle.prototype.queryPermission = async () => window.backupPermission
    FileSystemHandle.prototype.requestPermission = async () => {
      window.backupRequests += 1
      window.backupPermission = 'granted'
      return 'granted'
    }
  })
  await page.reload()
  await ready(page)

  await expect(page.locator('#backup-status')).toContainText('Backup paused — permission needed.')
  expect(await page.evaluate(() => window.backupRequests)).toBe(0)
  await expect(page.locator('#tree-menu-button')).toHaveClass('backup-attention')

  await page.locator('#tree-menu-button').click()
  await capture(page, 'backup-paused-menu.png')
  await page.getByRole('button', { name: 'Resume Backing Up…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Resume Folder Backup?' })

  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

  await capture(page, 'backup-resume-dialog.png')
  await page.keyboard.press('h')

  await expect(dialog.getByRole('button', { name: 'Choose Another Folder', exact: true })).toBeFocused()

  await page.keyboard.press('h')

  await expect(dialog.getByRole('button', { name: 'Stop Backing Up', exact: true })).toBeFocused()

  await page.keyboard.press('h')
  await page.keyboard.press('h')

  await expect(dialog.getByRole('button', { name: 'Resume Backing Up', exact: true })).toBeFocused()

  // Cancelling the confirmation for a different occupied folder preserves the paused choice.
  await page.evaluate(async () => {
    window.backupFolderName = 'Other Backup'
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('Other Backup', { create: true })
    const stream = await (await folder.getFileHandle('document.json', { create: true })).createWritable()
    await stream.write('other notes')
    await stream.close()
  })
  await dialog.getByRole('button', { name: 'Choose Another Folder', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'This Folder Already Contains Notes' })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await page.reload()
  await ready(page)

  await expect(page.locator('#backup-status')).toContainText('Backup paused')

  await page.locator('#tree-menu-button').click()
  await page.getByRole('button', { name: 'Resume Backing Up…', exact: true }).click()

  await expect(dialog.locator('#backup-confirm-text')).toContainText('“Tree Backup”')

  await dialog.getByRole('button', { name: 'Resume Backing Up', exact: true }).click()

  await expect(page.locator('#backup-status')).toContainText('Backed up')
  expect(await page.evaluate(() => window.backupRequests)).toBe(1)
  await expect(page.locator('#tree-menu-button')).not.toHaveClass('backup-attention')
})

test('existing notes are never overwritten without choosing Replace Backup; cancellation keeps both copies', async ({
  newContext,
}) => {
  const context = await newContext()

  await installBackupPicker(context)
  const page = await context.newPage()

  await page.goto('/')
  await ready(page)

  await page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tree Backup', { create: true })
    const file = await folder.getFileHandle('document.json', { create: true })
    const stream = await file.createWritable()
    await stream.write('old backup')
    await stream.close()
  })
  const head = await readStored(page, 'document', 'head')

  await chooseMenuItem(page, 'Vim Editing')
  await chooseMenuItem(page, 'Back Up to Folder…')
  const dialog = page.getByRole('dialog', { name: 'This Folder Already Contains Notes' })

  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()

  await capture(page, 'backup-existing-folder.png')
  await page.keyboard.press('h')
  await page.keyboard.press('h')

  await expect(dialog.getByRole('button', { name: 'Replace Backup with Current Notes', exact: true })).toBeFocused()

  await page.keyboard.press('h')
  await page.keyboard.press('h')

  await expect(dialog.getByRole('button', { name: 'Restore from This Folder', exact: true })).toBeFocused()

  await page.keyboard.press('Escape')

  expect((await readBackup(page))['document.json']).toBe('old backup')
  expect(await readStored(page, 'document', 'head')).toEqual(head)

  await chooseMenuItem(page, 'Back Up to Folder…')
  await dialog.getByRole('button', { name: 'Choose Another Folder', exact: true }).click()

  await expect(dialog).toBeVisible()
  expect((await readBackup(page))['document.json']).toBe('old backup')

  await dialog.getByRole('button', { name: 'Replace Backup with Current Notes', exact: true }).click()

  await expect(page.locator('#backup-status')).toContainText('Backed up')
  expect(JSON.parse((await readBackup(page))['document.json'])).toEqual(await readStored(page, 'document', 'head'))
})

test('folder failure is visible and unsupported browsers hide the controls', async ({ newContext }) => {
  const context = await newContext()

  await installBackupPicker(context)
  const page = await context.newPage()

  await page.goto('/')
  await ready(page)

  await chooseMenuItem(page, 'Back Up to Folder…')

  await expect(page.locator('#backup-status')).toContainText('Backed up')

  await page.evaluate(async () => {
    await (await navigator.storage.getDirectory()).removeEntry('Tree Backup', { recursive: true })
    window.prototypeStore.editText('welcome', 'Cannot back up this version')
    await window.prototypeStore.flushPersistence()
  })

  await expect(page.locator('#backup-status')).toContainText('Backup failed.', { timeout: 15_000 })
  await expect(page.locator('#tree-menu-button')).toHaveClass('backup-attention')

  await page.locator('#tree-menu-button').click()
  await capture(page, 'backup-failed-menu.png')

  await expect(page.locator('#prototype-problem')).toBeHidden()

  const unsupported = await newContext()

  await unsupported.addInitScript(() => {
    delete window.showDirectoryPicker
  })
  const other = await unsupported.newPage()

  await other.goto('/')
  await ready(other)

  await openMenu(other)

  await expect(other.locator('#data-backup')).toBeHidden()
  await expect(other.locator('#data-restore')).toBeHidden()
  await expect(other.locator('#backup-status')).toBeHidden()
})

test('backup menu fits light, dark and narrow viewports', async ({ newContext }) => {
  for (const [appearance, width] of [
    ['light', 1100],
    ['dark', 1100],
    ['light', 390],
  ] as const) {
    const context = await newContext({ viewport: { width, height: 760 }, colorScheme: appearance })

    await installBackupPicker(context)
    const page = await context.newPage()

    await page.goto('/')
    await ready(page)

    await openMenu(page)

    await expect(page.locator('#data-backup')).toBeVisible()

    const bounds = (await page.locator('#tree-menu').boundingBox())!

    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)

    await capture(page, `backup-menu-${appearance}-${width}.png`)
  }
})

test('Restore from This Folder uses the import confirmation and preserves notes on cancel', async ({ newContext }) => {
  const context = await newContext()

  await installBackupPicker(context)
  const page = await context.newPage()

  await page.goto('/')
  await ready(page)
  const png = await noisePng(page, 16)
  await seedImageNodes(page, [{ id: 'restored-image', bytes: png }])

  await chooseMenuItem(page, 'Back Up to Folder…')

  await expect(page.locator('#backup-status')).toContainText('Backed up')

  const backup = JSON.parse((await readBackup(page))['document.json'])

  await chooseMenuItem(page, 'Stop Backing Up')
  await page.evaluate(async () => {
    window.prototypeStore.editText('welcome', 'Current version')
    await window.prototypeStore.flushPersistence()
  })
  const current = await readStored(page, 'document', 'head')
  const restoreChoice = async () => {
    await chooseMenuItem(page, 'Back Up to Folder…')
    await page.getByRole('button', { name: 'Restore from This Folder', exact: true }).click()
  }

  await restoreChoice()
  const dialog = page.getByRole('dialog', { name: 'Replace Current Notes?' })

  await expect(dialog.locator('#import-confirm-incoming')).toContainText('“Tree Backup”')
  await expect(dialog.locator('#import-confirm-current')).toContainText('Restoring replaces them')

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  expect(await readStored(page, 'document', 'head')).toEqual(current)

  await restoreChoice()
  const reload = page.waitForEvent('load')

  await dialog.getByRole('button', { name: 'Replace Notes', exact: true }).click()
  await reload
  await ready(page)

  expect(await readStored(page, 'document', 'head')).toEqual(backup)
  expect(await readStored(page, 'blobs', 'restored-image')).toEqual(png)
  expect(await readStored(page, 'preferences', 'backup-folder')).toBeUndefined()
})

test('a stopped backup worker can be resumed without affecting browser saves', async ({ newContext }) => {
  const context = await newContext()

  await installBackupPicker(context)
  const page = await context.newPage()

  await page.goto('/')
  await ready(page)

  await page.route(/backup\.worker/, async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: `throw new Error('Synthetic worker failure');\n${await response.text()}` })
  })
  await page.keyboard.press(`${primaryKey}+Shift+p`)
  await page.getByRole('combobox', { name: 'Command' }).fill('back-up-to-folder')
  await page.keyboard.press('Enter')

  await expect(page.locator('#backup-status')).toContainText('The backup stopped unexpectedly.')
  await expect(page.locator('#tree-menu-button')).toHaveClass('backup-attention')

  await page.locator('[data-node-id="welcome"] .node-input').pressSequentially('Saved despite backup failure ')
  await page.evaluate(() => window.prototypeStore.flushPersistence())
  await saved(page)
  await page.unroute(/backup\.worker/)
  await page.keyboard.press(`${primaryKey}+Shift+p`)
  await page.getByRole('combobox', { name: 'Command' }).fill('resume-backing-up')

  await expect(page.locator('#command-back-up-to-folder')).toHaveCount(0)

  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Resume Backing Up', exact: true }).click()

  await expect(page.locator('#backup-status')).toContainText('Backed up')
  expect((await readBackup(page))['document.json']).toContain('Saved despite backup failure ')

  await page.keyboard.press(`${primaryKey}+Shift+p`)
  await page.getByRole('combobox', { name: 'Command' }).fill('stop-backing-up')
  await page.keyboard.press('Enter')

  await expect(page.locator('#backup-status')).toHaveText('Folder backup is off.')
  expect((await readBackup(page))['document.json']).toContain('Saved despite backup failure ')
})

test('a failed image write preserves the previous document and retries an empty file after restart', async ({
  newContext,
}) => {
  test.fixme(storedHandleCrash, storedHandleCrashReason)
  const context = await newContext()

  await installBackupPicker(context)
  const page = await context.newPage()

  await page.goto('/')
  await ready(page)
  const png = await noisePng(page, 16)
  await seedImageNodes(page, [{ id: 'retry-image', bytes: png }])

  await page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tree Backup', { create: true })
    const stream = await (await folder.getFileHandle('document.json', { create: true })).createWritable()
    await stream.write('previous backup')
    await stream.close()
  })
  await page.route(/backup\.worker/, async (route) => {
    const response = await route.fetch()
    const patch = `{
      const create = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = function (...args) {
        if (this.name === 'retry-image.png') throw new DOMException('Synthetic full disk', 'QuotaExceededError');
        return create.apply(this, args);
      };
    }\n`
    await route.fulfill({ response, body: patch + (await response.text()) })
  })
  await chooseMenuItem(page, 'Back Up to Folder…')
  await page.getByRole('button', { name: 'Replace Backup with Current Notes', exact: true }).click()

  await expect(page.locator('#backup-status')).toContainText('The destination is full.')

  let files = await readBackup(page)

  expect(files['document.json']).toBe('previous backup')
  expect(files['attachments/retry-image.png']).toEqual([])

  await page.unroute(/backup\.worker/)
  await page.reload()
  await ready(page)

  await expect(page.locator('#backup-status')).toContainText('Backed up')

  files = await readBackup(page)

  expect(files['attachments/retry-image.png']).toEqual(png)
  expect(JSON.parse(files['document.json'])).toEqual(await readStored(page, 'document', 'head'))
})
