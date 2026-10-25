import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializeState, type TreeNode } from '../../domain/document'
import { exportNotesArchive } from '../../application/notes-archive/export-notes'
import { ENCRYPTED_ARCHIVE_MESSAGE } from '../../application/notes-archive/zip-reader'
import { buildZip } from '../../application/test/zip-builder'
import { createZipWriter } from '../../infrastructure/archive/zip-writer'
import { concat } from '../../infrastructure/archive/zip-test-utils'
import { createFileServices } from '../../infrastructure/main/file-services'
import type {
  ArchiveWorkerChannel,
  ArchiveWorkerMessage,
  ArchiveWorkerReply,
  ArchiveWorkerTask,
} from '../../infrastructure/main/notes-archive/archive-worker-protocol'
import { runDesktopExport } from '../../infrastructure/main/notes-archive/desktop-export-job'
import { runDesktopImport } from '../../infrastructure/main/notes-archive/desktop-import-job'
import { ReplacementIncompleteError } from '../../infrastructure/main/notes-replacement'
import {
  BUSY_MESSAGE,
  RESTART_REQUIRED_MESSAGE,
  WORKER_STOPPED_MESSAGE,
  createNotesArchiveController,
  displayPath,
  type ArchiveWorkerHandle,
  type NotesArchiveControllerDependencies,
} from './notes-archive-controller'
import { onePixelPng } from './png-test-utils'

const NOW = new Date(2026, 9, 23, 14, 5, 9)
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function headWithImages(ids: string[], text = 'Root') {
  const nodes: TreeNode[] = [
    { id: 'root', text, children: [] },
    ...ids.map((id) => ({
      id: `node-${id}`,
      text: id,
      attachment: { id, mimeType: 'image/png' as const },
      children: [],
    })),
  ]
  return serializeState({ roots: nodes }, { currentParentId: null, selectedNodeId: 'root' }, { expandedIds: [] })
}

/** Runs the real worker job in this thread, with message cloning and asynchronous delivery. */
class InProcessWorker extends EventEmitter implements ArchiveWorkerHandle {
  terminated = false
  private pending: ((reply: ArchiveWorkerReply) => void) | undefined

  constructor(task: ArchiveWorkerTask) {
    super()
    const channel: ArchiveWorkerChannel = {
      post: (message) => this.deliver(message),
      request: (message) =>
        new Promise((resolve) => {
          this.pending = resolve
          this.deliver(message)
        }),
    }
    setImmediate(
      () => void (task.type === 'export' ? runDesktopExport(task, channel) : runDesktopImport(task, channel)),
    )
  }

  postMessage(reply: ArchiveWorkerReply): void {
    const resolve = this.pending
    this.pending = undefined
    setImmediate(() => resolve?.(structuredClone(reply)))
  }

  async terminate(): Promise<number> {
    if (!this.terminated) {
      this.terminated = true
      this.emit('exit', 1)
    }
    return 1
  }

  private deliver(message: ArchiveWorkerMessage): void {
    if (this.terminated) return
    const copy = structuredClone(message)
    setImmediate(() => {
      if (!this.terminated) this.emit('message', copy)
    })
  }
}

/** A worker that only does what the test tells it to, for cancellation and failure paths. */
class ScriptedWorker extends EventEmitter implements ArchiveWorkerHandle {
  readonly replies: ArchiveWorkerReply[] = []
  terminated = false
  /** Runs before the thread counts as stopped, like a file operation that finishes after termination. */
  beforeExit: () => Promise<void> = async () => undefined

  constructor(readonly task: ArchiveWorkerTask) {
    super()
  }

  send(message: ArchiveWorkerMessage): void {
    this.emit('message', message)
  }

  postMessage(reply: ArchiveWorkerReply): void {
    this.replies.push(reply)
  }

  async terminate(): Promise<number> {
    if (!this.terminated) {
      this.terminated = true
      await this.beforeExit()
      this.emit('exit', 1)
    }
    return 1
  }
}

