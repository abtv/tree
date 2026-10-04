// @editing-modes: independent
import type { Page } from '@playwright/test'
import { expect, launchTree, screenshotContentSize, seedDocument, setMainWindowContentSize, test } from './fixtures'

function seedRoots(userDataDir: string, count: number): void {
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: count }, (_, index) => ({ id: `r${index}`, text: `Root ${index}`, children: [] })),
    },
    location: { currentParentId: null, selectedNodeId: 'r0' },
  })
}

async function scrollContentTo(page: Page, position: 'start' | 'end' | number): Promise<void> {
  await page.evaluate((target) => {
    const viewport = document.querySelector('.scroll-viewport')!
    viewport.scrollTo(0, target === 'start' ? 0 : target === 'end' ? viewport.scrollHeight : target)
  }, position)
}

function fadeOpacities(page: Page): Promise<{ top: number; bottom: number }> {
  return page.evaluate(() => {
    const app = document.querySelector('.tree-app')!
    return {
      top: Number(getComputedStyle(app, '::before').opacity),
      bottom: Number(getComputedStyle(app, '::after').opacity),
    }
  })
}

test.describe('scroll edges', () => {
  // @requirement PRODUCT.md §20.6
  test('fades content toward an edge only while more content lies beyond it', async ({ userDataDir }) => {
    seedRoots(userDataDir, 200)
    const { window: page } = await launchTree(userDataDir)
    await expect(page.locator('.node-row')).toHaveCount(200)

    await scrollContentTo(page, 'start')
    await expect.poll(() => fadeOpacities(page)).toEqual({ top: 0, bottom: 1 })
    // Full strength within the first few pixels scrolled away from the start.
    await scrollContentTo(page, 20)
    await expect.poll(() => fadeOpacities(page)).toEqual({ top: 1, bottom: 1 })
    await scrollContentTo(page, 1500)
    await expect.poll(() => fadeOpacities(page)).toEqual({ top: 1, bottom: 1 })
    await scrollContentTo(page, 'end')
    await expect.poll(() => fadeOpacities(page)).toEqual({ top: 1, bottom: 0 })
  })

  // @requirement PRODUCT.md §20.6
  test('shows no fade when the content fits the window', async ({ userDataDir }) => {
    seedRoots(userDataDir, 3)
    const { window: page } = await launchTree(userDataDir)
    await expect(page.locator('.node-row')).toHaveCount(3)
    expect(await page.evaluate(() => document.querySelector('.scroll-viewport')!.scrollHeight)).toBe(
      await page.evaluate(() => document.querySelector('.scroll-viewport')!.clientHeight),
    )
    await expect.poll(() => fadeOpacities(page)).toEqual({ top: 0, bottom: 0 })
  })

  // @requirement PRODUCT.md §20.6
  test('places shorter-than-row fades at the bar edges, clear of the scrollbar and the pointer', async ({
    userDataDir,
  }) => {
    seedRoots(userDataDir, 200)
    const { window: page } = await launchTree(userDataDir)
    await expect(page.locator('.node-row')).toHaveCount(200)
    await scrollContentTo(page, 512)
    await expect.poll(() => fadeOpacities(page)).toEqual({ top: 1, bottom: 1 })

    const geometry = await page.evaluate(() => {
      const app = document.querySelector('.tree-app')!
      const viewport = document.querySelector('.scroll-viewport')!
      const appBox = app.getBoundingClientRect()
      const viewportBox = viewport.getBoundingClientRect()
      const box = (pseudo: '::before' | '::after') => {
        const style = getComputedStyle(app, pseudo)
        const height = parseFloat(style.height)
        const top = style.top === 'auto' ? appBox.height - parseFloat(style.bottom) - height : parseFloat(style.top)
        return { top, bottom: top + height, height, right: appBox.width - parseFloat(style.right) }
      }
      return {
        top: box('::before'),
        bottom: box('::after'),
        viewportTop: viewportBox.top - appBox.top,
        viewportBottom: viewportBox.bottom - appBox.top,
        rowHeight: document.querySelector('.node-row')!.getBoundingClientRect().height,
        // A classic scrollbar reserves its width; an overlay scrollbar reserves none and is narrower.
        scrollbarLeft: Math.min(viewport.clientWidth, viewportBox.width - 15),
        pointerEvents: [
          getComputedStyle(app, '::before').pointerEvents,
          getComputedStyle(app, '::after').pointerEvents,
        ],
      }
    })
    expect(geometry.top.top).toBe(geometry.viewportTop)
    expect(geometry.bottom.bottom).toBe(geometry.viewportBottom)
    expect(geometry.top.height).toBeLessThan(geometry.rowHeight)
    expect(geometry.bottom.height).toBeLessThan(geometry.rowHeight)
    expect(geometry.top.right).toBeLessThanOrEqual(geometry.scrollbarLeft)
    expect(geometry.bottom.right).toBeLessThanOrEqual(geometry.scrollbarLeft)
    expect(geometry.pointerEvents).toEqual(['none', 'none'])

    // A click inside the top fade reaches the row cut by the toolbar.
    const target = await page.evaluate(() => {
      const viewport = document.querySelector('.scroll-viewport')!.getBoundingClientRect()
      const y = viewport.top + 4
      const input = Array.from(document.querySelectorAll<HTMLElement>('.node-input')).find((element) => {
        const box = element.getBoundingClientRect()
        return box.top < y && box.bottom > y
      })!
      const box = input.getBoundingClientRect()
      return { x: box.left + 4, y, label: input.getAttribute('aria-label') }
    })
    expect(target.label).not.toBe('Node 1')
    await page.mouse.click(target.x, target.y)
    await expect(page.getByRole('textbox', { name: target.label!, exact: true })).toBeFocused()
  })

  for (const appearance of ['light', 'dark'] as const) {
    // @requirement PRODUCT.md §20.6
    test(`renders the cut rows fading into the ${appearance} background`, async ({ userDataDir }) => {
      seedRoots(userDataDir, 200)
      const { window: page, app } = await launchTree(userDataDir, { appearance })
      await setMainWindowContentSize(app, screenshotContentSize)
      // Playwright's browser context defaults to light media independently of nativeTheme.
      await page.emulateMedia({ colorScheme: appearance })
      await expect(page.locator('.node-row')).toHaveCount(200)
      // Both edges cut through a row, so the screenshots show the fade over partial text.
      await scrollContentTo(page, 512)
      await expect.poll(() => fadeOpacities(page)).toEqual({ top: 1, bottom: 1 })
      const size = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      await expect(page).toHaveScreenshot(`scroll-edge-top-${appearance}.png`, {
        clip: { x: 0, y: 0, width: 320, height: 80 },
      })
      await expect(page).toHaveScreenshot(`scroll-edge-bottom-${appearance}.png`, {
        clip: { x: 0, y: size.height - 80, width: 320, height: 80 },
      })
    })
  }
})
