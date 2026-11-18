// @editing-modes: independent
import { expect, primaryKey, test } from './fixtures.mts'

// @requirement PRODUCT.md §2.5
test('restores an empty filtered Tree after reload and can reveal tasks again', async ({ page, baseURL }) => {
  await page.goto(baseURL!)
  await expect(page.locator('.node-input').first()).toBeVisible()
  await page.evaluate(() =>
    window.treeApi.save({
      version: 5,
      document: { roots: [{ id: 'done', text: 'Completed task', struckThrough: true, children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'done' },
      view: { expandedIds: [] },
    }),
  )
  await page.reload()
  await expect(page.locator('.node-row[data-node-id="done"]')).toBeVisible()

  const toggle = async () => {
    await page.keyboard.press(`${primaryKey}+Shift+p`)
    await page.getByRole('combobox', { name: 'Command' }).fill('toggle-finished-tasks')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('combobox', { name: 'Command' })).toHaveCount(0)
  }
  await toggle()
  await expect(page.locator('main.tree-app')).toBeFocused()
  await expect(page.locator('.node-row')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('main.tree-app')).toBeFocused()
  await expect(page.locator('.node-row')).toHaveCount(0)

  await toggle()
  await expect(page.locator('.node-row[data-node-id="done"] .node-input')).toBeFocused()
})
