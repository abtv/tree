// @editing-modes: both
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  attachmentPath,
  describeForEachEditingMode,
  launchTree,
  closeApp,
  setMainWindowBounds,
  setMainWindowContentSize,
  titleStripHeight,
  seedDocument,
  lockSystemClipboard,
  firePaste,
  node,
  fireIdleSave,
  tryReadPersisted,
  writeClipboardImageSized,
  typeInto,
} from './fixtures'
import { solidPng } from './solid-png'

describeForEachEditingMode('automatic image search', ({ screenshotName }) => {
  // @requirement PRODUCT.md §15.1
  // @requirement PRODUCT.md §20.14
  test('recognizes paste, preserves hidden text after restart and removes matches with the image', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'source', text: 'Screenshot', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'source' },
    })
    const { app, window } = await launchTree(userDataDir)
    await window.clock.install()
    const bytes = await window.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 240
      const context = canvas.getContext('2d')!
      context.fillStyle = 'white'
      context.fillRect(0, 0, 800, 240)
      context.fillStyle = 'black'
      context.font = '64px Arial'
      context.fillText('Secret Zebra', 30, 130)
      return Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), (c) => c.charCodeAt(0))
    })
    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & { releaseImageOcr?: () => void }
      globalThis.__treeIpc.wrap('tree:image-to-text', async (original, ...args) => {
        await new Promise<void>((resolve) => {
          control.releaseImageOcr = resolve
        })
        return original(...args)
      })
    })
    await lockSystemClipboard()
    await app.evaluate(async ({ clipboard, ClipboardItem }, png) => {
      clipboard.clear()
      await clipboard.write([
        new ClipboardItem({ 'public.png': new Blob([new Uint8Array(png)], { type: 'image/png' }) }),
      ])
    }, bytes)

    await firePaste(node(window, 1))
    const image = window.locator('.attachment-button')
    await expect(image).toHaveAttribute('data-recognition-incomplete', 'true')
    await expect(image.locator('..')).toHaveScreenshot(screenshotName('image-recognition-pending.png'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => window.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
    await expect(image.locator('..')).toHaveScreenshot(screenshotName('image-recognition-pending-dark.png'))
    await window.emulateMedia({ colorScheme: 'light' })
    const pendingBox = await image.boundingBox()
    await expect
      .poll(() =>
        app.evaluate(
          () =>
            typeof (
              globalThis as typeof globalThis & {
                releaseImageOcr?: () => void
              }
            ).releaseImageOcr,
        ),
      )
      .toBe('function')
    await app.evaluate(() => (globalThis as typeof globalThis & { releaseImageOcr: () => void }).releaseImageOcr())
    await expect(image).not.toHaveAttribute('data-recognition-incomplete', 'true', { timeout: 30_000 })
    expect(await image.boundingBox()).toEqual(pendingBox)
    await expect(node(window, 1)).toHaveValue('Screenshot')
    await expect(window.locator('.node-input')).toHaveCount(1)
    await fireIdleSave(window)
    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.attachment?.searchText)
      .toContain('Secret Zebra')
    await closeApp(app)

    const reopened = await launchTree(userDataDir)
    await expect(reopened.window.locator('.attachment-button')).not.toHaveAttribute(
      'data-recognition-incomplete',
      'true',
    )
    await reopened.app.evaluate(() => {
      const probe = globalThis as typeof globalThis & { reindexedImages: number }
      probe.reindexedImages = 0
      globalThis.__treeIpc.wrap('tree:image-to-text', async (original, ...args) => {
        const result = await original(...args)
        probe.reindexedImages++
        return result
      })
    })
    await reopened.window.keyboard.press('Meta+Shift+p')
    await reopened.window.getByRole('combobox', { name: 'Command' }).fill('reindex-all-images')
    await reopened.window.keyboard.press('Enter')

    await expect
      .poll(
        () =>
          reopened.app.evaluate(() => (globalThis as typeof globalThis & { reindexedImages: number }).reindexedImages),
        { timeout: 30_000 },
      )
      .toBe(1)
    await expect(reopened.window.locator('.node-input')).toHaveCount(1)
    await reopened.window.keyboard.press('Meta+;')
    await reopened.window.getByRole('searchbox', { name: 'Search query' }).fill('secret zebra')
    await expect(reopened.window.getByRole('listbox', { name: 'Search results' }).getByRole('option')).toHaveCount(1)
    await expect(reopened.window.getByRole('listbox', { name: 'Search results' })).toContainText('Screenshot')
    await expect(reopened.window.locator('.recent-node-image-excerpt .node-search-match')).toHaveText([
      'Secret',
      'Zebra',
    ])
    await reopened.window.keyboard.press('Escape')
    await reopened.window.keyboard.press('Meta+Backspace')
    await expect(reopened.window.locator('.attachment-button')).toHaveCount(0)
    await reopened.window.keyboard.press('Meta+;')
    await reopened.window.getByRole('searchbox', { name: 'Search query' }).fill('secret zebra')
    await expect(reopened.window.getByText('No results', { exact: true })).toBeVisible()
  })
})

