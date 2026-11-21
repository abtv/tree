// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import {
  attachmentPath,
  expect,
  launchTree,
  screenshotContentSize,
  seedDocument,
  setMainWindowContentSize,
  test,
} from './fixtures'
import { solidPng } from './solid-png'

// Forty roots; `r30` holds forty children, and its child `c20` holds one grandchild.
function seedRoundTrip(userDataDir: string): void {
  const leaf = (id: string, children: unknown[] = []) => ({ id, text: `Node ${id}`, children })
  const children = Array.from({ length: 40 }, (_, index) => leaf(`c${index}`, index === 20 ? [leaf('g0')] : []))
  seedDocument(userDataDir, {
    document: { roots: Array.from({ length: 40 }, (_, index) => leaf(`r${index}`, index === 30 ? children : [])) },
    location: { currentParentId: null, selectedNodeId: 'r0' },
  })
}

async function press(window: Page, key: string, times: number): Promise<void> {
  for (let pressed = 0; pressed < times; pressed += 1) await window.keyboard.press(key)
}

async function selectedRow(window: Page, nodeId: string) {
  const row = window.locator(`.node-row[data-node-id="${nodeId}"]`)
  await expect(row.locator('.node-input')).toBeFocused()
  return row
}

async function rowTop(window: Page, nodeId: string): Promise<number> {
  const box = await window.locator(`.node-row[data-node-id="${nodeId}"]`).boundingBox()
  if (box === null) throw new Error(`Row ${nodeId} is not laid out.`)
  return box.y
}

async function offset(window: Page, nodeId: string, expectedTop: number): Promise<number> {
  return Math.abs((await rowTop(window, nodeId)) - expectedTop)
}

// Walking with `j` leaves the row near the bottom edge; walking back with `k` lifts it within the window.
async function enterRoundTripLevels(window: Page): Promise<{ parentTop: number; childTop: number }> {
  await press(window, 'j', 39)
  await press(window, 'k', 9)
  await selectedRow(window, 'r30')
  const parentTop = await rowTop(window, 'r30')

  await window.keyboard.type('gd')
  await selectedRow(window, 'c0')
  await press(window, 'j', 25)
  await press(window, 'k', 5)
  await selectedRow(window, 'c20')
  const childTop = await rowTop(window, 'c20')

  await window.keyboard.type('gd')
  await selectedRow(window, 'g0')

  return { parentTop, childTop }
}

