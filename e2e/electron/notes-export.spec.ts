// @editing-modes: independent
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readArchive } from '../../src/infrastructure/archive/zip-test-utils'
import { ipcChannels, type TreeApi } from '../../src/shared/ipc'
import {
  allowRendererError,
  blockSaves,
  clickApplicationMenuItem,
  configureHiddenParallelTests,
  exactMessage,
  expect,
  fireIdleSave,
  idleSavePoll,
  launchTree,
  node,
  readPersisted,
  restoreSaves,
  seedDocument,
  test,
} from './fixtures'

function seed(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'note', text: 'Synthetic export notes', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'note' },
  })
}

async function choosePath(app: ElectronApplication, path: string | null): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showSaveDialog = (async () => ({
      canceled: chosen === null,
      filePath: chosen ?? undefined,
    })) as typeof dialog.showSaveDialog
  }, path)
}

async function availability(app: ElectronApplication): Promise<boolean[]> {
  return app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!
      .items.find((item) => item.label === 'File')!
      .submenu!.items.map((item) => item.enabled),
  )
}

async function startExport(app: ElectronApplication): Promise<void> {
  await expect.poll(() => availability(app)).toEqual([true, true])

  await clickApplicationMenuItem(app, 'File', 'Export Notes…')
}

async function holdExport(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    globalThis.__treeArchiveWorkers.hold = ['written']
  })
}
async function waitForExport(app: ElectronApplication): Promise<void> {
  await expect.poll(() => app.evaluate(() => globalThis.__treeArchiveWorkers.held.length)).toBe(1)
}

function exportedText(path: string): string {
  const entries = readArchive(new Uint8Array(readFileSync(path)))
  return JSON.parse(new TextDecoder().decode(entries.get('document.json'))).document.roots[0].text as string
}

async function inspectGeometry(page: Page, error = false): Promise<void> {
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.data-activity')!.getBoundingClientRect()
    const toolbar = document.querySelector('.location-bar')!.getBoundingClientRect()
    const footer = document.querySelector('.status-bar')!.getBoundingClientRect()
    const errors = [...document.querySelectorAll('.save-error')].map((element) => element.getBoundingClientRect())
    return {
      visible: panel.left >= 0 && panel.right <= innerWidth && panel.top >= toolbar.bottom && panel.bottom < footer.top,
      nearTop: panel.top < toolbar.bottom + 20,
      separate: errors.every(
        (box) =>
          panel.right <= box.left || panel.left >= box.right || panel.bottom <= box.top || panel.top >= box.bottom,
      ),
    }
  })

  expect(geometry.visible).toBe(true)
  expect(geometry.separate).toBe(true)
  expect(geometry.nearTop).toBe(error)
}

