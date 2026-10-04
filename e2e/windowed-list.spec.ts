// @editing-modes: both
import type { Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  screenshotContentSize,
  seedDocument,
  setMainWindowBounds,
  setMainWindowContentSize,
  startRowDrag,
  test,
} from './fixtures'

function row(window: Page, index: number): ReturnType<Page['getByRole']> {
  return window.getByRole('textbox', { name: `Node ${index}`, exact: true })
}

interface SeedNodeShape {
  text?: string
  attachmentId?: string
}

function wideSeed(
  count: number,
  build: (index: number) => SeedNodeShape = (index) => ({ text: `Child ${index}` }),
): { document: unknown; location: unknown } {
  return {
    document: {
      roots: [
        {
          id: 'root',
          text: 'Root',
          children: Array.from({ length: count }, (_, index) => {
            const node = build(index)
            return {
              id: `c${index}`,
              text: node.text ?? `Child ${index}`,
              ...(node.attachmentId === undefined
                ? {}
                : { attachment: { id: node.attachmentId, mimeType: 'image/png' } }),
              children: [],
            }
          }),
        },
      ],
    },
    location: { currentParentId: 'root', selectedNodeId: 'c0' },
  }
}

const wrappedRowText = 'The quick brown fox jumps over the lazy dog. '.repeat(6).trim()

const attachmentImageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAABmklEQVR4nO3TMRHAIADAQOSgqYpxBQZ6WWH44fcsGfNbG/g3bgfAywwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAOQJHaVsxH0sYAAAAASUVORK5CYII=',
  'base64',
)

function seedAttachmentImage(userDataDir: string, attachmentId: string): void {
  const directory = join(userDataDir, 'data', 'attachments')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `${attachmentId}.png`), attachmentImageBytes)
}

async function rowHeight(window: Page, index: number): Promise<number> {
  const height = await row(window, index).evaluate(
    (element) => element.closest('.node-row')?.getBoundingClientRect().height ?? 0,
  )
  if (height <= 0) throw new Error(`Node ${index} was not rendered.`)
  return height
}

async function rowTilingProblems(window: Page): Promise<string[]> {
  return window.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.node-row')].filter(
      (element) => !element.classList.contains('node-row-pinned'),
    )
    const boxes = rows
      .map((element) => {
        const bounds = element.getBoundingClientRect()
        return { id: element.dataset['nodeId'] ?? '', top: bounds.top, bottom: bounds.bottom }
      })
      .sort((left, right) => left.top - right.top)
    const problems: string[] = []
    for (let index = 1; index < boxes.length; index += 1) {
      const previous = boxes[index - 1]!
      const current = boxes[index]!
      const gap = current.top - previous.bottom
      if (Math.abs(gap) > 1) problems.push(`${previous.id}->${current.id} gap ${gap.toFixed(1)}`)
    }
    return problems
  })
}

describeForEachEditingMode('windowed node list', ({ screenshotName }) => {
  // @requirement PRODUCT.md §11
  test('keeps an unfocused drag source mounted while the viewport scrolls away', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(600))
    const { app, window } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    const source = window.locator('.node-row[data-node-id="c2"]')
    // The free gutter starts a row drag without moving focus from c0 to the source input.
    await startRowDrag(window, source, { xOffset: 1 })
    await expect(window.locator('.node-row[data-node-id="c0"] .node-focus-marker')).toHaveCount(1)
    await window.evaluate(() => {
      document.querySelector('.scroll-viewport')!.scrollTop = 7500
    })
    await expect(source).toHaveClass(/node-row-pinned/)
    await expect(source).toHaveClass(/node-row-dragging/)
    await expect(window.locator('.node-row[data-node-id="c0"] .node-focus-marker')).toHaveCount(1)
    expect(await window.locator('.node-row').count()).toBeLessThan(100)
    expect(await rowTilingProblems(window)).toEqual([])
    const receivingRow = window.locator('.node-row[data-node-id="c302"]')
    const receivingBox = await receivingRow.boundingBox()
    if (receivingBox === null) throw new Error('The row under the scrolled drag was not rendered.')
    await window.mouse.move(receivingBox.x + 30, receivingBox.y + receivingBox.height / 2)
    await expect(receivingRow).toHaveClass(/node-row-drop-on/)
    await expect(window).toHaveScreenshot(screenshotName('windowed-unfocused-drag-scrolled.png'))
    await window.keyboard.press('Escape')
    await window.mouse.up()
    await expect(window.locator('.node-row[data-node-id="c0"] .node-focus-marker')).toHaveCount(1)
    await expect(source).toHaveCount(0)
    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
  })

  test('keyboard navigation reaches and types into an off-screen row', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(600))
    const { window } = await launchTree(userDataDir)

    await row(window, 1).focus()
    await expect(row(window, 1)).toBeFocused()
    for (let index = 0; index < 60; index += 1) await window.keyboard.press('ArrowDown')

    await expect(row(window, 61)).toBeFocused()
    await expect(row(window, 1)).toHaveCount(0)

    await window.keyboard.type('x')

    await expect(row(window, 61)).toHaveValue(/x/)
  })

  test('undo and redo while scrolled restore the edited row', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(600))
    const { window } = await launchTree(userDataDir)

    for (let index = 0; index < 40; index += 1) await window.keyboard.press('ArrowDown')
    await expect(row(window, 41)).toBeFocused()
    await expect
      .poll(() => window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0))
      .toBeGreaterThan(0)

    await window.keyboard.type('y')
    await expect(row(window, 41)).toHaveValue(/y/)

    await window.keyboard.press('Meta+z')
    await expect(row(window, 41)).toBeFocused()
    await expect(row(window, 41)).toHaveValue('Child 40')

    await window.keyboard.press('Meta+Shift+z')
    await expect(row(window, 41)).toBeFocused()
    await expect(row(window, 41)).toHaveValue(/y/)
  })
})