async function setup(options: { worker?: 'real' | 'scripted'; withNotes?: boolean } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'tree-notes-controller-'))
  roots.push(home)
  const userData = join(home, 'Library', 'Application Support', 'Tree')
  const data = join(userData, 'data')
  const fileServices = createFileServices(data, () => {}, { userDataDirectory: userData, now: () => NOW })
  await fileServices.load()
  if (options.withNotes !== false) {
    await fileServices.writeAttachment('a', onePixelPng)
    await fileServices.save(headWithImages(['a'], 'Current'))
  }
  const destinations = join(home, 'Documents')
  await mkdir(destinations, { recursive: true })
  const scripted: ScriptedWorker[] = []
  const dialogs = {
    showSaveDialog: vi.fn<NotesArchiveControllerDependencies['dialogs']['showSaveDialog']>(async () => ({
      canceled: false,
      filePath: join(destinations, 'Tree Notes 2026-10-23.zip'),
    })),
    showOpenDialog: vi.fn<NotesArchiveControllerDependencies['dialogs']['showOpenDialog']>(async () => ({
      canceled: false,
      filePaths: [join(destinations, 'Tree Notes 2026-10-20.zip')],
    })),
  }
  const dependencies = {
    fileServices,
    attachmentsDirectory: join(data, 'attachments'),
    dialogs,
    startWorker: vi.fn((task: ArchiveWorkerTask): ArchiveWorkerHandle => {
      if (options.worker === 'scripted') {
        const worker = new ScriptedWorker(task)
        scripted.push(worker)
        return worker
      }
      return new InProcessWorker(task)
    }),
    decodePng: vi.fn((bytes: Uint8Array) => bytes.byteLength > 0),
    sendProgress: vi.fn(),
    showItemInFolder: vi.fn(),
    homeDirectory: home,
    now: () => NOW,
  }
  const controller = createNotesArchiveController(dependencies)
  return { home, userData, data, destinations, fileServices, dialogs, dependencies, controller, scripted }
}

async function writeArchive(path: string, head: unknown, images: Record<string, Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  await exportNotesArchive(
    { readHead: async () => head, readImage: async (id) => images[id] },
    createZipWriter((chunk) => chunks.push(chunk.slice())),
  )
  const archive = concat(chunks)
  await writeFile(path, archive)
  return archive
}

const waitForWorker = async (scripted: ScriptedWorker[]) => {
  await vi.waitFor(() => expect(scripted).toHaveLength(1))
  return scripted[0]!
}

