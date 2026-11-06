// @editing-modes: independent
import { test, expect, primaryKey } from './fixtures.mts'

// @requirement PRODUCT.md §2.1
test('line numbers persist in browser preferences and remain available from the command panel', async ({
  page,
  baseURL,
}) => {
  await page.goto(baseURL!)
  const editor = page.locator('.node-input').first()
  await expect(editor).toBeVisible()
  await page.evaluate(() =>
    window.treeApi.save({
      version: 1,
      document: { roots: [{ id: 'numbered', text: 'Synthetic note', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'numbered' },
    }),
  )
  await page.reload()
  await expect(editor).toBeVisible()
  await editor.focus()
  await page.keyboard.press(`${primaryKey}+Shift+p`)
  await page.getByRole('combobox', { name: 'Command', exact: true }).fill('toggle-line-numbers')
  await page.keyboard.press('Enter')

  await expect(page.locator('.line-number')).toHaveText(['1'])
  await expect.poll(() => page.evaluate(() => window.treeApi.getLineNumbers())).toBe(true)

  await page.reload()

  await expect(page.locator('.line-number')).toHaveText(['1'])
  await editor.focus()
  // Browser-reserved keyboard delivery varies; verify the application handler explicitly.
  await editor.dispatchEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true, cancelable: true })

  await expect(page.locator('.line-number')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.treeApi.getLineNumbers())).toBe(false)

  await page.reload()

  await expect(editor).toBeVisible()
  await expect(page.locator('.line-number')).toHaveCount(0)
})
