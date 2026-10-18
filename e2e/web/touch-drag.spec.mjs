// @editing-modes: independent
import { test, expect, capture } from './fixtures.mjs'

// @requirement PRODUCT.md §11
test('drags from empty row space while preserving touch editing and controls', async ({ newContext, baseURL }) => {
  const context = await newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 760 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  })
  const page = await context.newPage()
  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const session = await context.newCDPSession(page)
  const row = (id) => page.locator(`.node-row[data-node-id="${id}"]`)
  await row('project').locator('.node-disclosure-triangle').tap()
  const roots = () => page.evaluate(() => window.prototypeStore.getSnapshot().document.roots.map((node) => node.id))
  const before = await roots()
  const box = await row('welcome').boundingBox()
  const point = { x: box.x + box.width + 12, y: box.y + box.height / 2, id: 1 }
  const start = (touch = point) =>
    session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] })
  const end = () => session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  await start()
  await end()
  await page.waitForTimeout(300)
  await expect(page.locator('body')).not.toHaveClass(/node-drag-active/)
  expect(await roots()).toEqual(before)

  await start()
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...point, y: point.y + 12 }],
  })
  await page.waitForTimeout(300)
  await expect(page.locator('body')).not.toHaveClass(/node-drag-active/)
  await end()
  expect(await roots()).toEqual(before)

  const gutter = row('welcome').locator('.node-touch-drag-gutter')
  await expect(gutter).toBeVisible()
  const gutterPoint = { ...point, x: box.x - 4 }
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, gutterPoint)).toContain(
    'node-touch-drag-surface',
  )
  await start(gutterPoint)
  await expect(page.locator('body')).toHaveClass(/node-drag-active/)
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await expect(page.locator('body')).not.toHaveClass(/node-drag-active/)
  expect(await roots()).toEqual(before)

  await start()
  await expect(page.locator('body')).toHaveClass(/node-drag-active/)
  await row('welcome').dispatchEvent('pointercancel', { pointerId: 999, pointerType: 'touch' })
  await expect(page.locator('body')).toHaveClass(/node-drag-active/)
  await capture(page, 'touch-drag-active.png')
  const target = await row('project').boundingBox()
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...point, y: target.y + target.height - 2 }],
  })
  await expect(page.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(1)
  await end()
  await expect.poll(roots).toEqual([before[1], before[0], ...before.slice(2)])
  await expect(page.locator('body')).not.toHaveClass(/node-drag-active/)

  const input = row('welcome').locator('.node-input')
  await expect(input).toHaveCSS('touch-action', 'auto')
  const textBox = await input.boundingBox()
  await start({ x: textBox.x + 35, y: textBox.y + 10, id: 1 })
  await page.waitForTimeout(300)
  await expect(page.locator('body')).not.toHaveClass(/node-drag-active/)
  await end()
  await input.fill('Touch editing still works')
  await expect(input).toHaveValue('Touch editing still works')
})

// @requirement PRODUCT.md §11
// @requirement PRODUCT.md §23.12
test('moves a windowed Agenda occurrence with a touch hold on an iPad', async ({ newContext, baseURL }) => {
  const context = await newContext({
    hasTouch: true,
    viewport: { width: 820, height: 760 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)',
  })
  const page = await context.newPage()
  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const [sourceId, targetId] = await page.evaluate(() => {
    window.prototypeStore.pasteSubtree('welcome', 'after', {
      id: 'touch-fixture',
      text: 'Touch fixture',
      children: [
        { id: 'touch-source', text: 'First #2026-10-18', children: [] },
        { id: 'touch-target', text: 'Second #2026-10-19', children: [] },
        ...Array.from({ length: 520 }, (_, index) => ({
          id: `touch-later-${index}`,
          text: `Later #2026-10-23 item ${index}`,
          children: [],
        })),
      ],
    })
    window.prototypeStore.openAgenda()
    return window.prototypeStore
      .getSnapshot()
      .document.roots.find((node) => node.text === 'Touch fixture')
      .children.slice(0, 2)
      .map((node) => node.id)
  })
  await expect(page.locator('.agenda-list-windowed')).toBeVisible()
  const source = page.locator(`.agenda-row[data-node-id="${sourceId}"]`)
  await expect(source).toBeVisible()
  const destination = page.locator(`.agenda-row[data-node-id="${targetId}"]`)
  const sourceBox = await source.boundingBox()
  const targetBox = await destination.boundingBox()
  const session = await context.newCDPSession(page)
  const point = { x: sourceBox.x + sourceBox.width + 12, y: sourceBox.y + sourceBox.height / 2, id: 1 }
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await expect(source).toHaveClass(/agenda-row-dragging/)
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...point, y: targetBox.y + targetBox.height / 2 }],
  })
  await expect(page.locator('.agenda-row-drop-on')).toHaveCount(1)
  await capture(page, 'ipad-agenda-touch-drag.png')
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.prototypeStore.getSnapshot().document.roots.find((node) => node.text === 'Touch fixture').children[0]
            .text,
      ),
    )
    .toBe('First #2026-10-19')
  await expect(page.locator('body')).not.toHaveClass(/node-drag-active/)
})
