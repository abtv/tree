// @editing-modes: independent
import { existsSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { serializeState } from '../../src/domain/document'
import { exportNotesArchive } from '../../src/application/notes-archive/export-notes'
import { createZipWriter } from '../../src/infrastructure/archive/zip-writer'
import { concat, readArchive } from '../../src/infrastructure/archive/zip-test-utils'
import { onePixelPng } from '../../src/electron/main/png-test-utils'
import { ipcChannels, type TreeApi } from '../../src/shared/ipc'
import {
  clickApplicationMenuQuit,
  closeApp,
  configureHiddenParallelTests,
  documentPath,
  expect,
  launchTree,
  node,
  readPersisted,
  seedDocument,
  test,
  vimPreferencePath,
} from './fixtures'

// Desktop notes export and import across the real worker thread, IPC and file system (ADR 0024).
// The native panels and the Finder are stubbed in the main process; the menu and the in-window
// panels come with PRODUCT §25.

type NotesRequest =
  | 'chooseNotesExportDestination'
  | 'startNotesExport'
  | 'chooseNotesImportArchive'
  | 'prepareNotesImport'
  | 'commitNotesImport'
  | 'cancelNotesOperation'
  | 'takeNotesImportNotice'
  | 'showReplacedNotesFolder'

function callNotes<K extends NotesRequest>(
  window: Page,
  request: K,
): Promise<Awaited<ReturnType<NonNullable<TreeApi[K]>>>> {
  return window.evaluate(
    (name) => (globalThis as unknown as { treeApi: Record<string, () => Promise<unknown>> }).treeApi[name]!(),
    request,
  ) as Promise<Awaited<ReturnType<NonNullable<TreeApi[K]>>>>
}

async function stubPanels(app: ElectronApplication, paths: { save?: string; open?: string }): Promise<void> {
  await app.evaluate(({ dialog, shell }, chosen) => {
    const record = globalThis as typeof globalThis & { shownFolders?: string[] }
    record.shownFolders = []
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: chosen.save })) as typeof dialog.showSaveDialog
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: chosen.open === undefined ? [] : [chosen.open],
    })) as typeof dialog.showOpenDialog
    shell.showItemInFolder = (path) => void record.shownFolders!.push(path)
  }, paths)
}

/** Holds the worker's final message, so its file or staging is complete but unused by the main process. */
const holdWorkers = (app: ElectronApplication, type: 'written' | 'prepared') =>
  app.evaluate((_electron, held) => {
    globalThis.__treeArchiveWorkers.hold = [held]
  }, type)
const heldMessages = (app: ElectronApplication) => app.evaluate(() => globalThis.__treeArchiveWorkers.held.length)
const releaseWorkers = (app: ElectronApplication) => app.evaluate(() => globalThis.__treeArchiveWorkers.release())

function seedNotesWithImage(userDataDir: string, text: string, imageId: string): void {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'root', text, attachment: { id: imageId, mimeType: 'image/png' }, children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'root' },
  })
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(join(userDataDir, 'data', 'attachments', `${imageId}.png`), onePixelPng)
}

const importedHead = serializeState(
  {
    roots: [{ id: 'imported', text: 'Imported notes', attachment: { id: 'new', mimeType: 'image/png' }, children: [] }],
  },
  { currentParentId: null, selectedNodeId: 'imported' },
  { expandedIds: [] },
)

/** Writes the archive exactly as the browser version exports it. */
async function writeBrowserArchive(path: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  await exportNotesArchive(
    { readHead: async () => importedHead, readImage: async () => onePixelPng },
    createZipWriter((chunk) => chunks.push(chunk.slice())),
  )
  const archive = concat(chunks)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, archive)
  return archive
}

const entries = (directory: string) => (existsSync(directory) ? readdirSync(directory).sort() : [])