test.describe('image thumbnails in Search', () => {
  // @requirement PRODUCT.md §20.14.2
  test('reads only nearby image results on the first query', async ({ userDataDir }) => {
    const images = Array.from({ length: 48 }, (_, index) => ({
      id: `result-${index}`,
      text: `Picture ${index}`,
      attachment: { id: `image-${index}`, mimeType: 'image/png', width: 320, height: 240, searchText: 'release' },
      children: [],
    }))
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'branch', text: 'Pictures', children: images }] },
      location: { currentParentId: null, selectedNodeId: 'branch' },
    })
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    const png = solidPng(320, 240)
    for (const result of images) writeFileSync(attachmentPath(userDataDir, result.attachment.id), png)
    const { app, window } = await launchTree(userDataDir)
    await setMainWindowBounds(app, { width: 700, height: 600 })
    await app.evaluate(() => {
      const probe = { ids: [] as string[] }
      Object.assign(globalThis, { searchThumbnailReads: probe })
      globalThis.__treeIpc.wrap('tree:read-attachment', (original, event, id) => {
        probe.ids.push(String(id))
        return original(event, id)
      })
    })

    await window.keyboard.press('Meta+;')
    const popup = window.getByRole('dialog', { name: 'Search' })
    await popup.getByRole('searchbox').fill('release')
    await expect(popup.getByLabel('Result position')).toHaveText('1 / 48')
    await expect
      .poll(() =>
        popup
          .locator('img.search-thumbnail')
          .first()
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(320)
    const ids = await app.evaluate(
      () => (globalThis as unknown as { searchThumbnailReads: { ids: string[] } }).searchThumbnailReads.ids,
    )

    expect(ids).toContain('image-0')
    expect(ids).not.toContain('image-12')
    expect(ids.length).toBeLessThanOrEqual(12)
  })

  // @requirement PRODUCT.md §20.14.2
  test('shows a fitted image thumbnail under the text of a result found through its image', async ({
    userDataDir,
  }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'wide',
            text: 'Plan screenshot',
            attachment: {
              id: 'wide-image',
              mimeType: 'image/png',
              width: 800,
              height: 240,
              searchText: `Review the release Version and the ${'documented plan '.repeat(7)}`,
            },
            children: [],
          },
          {
            id: 'tall',
            text: '',
            attachment: {
              id: 'tall-image',
              mimeType: 'image/png',
              width: 100,
              height: 300,
              searchText: 'release Version',
            },
            children: [],
          },
          { id: 'plain', text: 'Release Version notes', children: [] },
          {
            id: 'ancestor',
            text: 'Roadmap',
            attachment: { id: 'wide-image', mimeType: 'image/png', searchText: 'architecture notes' },
            children: [{ id: 'milestone', text: 'Milestone', children: [] }],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'plain' },
    })
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(attachmentPath(userDataDir, 'wide-image'), solidPng(800, 240))
    writeFileSync(attachmentPath(userDataDir, 'tall-image'), solidPng(100, 300))
    const { app, window } = await launchTree(userDataDir)
    // Center the initially odd-height popup on a whole pixel so the screenshot does not include
    // a row of pixels from the outline behind its top edge.
    const contentSize = { width: 700, height: 601 }
    await setMainWindowContentSize(app, contentSize)
    await expect
      .poll(() => window.evaluate(() => [innerWidth, innerHeight]))
      .toEqual([contentSize.width, contentSize.height + titleStripHeight])
    await window.keyboard.press('Meta+;')
    const popup = window.getByRole('dialog', { name: 'Search' })
    await popup.getByRole('searchbox').fill('release Version')
    const rows = popup.locator('.recent-node-row')
    const excerpts = rows.locator('.recent-node-image-excerpt')
    await expect(rows).toHaveCount(3)
    await expect(excerpts).toHaveCount(2)
    await expect(rows.first().getByText('Plan screenshot', { exact: true })).toBeVisible()
    await expect(rows.nth(1).locator('[data-replaces-title]')).toHaveCount(1)
    await expect(excerpts.locator('.node-search-match')).toHaveText(['release', 'Version', 'release', 'Version'])
    await expect(excerpts.getByRole('img', { name: 'Text in image' })).toHaveCount(2)
    const thumbnails = popup.locator('img.search-thumbnail')
    await expect(thumbnails).toHaveCount(2)
    await expect
      .poll(() => thumbnails.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete)))
      .toBe(true)

    const geometry = await rows.evaluateAll((elements) =>
      elements.map((row) => {
        const image = row.querySelector('img.search-thumbnail')?.getBoundingClientRect()
        const text = row.querySelector<HTMLElement>('.recent-node-text')!
        const excerpt = row.querySelector<HTMLElement>('.recent-node-image-content')
        const icon = row.querySelector('.recent-node-image-recognition')?.getBoundingClientRect()
        if (image === undefined || excerpt === null || icon === undefined) return null
        const range = document.createRange()
        range.selectNodeContents(excerpt)
        const lines = [...range.getClientRects()]
        const first = lines[0]!
        const second = lines.find((line) => line.y > first.y) ?? first
        const lineHeight = Number.parseFloat(getComputedStyle(excerpt).lineHeight)
        return {
          width: image.width,
          height: image.height,
          left: image.left - text.getBoundingClientRect().left,
          gap: image.top - excerpt.getBoundingClientRect().bottom,
          iconOffset: icon.top + icon.height / 2 - excerpt.getBoundingClientRect().top - lineHeight / 2,
          wrapIndent: second.left - first.left,
        }
      }),
    )
    expect(geometry).toEqual([
      { width: 120, height: 36, left: 0, gap: expect.any(Number), iconOffset: 0, wrapIndent: 0 },
      { width: 16, height: 48, left: 0, gap: expect.any(Number), iconOffset: 0, wrapIndent: 0 },
      null,
    ])
    expect(geometry[0]!.gap).toBeGreaterThanOrEqual(0)
    await expect(popup.getByRole('button', { name: 'Open image preview' })).toHaveCount(0)
    expect((await popup.boundingBox())!.y % 1, 'The screenshot must start on a whole pixel.').toBe(0)

    for (const appearance of ['light', 'dark'] as const) {
      await window.evaluate((value) => globalThis.window.treeApi.setAppearance(value), appearance)
      await window.emulateMedia({ colorScheme: appearance })
      await expect(popup).toHaveScreenshot(`search-image-thumbnails-${appearance}.png`)
    }

    await window.keyboard.press('ArrowDown')
    await window.keyboard.press('Enter')
    await expect(window.locator('[data-node-id="tall"] .node-input')).toBeFocused()

    await window.keyboard.press('Meta+Enter')
    await window.keyboard.press('Meta+;')
    await popup.getByRole('searchbox').fill('release Version')
    const struckExcerpt = popup.locator('[data-result-id="tall"] .recent-node-image-content')
    await expect(struckExcerpt).toHaveCSS('text-decoration-line', 'line-through')
    await expect(popup.locator('[data-result-id="tall"] .search-thumbnail')).toHaveCSS('text-decoration-line', 'none')
    await popup.screenshot({ path: testInfo.outputPath('search-struck-image-excerpt.png') })

    await window.keyboard.press('Escape')
    await window.keyboard.press('Meta+;')
    await popup.getByRole('searchbox').fill('milestone architecture')
    await expect(rows).toHaveCount(1)
    await expect(rows.getByText('Ancestor image', { exact: true })).toBeVisible()
    await expect(excerpts.locator('.node-search-match')).toHaveText('architecture')
    await expect(thumbnails).toHaveCount(0)
  })
})