describe('notes archive controller: export', () => {
  it('opens the save panel with the dated name and writes the archive only once it is complete', async () => {
    const { controller, dialogs, destinations, userData, dependencies, fileServices } = await setup()
    const pinned = vi.spyOn(fileServices, 'pinAttachments')

    await expect(controller.chooseExportDestination()).resolves.toEqual({
      ok: true,
      fileName: 'Tree Notes 2026-10-23.zip',
    })
    expect(dialogs.showSaveDialog).toHaveBeenCalledExactlyOnceWith({
      defaultPath: 'Tree Notes 2026-10-23.zip',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })

    const result = await controller.startExport()

    const archive = await readFile(join(destinations, 'Tree Notes 2026-10-23.zip'))

    expect(result).toEqual({
      ok: true,
      fileName: 'Tree Notes 2026-10-23.zip',
      summary: { imageCount: 1, missingImageCount: 0, archiveBytes: archive.byteLength },
    })
    expect(await readdir(destinations)).toEqual(['Tree Notes 2026-10-23.zip'])
    expect(await readdir(join(userData, '.notes-export'))).toEqual([])
    expect(pinned).toHaveBeenCalledExactlyOnceWith(['a'])
    expect(dependencies.sendProgress).toHaveBeenLastCalledWith({ imagesDone: 1, imageCount: 1 })
    // A finished export frees the controller for the next operation.
    await expect(controller.chooseImportArchive()).resolves.toMatchObject({ ok: true })
  })

  it('round-trips a desktop export through import into another profile', async () => {
    const source = await setup()

    await source.controller.chooseExportDestination()
    await source.controller.startExport()
    const target = await setup({ withNotes: false })
    target.dialogs.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(source.destinations, 'Tree Notes 2026-10-23.zip')],
    })

    await target.controller.chooseImportArchive()

    await expect(target.controller.prepareImport()).resolves.toMatchObject({
      ok: true,
      incoming: { nodeCount: 2, imageCount: 1, missingImageCount: 0 },
      current: 'none',
    })
    await expect(target.controller.commitImport()).resolves.toEqual({ ok: true })

    await expect(target.fileServices.load()).resolves.toEqual(headWithImages(['a'], 'Current'))
    expect(await readFile(join(target.data, 'attachments', 'a.png'))).toEqual(Buffer.from(onePixelPng))
  })

  it('does nothing when the save panel is cancelled', async () => {
    const { controller, dialogs, dependencies } = await setup()
    dialogs.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' })

    await expect(controller.chooseExportDestination()).resolves.toEqual({ ok: false, canceled: true })
    await expect(controller.startExport()).rejects.toThrow('No export destination was chosen.')
    expect(dependencies.startWorker).not.toHaveBeenCalled()
  })

  it('leaves no partial file and keeps an existing file when the export is cancelled', async () => {
    const { controller, destinations, userData, scripted, fileServices } = await setup({ worker: 'scripted' })
    const destination = join(destinations, 'Tree Notes 2026-10-23.zip')

    await writeFile(destination, 'previous archive')
    const unpin = vi.fn()
    vi.spyOn(fileServices, 'pinAttachments').mockReturnValue(unpin)

    await controller.chooseExportDestination()

    const result = controller.startExport()
    const worker = await waitForWorker(scripted)
    if (worker.task.type !== 'export') throw new Error('Expected an export task.')

    expect(worker.task.temporaryPath.startsWith(join(destinations, '.Tree Notes 2026-10-23.zip.'))).toBe(true)

    await writeFile(worker.task.temporaryPath, 'partial archive')
    worker.send({ type: 'pin', ids: ['a'] })
    await vi.waitFor(() => expect(worker.replies).toEqual([{ type: 'pinned' }]))

    await controller.cancel()

    await expect(result).resolves.toEqual({ ok: false, canceled: true })
    expect(worker.terminated).toBe(true)
    expect(unpin).toHaveBeenCalled()
    expect(await readdir(destinations)).toEqual(['Tree Notes 2026-10-23.zip'])
    expect(await readFile(destination, 'utf8')).toBe('previous archive')
    expect(await readdir(join(userData, '.notes-export'))).toEqual([])

    // A message the worker queued before it stopped is ignored.
    worker.send({ type: 'written', summary: { imageCount: 0, missingImageCount: 0, archiveBytes: 0 } })

    expect(await readdir(destinations)).toEqual(['Tree Notes 2026-10-23.zip'])
  })

  it('waits for the worker to stop before removing a file it was still creating', async () => {
    const { controller, destinations, scripted } = await setup({ worker: 'scripted' })

    await controller.chooseExportDestination()
    const result = controller.startExport()
    const worker = await waitForWorker(scripted)
    if (worker.task.type !== 'export') throw new Error('Expected an export task.')
    const temporaryPath = worker.task.temporaryPath
    worker.beforeExit = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      await writeFile(temporaryPath, 'written while stopping')
    }

    await controller.cancel()

    await expect(result).resolves.toEqual({ ok: false, canceled: true })
    expect(await readdir(destinations)).toEqual([])
  })

  it('reports worker failures and removes the temporary file', async () => {
    for (const [fail, message] of [
      [
        (worker: ScriptedWorker) => worker.send({ type: 'error', message: 'Your notes are too large.' }),
        'Your notes are too large.',
      ],
      [(worker: ScriptedWorker) => worker.emit('error', new Error('boom')), 'The notes could not be read: boom'],
      [(worker: ScriptedWorker) => worker.emit('exit', 1), `The notes could not be read: ${WORKER_STOPPED_MESSAGE}`],
    ] as const) {
      const { controller, destinations, scripted } = await setup({ worker: 'scripted' })

      await controller.chooseExportDestination()
      const result = controller.startExport()
      const worker = await waitForWorker(scripted)
      if (worker.task.type !== 'export') throw new Error('Expected an export task.')

      await writeFile(worker.task.temporaryPath, 'partial archive')

      fail(worker)

      await expect(result).resolves.toEqual({ ok: false, message })
      expect(await readdir(destinations)).toEqual([])
    }
  })

  it('reports a destination that cannot be written', async () => {
    const { controller, dialogs, home } = await setup()
    dialogs.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(home, 'missing', 'notes.zip') })

    await controller.chooseExportDestination()

    await expect(controller.startExport()).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/^The archive could not be saved: ENOENT/),
    })
  })

  it('runs one operation at a time', async () => {
    const { controller, scripted } = await setup({ worker: 'scripted' })

    await controller.chooseExportDestination()
    const result = controller.startExport()
    await waitForWorker(scripted)

    await expect(controller.chooseExportDestination()).rejects.toThrow(BUSY_MESSAGE)
    await expect(controller.chooseImportArchive()).rejects.toThrow(BUSY_MESSAGE)
    await expect(controller.commitImport()).rejects.toThrow('No import is prepared.')

    await controller.cancel()

    await expect(result).resolves.toEqual({ ok: false, canceled: true })
  })
})

