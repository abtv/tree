// @editing-modes: independent
import { test, expect } from './fixtures.mts'
import { ready, readStored, chooseImportFile, writeExportedArchive } from './data-helpers.mts'
import { serializeState } from '../../src/domain/document.ts'

// @requirement PRODUCT.md §20.14
test('persists recent nodes in browser preferences and clears them when importing the same IDs', async ({
  newContext,
  baseURL,
}) => {
  const context = await newContext({ shortcutPlatform: 'other' })
  const page = await context.newPage()
  await page.goto(baseURL!)
  await ready(page)
  await page.locator('[data-node-id="welcome"] .node-input').fill('Recently edited')
  await page.keyboard.press('Control+;')

  await expect(page.getByRole('option').first()).toContainText('Recently edited')
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.prototypeStore!.flushPersistence())
  expect(await readStored(page, 'preferences', 'recent-nodes')).toEqual(['welcome'])
  await page.reload()
  await ready(page)
  await page.keyboard.press('Control+;')

  await expect(page.getByRole('option').first()).toContainText('Recently edited')
  await page.keyboard.press('Escape')

  const archive = test.info().outputPath('same-ids.zip')
  await writeExportedArchive(
    archive,
    serializeState(
      { roots: [{ id: 'welcome', text: 'Imported', children: [] }] },
      { currentParentId: null, selectedNodeId: 'welcome' },
    ),
    {},
  )
  await chooseImportFile(page, archive)
  await page.getByRole('button', { name: 'Replace Notes', exact: true }).click()
  await ready(page)
  await expect(page.locator('[data-node-id="welcome"] .node-input')).toHaveValue('Imported')
  expect(await readStored(page, 'preferences', 'recent-nodes')).toBeUndefined()
})
