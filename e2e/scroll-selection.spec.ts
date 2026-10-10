// @editing-modes: vim
import type { Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, launchTree, seedDocument, setMainWindowContentSize, test } from './fixtures'

const geometry = (window: Page) =>
  window.evaluate(() => {
    const viewport = document.querySelector('.scroll-viewport') as HTMLElement
    const view = viewport.getBoundingClientRect()
    const row = document.activeElement!.closest<HTMLElement>('.node-row')!
    const rect = row.getBoundingClientRect()
    return {
      id: row.dataset.nodeId,
      top: rect.top - view.top,
      gap: view.bottom - rect.bottom,
      height: rect.height,
      area: view.height,
      scrollTop: viewport.scrollTop,
      max: viewport.scrollHeight - viewport.clientHeight,
    }
  })

async function painted(window: Page): Promise<void> {
  await window.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

function seedRows(
  userDataDir: string,
  options: { count?: number; tall?: number[]; lines?: number; image?: number } = {},
): void {
  const { count = 100, tall = [], lines = 30, image } = options
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: count }, (_, index) => ({
        id: `n${index}`,
        text: tall.includes(index) ? Array(lines).fill('Tall line').join('\n') : `Row ${index}`,
        ...(image === index ? { attachment: { id: 'late', mimeType: 'image/png' } } : {}),
        children: [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 'n0' },
  })
  if (image !== undefined) {
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(
      join(userDataDir, 'data', 'attachments', 'late.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAABmklEQVR4nO3TMRHAIADAQOSgqYpxBQZ6WWH44fcsGfNbG/g3bgfAywwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAOQJHaVsxH0sYAAAAASUVORK5CYII=',
        'base64',
      ),
    )
  }
}

async function launchDelayedImage(userDataDir: string) {
  seedRows(userDataDir, { count: 650, image: 649 })
  const launched = await launchTree(userDataDir, { initialMode: 'normal' })
  await setMainWindowContentSize(launched.app, { width: 640, height: 500 })
  await launched.app.evaluate(() => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    ;(globalThis as unknown as { releaseScrollImage: () => void }).releaseScrollImage = release
    globalThis.__treeIpc.wrap('tree:read-attachment', async (invoke, ...args) => {
      await pending
      return invoke(...args)
    })
  })
  return {
    ...launched,
    release: () =>
      launched.app.evaluate(() => (globalThis as unknown as { releaseScrollImage: () => void }).releaseScrollImage()),
  }
}

// @requirement PRODUCT.md §20.8
test('keeps the last windowed row visible after a delayed image loads', async ({ userDataDir }, info) => {
  const { window, release } = await launchDelayedImage(userDataDir)
  await window.keyboard.press('G')
  await painted(window)
  const before = await geometry(window)
  expect(before.id).toBe('n649')
  expect(before.scrollTop).toBe(before.max)
  await window.evaluate(() => {
    const frames: { height: number; gap: number }[] = []
    const state = window as unknown as { scrollFrames: typeof frames; stopScrollFrames: () => void }
    state.scrollFrames = frames
    // A timer or animation-frame callback can run between a layout-changing task and the next rendering
    // update, where it would read geometry that is never painted. Resize observers deliver during the
    // rendering update, after the application's own observer (created earlier, when the reveal began)
    // has corrected the scroll position and before the frame is painted, so each sample is a painted state.
    const viewport = document.querySelector('.scroll-viewport')!
    const row = document.activeElement!.closest('.node-row')!
    const observer = new ResizeObserver(() => {
      const rect = row.getBoundingClientRect()
      frames.push({ height: rect.height, gap: viewport.getBoundingClientRect().bottom - rect.bottom })
    })
    for (const target of [row, viewport.firstElementChild!, viewport]) observer.observe(target)
    state.stopScrollFrames = () => observer.disconnect()
  })
  await release()
  await expect(window.getByAltText('Attached image')).toBeVisible()
  await expect
    .poll(async () => {
      const state = await geometry(window)
      return state.height > 100 && state.gap >= 25 && Math.abs(state.scrollTop - state.max) <= 1
    })
    .toBe(true)
  const after = await geometry(window)
  await painted(window)
  const frames = await window.evaluate(() => {
    const state = window as unknown as {
      scrollFrames: { height: number; gap: number }[]
      stopScrollFrames: () => void
    }
    state.stopScrollFrames()
    return state.scrollFrames
  })
  await info.attach('geometry', { body: JSON.stringify({ before, after, frames }), contentType: 'application/json' })
  expect(frames.some((frame) => frame.height > 100)).toBe(true)
  expect(frames.filter((frame) => frame.height > 100).every((frame) => frame.gap >= 25)).toBe(true)
  // The overlay scrollbar fades out a moment after scrolling, so whether its thumb is in the capture
  // depends on timing, and page styles do not hide it. This test checks the row geometry, so the
  // capture stops short of the window's right edge, where the thumb is drawn.
  await expect(window).toHaveScreenshot('loaded-last-row.png', { clip: { x: 0, y: 0, width: 628, height: 528 } })
  await window.keyboard.type('gg')
  await window.keyboard.press('G')
  await painted(window)
  expect(await geometry(window)).toEqual(after)
})

