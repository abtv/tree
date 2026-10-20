/* global window, document, indexedDB, OffscreenCanvas */
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createStaticServer } from '../../scripts/web/static-server.mts'
import { listCentralEntries } from '../../src/web/archive/zip-test-utils.ts'
import { recordPerfResult } from '../results.ts'

// Measures "Export Notes…" in the built browser package (PRODUCT §24.3, §22.1): the worker writes
// the archive while the main thread only appends transferred chunks to a Blob.
const NODE_COUNT = 100_000
const IMAGE_COUNT = 300
const IMAGE_SIZE = 512
const LONG_TASK_CEILING_MS = 200

const server = createStaticServer()
let origin = ''

test.beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}/`
})

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const ready = (page) =>
  page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready', undefined, { timeout: 60_000 })

// Writes a synthetic head of NODE_COUNT nodes and IMAGE_COUNT stored noise images straight into
// IndexedDB; the page reloads afterwards so the editor opens the seeded notes.
function seedLargeProfile(page) {
  return page.evaluate(
    async ({ nodeCount, imageCount, imageSize }) => {
      const canvas = new OffscreenCanvas(imageSize, imageSize)
      const context = canvas.getContext('2d')
      const image = context.createImageData(imageSize, imageSize)
      for (let offset = 0; offset < image.data.length; offset += 65_536) {
        crypto.getRandomValues(image.data.subarray(offset, offset + 65_536))
      }
      for (let alpha = 3; alpha < image.data.length; alpha += 4) image.data[alpha] = 255
      context.putImageData(image, 0, 0)
      const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())

      const roots = []
      const perRoot = 1000
      for (let root = 0; root < nodeCount / perRoot; root += 1) {
        const children = []
        for (let child = 1; child < perRoot; child += 1) {
          const index = root * perRoot + child
          children.push({
            id: `n${index}`,
            text: `Synthetic note ${index} with ordinary words for a realistic document size`,
            ...(index <= imageCount ? { attachment: { id: `image-${index}`, mimeType: 'image/png' } } : {}),
            children: [],
          })
        }
        roots.push({ id: `r${root}`, text: `Section ${root}`, children })
      }
      const head = {
        version: 4,
        document: { roots },
        location: { currentParentId: null, selectedNodeId: 'r0' },
        view: { expandedIds: [] },
      }
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('tree-browser-prototype')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['document', 'blobs'], 'readwrite')
        tx.objectStore('document').put(head, 'head')
        for (let index = 1; index <= imageCount; index += 1) tx.objectStore('blobs').put(png.slice(), `image-${index}`)
        tx.oncomplete = resolve
        tx.onabort = () => reject(tx.error)
      })
      db.close()
      return png.byteLength
    },
    { nodeCount: NODE_COUNT, imageCount: IMAGE_COUNT, imageSize: IMAGE_SIZE },
  )
}

test('exports a large profile without blocking the main thread', async ({ browser }) => {
  test.setTimeout(300_000)
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, acceptDownloads: true })
  try {
    const page = await context.newPage()
    await page.goto(origin)
    await ready(page)
    const imageBytes = await seedLargeProfile(page)
    await page.reload()
    await ready(page)

    await page.evaluate(() => {
      window.exportPerf = { longTasks: [] }
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.exportPerf.longTasks.push(entry.duration)
      }).observe({ type: 'longtask' })
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    const heap = async () =>
      (await cdp.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'JSHeapUsedSize').value
    const heapBefore = await heap()
    let peakHeap = heapBefore
    let sampling = true
    const sampler = (async () => {
      while (sampling) {
        peakHeap = Math.max(peakHeap, await heap())
        await page.waitForTimeout(50)
      }
    })()

    await page.getByRole('button', { name: 'Tree menu', exact: true }).click()
    const downloading = page.waitForEvent('download', { timeout: 240_000 })
    const started = Date.now()
    await page.getByRole('dialog', { name: 'Tree menu' }).getByRole('button', { name: 'Export Notes…' }).click()
    const download = await downloading
    const exportMs = Date.now() - started
    sampling = false
    await sampler

    const archive = new Uint8Array(await readFile(await download.path()))
    expect(listCentralEntries(archive)).toHaveLength(IMAGE_COUNT + 1)
    expect(await page.evaluate(() => document.getElementById('data-activity-text').textContent)).toMatch(/^Exported/)
    const longTasks = await page.evaluate(() => window.exportPerf.longTasks)
    const totalBlockingMs = longTasks.reduce((total, duration) => total + Math.max(0, duration - 50), 0)
    const maxLongTaskMs = Math.max(0, ...longTasks)
    recordPerfResult({
      kind: 'web-export',
      scenario: `nodes-${NODE_COUNT}-images-${IMAGE_COUNT}`,
      metrics: {
        exportMs,
        longTaskCount: longTasks.length,
        maxLongTaskMs: Math.round(maxLongTaskMs),
        totalBlockingMs: Math.round(totalBlockingMs),
        mainHeapGrowthMiB: Math.round(((peakHeap - heapBefore) / 1024 / 1024) * 10) / 10,
        archiveMiB: Math.round((archive.byteLength / 1024 / 1024) * 10) / 10,
        imageKiB: Math.round(imageBytes / 1024),
      },
    })
    expect(maxLongTaskMs, 'The main thread must not block while the worker writes the archive').toBeLessThan(
      LONG_TASK_CEILING_MS,
    )
  } finally {
    await context.close()
  }
})