describe('notes archive controller: import', () => {
  it('cancels both the export worker and the import retained behind it', async () => {
    const { controller, destinations, userData, dependencies } = await setup()

    await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), headWithImages([]), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()
    const worker = new ScriptedWorker({
      type: 'export',
      snapshotDirectory: '',
      attachmentsDirectory: '',
      temporaryPath: '',
    })
    dependencies.startWorker.mockReturnValueOnce(worker)

    await controller.chooseExportDestination()
    const exportJob = controller.startExport()
    await vi.waitFor(() => expect(dependencies.startWorker).toHaveBeenCalledTimes(2))

    await controller.cancel()

    await expect(exportJob).resolves.toEqual({ ok: false, canceled: true })
    expect(worker.terminated).toBe(true)
    expect(await readdir(join(userData, '.notes-import'))).toEqual([])
    await expect(controller.commitImport()).rejects.toThrow('No import is prepared.')
  })
  // @requirement PRODUCT.md §25.3
  it('exports current notes from confirmation, retains preparation after native cancel and permits replacement', async () => {
    const { controller, destinations, dialogs, fileServices } = await setup()

    await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), headWithImages([], 'Incoming'), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()
    dialogs.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' })

    await controller.chooseExportDestination()
    await controller.chooseExportDestination()

    await expect(controller.startExport()).resolves.toMatchObject({ ok: true })
    await expect(controller.commitImport()).resolves.toEqual({ ok: true })
    await expect(fileServices.load()).resolves.toEqual(headWithImages([], 'Incoming'))
  })

  it('discards the retained import when cancellation interrupts its export choice', async () => {
    const { controller, destinations, dialogs, userData } = await setup()

    await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), headWithImages([]), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()
    let release!: (value: { canceled: boolean; filePath: string }) => void
    dialogs.showSaveDialog.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const choosing = controller.chooseExportDestination()

    await controller.shutdown()
    release({ canceled: true, filePath: '' })
    await choosing

    expect(await readdir(join(userData, '.notes-import'))).toEqual([])
  })
  it('prepares a browser archive, replaces the notes and reports the Replaced Notes folder once', async () => {
    const { controller, destinations, data, userData, dependencies, fileServices } = await setup()
    const incoming = headWithImages(['b', 'missing'], 'Imported')
    const archive = await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), incoming, { b: onePixelPng })

    await expect(controller.chooseImportArchive()).resolves.toEqual({ ok: true, fileName: 'Tree Notes 2026-10-20.zip' })
    expect(dependencies.dialogs.showOpenDialog).toHaveBeenCalledExactlyOnceWith({
      properties: ['openFile'],
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    await expect(controller.prepareImport()).resolves.toEqual({
      ok: true,
      fileName: 'Tree Notes 2026-10-20.zip',
      fileBytes: archive.byteLength,
      incoming: { nodeCount: 3, imageCount: 1, missingImageCount: 1 },
      current: { nodeCount: 2, imageCount: 1 },
    })
    expect(dependencies.decodePng).toHaveBeenCalledExactlyOnceWith(onePixelPng)
    expect(await readdir(join(userData, '.notes-export'))).toEqual([])
    await expect(controller.commitImport()).resolves.toEqual({ ok: true })

    await expect(fileServices.load()).resolves.toEqual(incoming)
    expect(await readdir(join(data, 'attachments'))).toEqual(['b.png'])
    expect(controller.takeImportNotice()).toEqual({
      fileName: 'Tree Notes 2026-10-20.zip',
      replacedFolder: '~/Library/Application Support/Tree/Replaced Notes/2026-10-23 14-05-09',
    })
    expect(controller.takeImportNotice()).toBeNull()

    controller.showReplacedFolder()

    expect(dependencies.showItemInFolder).toHaveBeenCalledExactlyOnceWith(
      join(userData, 'Replaced Notes', '2026-10-23 14-05-09'),
    )
  })

  it('reports an import into empty notes without a Replaced Notes folder', async () => {
    const { controller, destinations } = await setup({ withNotes: false })

    await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), headWithImages([]), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()
    await controller.commitImport()

    expect(controller.takeImportNotice()).toEqual({ fileName: 'Tree Notes 2026-10-20.zip', replacedFolder: null })
    expect(() => controller.showReplacedFolder()).toThrow('There is no Replaced Notes folder to show.')
  })

  it('removes what the import prepared when the archive is refused or the import is cancelled', async () => {
    const { controller, destinations, userData } = await setup()
    const archivePath = join(destinations, 'Tree Notes 2026-10-20.zip')
    const document = new TextEncoder().encode(JSON.stringify(headWithImages([])))

    await writeFile(archivePath, buildZip([{ name: 'document.json', data: document, flags: 0x0001 }]))

    await controller.chooseImportArchive()

    await expect(controller.prepareImport()).resolves.toEqual({ ok: false, message: ENCRYPTED_ARCHIVE_MESSAGE })
    expect(await readdir(join(userData, '.notes-import'))).toEqual([])

    await writeArchive(archivePath, headWithImages([]), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()

    expect(await readdir(join(userData, '.notes-import'))).toHaveLength(1)

    await controller.cancel()

    expect(await readdir(join(userData, '.notes-import'))).toEqual([])
    await expect(controller.commitImport()).rejects.toThrow('No import is prepared.')
  })

  it('stops a running preparation, discards staging and ignores later worker messages', async () => {
    const { controller, userData, scripted, dependencies } = await setup({ worker: 'scripted' })

    await controller.chooseImportArchive()
    const result = controller.prepareImport()
    const worker = await waitForWorker(scripted)

    worker.send({ type: 'validate-image', bytes: onePixelPng })
    await vi.waitFor(() => expect(worker.replies).toEqual([{ type: 'image-validated', decodable: true }]))

    worker.send({ type: 'staged' })
    await vi.waitFor(() => expect(worker.replies).toHaveLength(2))

    await controller.cancel()

    await expect(result).resolves.toEqual({ ok: false, canceled: true })
    expect(await readdir(join(userData, '.notes-import'))).toEqual([])
    expect(await readdir(join(userData, '.notes-export'))).toEqual([])

    worker.send({ type: 'validate-image', bytes: onePixelPng })
    await new Promise((resolve) => setImmediate(resolve))

    expect(dependencies.decodePng).toHaveBeenCalledOnce()
  })

  it('keeps the notes and resumes when the replacement fails before its journal', async () => {
    const { controller, destinations, fileServices, userData } = await setup()

    await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), headWithImages([]), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()
    vi.spyOn(fileServices, 'replaceNotes').mockRejectedValueOnce(new Error('disk full'))

    await expect(controller.commitImport()).resolves.toEqual({
      ok: false,
      restartRequired: false,
      message: 'Your notes could not be replaced: disk full',
    })
    expect(await readdir(join(userData, '.notes-import'))).toEqual([])
    await expect(fileServices.load()).resolves.toEqual(headWithImages(['a'], 'Current'))
    await expect(controller.chooseExportDestination()).resolves.toMatchObject({ ok: true })
  })

  it('requires a restart after a replacement fails past its journal', async () => {
    const { controller, destinations, fileServices } = await setup()

    await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), headWithImages([]), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()
    vi.spyOn(fileServices, 'replaceNotes').mockRejectedValueOnce(
      new ReplacementIncompleteError(new Error('interrupted')),
    )

    await expect(controller.commitImport()).resolves.toEqual({
      ok: false,
      restartRequired: true,
      message: 'Your notes could not be replaced: interrupted',
    })
    await expect(controller.chooseExportDestination()).rejects.toThrow(RESTART_REQUIRED_MESSAGE)
    await expect(controller.chooseImportArchive()).rejects.toThrow(RESTART_REQUIRED_MESSAGE)
  })

  it('reports a replacement that a restart completed, with the archive name its journal kept', async () => {
    const { controller, fileServices, userData, dependencies } = await setup()
    const folder = join(userData, 'Replaced Notes', '2026-10-23 14-05-09')
    vi.spyOn(fileServices, 'takeRecoveredReplacement')
      .mockReturnValueOnce({ replacedFolder: folder, archive: 'Tree Notes 2026-10-20.zip' })
      .mockReturnValueOnce({ replacedFolder: null })

    expect(controller.takeImportNotice()).toEqual({
      fileName: 'Tree Notes 2026-10-20.zip',
      replacedFolder: '~/Library/Application Support/Tree/Replaced Notes/2026-10-23 14-05-09',
    })

    controller.showReplacedFolder()

    expect(dependencies.showItemInFolder).toHaveBeenCalledWith(folder)
    expect(controller.takeImportNotice()).toEqual({ replacedFolder: null })
    expect(controller.takeImportNotice()).toBeNull()
  })
})

