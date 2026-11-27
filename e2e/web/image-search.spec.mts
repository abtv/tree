// @editing-modes: independent
import { expect, test } from './fixtures.mts'

// @requirement PRODUCT.md §20.14.2
test('shows a reduced Search thumbnail and the original image after opening the result', async ({
  newContext,
  baseURL,
}) => {
  const context = await newContext({ deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 240
    const context = canvas.getContext('2d')!
    context.fillStyle = '#304070'
    context.fillRect(0, 0, 400, 240)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((png) => (png === null ? reject(new Error('Could not create a synthetic PNG')) : resolve(png))),
    )
    const id = 'search-thumbnail-source'
    await window.treeApi.writeAttachment(id, new Uint8Array(await blob.arrayBuffer()))
    await window.treeApi.save({
      version: 1,
      document: {
        roots: [
          { id: 'start', text: 'Start', children: [] },
          {
            id: 'search-thumbnail-result',
            text: 'Synthetic thumbnail result',
            attachment: { id, mimeType: 'image/png', width: 800, height: 240 },
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'start' },
    })
  })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')

  await page.locator('#tree-menu-button').click()
  await page.locator('#global-search').click()
  const input = page.getByRole('searchbox', { name: 'Search query' })
  await input.fill('synthetic thumbnail result')

  const thumbnail = page.locator('.node-search-results canvas.search-thumbnail')
  await expect(thumbnail).toHaveJSProperty('width', 240)
  await expect(thumbnail).toHaveJSProperty('height', 72)
  expect(await thumbnail.boundingBox()).toMatchObject({ width: 120, height: 36 })
  const alpha = await thumbnail.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')!
    return [context.getImageData(60, 30, 1, 1).data[3], context.getImageData(180, 30, 1, 1).data[3]]
  })
  expect(alpha).toEqual([255, 0])

  await input.press('Enter')

  await expect(page.locator('[data-node-id="search-thumbnail-result"] img.attachment-image')).toHaveJSProperty(
    'naturalWidth',
    800,
  )
})
