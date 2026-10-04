// @editing-modes: independent
import type { Page } from '@playwright/test'
import { expect, launchTree, node, nodeTexts, seedDocument, setMainWindowBounds, startRowDrag, test } from './fixtures'

function rootSeed(count: number): { document: unknown; location: unknown } {
  return {
    document: {
      roots: Array.from({ length: count }, (_, index) => ({
        id: `n${index}`,
        text: `Item ${index}`,
        children: [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 'n0' },
  }
}

function parentSeed(): { document: unknown; location: unknown } {
  return {
    document: {
      roots: [
        {
          id: 'root',
          text: 'Root',
          children: Array.from({ length: 5 }, (_, index) => ({
            id: `c${index}`,
            text: `Child ${index}`,
            children: [],
          })),
        },
      ],
    },
    location: { currentParentId: 'root', selectedNodeId: 'c0' },
  }
}

interface ElementRect {
  top: number
  bottom: number
  height: number
}

function selectorRect(window: Page, selector: string): Promise<ElementRect> {
  return window.locator(selector).evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { top: bounds.top, bottom: bounds.bottom, height: bounds.height }
  })
}

function rowRect(window: Page, index: number): Promise<ElementRect> {
  return window
    .locator('.node-row')
    .nth(index)
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height }
    })
}

test.describe('compact layout density', () => {
  test('fits more rows into a small window and uses the raised width cap', async ({ userDataDir }) => {
    seedDocument(userDataDir, rootSeed(20))
    const { app, window } = await launchTree(userDataDir)
    await setMainWindowBounds(app, { width: 640, height: 480 })
    await expect.poll(() => window.evaluate(() => globalThis.innerWidth)).toBeLessThan(700)

    const bar = await selectorRect(window, '.location-bar')
    const first = await rowRect(window, 0)
    expect(bar.height).toBeCloseTo(30, 0)
    expect(first.height).toBeCloseTo(25, 0)
    expect(first.top - bar.bottom).toBeCloseTo(48, 0)

    // The 27px status bar at the bottom takes the space of one row.
    await expect(node(window, 13)).toBeInViewport({ ratio: 1 })
    expect(await window.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true)

    // Text keeps 28px of clear space from the right edge of the content area.
    const rightClearance = await window.evaluate(() => {
      const shell = document.querySelector('.editor-shell')
      const row = document.querySelector('.node-row')
      if (!shell || !row) throw new Error('Expected the editor shell and a node row')
      return shell.getBoundingClientRect().right - row.getBoundingClientRect().right
    })
    expect(rightClearance).toBeCloseTo(28, 0)

    await setMainWindowBounds(app, { width: 1200 })
    await expect.poll(() => window.evaluate(() => globalThis.innerWidth)).toBeGreaterThan(1100)
    const shellWidth = await window
      .locator('.editor-shell')
      .evaluate((element) => element.getBoundingClientRect().width)
    expect(shellWidth).toBeCloseTo(960, 0)
  })

  test('keeps the heading gap compact and expands edge drop zones only while dragging', async ({ userDataDir }) => {
    seedDocument(userDataDir, parentSeed())
    const { app, window } = await launchTree(userDataDir)
    await setMainWindowBounds(app, { width: 640, height: 480 })
    await expect.poll(() => window.evaluate(() => globalThis.innerWidth)).toBeLessThan(700)

    const bar = await selectorRect(window, '.location-bar')
    const heading = await selectorRect(window, '.current-parent')
    const firstBefore = await rowRect(window, 0)
    expect(heading.top - bar.bottom).toBeCloseTo(10, 0)
    expect(firstBefore.top - heading.bottom).toBeCloseTo(6, 0)
    expect(firstBefore.top - bar.bottom).toBeCloseTo(48, 0)
    expect((await selectorRect(window, '.drop-zone-start')).height).toBe(0)
    expect((await selectorRect(window, '.drop-zone-end')).height).toBe(0)

    await startRowDrag(window, window.locator('.node-row').nth(2).locator('.node-input'))
    await expect(window.locator('body')).toHaveClass(/node-drag-active/)
    expect((await selectorRect(window, '.drop-zone-start')).height).toBeCloseTo(40, 0)
    expect((await selectorRect(window, '.drop-zone-end')).height).toBeCloseTo(64, 0)

    const firstDuring = await rowRect(window, 0)
    expect(firstDuring.top).toBeCloseTo(firstBefore.top, 0)
    expect(firstDuring.top - heading.bottom).toBeCloseTo(6, 0)

    const firstBox = await window.locator('.node-row').first().boundingBox()
    if (firstBox === null) throw new Error('The first row was not rendered.')
    await window.mouse.move(firstBox.x + 8, firstBox.y - 10, { steps: 5 })
    await expect(window.locator('.node-row').first()).toHaveClass(/node-row-drop-before/)

    await window.mouse.up()
    await expect.poll(() => nodeTexts(window)).toEqual(['Child 2', 'Child 0', 'Child 1', 'Child 3', 'Child 4'])
    await expect(window.locator('body')).not.toHaveClass(/node-drag-active/)
    expect((await selectorRect(window, '.drop-zone-start')).height).toBe(0)
    expect((await selectorRect(window, '.drop-zone-end')).height).toBe(0)
  })
})