// @requirement PRODUCT.md §20.8
test('does not pull the viewport back after wheel scrolling during image loading', async ({ userDataDir }) => {
  const { window, release } = await launchDelayedImage(userDataDir)
  await window.keyboard.press('G')
  await painted(window)
  await window.mouse.move(400, 250)
  await window.mouse.wheel(0, -500)
  let previousScrollTop = Number.NaN
  let lastScrollChangeAt = Date.now()
  await expect
    .poll(async () => {
      const { scrollTop, max } = await geometry(window)
      if (scrollTop !== previousScrollTop) {
        previousScrollTop = scrollTop
        lastScrollChangeAt = Date.now()
      }
      return scrollTop < max - 200 && Date.now() - lastScrollChangeAt >= 300
    })
    .toBe(true)
  const before = await geometry(window)
  await release()
  await expect.poll(async () => (await geometry(window)).height).toBeGreaterThan(100)
  await painted(window)
  const after = await geometry(window)
  expect(after.id).toBe('n649')
  expect(after.top).toBeGreaterThan(after.area)
  // Native anchoring may adjust offsets during measurement, but navigation must not return to the end.
  expect(after.max - after.scrollTop).toBeGreaterThan(200)
  expect(after.top).toBeGreaterThanOrEqual(before.top - 1)
})

// @requirement PRODUCT.md §20.8
test('a new destination replaces the delayed image reveal', async ({ userDataDir }) => {
  const { window, release } = await launchDelayedImage(userDataDir)
  await window.keyboard.press('G')
  await window.keyboard.type('gg')
  await release()
  await painted(window)
  await window.waitForTimeout(100)
  const state = await geometry(window)
  expect(state.id).toBe('n0')
  expect(state.scrollTop).toBe(0)
})

// @requirement PRODUCT.md §20.8
test('gg reaches the document start with an oversized first row', async ({ userDataDir }) => {
  seedRows(userDataDir, { tall: [0, 50] })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setMainWindowContentSize(app, { width: 640, height: 450 })
  await window.keyboard.type('51G')
  await window.keyboard.type('gg')
  await painted(window)
  const state = await geometry(window)
  expect(state.height).toBeGreaterThan(state.area)
  expect(state.scrollTop).toBe(0)
  expect(state.top).toBeGreaterThanOrEqual(25)
})

for (const key of ['H', 'M', 'L']) {
  // @requirement PRODUCT.md §20.2.9
  // @requirement PRODUCT.md §20.8
  test(`${key} keeps scrolling unchanged when only a clipped row is visible`, async ({ userDataDir }) => {
    seedRows(userDataDir, { tall: [50] })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await setMainWindowContentSize(app, { width: 640, height: 450 })
    await window.keyboard.type('51G')
    // The reveal keeps correcting while the oversized row is measured and ends only on user scrolling
    // (PRODUCT.md §20.8). A scripted `scrollTop` change is not user input, so a late correction could
    // undo it and leave the row above fully visible; the wheel cancels the reveal like a user would.
    await window.mouse.move(400, 250)
    await window.mouse.wheel(0, 75)
    // Only the clipped row is visible once the row's start has scrolled out of view.
    await expect.poll(async () => (await geometry(window)).top).toBe(-50)
    await painted(window)
    const before = await geometry(window)
    await window.keyboard.press(key)
    await painted(window)
    expect(await geometry(window)).toEqual(before)
  })
}

// @requirement PRODUCT.md §20.8
test('a near-fit row and oversized final row keep their readable start', async ({ userDataDir }) => {
  seedRows(userDataDir, { tall: [20, 99], lines: 21 })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setMainWindowContentSize(app, { width: 640, height: 500 })
  await window.keyboard.type('21G')
  await painted(window)
  const state = await geometry(window)
  expect(state.height).toBeLessThan(state.area)
  expect(state.height).toBeGreaterThan(state.area - 50)
  expect(state.top).toBe(25)
  await expect(window).toHaveScreenshot('near-fit-start.png')
  await window.keyboard.press('G')
  await painted(window)
  const end = await geometry(window)
  expect(end.id).toBe('n99')
  expect(end.top).toBe(25)
  expect(end.scrollTop).toBeLessThan(end.max)
})

for (const appearance of ['light', 'dark'] as const) {
  // @requirement PRODUCT.md §20.8
  // @requirement PRODUCT.md §20.6
  test(`a short ${appearance} viewport caps both context and fades`, async ({ userDataDir }) => {
    seedRows(userDataDir)
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', appearance })
    await window.emulateMedia({ colorScheme: appearance })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setMinimumSize(100, 80))
    await setMainWindowContentSize(app, { width: 640, height: 120 })
    await window.keyboard.type('20j')
    await painted(window)
    const state = await geometry(window)
    const fades = await window.evaluate(() =>
      ['::before', '::after'].map((pseudo) =>
        parseFloat(getComputedStyle(document.querySelector('.tree-app')!, pseudo).height),
      ),
    )
    expect(fades[0]).toBeLessThanOrEqual(state.top)
    expect(fades[1]).toBeLessThanOrEqual(state.gap)
    // Native overlay scrollbars fade independently of CSS animations. Keep both context fades
    // in the capture, excluding only the right edge where the scrollbar thumb is drawn.
    const clip = await window.evaluate(() => ({ x: 0, y: 0, width: innerWidth - 12, height: innerHeight }))
    await expect(window).toHaveScreenshot(`short-viewport-${appearance}.png`, { clip })
  })
}
