// @editing-modes: vim
import type { Locator } from '@playwright/test'
import { test, expect } from './fixtures.mts'

/** The viewport point one pixel after the boundary before `offset` in a single-line rich field. */
const textPoint = (field: Locator, offset: number) =>
  field.evaluate((element, offset) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let remaining = offset
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      const length = text.textContent?.length ?? 0
      if (remaining < length) {
        const range = document.createRange()
        range.setStart(text, remaining)
        range.setEnd(text, remaining + 1)
        const rect = range.getBoundingClientRect()
        return { x: rect.left + 1, y: rect.top + rect.height / 2 }
      }
      remaining -= length
    }
    throw new Error(`Offset ${offset} is outside the field text.`)
  }, offset)

// @requirement PRODUCT.md §20.2.6
// Normal-mode rich fields are not editable in the browser, so a native drag can leave the node.
test('keeps a pointer Visual selection inside the pressed rich node when the drag leaves it', async ({
  newContext,
  baseURL,
}) => {
  const context = await newContext({ viewport: { width: 1100, height: 760 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  const errors: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await window.treeApi.save({
      version: 1,
      document: {
        roots: [
          { id: 'first', text: '2026-10-18 Alpha beta gamma', children: [] },
          { id: 'second', text: '2026-10-18 Delta epsilon', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    await window.treeApi.setVimEnabled(true)
  })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const first = page.locator('.node-row[data-node-id="first"] .node-input')
  const second = page.locator('.node-row[data-node-id="second"] .node-input')
  await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')
  const press = await textPoint(first, 17)
  const release = await textPoint(second, 16)

  await page.mouse.move(press.x, press.y)
  await page.mouse.down()
  await page.mouse.move(release.x, release.y, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByLabel('Vim mode')).toHaveText('VISUAL')
  await expect(first).toBeFocused()
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('beta gamma')

  await page.keyboard.press('d')

  await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')
  await expect(first).toHaveText('2026-10-18 Alpha ')
  await expect(second).toHaveText('2026-10-18 Delta epsilon')
  expect(errors).toEqual([])
})