test.describe('desktop Export Notes', () => {
  configureHiddenParallelTests()

  // @requirement PRODUCT.md §20.2.28
  test('exports through the command panel and blocks data commands while running', async ({ userDataDir }) => {
    seed(userDataDir)
    const destination = join(userDataDir, 'Panel Notes.zip')
    const { app, window } = await launchTree(userDataDir, { vimPreference: false })

    await choosePath(app, destination)
    await holdExport(app)
    await node(window, 1).focus()

    await window.keyboard.press('Meta+Shift+p')
    await window.getByRole('combobox', { name: 'Command' }).fill('export-notes')
    await window.keyboard.press('Enter')
    await waitForExport(app)

    await window.keyboard.press('Meta+Shift+p')
    await window.getByRole('combobox', { name: 'Command' }).fill('import-notes')

    await expect(window.locator('#command-import-notes')).toHaveAttribute('aria-disabled', 'true')

    await window.screenshot({ path: '.scratch/menu-command-parity/disabled-data-command.png' })
    await window.keyboard.press('Enter')

    await expect(window.getByRole('combobox', { name: 'Command' })).toBeFocused()

    await window.keyboard.press('Escape')
    await app.evaluate(() => {
      globalThis.__treeArchiveWorkers.release()
    })

    await expect(window.getByRole('complementary', { name: 'Notes activity' })).toContainText('Exported')
    expect(exportedText(destination)).toBe('Synthetic export notes')
  })

  for (const appearance of ['light', 'dark'] as const) {
    // @requirement PRODUCT.md §25
    // @requirement PRODUCT.md §25.1
    // @requirement PRODUCT.md §25.2
    test(`flushes, exports in the background and shows running, done and failed panels (${appearance})`, async ({
      userDataDir,
    }) => {
      seed(userDataDir)
      const destination = join(userDataDir, 'Notes.zip')
      const { app, window } = await launchTree(userDataDir, { appearance, vimPreference: false })

      await window.emulateMedia({ colorScheme: appearance })

      await expect(window.locator('html')).toHaveCSS(
        'background-color',
        appearance === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)',
      )

      await window.clock.install()
      await choosePath(app, destination)
      await node(window, 1).fill('The latest notes before export')
      await holdExport(app)
      await startExport(app)
      await waitForExport(app)
      const panel = window.getByRole('complementary', { name: 'Notes activity' })

      await expect(panel).toContainText('Exporting Notes…')
      expect(existsSync(destination)).toBe(false)
      expect(await availability(app)).toEqual([false, false])

      await inspectGeometry(window)

      await expect(panel).toHaveScreenshot(`export-running-${appearance}.png`)

      await window.screenshot({ path: `.scratch/desktop-notes-export/running-${appearance}.png` })

      // The worker already took its snapshot. Later editing remains usable and is saved separately.
      await node(window, 1).fill('Editing continues during export')
      await fireIdleSave(window)

      // A save briefly renames the primary away; retry the read as well as its assertion.
      await expect(async () => {
        expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Editing continues during export')
      }).toPass(idleSavePoll)

      await app.evaluate(() => globalThis.__treeArchiveWorkers.release())

      await expect(panel).toContainText('Exported “Notes.zip”.')
      expect(exportedText(destination)).toBe('The latest notes before export')
      await expect(panel).toHaveScreenshot(`export-done-${appearance}.png`)

      await window.clock.fastForward(6000)

      await expect(panel).toHaveCount(0)

      await blockSaves(app)
      allowRendererError(
        exactMessage("Changes could not be saved: Error invoking remote method 'tree:save': Error: save blocked"),
      )
      await node(window, 1).fill('A pending edit cannot be saved')
      await startExport(app)

      await expect(panel).toContainText('Export failed. Your latest changes could not be saved:')

      await inspectGeometry(window, true)

      await expect(panel).toHaveScreenshot(`export-failed-${appearance}.png`)

      await window.screenshot({ path: `.scratch/desktop-notes-export/failed-${appearance}.png` })
      await window.clock.fastForward(6000)

      await expect(panel).toBeVisible()

      await panel.getByRole('button', { name: 'OK' }).focus()

      await window.keyboard.press('Enter')

      await expect(panel).toHaveCount(0)
      await expect(node(window, 1)).toBeFocused()

      await restoreSaves(app)
    })
  }

  // @requirement PRODUCT.md §25.2
  test('cancels the native choice and active export while preserving an existing archive', async ({ userDataDir }) => {
    seed(userDataDir)
    const destination = join(userDataDir, 'Notes.zip')

    writeFileSync(destination, 'Previous archive')
    const { app, window } = await launchTree(userDataDir, { vimPreference: false })

    await window.clock.install()
    const before = readPersisted(userDataDir)

    await choosePath(app, null)
    await startExport(app)

    await expect.poll(() => availability(app)).toEqual([true, true])

    await fireIdleSave(window)
    await window.evaluate(() => (globalThis as typeof globalThis & { treeApi: TreeApi }).treeApi.load())

    expect(readPersisted(userDataDir)).toEqual(before)
    await expect(window.locator('.data-activity')).toHaveCount(0)

    await choosePath(app, destination)
    await holdExport(app)
    await startExport(app)
    await waitForExport(app)

    await window.getByRole('button', { name: 'Cancel', exact: true }).click()

    await expect(window.locator('.data-activity')).toHaveCount(0)
    await expect.poll(() => availability(app)).toEqual([true, true])
    expect(readFileSync(destination, 'utf8')).toBe('Previous archive')
    expect(readdirSync(userDataDir).filter((name) => name.startsWith('.Notes.zip.'))).toEqual([])
    await expect(node(window, 1)).toBeFocused()
  })

  // @requirement PRODUCT.md §25.2
  test('reports a real write failure and a limit refusal, then permits another export', async ({ userDataDir }) => {
    seed(userDataDir)
    const destination = join(userDataDir, 'Notes.zip')

    mkdirSync(destination)
    const { app, window } = await launchTree(userDataDir)

    await choosePath(app, destination)
    await startExport(app)

    await expect(window.locator('.data-activity')).toContainText('Export failed. The archive could not be saved:')
    expect(readdirSync(destination)).toEqual([])
    expect(readdirSync(userDataDir).filter((name) => name.startsWith('.Notes.zip.'))).toEqual([])

    await window.getByRole('button', { name: 'OK', exact: true }).click()

    await app.evaluate((_electron, channel) => {
      globalThis.__treeIpc.wrap(channel, async () => ({
        ok: false,
        message: 'Your notes are too large to export as one archive.',
      }))
    }, ipcChannels.startNotesExport)
    await startExport(app)

    await expect(window.locator('.data-activity')).toHaveText(
      'Export failed. Your notes are too large to export as one archive.OK',
    )

    // The injected result skips the worker; release its chosen destination before teardown.
    await window.evaluate(() =>
      (globalThis as typeof globalThis & { treeApi: TreeApi }).treeApi.cancelNotesOperation!(),
    )
  })

  // @requirement PRODUCT.md §25.2
  test('cancels an active export on renderer reload and permits a new export', async ({ userDataDir }) => {
    seed(userDataDir)
    const destination = join(userDataDir, 'Notes.zip')

    writeFileSync(destination, 'Previous archive')
    const { app, window } = await launchTree(userDataDir)

    await choosePath(app, destination)
    await holdExport(app)
    await startExport(app)
    await waitForExport(app)

    await window.reload()

    await expect(node(window, 1)).toBeVisible()
    await expect.poll(() => availability(app)).toEqual([true, true])
    expect(readFileSync(destination, 'utf8')).toBe('Previous archive')
    await expect.poll(() => readdirSync(userDataDir).filter((name) => name.startsWith('.Notes.zip.'))).toEqual([])

    await app.evaluate(() => globalThis.__treeArchiveWorkers.release())
    await startExport(app)

    await expect(window.locator('.data-activity')).toContainText('Exported “Notes.zip”.')
    expect(exportedText(destination)).toBe('Synthetic export notes')
  })

  // @requirement PRODUCT.md §25.2
  test('flushes a pending Vim Replace edit through the same path as quit', async ({ userDataDir }) => {
    seed(userDataDir)
    const destination = join(userDataDir, 'Notes.zip')
    const { app, window } = await launchTree(userDataDir, { vimPreference: true, initialMode: 'normal' })

    await choosePath(app, destination)
    await window.keyboard.press('R')
    await window.keyboard.type('ABC')
    await startExport(app)

    await expect(window.locator('.data-activity')).toContainText('Exported “Notes.zip”.')
    expect(exportedText(destination)).toBe('ABCthetic export notes')
    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('ABCthetic export notes')
  })

  // @requirement PRODUCT.md §25.1
  test('disables export and keeps import available in the load-error state', async ({ userDataDir }) => {
    mkdirSync(join(userDataDir, 'data'), { recursive: true })
    writeFileSync(join(userDataDir, 'data', 'document.json'), 'invalid notes')
    const { app, window } = await launchTree(userDataDir, { expectReady: false })

    await expect(window.getByText('Tree could not open this document')).toBeVisible()
    expect(await availability(app)).toEqual([false, true])
  })
})
