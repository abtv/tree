// @editing-modes: both
import { test, expect, primaryKey } from './fixtures.mts'

function describeForEachEditingMode(title: string, body: (vimEnabled: boolean) => void) {
  for (const vimEnabled of [false, true]) {
    test.describe(`${title} [${vimEnabled ? 'vim' : 'standard'} editing]`, () => body(vimEnabled))
  }
}

describeForEachEditingMode('Browser Agenda folds', (vimEnabled) => {
  // @requirement PRODUCT.md §23.5
  test('restores a folded day after reload and saves an explicit reopening', async ({ newContext, baseURL }) => {
    const context = await newContext()
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-10-08T12:00:00'))
    await page.goto(baseURL!)
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    await page.evaluate(async (enabled) => {
      await window.treeApi.save({
        version: 4,
        document: { roots: [{ id: 'one', text: '2026-10-09 Remember this day', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'one' },
        view: { expandedIds: [] },
      })
      await window.treeApi.setVimEnabled(enabled)
    }, vimEnabled)
    await page.reload()
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')

    await page.keyboard.press(`${primaryKey}+p`)
    const friday = page.locator('.agenda-row-day').filter({ hasText: 'Fri Oct 9' })
    await friday.click()
    if (vimEnabled) {
      await page.keyboard.press('Escape')
      await page.keyboard.press('z')
      await page.keyboard.press('a')
    } else await page.keyboard.press(`${primaryKey}+e`)
    await expect(friday.getByRole('button', { name: 'Expand Fri Oct 9', exact: true })).toBeVisible()
    await page.evaluate(() => window.prototypeStore.flushPersistence())

    await page.reload()
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    await expect(page.locator('.agenda-list')).toHaveCount(0)
    await page.keyboard.press(`${primaryKey}+p`)

    await expect(friday.getByRole('button', { name: 'Expand Fri Oct 9', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Agenda node one', exact: true })).toHaveCount(0)

    await friday.getByRole('button', { name: 'Expand Fri Oct 9', exact: true }).click()
    await page.evaluate(() => window.prototypeStore.flushPersistence())
    await page.reload()
    await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
    await page.keyboard.press(`${primaryKey}+p`)

    await expect(friday.getByRole('button', { name: 'Collapse Fri Oct 9', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Agenda node one', exact: true })).toBeVisible()
  })
})