test.describe('windowed node list (mode-independent)', () => {
  // @requirement PRODUCT.md §20.1
  test('dragging near the window edge auto-scrolls to an off-screen position', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(600))
    const { window } = await launchTree(userDataDir)

    const source = window.locator('.node-row').first()
    const box = await source.boundingBox()
    if (box === null) throw new Error('The source row was not rendered.')
    const innerHeight = await window.evaluate(() => globalThis.innerHeight)
    const x = box.x + box.width / 2

    await startRowDrag(window, source, { xOffset: box.width / 2 })
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    await window.mouse.move(x, box.y + box.height, { steps: 5 })
    await window.mouse.move(x, innerHeight - 8, { steps: 10 })

    await expect
      .poll(() => window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0))
      .toBeGreaterThan(500)
    const dropRow = window.locator('.node-row').nth(20)
    const dropBox = await dropRow.boundingBox()
    if (dropBox === null) throw new Error('The windowed drop row was not rendered after scrolling.')
    await window.mouse.move(x, dropBox.y + 1, { steps: 5 })
    const scrollY = await window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0)
    await window.mouse.up()

    await expect
      .poll(() =>
        window.evaluate(() => {
          const target = [...document.querySelectorAll('textarea')].find((input) => input.value === 'Child 0')
          const label = target?.getAttribute('aria-label') ?? ''
          return Number.parseInt(label.replace('Node ', ''), 10)
        }),
      )
      .toBeGreaterThan(1)
    expect(scrollY).toBeGreaterThan(500)
  })

  // @requirement PRODUCT.md §20.1
  test('dragging near the window edge auto-scrolls a list below the windowing threshold', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(120))
    const { window } = await launchTree(userDataDir)
    const scrollTop = (): Promise<number> =>
      window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0)

    const source = window.locator('.node-row').first()
    const box = await source.boundingBox()
    if (box === null) throw new Error('The source row was not rendered.')
    const innerHeight = await window.evaluate(() => globalThis.innerHeight)
    const x = box.x + box.width / 2
    expect(await window.locator('.node-row').count()).toBeGreaterThan(100)

    await startRowDrag(window, source, { xOffset: box.width / 2 })
    await expect(window.locator('.node-row-dragging')).toHaveCount(1)
    await window.mouse.move(x, box.y + box.height, { steps: 5 })
    await window.mouse.move(x, innerHeight - 8, { steps: 10 })
    await expect.poll(scrollTop).toBeGreaterThan(300)

    await window.mouse.move(x, 70, { steps: 10 })
    await expect.poll(scrollTop).toBeLessThan(50)
    await window.keyboard.press('Escape')
    await window.mouse.up()
    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
  })

  // @requirement PRODUCT.md §20.1
  test('dragging over the location toolbar does not auto-scroll the list', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(120))
    const { window } = await launchTree(userDataDir)
    const scrollTop = (): Promise<number> =>
      window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0)

    const source = window.locator('.node-row').first()
    const box = await source.boundingBox()
    if (box === null) throw new Error('The source row was not rendered.')
    const innerHeight = await window.evaluate(() => globalThis.innerHeight)
    const x = box.x + box.width / 2

    await startRowDrag(window, source, { xOffset: box.width / 2 })
    await window.mouse.move(x, box.y + box.height, { steps: 5 })
    await window.mouse.move(x, innerHeight - 8, { steps: 10 })
    await expect.poll(scrollTop).toBeGreaterThan(300)

    // A single jump, so no intermediate pointer event passes through the top edge margin.
    const toolbar = await window.locator('.location-bar').boundingBox()
    if (toolbar === null) throw new Error('The location toolbar was not rendered.')
    await window.mouse.move(x, toolbar.y + toolbar.height / 2)
    const resting = await scrollTop()
    await window.waitForTimeout(300)
    expect(await scrollTop()).toBe(resting)

    await window.keyboard.press('Escape')
    await window.mouse.up()
  })

  test('dragging at the window edge does not scroll a list that fits the window', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(5))
    const { window } = await launchTree(userDataDir)

    const source = window.locator('.node-row').first()
    const box = await source.boundingBox()
    if (box === null) throw new Error('The source row was not rendered.')
    const innerHeight = await window.evaluate(() => globalThis.innerHeight)
    const x = box.x + box.width / 2

    await startRowDrag(window, source, { xOffset: box.width / 2 })
    await window.mouse.move(x, innerHeight - 8, { steps: 10 })
    await window.waitForTimeout(300)
    expect(await window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollTop ?? 0)).toBe(0)
    await window.keyboard.press('Escape')
    await window.mouse.up()
  })

  test('resizing the window re-wraps rows and keeps navigation and focus correct', async ({ userDataDir }) => {
    seedDocument(
      userDataDir,
      wideSeed(600, () => ({ text: wrappedRowText })),
    )
    const { app, window } = await launchTree(userDataDir)

    await row(window, 1).focus()
    for (let index = 0; index < 20; index += 1) await window.keyboard.press('ArrowDown')
    await expect(row(window, 21)).toBeFocused()
    const heightBeforeResize = await rowHeight(window, 21)

    await setMainWindowBounds(app, { width: 640 })
    await expect.poll(() => window.evaluate(() => globalThis.innerWidth)).toBeLessThan(700)
    await expect.poll(() => rowHeight(window, 21)).toBeGreaterThan(heightBeforeResize)

    await expect(row(window, 21)).toBeFocused()
    await expect(row(window, 21)).toHaveValue(wrappedRowText)
    expect(await rowTilingProblems(window)).toEqual([])

    for (let index = 0; index < 5; index += 1) await window.keyboard.press('ArrowDown')
    await expect(row(window, 26)).toBeFocused()
    await expect(row(window, 26)).toBeInViewport()
    expect(await rowTilingProblems(window)).toEqual([])
  })

  test('editing a row to wrapped text grows the row and the list height', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(600))
    const { window } = await launchTree(userDataDir)

    const listHeightBefore = await window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollHeight ?? 0)
    const baseRowHeight = await rowHeight(window, 1)
    await row(window, 3).fill(wrappedRowText)
    await expect.poll(() => rowHeight(window, 3)).toBeGreaterThan(30)

    await expect
      .poll(async () => {
        const height = await rowHeight(window, 3)
        const listHeight = await window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollHeight ?? 0)
        return Math.abs(listHeight - listHeightBefore - (height - baseRowHeight))
      })
      .toBeLessThan(1)

    await row(window, 3).focus()
    for (let index = 0; index < 60; index += 1) await window.keyboard.press('ArrowDown')
    await expect(row(window, 63)).toBeFocused()
    await expect(row(window, 63)).toBeInViewport()
    expect(await rowTilingProblems(window)).toEqual([])
  })

  test('loading an attachment image grows its row and shifts later rows', async ({ userDataDir }) => {
    seedAttachmentImage(userDataDir, 'img-40')
    seedDocument(
      userDataDir,
      wideSeed(600, (index) => (index === 40 ? { attachmentId: 'img-40' } : {})),
    )
    const { window } = await launchTree(userDataDir)

    const listHeightBefore = await window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollHeight ?? 0)
    const baseRowHeight = await rowHeight(window, 1)
    for (let index = 0; index < 40; index += 1) await window.keyboard.press('ArrowDown')
    await expect(row(window, 41)).toBeFocused()

    await expect(window.getByAltText('Attached image')).toBeVisible()
    await expect.poll(() => rowHeight(window, 41)).toBeGreaterThan(100)
    await expect
      .poll(async () => {
        const height = await rowHeight(window, 41)
        const listHeight = await window.evaluate(() => document.querySelector('.scroll-viewport')?.scrollHeight ?? 0)
        return Math.abs(listHeight - listHeightBefore - (height - baseRowHeight))
      })
      .toBeLessThan(1)

    expect(await rowTilingProblems(window)).toEqual([])

    await row(window, 41).focus()
    for (let index = 0; index < 5; index += 1) await window.keyboard.press('ArrowDown')
    await expect(row(window, 46)).toBeFocused()
    await expect(row(window, 46)).toBeInViewport()
    expect(await rowTilingProblems(window)).toEqual([])
  })
})
