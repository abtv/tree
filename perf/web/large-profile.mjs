/* global window, indexedDB, OffscreenCanvas */
// The large synthetic browser profile shared by the notes archive scenarios (PRODUCT §24, §22.1).
export const NODE_COUNT = 100_000
export const IMAGE_COUNT = 300
export const IMAGE_SIZE = 512
export const LONG_TASK_CEILING_MS = 200

export const ready = (page) =>
  page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready', undefined, { timeout: 60_000 })

// Writes a synthetic head of NODE_COUNT nodes and IMAGE_COUNT stored noise images straight into
// IndexedDB; the page reloads afterwards so the editor opens the seeded notes.
export function seedLargeProfile(page) {
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

/** Records long tasks in the page and samples the main-thread heap until `stop` is called. */
export async function watchMainThread(context, page) {
  await page.evaluate(() => {
    window.archivePerf = { longTasks: [] }
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.archivePerf.longTasks.push(entry.duration)
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
  return async () => {
    sampling = false
    await sampler
    const longTasks = await page.evaluate(() => window.archivePerf.longTasks)
    return {
      longTaskCount: longTasks.length,
      maxLongTaskMs: Math.round(Math.max(0, ...longTasks)),
      totalBlockingMs: Math.round(longTasks.reduce((total, duration) => total + Math.max(0, duration - 50), 0)),
      mainHeapGrowthMiB: Math.round(((peakHeap - heapBefore) / 1024 / 1024) * 10) / 10,
    }
  }
}