describe('notes archive controller: quitting', () => {
  it('has nothing to wait for when idle', async () => {
    const { controller } = await setup()

    expect(controller.shutdown()).toBeNull()
    await expect(controller.chooseExportDestination()).rejects.toThrow('Tree is quitting.')
  })

  it('cancels a running export and its cleanup finishes before quitting', async () => {
    const { controller, destinations, scripted } = await setup({ worker: 'scripted' })

    await controller.chooseExportDestination()
    const result = controller.startExport()
    const worker = await waitForWorker(scripted)
    if (worker.task.type !== 'export') throw new Error('Expected an export task.')

    await writeFile(worker.task.temporaryPath, 'partial archive')

    const pending = controller.shutdown()

    expect(pending).not.toBeNull()

    await pending

    await expect(result).resolves.toEqual({ ok: false, canceled: true })
    expect(await readdir(destinations)).toEqual([])
    expect(controller.shutdown()).toBeNull()
  })

  it('discards a prepared import when quitting from the confirmation', async () => {
    const { controller, destinations, userData } = await setup()

    await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), headWithImages([]), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()

    await controller.shutdown()

    expect(await readdir(join(userData, '.notes-import'))).toEqual([])
    expect(controller.shutdown()).toBeNull()
  })

  it('waits for a running replacement instead of cancelling it', async () => {
    const { controller, destinations, fileServices } = await setup()

    await writeArchive(join(destinations, 'Tree Notes 2026-10-20.zip'), headWithImages([], 'Imported'), {})
    await controller.chooseImportArchive()
    await controller.prepareImport()
    let release: () => void = () => undefined
    const replaceNotes = fileServices.replaceNotes
    vi.spyOn(fileServices, 'replaceNotes').mockImplementationOnce(async (staging, archive) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return replaceNotes(staging, archive)
    })

    const committed = controller.commitImport()
    const pending = controller.shutdown()
    let settled = false
    void pending?.then(() => {
      settled = true
    })
    await new Promise((resolve) => setImmediate(resolve))

    expect(settled).toBe(false)

    release()
    await pending

    await expect(committed).resolves.toEqual({ ok: true })
    await expect(fileServices.load()).resolves.toEqual(headWithImages([], 'Imported'))
    expect(controller.shutdown()).toBeNull()
  })
})

describe('displayPath', () => {
  it('abbreviates only the home directory itself', () => {
    expect(displayPath('/Users/someone/Library/Tree', '/Users/someone')).toBe('~/Library/Tree')
    expect(displayPath('/Users/someone2/Library', '/Users/someone')).toBe('/Users/someone2/Library')
    expect(displayPath('/Volumes/Data/Tree', '/Users/someone')).toBe('/Volumes/Data/Tree')
  })
})
