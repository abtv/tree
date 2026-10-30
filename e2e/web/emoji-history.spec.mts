// @editing-modes: independent
import { test, expect } from './fixtures.mts'
import { ready, readStored, chooseImportFile, writeExportedArchive } from './data-helpers.mts'
import { serializeState } from '../../src/domain/document.ts'

// @requirement PRODUCT.md §20.12
test('persists accepted emoji history across reload and notes replacement', async ({ newContext, baseURL }) => {
  const context = await newContext({ shortcutPlatform: 'other' })
  const page = await context.newPage()
  await page.goto(baseURL!)
  await ready(page)
  const input = page.locator('[data-node-id="welcome"] .node-input')
  await input.fill(':rocket')
  await page.keyboard.press('Enter')
  await input.fill(':cat')
  await page.keyboard.press('Tab')
  await page.evaluate(() => window.prototypeStore!.flushPersistence())

  expect(await readStored(page, 'preferences', 'emoji-history')).toEqual(['cat', 'rocket'])
  await page.reload()
  await ready(page)
  await input.fill(':')

  const popup = page.getByRole('listbox', { name: 'Emoji suggestions' })
  await expect(popup.getByRole('option').nth(0)).toContainText(':cat:')
  await expect(popup.getByRole('option').nth(1)).toContainText(':rocket:')
  await page.keyboard.press('Escape')
  expect(await readStored(page, 'preferences', 'emoji-history')).toEqual(['cat', 'rocket'])

  const archive = test.info().outputPath('notes.zip')
  await writeExportedArchive(
    archive,
    serializeState(
      { roots: [{ id: 'welcome', text: 'Imported', children: [] }] },
      { currentParentId: null, selectedNodeId: 'welcome' },
    ),
    {},
  )
  await chooseImportFile(page, archive)
  const reloaded = page.waitForEvent('load')

  await page.getByRole('button', { name: 'Replace Notes', exact: true }).click()
  await reloaded
  await ready(page)
  await input.fill(':')

  await expect(popup.getByRole('option').nth(0)).toContainText(':cat:')
  await expect(popup.getByRole('option').nth(1)).toContainText(':rocket:')
})