test.describe('pending recognition with Vim image caret', () => {
  test.use({ editingMode: 'vim' })

  // @requirement PRODUCT.md §15.1
  test('keeps both the recognition border and image caret on rows and the current parent', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { appearance: 'dark' })
    await window.emulateMedia({ colorScheme: 'dark' })
    await app.evaluate(() => {
      globalThis.__treeIpc.wrap('tree:image-to-text', () => new Promise<string[]>(() => undefined))
    })
    await typeInto(node(window, 1), 'Pending image')
    await window.keyboard.press('Escape')
    await writeClipboardImageSized(app, 80, 80)
    await firePaste(node(window, 1))
    await window.keyboard.press('l')

    await expect(window.locator('.attachment-button')).toHaveClass(/attachment-image-caret/)
    await expect(window.locator('.attachment-button')).toHaveAttribute('data-recognition-incomplete', 'true')
    await expect(window.locator('.node-row').first()).toHaveScreenshot('pending-image-caret-dark.png', {
      caret: 'initial',
    })
    await window.keyboard.press('Meta+.')
    await expect(window.getByRole('region', { name: 'Current parent' }).locator('.attachment-button')).toHaveAttribute(
      'data-recognition-incomplete',
      'true',
    )
    await expect(window.getByRole('region', { name: 'Current parent' })).toHaveScreenshot(
      'pending-image-parent-dark.png',
    )
  })
})
