// Helpers for the browser data-safety specs. They read IndexedDB and seed synthetic notes through
// the page; nothing here changes production code.
import { readFile } from 'node:fs/promises'
import { listCentralEntries, readArchive } from '../../src/web/archive/zip-test-utils.ts'

export const ready = (page) => page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')

export const saved = (page) =>
  page.waitForFunction(
    () => document.getElementById('prototype-save-status').textContent === 'Saved locally in this browser',
  )

export async function openMenu(page) {
  await page.getByRole('button', { name: 'Tree menu', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Tree menu' })
  await menu.waitFor()
  return menu
}

export async function chooseMenuItem(page, name) {
  const menu = await openMenu(page)
  await menu.getByRole('button', { name, exact: true }).click()
}

/** Reads one IndexedDB value; `Uint8Array` values are returned as plain arrays. */
export function readStored(page, store, key) {
  return page.evaluate(
    async ({ store, key }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('tree-browser-prototype')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        const value = await new Promise((resolve, reject) => {
          const tx = db.transaction(store)
          const request = tx.objectStore(store).get(key)
          tx.oncomplete = () => resolve(request.result)
          tx.onabort = () => reject(tx.error)
        })
        return value instanceof Uint8Array ? [...value] : value
      } finally {
        db.close()
      }
    },
    { store, key },
  )
}

export function writeStored(page, store, key, value) {
  return page.evaluate(
    async ({ store, key, value }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('tree-browser-prototype')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite')
          tx.objectStore(store).put(value, key)
          tx.oncomplete = resolve
          tx.onabort = () => reject(tx.error)
        })
      } finally {
        db.close()
      }
    },
    { store, key, value },
  )
}

/** Creates a noise PNG of `size`×`size` pixels in the page and returns its bytes as an array. */
export function noisePng(page, size) {
  return page.evaluate(async (size) => {
    const canvas = new OffscreenCanvas(size, size)
    const context = canvas.getContext('2d')
    const image = context.createImageData(size, size)
    for (let offset = 0; offset < image.data.length; offset += 65_536) {
      crypto.getRandomValues(image.data.subarray(offset, offset + 65_536))
    }
    for (let alpha = 3; alpha < image.data.length; alpha += 4) image.data[alpha] = 255
    context.putImageData(image, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return [...new Uint8Array(await blob.arrayBuffer())]
  }, size)
}

/**
 * Stores each image through the browser adapter and inserts one child node per image after the
 * welcome node, then saves. An entry without bytes references an image that is never stored.
 */
export async function seedImageNodes(page, images) {
  await page.evaluate(async (images) => {
    for (const { id, bytes } of images) {
      if (bytes) await window.treeApi.writeAttachment(id, new Uint8Array(bytes))
    }
    window.prototypeStore.pasteSubtree('welcome', 'after', {
      id: 'seeded-images',
      text: 'Seeded images',
      children: images.map(({ id }) => ({
        id: `node-${id}`,
        text: `Image ${id}`,
        attachment: { id, mimeType: 'image/png' },
        children: [],
      })),
    })
    await window.prototypeStore.flushPersistence()
  }, images)
}

export async function readDownloadedArchive(download) {
  const bytes = new Uint8Array(await readFile(await download.path()))
  return { bytes, names: listCentralEntries(bytes).map((entry) => entry.name), entries: readArchive(bytes) }
}