test.describe('desktop notes archive boundary', () => {
  configureHiddenParallelTests()

  // @requirement PRODUCT.md §25
  // @requirement PRODUCT.md §25.2
  test('exports through the save panel, keeps an existing file on cancel and replaces it once complete', async ({
    userDataDir,
  }) => {
    seedNotesWithImage(userDataDir, 'Exported notes', 'picture')
    const exports = join(userDataDir, 'Exports')
    mkdirSync(exports)
    const destination = join(exports, 'Tree Notes 2026-10-23.zip')
    writeFileSync(destination, 'previous archive')
    const { app, window } = await launchTree(userDataDir)
    await expect(node(window, 1)).toHaveValue('Exported notes')
    await stubPanels(app, { save: destination })
    await window.evaluate(() => {
      const record = globalThis as typeof globalThis & { progress?: unknown[] }
      record.progress = []
      ;(globalThis as unknown as { treeApi: TreeApi }).treeApi.onNotesProgress?.((value) =>
        record.progress!.push(value),
      )
    })

    await holdWorkers(app, 'written')
    await expect(callNotes(window, 'chooseNotesExportDestination')).resolves.toEqual({
      ok: true,
      fileName: 'Tree Notes 2026-10-23.zip',
    })
    const cancelled = callNotes(window, 'startNotesExport')
    await expect.poll(() => heldMessages(app)).toBe(1)
    // The finished archive waits under a hidden name; the existing file is untouched.
    const [hidden] = entries(exports).filter((name) => name.startsWith('.Tree Notes 2026-10-23.zip.'))
    expect(readArchive(new Uint8Array(readFileSync(join(exports, hidden!)))).has('document.json')).toBe(true)
    expect(readFileSync(destination, 'utf8')).toBe('previous archive')
    await callNotes(window, 'cancelNotesOperation')
    await expect(cancelled).resolves.toEqual({ ok: false, canceled: true })
    expect(entries(exports)).toEqual(['Tree Notes 2026-10-23.zip'])
    expect(readFileSync(destination, 'utf8')).toBe('previous archive')
    await releaseWorkers(app)

    await callNotes(window, 'chooseNotesExportDestination')
    const result = await callNotes(window, 'startNotesExport')

    const archive = new Uint8Array(readFileSync(destination))
    expect(result).toEqual({
      ok: true,
      fileName: 'Tree Notes 2026-10-23.zip',
      summary: { imageCount: 1, missingImageCount: 0, archiveBytes: archive.byteLength },
    })
    const contents = readArchive(archive)
    expect([...contents.keys()]).toEqual(['document.json', 'attachments/picture.png'])
    expect(JSON.parse(new TextDecoder().decode(contents.get('document.json')))).toEqual(readPersisted(userDataDir))
    expect(contents.get('attachments/picture.png')).toEqual(onePixelPng)
    expect(entries(exports)).toEqual(['Tree Notes 2026-10-23.zip'])
    expect(entries(join(userDataDir, '.notes-export'))).toEqual([])
    expect(
      await window.evaluate(() => (globalThis as typeof globalThis & { progress?: unknown[] }).progress),
    ).toContainEqual({ imagesDone: 1, imageCount: 1 })
    expect(await app.evaluate(() => globalThis.__treeArchiveWorkers.started)).toBe(2)
    await closeApp(app)
  })

  test('imports a browser archive into another profile and opens it after the window reloads', async ({
    userDataDir,
  }) => {
    seedNotesWithImage(userDataDir, 'Previous notes', 'old')
    const previous = readFileSync(documentPath(userDataDir))
    writeFileSync(join(userDataDir, 'data', 'document.3.json'), previous)
    // Older than the primary, so loading keeps it as a retained generation.
    utimesSync(join(userDataDir, 'data', 'document.3.json'), 1_000, 1_000)
    const archivePath = join(userDataDir, 'Downloads', 'Tree Notes 2026-10-20.zip')
    const archive = await writeBrowserArchive(archivePath)
    const { app, window } = await launchTree(userDataDir)
    await expect(node(window, 1)).toHaveValue('Previous notes')
    const preference = readFileSync(vimPreferencePath(userDataDir))
    await stubPanels(app, { open: archivePath })

    await expect(callNotes(window, 'chooseNotesImportArchive')).resolves.toEqual({
      ok: true,
      fileName: 'Tree Notes 2026-10-20.zip',
    })
    await expect(callNotes(window, 'prepareNotesImport')).resolves.toEqual({
      ok: true,
      fileName: 'Tree Notes 2026-10-20.zip',
      fileBytes: archive.byteLength,
      incoming: { nodeCount: 1, imageCount: 1, missingImageCount: 0 },
      current: { nodeCount: 1, imageCount: 1 },
    })
    await expect(callNotes(window, 'commitNotesImport')).resolves.toEqual({ ok: true })
    await window.reload()

    await expect(node(window, 1)).toHaveValue('Imported notes')
    const replacedNotes = join(userDataDir, 'Replaced Notes')
    const [folderName] = entries(replacedNotes)
    expect(folderName).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}$/)
    const folder = join(replacedNotes, folderName!)
    expect(entries(folder)).toEqual(['attachments', 'document.3.json', 'document.json'])
    expect(readFileSync(join(folder, 'document.json'))).toEqual(previous)
    expect(entries(join(folder, 'attachments'))).toEqual(['old.png'])
    expect(entries(join(userDataDir, 'data')).filter((name) => /^document\.\d+\.json$/.test(name))).toEqual([])
    expect(entries(join(userDataDir, 'data', 'attachments'))).toEqual(['new.png'])
    expect(readFileSync(vimPreferencePath(userDataDir))).toEqual(preference)
    expect(entries(join(userDataDir, '.notes-import'))).toEqual([])

    const notice = await callNotes(window, 'takeNotesImportNotice')
    expect(notice).toEqual({ fileName: 'Tree Notes 2026-10-20.zip', replacedFolder: expect.any(String) })
    expect(notice?.replacedFolder?.endsWith(join('Replaced Notes', folderName!))).toBe(true)
    await expect(callNotes(window, 'takeNotesImportNotice')).resolves.toBeNull()
    await callNotes(window, 'showReplacedNotesFolder')
    const shown = await app.evaluate(() => (globalThis as typeof globalThis & { shownFolders?: string[] }).shownFolders)
    expect(shown).toHaveLength(1)
    expect(shown![0]!.endsWith(join('Replaced Notes', folderName!))).toBe(true)
    await closeApp(app)
  })

  // @requirement PRODUCT.md §25.2
  test('quitting during an export cancels it and leaves no file', async ({ userDataDir }) => {
    seedNotesWithImage(userDataDir, 'Exported notes', 'picture')
    const exports = join(userDataDir, 'Exports')
    mkdirSync(exports)
    const { app, window } = await launchTree(userDataDir)
    await expect(node(window, 1)).toHaveValue('Exported notes')
    await stubPanels(app, { save: join(exports, 'Tree Notes 2026-10-23.zip') })
    await holdWorkers(app, 'written')
    await callNotes(window, 'chooseNotesExportDestination')
    void callNotes(window, 'startNotesExport').catch(() => undefined)
    await expect.poll(() => heldMessages(app)).toBe(1)
    expect(entries(exports)).toHaveLength(1)

    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed

    expect(entries(exports)).toEqual([])
    expect(entries(join(userDataDir, '.notes-export'))).toEqual([])
  })

  test('quitting while an archive is checked removes what the import prepared', async ({ userDataDir }) => {
    seedNotesWithImage(userDataDir, 'Previous notes', 'old')
    const previous = readFileSync(documentPath(userDataDir), 'utf8')
    const archivePath = join(userDataDir, 'Downloads', 'Tree Notes 2026-10-20.zip')
    await writeBrowserArchive(archivePath)
    const { app, window } = await launchTree(userDataDir)
    await expect(node(window, 1)).toHaveValue('Previous notes')
    await stubPanels(app, { open: archivePath })
    await holdWorkers(app, 'prepared')
    await callNotes(window, 'chooseNotesImportArchive')
    void callNotes(window, 'prepareNotesImport').catch(() => undefined)
    await expect.poll(() => heldMessages(app)).toBe(1)
    const [staging] = entries(join(userDataDir, '.notes-import'))
    expect(entries(join(userDataDir, '.notes-import', staging!))).toEqual(['attachments', 'document.json'])

    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed

    expect(entries(join(userDataDir, '.notes-import'))).toEqual([])
    expect(readFileSync(documentPath(userDataDir), 'utf8')).toBe(previous)
    expect(existsSync(join(userDataDir, 'Replaced Notes'))).toBe(false)
  })

  test('quitting during Replace Notes completes the replacement', async ({ userDataDir }) => {
    seedNotesWithImage(userDataDir, 'Previous notes', 'old')
    const archivePath = join(userDataDir, 'Downloads', 'Tree Notes 2026-10-20.zip')
    await writeBrowserArchive(archivePath)
    const { app, window } = await launchTree(userDataDir)
    await expect(node(window, 1)).toHaveValue('Previous notes')
    await stubPanels(app, { open: archivePath })
    await callNotes(window, 'chooseNotesImportArchive')
    await expect(callNotes(window, 'prepareNotesImport')).resolves.toMatchObject({ ok: true })
    await app.evaluate((_electron, channel) => {
      globalThis.__treeIpc.wrap(channel, (original, ...args) => {
        ;(globalThis as typeof globalThis & { commitStarted?: boolean }).commitStarted = true
        return original(...args)
      })
    }, ipcChannels.commitNotesImport)

    void callNotes(window, 'commitNotesImport').catch(() => undefined)
    await expect
      .poll(() => app.evaluate(() => (globalThis as typeof globalThis & { commitStarted?: boolean }).commitStarted))
      .toBe(true)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))
    await clickApplicationMenuQuit(app)
    await closed

    expect(readPersisted(userDataDir).document.roots[0]?.text).toBe('Imported notes')
    expect(entries(join(userDataDir, 'Replaced Notes'))).toHaveLength(1)
    expect(entries(join(userDataDir, '.notes-import'))).toEqual([])
    const restarted = await launchTree(userDataDir)
    await expect(node(restarted.window, 1)).toHaveValue('Imported notes')
    await closeApp(restarted.app)
  })
})
