// @editing-modes: vim
import { expect, test } from './fixtures.mts'

// @requirement PRODUCT.md §20.2.32
test('uses the saved browser appearance as the start of the Leader cycle', async ({ newContext, baseURL }) => {
  const context = await newContext()
  const page = await context.newPage()
  await page.goto(baseURL!)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await window.treeApi.setVimEnabled(true)
    await window.treeApi.setAppearance('gray')
  })
  await expect(page.locator('.tree-app')).toHaveClass(/vim-state-normal/)
  const editor = page.locator('.node-input').first()
  await editor.focus()

  for (const key of ['Space', 't', 't', 'Space', 't', 't']) await page.keyboard.press(key)

  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'white')
  await expect(editor).toBeFocused()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'white')
})
