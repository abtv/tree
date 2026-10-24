// @editing-modes: independent
import { test, expect } from './fixtures.mts'
import { ready } from './data-helpers.mts'
import { expectExternalDropBlocked } from '../external-drop.ts'

for (const vim of [false, true]) {
  // @requirement PRODUCT.md §11
  test(`rejects external HTML before native insertion (${vim ? 'Vim Insert' : 'standard'})`, async ({
    newContext,
    baseURL,
  }) => {
    const page = await (await newContext()).newPage()
    await page.goto(baseURL!)
    await ready(page)
    await page.evaluate(async (enabled) => {
      await window.treeApi.setVimEnabled(enabled)
    }, vim)
    await page.reload()
    await ready(page)
    const editor = page.locator('[data-node-id="welcome"] .node-input')
    await editor.click()
    if (vim) await page.keyboard.press('i')
    await editor.fill('Original')
    await expectExternalDropBlocked(page, editor)
    await editor.fill('2026-10-25 Original')
    await expect(editor).toHaveAttribute('contenteditable', 'true')
    await expectExternalDropBlocked(page, editor)
    await page.keyboard.press('ControlOrMeta+p')
    const agendaEditor = page.locator('.agenda-row[data-node-id="welcome"] .node-input').first()
    await expect(agendaEditor).toBeVisible()
    await expectExternalDropBlocked(page, agendaEditor)
  })
}
