// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator } from '@playwright/test'
import { attachmentPath, expect, launchTree, seedDocument, test } from './fixtures'
import { solidPng } from './solid-png'

const ROWS = 600

async function holdAttachmentRead(app: ElectronApplication): Promise<() => Promise<void>> {
  await app.evaluate(() => {
    const control = globalThis as typeof globalThis & { releaseAttachmentRead?: () => void }
    const pending = new Promise<void>((resolve) => {
      control.releaseAttachmentRead = resolve
    })
    globalThis.__treeIpc.wrap('tree:read-attachment', async (read, ...args) => {
      await pending
      return read(...args)
    })
  })
  return () =>
    app.evaluate(() =>
      (globalThis as typeof globalThis & { releaseAttachmentRead: () => void }).releaseAttachmentRead(),
    )
}

async function startProbe(row: Locator) {
  await expect(row).toBeVisible()
  // Take explicit samples while loading and after it finishes. Hidden windows
  // may skip animation frames under load, but any frames they deliver also count.
  return row.evaluateHandle((element) => {
    const top = () => (element.isConnected ? Math.round(element.getBoundingClientRect().top) : null)
    const initial = top()
    const positions = new Set([initial])
    let frame: number
    const sampleFrame = () => {
      positions.add(top())
      frame = requestAnimationFrame(sampleFrame)
    }
    frame = requestAnimationFrame(sampleFrame)
    return {
      finish: () => {
        cancelAnimationFrame(frame)
        positions.add(top())
        return { initial, positions: [...positions] }
      },
    }
  })
}

async function expectStableTop(probe: Awaited<ReturnType<typeof startProbe>>): Promise<void> {
  const { initial, positions } = await probe.evaluate((probe) => probe.finish())

  expect(initial).not.toBeNull()
  expect(positions).toEqual([initial])
}

function rows(image: { index: number; id: string; parent?: boolean }) {
  return Array.from({ length: ROWS }, (_, index) => {
    const row = { id: `row-${index}`, text: `Row ${index}`, children: [] as unknown[] }
    if (index !== image.index) return row
    const node = {
      id: image.id,
      text: 'Picture',
      attachment: { id: 'picture', mimeType: 'image/png', width: 160, height: 160 },
      children: [],
    }
    return image.parent === true ? { ...row, children: [node] } : node
  })
}

function seedPicture(userDataDir: string): void {
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(attachmentPath(userDataDir, 'picture'), solidPng(160, 160))
}

async function expectLoadedImage(row: Locator): Promise<void> {
  const image = row.locator('img.attachment-image')
  await expect(image).toHaveJSProperty('complete', true)
  await expect(image).toHaveJSProperty('naturalWidth', 160)
}

test.describe('Image space reserved from the stored size', () => {
  // @requirement PRODUCT.md §17.1
  test('zo opens a branch whose image never displayed without moving the row below it again', async ({
    userDataDir,
  }) => {
    seedPicture(userDataDir)
    seedDocument(userDataDir, {
      document: { roots: rows({ index: 2, id: 'picture-node', parent: true }) },
      location: { currentParentId: null, selectedNodeId: 'row-2' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const release = await holdAttachmentRead(app)
    const picture = window.locator('[data-node-id="picture-node"]')

    await expect(window.locator('[data-node-id="row-3"]')).toBeVisible()
    await expect(picture).toHaveCount(0)

    await window.keyboard.press('z')
    await window.keyboard.press('o')
    await expect(picture).toBeVisible()
    const probe = await startProbe(window.locator('[data-node-id="row-3"]'))

    await release()
    await expectLoadedImage(picture)

    await expectStableTop(probe)
  })

  // @requirement PRODUCT.md §17.1
  test('zo keeps the row below in place when an image with a stored size cannot be loaded', async ({ userDataDir }) => {
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    seedDocument(userDataDir, {
      document: { roots: rows({ index: 2, id: 'picture-node', parent: true }) },
      location: { currentParentId: null, selectedNodeId: 'row-2' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const release = await holdAttachmentRead(app)
    const picture = window.locator('[data-node-id="picture-node"]')

    await expect(window.locator('[data-node-id="row-3"]')).toBeVisible()
    await expect(picture).toHaveCount(0)

    await window.keyboard.press('z')
    await window.keyboard.press('o')
    await expect(picture).toBeVisible()
    const probe = await startProbe(window.locator('[data-node-id="row-3"]'))

    await release()
    await expect(picture).toContainText('Image could not be loaded.')

    await expectStableTop(probe)
  })

  // @requirement PRODUCT.md §17.1
  test('G to the last of 600 rows keeps it in place while an image nine rows above loads', async ({ userDataDir }) => {
    seedPicture(userDataDir)
    seedDocument(userDataDir, {
      document: { roots: rows({ index: ROWS - 10, id: 'picture-node' }) },
      location: { currentParentId: null, selectedNodeId: 'row-0' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const release = await holdAttachmentRead(app)
    const picture = window.locator('[data-node-id="picture-node"]')
    const lastRow = window.locator(`[data-node-id="row-${ROWS - 1}"]`)

    await expect(window.locator('[data-node-id="row-0"]')).toBeVisible()
    await expect(picture).toHaveCount(0)

    await window.keyboard.press('G')
    await expect(lastRow).toBeInViewport()
    const probe = await startProbe(lastRow)

    await release()
    await expectLoadedImage(picture)

    await expectStableTop(probe)
  })
})
