// @editing-modes: independent
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildZip } from '../../src/application/test/zip-builder'
import { ipcChannels } from '../../src/shared/ipc'
import {
  clickApplicationMenuItem,
  closeApp,
  configureHiddenParallelTests,
  documentPath,
  expect,
  launchTree,
  node,
  seedDocument,
  test,
  vimPreferencePath,
} from './fixtures'

function archive(path: string, version = 1): void {
  writeFileSync(
    path,
    buildZip([
      {
        name: 'document.json',
        data: new TextEncoder().encode(
          JSON.stringify({
            version,
            document: { roots: [{ id: 'incoming', text: 'Imported synthetic notes', children: [] }] },
            location: { currentParentId: null, selectedNodeId: 'incoming' },
          }),
        ),
      },
    ]),
  )
}

function seed(path: string): void {
  seedDocument(path, {
    document: { roots: [{ id: 'old', text: 'Previous synthetic notes', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'old' },
  })
}

test.describe('desktop Import Notes', () => {
  configureHiddenParallelTests()

  for (const appearance of ['light', 'dark'] as const) {
    // @requirement PRODUCT.md §25.3
    // @requirement PRODUCT.md §25.4
    // @requirement PRODUCT.md §20.5
    test(`imports an older archive through the menu and reloads with a persistent Finder result (${appearance})`, async ({
      userDataDir,
    }) => {
      seed(userDataDir)
      const path = join(userDataDir, 'Browser Notes.zip')
      archive(path)
      const { app, window } = await launchTree(userDataDir, { appearance, vimPreference: false })
      await window.emulateMedia({ colorScheme: appearance })
      await expect(node(window, 1)).toHaveValue('Previous synthetic notes')
      const preference = readFileSync(vimPreferencePath(userDataDir))
      await app.evaluate(({ dialog, shell }, chosen) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog
        shell.showItemInFolder = (folder) => {
          ;(globalThis as typeof globalThis & { shownFolder?: string }).shownFolder = folder
        }
      }, path)
      // Keep synthetic screenshot display text stable; the real commit and Finder path stay intact.
      await app.evaluate((_electron, channel) => {
        globalThis.__treeIpc.wrap(channel, async (original, ...args) => {
          const result = (await original(...args)) as { replacedFolder: string | null } | null
          return result === null
            ? null
            : { ...result, replacedFolder: '~/Library/Application Support/Tree/Replaced Notes/2026-10-23 14-05-09' }
        })
      }, ipcChannels.takeNotesImportNotice)
      await clickApplicationMenuItem(app, 'File', 'Import Notes…')
      const confirmation = window.getByRole('dialog', { name: 'Replace Current Notes?' })
      await expect(confirmation).toBeVisible()
      await expect(confirmation).toContainText('contains 1 node and 0 images.')
      await expect(confirmation).toContainText('moves them to the Replaced Notes folder.')
      await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
      expect(
        await confirmation.evaluate((element) => {
          const dialog = element.getBoundingClientRect()
          const buttons = [...element.querySelectorAll('button')].map((button) => button.getBoundingClientRect())
          return (
            dialog.left >= 0 &&
            dialog.right <= innerWidth &&
            dialog.top >= 0 &&
            dialog.bottom <= innerHeight &&
            buttons.every((button, index) =>
              buttons
                .slice(index + 1)
                .every(
                  (next) =>
                    button.right <= next.left ||
                    next.right <= button.left ||
                    button.bottom <= next.top ||
                    next.bottom <= button.top,
                ),
            )
          )
        }),
      ).toBe(true)
      await expect(confirmation).toHaveScreenshot(`import-confirmation-${appearance}.png`)
      await window.screenshot({ path: `.scratch/desktop-notes-import/confirmation-${appearance}.png` })
      await confirmation.getByRole('button', { name: 'Replace Notes', exact: true }).click()
      await expect(node(window, 1)).toHaveValue('Imported synthetic notes')
      const panel = window.getByRole('complementary', { name: 'Notes activity' })
      await expect(panel).toContainText('Imported “Browser Notes.zip”. Your previous notes are in')
      await expect(panel.getByRole('button', { name: 'OK', exact: true })).toBeFocused()
      await expect(panel.getByRole('button', { name: 'OK', exact: true })).toHaveCSS('outline-width', '2px')
      await expect(panel.getByRole('button', { name: 'OK', exact: true })).toHaveCSS('outline-style', 'solid')
      expect(
        await panel.evaluate((element) => {
          const panel = element.getBoundingClientRect()
          const footer = document.querySelector('.status-bar')!.getBoundingClientRect()
          return panel.left >= 0 && panel.right <= innerWidth && panel.bottom < footer.top
        }),
      ).toBe(true)
      await expect(panel).toHaveScreenshot(`import-result-${appearance}.png`)
      await window.screenshot({ path: `.scratch/desktop-notes-import/result-${appearance}.png` })
      const folders = readdirSync(join(userDataDir, 'Replaced Notes'))
      expect(folders).toHaveLength(1)
      expect(
        JSON.parse(readFileSync(join(userDataDir, 'Replaced Notes', folders[0]!, 'document.json'), 'utf8')).document
          .roots[0].text,
      ).toBe('Previous synthetic notes')
      expect(readdirSync(join(userDataDir, 'data')).filter((name) => /^document\.\d+\.json$/.test(name))).toEqual([])
      expect(readFileSync(vimPreferencePath(userDataDir))).toEqual(preference)
      await panel.getByRole('button', { name: 'Show in Finder' }).click()
      expect(await app.evaluate(() => (globalThis as typeof globalThis & { shownFolder?: string }).shownFolder)).toBe(
        realpathSync(join(userDataDir, 'Replaced Notes', folders[0]!)),
      )
      await window.clock.install()
      await window.clock.fastForward(6000)
      await expect(panel).toBeVisible()
      await panel.getByRole('button', { name: 'OK', exact: true }).click()
      await expect(panel).toHaveCount(0)
      expect(readdirSync(join(userDataDir, '.notes-import'))).toEqual([])
      await closeApp(app)
    })
  }

  // @requirement PRODUCT.md §25.1
  // @requirement PRODUCT.md §25.3
  test('rejects hostile and newer archives, then imports from a load-error state', async ({ userDataDir }) => {
    seed(userDataDir)
    writeFileSync(documentPath(userDataDir), 'invalid notes')
    const path = join(userDataDir, 'Notes.zip')
    writeFileSync(path, buildZip([{ name: '__MACOSX/file', data: new Uint8Array() }]))
    const { app, window } = await launchTree(userDataDir, { expectReady: false })
    await expect(window.getByRole('heading', { name: 'Tree could not open this document' })).toBeVisible()
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog
    }, path)
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    await expect(window.getByRole('complementary', { name: 'Notes activity' })).toContainText('Import failed.')
    expect(readFileSync(documentPath(userDataDir), 'utf8')).toBe('invalid notes')
    archive(path, 999)
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    await expect(window.getByRole('complementary', { name: 'Notes activity' })).toContainText('unsupported format')
    archive(path)
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    const dialog = window.getByRole('dialog')
    await expect(dialog).toContainText('The saved notes cannot be opened.')
    await expect(dialog.getByRole('button', { name: 'Export Current Notes First' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Replace Notes', exact: true }).click()
    await expect(node(window, 1)).toHaveValue('Imported synthetic notes')
    await closeApp(app)
  })

  // @requirement PRODUCT.md §25.3
  test('cleans preparation and confirmation on renderer reload and permits another import', async ({ userDataDir }) => {
    seed(userDataDir)
    const path = join(userDataDir, 'Notes.zip')
    archive(path)
    const { app, window } = await launchTree(userDataDir)
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as typeof dialog.showOpenDialog
      globalThis.__treeArchiveWorkers.hold = ['prepared']
    }, path)
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    await expect.poll(() => app.evaluate(() => globalThis.__treeArchiveWorkers.held.length)).toBe(1)
    await window.reload()
    await expect(node(window, 1)).toHaveValue('Previous synthetic notes')
    await expect.poll(() => readdirSync(join(userDataDir, '.notes-import'))).toEqual([])
    await app.evaluate(() => {
      globalThis.__treeArchiveWorkers.hold = []
      globalThis.__treeArchiveWorkers.release()
    })
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    await expect(window.getByRole('dialog')).toBeVisible()
    await window.reload()
    await expect.poll(() => readdirSync(join(userDataDir, '.notes-import'))).toEqual([])
    await clickApplicationMenuItem(app, 'File', 'Import Notes…')
    await expect(window.getByRole('dialog')).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(window.getByRole('dialog')).toHaveCount(0)
    expect(existsSync(join(userDataDir, 'Replaced Notes'))).toBe(false)
    await closeApp(app)
  })
})