test.describe('Layout stability when leaving a node', () => {
  // @requirement PRODUCT.md §7.1
  test('keeps the rows below an image in place while Ctrl+o restores the parent level', async ({ userDataDir }) => {
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(attachmentPath(userDataDir, 'img1'), solidPng(200, 120))
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'inbox', text: 'Inbox', children: [{ id: 'item', text: 'Item', children: [] }] },
          { id: 'image', text: '', attachment: { id: 'img1', mimeType: 'image/png' }, children: [] },
          { id: 'last', text: 'Last row', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'inbox' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const lastRow = window.locator('[data-node-id="last"]')

    await expect(window.getByAltText('Attached image')).toBeVisible()

    const settledTop = (await lastRow.boundingBox())?.y

    await window.keyboard.press('g')
    await window.keyboard.press('d')

    await expect(window.locator('.node-row')).toHaveCount(1)

    // A hidden window on a loaded CI runner can go without animation frames, so the layout is
    // sampled at every DOM mutation and image load instead; reading the rectangle forces layout.
    await window.evaluate(() => {
      const observed = globalThis as unknown as { __lastRowTops: number[]; __sampleLastRowTop: () => void }
      observed.__lastRowTops = []
      observed.__sampleLastRowTop = (): void => {
        const top = document.querySelector('[data-node-id="last"]')?.getBoundingClientRect().top
        const tops = observed.__lastRowTops
        if (top !== undefined && tops[tops.length - 1] !== Math.round(top)) tops.push(Math.round(top))
      }
      new MutationObserver(observed.__sampleLastRowTop).observe(document.body, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      })
      document.addEventListener('load', observed.__sampleLastRowTop, true)
    })
    await window.keyboard.press('Control+o')

    await expect(window.getByAltText('Attached image')).toBeVisible()

    await window.waitForTimeout(300)

    const tops = await window.evaluate(() => {
      const observed = globalThis as unknown as { __lastRowTops: number[]; __sampleLastRowTop: () => void }
      observed.__sampleLastRowTop()
      return observed.__lastRowTops
    })

    expect(tops).toEqual([Math.round(settledTop ?? -1)])
  })

  // @requirement PRODUCT.md §7.1
  test('returns each entered row to its window position on nested Ctrl+o', async ({ userDataDir }) => {
    seedRoundTrip(userDataDir)
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await setMainWindowContentSize(app, screenshotContentSize)
    const { parentTop, childTop } = await enterRoundTripLevels(window)

    // The levels stand at different heights, so each return proves its own remembered position.
    expect(Math.abs(parentTop - childTop)).toBeGreaterThan(50)

    await window.keyboard.press('Control+o')

    await selectedRow(window, 'c20')
    await expect.poll(() => offset(window, 'c20', childTop)).toBeLessThanOrEqual(1)

    await window.keyboard.press('Control+o')

    await selectedRow(window, 'r30')
    await expect.poll(() => offset(window, 'r30', parentTop)).toBeLessThanOrEqual(1)

    // Layout settling after the return must not move the row away again.
    await window.waitForTimeout(300)

    expect(await offset(window, 'r30', parentTop)).toBeLessThanOrEqual(1)
  })

  // @requirement PRODUCT.md §7.1
  // @requirement PRODUCT.md §20.7
  test('returns the entered row to its window position through the location path', async ({ userDataDir }) => {
    seedRoundTrip(userDataDir)
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await setMainWindowContentSize(app, screenshotContentSize)
    const { parentTop } = await enterRoundTripLevels(window)

    await window.getByRole('button', { name: 'Top level' }).click()

    await selectedRow(window, 'r30')
    await expect.poll(() => offset(window, 'r30', parentTop)).toBeLessThanOrEqual(1)
  })

  // @requirement PRODUCT.md §7.1
  test('keeps the returning row whole at the bottom of a window made shorter', async ({ userDataDir }) => {
    seedRoundTrip(userDataDir)
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await setMainWindowContentSize(app, screenshotContentSize)
    await press(window, 'j', 30)
    await selectedRow(window, 'r30')
    await window.keyboard.type('gd')
    await selectedRow(window, 'c0')

    await setMainWindowContentSize(app, { width: screenshotContentSize.width, height: 300 })
    await window.keyboard.press('Control+o')

    await selectedRow(window, 'r30')
    const contentBottom = async (): Promise<number> => {
      const box = await window.locator('.scroll-viewport').boundingBox()
      if (box === null) throw new Error('The content area is not laid out.')
      return box.y + box.height
    }
    const rowBottom = async (): Promise<number> => {
      const box = await window.locator('.node-row[data-node-id="r30"]').boundingBox()
      if (box === null) throw new Error('Row r30 is not laid out.')
      return box.y + box.height
    }
    await expect.poll(async () => Math.abs((await contentBottom()) - (await rowBottom()))).toBeLessThanOrEqual(1)
  })

  // @requirement PRODUCT.md §17.1
  test('shows a previously displayed image in the first render after Agenda closes', async ({ userDataDir }) => {
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(attachmentPath(userDataDir, 'img1'), solidPng(1600, 1000))
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First', children: [] },
          { id: 'image', text: '', attachment: { id: 'img1', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await expect(window.getByAltText('Attached image')).toBeVisible()

    await window.keyboard.press('Meta+p')

    await expect(window.locator('[data-node-id="image"]')).toHaveCount(0)

    // Mutation callbacks run before the browser paints the remounted row, so a decoded image here
    // is already part of its first frame.
    await window.evaluate(() => {
      const observed = globalThis as unknown as { __imageFirstRender: string | undefined }
      observed.__imageFirstRender = undefined
      const observer = new MutationObserver(() => {
        const row = document.querySelector('[data-node-id="image"]')
        if (row === null) return
        const image = row.querySelector<HTMLImageElement>('img.attachment-image')
        observed.__imageFirstRender =
          image === null ? 'missing' : image.complete && image.naturalWidth > 0 ? 'decoded' : 'loading'
        observer.disconnect()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await window.keyboard.press('Meta+p')

    await expect(window.getByAltText('Attached image')).toBeVisible()

    expect(
      await window.evaluate(() => (globalThis as unknown as { __imageFirstRender?: string }).__imageFirstRender),
    ).toBe('decoded')
  })
})
