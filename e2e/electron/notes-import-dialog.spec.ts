// @editing-modes: both
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildZip } from '../../src/application/test/zip-builder'
import {
  clickApplicationMenuItem,
  closeApp,
  configureHiddenParallelTests,
  describeForEachEditingMode,
  documentPath,
  expect,
  launchTree,
  node,
  seedDocument,
  test,
} from './fixtures'

describeForEachEditingMode('desktop import confirmation input', () => {
  configureHiddenParallelTests()

  // @requirement PRODUCT.md §25.3
  test('preserves editor focus on Cancel and Escape, and exports before replacement with the dialog open', async ({
    userDataDir,
    editingMode,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'old', text: 'Current synthetic note', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'old' },
    })
    const path = join(userDataDir, 'Import.zip')
    const destination = join(userDataDir, 'Export.zip')
    writeFileSync(
      path,
      buildZip([
        {
          name: 'document.json',
          data: new TextEncoder().encode(
            JSON.stringify({
              version: 1,
              document: {
                roots: [
                  {
                    id: 'new',
                    text: 'Incoming note',
                    attachment: { id: 'missing', mimeType: 'image/png' },
                    children: [],
                  },
                ],
              },
              location: { currentParentId: null, selectedNodeId: 'new' },
            }),
          ),
        },
      ]),
    )
    const { app, window } = await launchTree(userDataDir)
    await expect(node(window, 1)).toHaveValue('Current synthetic note')
    await node(window, 1).focus()
    await app.evaluate(
      ({ dialog }, chosen) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [chosen.path],
        })) as typeof dialog.showOpenDialog
        dialog.showSaveDialog = (async () => ({
          canceled: false,
          filePath: chosen.destination,
        })) as typeof dialog.showSaveDialog
      },
      { path, destination },
    )
    for (const cancel of ['button', 'escape'] as const) {
      await clickApplicationMenuItem(app, 'File', 'Import Notes…')
      const dialog = window.getByRole('dialog')
      await expect(dialog).toContainText('1 image that the notes use is not in the archive.')
      const cancelButton = dialog.getByRole('button', { name: 'Cancel', exact: true })
      await expect(cancelButton).toBeFocused()
      await window.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Export Current Notes First' })).toBeFocused()
      await window.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Replace Notes', exact: true })).toBeFocused()
      await window.keyboard.press('Tab')
      await expect(cancelButton).toBeFocused()
      await window.keyboard.press('Shift+Tab')
      await expect(dialog.getByRole('button', { name: 'Replace Notes', exact: true })).toBeFocused()
      await window.keyboard.press('Shift+Tab')
      await expect(dialog.getByRole('button', { name: 'Export Current Notes First' })).toBeFocused()
      await window.keyboard.press('Shift+Tab')
      await expect(cancelButton).toBeFocused()
      // Enter on the default button cancels, never replaces.
      if (cancel === 'button') await window.keyboard.press('Enter')
      else await window.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(node(window, 1)).toBeFocused()
      expect(JSON.parse(readFileSync(documentPath(userDataDir), 'utf8')).document.roots[0].text).toBe(
        'Current synthetic note',
      )
      expect(readdirSync(join(userDataDir, '.notes-import'))).toEqual([])
    }
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    const dialog = window.getByRole('dialog')
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = (async () => ({ canceled: true, filePath: '' })) as typeof dialog.showSaveDialog
    })
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await window.keyboard.press('Tab')
    await window.keyboard.press('Enter')
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await app.evaluate(
      ({ dialog }, destination) => {
        dialog.showSaveDialog = (async () => ({
          canceled: false,
          filePath: destination,
        })) as typeof dialog.showSaveDialog
      },
      join(userDataDir, 'missing-folder', 'Export.zip'),
    )
    await window.keyboard.press('Tab')
    await window.keyboard.press('Enter')
    await expect(dialog).toContainText('Export failed.')
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: destination })) as typeof dialog.showSaveDialog
    }, destination)
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await window.keyboard.press('Tab')
    await window.keyboard.press('Enter')
    await expect(dialog).toContainText('Exported “Export.zip”.')
    expect(readFileSync(destination).byteLength).toBeGreaterThan(100)
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await window.keyboard.press('Shift+Tab')
    await window.keyboard.press('Enter')
    await expect(node(window, 1)).toHaveValue('Incoming note')
    await expect(window.getByRole('complementary', { name: 'Notes activity' })).toContainText('Imported “Import.zip”.')
    await expect(window.getByRole('button', { name: 'OK', exact: true })).toBeFocused()
    await app.evaluate(({ shell }) => {
      shell.showItemInFolder = () => {
        ;(globalThis as typeof globalThis & { keyboardFinder?: boolean }).keyboardFinder = true
      }
    })
    await window.keyboard.press('Shift+Tab')
    await expect(window.getByRole('button', { name: 'Show in Finder' })).toBeFocused()
    await window.keyboard.press('Enter')
    expect(
      await app.evaluate(() => (globalThis as typeof globalThis & { keyboardFinder?: boolean }).keyboardFinder),
    ).toBe(true)
    await window.keyboard.press('Tab')
    await expect(window.getByRole('button', { name: 'OK', exact: true })).toBeFocused()
    await window.keyboard.press(editingMode === 'vim' ? 'Space' : 'Enter')
    await expect(window.getByRole('complementary', { name: 'Notes activity' })).toHaveCount(0)
    await expect(node(window, 1)).toBeFocused()
    await expect(node(window, 1)).toHaveValue('Incoming note')
    await closeApp(app)
  })
})
