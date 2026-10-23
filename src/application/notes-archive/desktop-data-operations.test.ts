import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotesArchiveProgress, NotesExportResult, NotesFileChoice, NotesMenuCommand } from '../../shared/ipc'
import { DesktopDataOperations } from './desktop-data-operations'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const success: NotesExportResult = {
  ok: true,
  fileName: 'Notes.zip',
  summary: { imageCount: 2, missingImageCount: 0, archiveBytes: 100 },
}

function harness(notice: import('../../shared/ipc').NotesImportNotice | null = null) {
  let snapshot: { status: string; persistenceLocked?: boolean } = { status: 'ready' }
  let changed = () => {}
  let progress: (value: NotesArchiveProgress) => void = () => {}
  let command: (value: NotesMenuCommand) => void = () => {}
  const stops = [vi.fn(), vi.fn(), vi.fn()]
  const store = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      changed = listener
      return stops[0]!
    },
    flushPersistence: vi.fn(async (): Promise<void> => undefined),
    reportError: vi.fn(),
  }
  const api = {
    chooseNotesImportArchive: vi.fn(async (): Promise<NotesFileChoice> => ({ ok: true, fileName: 'Import.zip' })),
    prepareNotesImport: vi.fn(async () => ({
      ok: true as const,
      fileName: 'Import.zip',
      fileBytes: 100,
      incoming: { nodeCount: 3, imageCount: 0, missingImageCount: 0 },
      current: 'none' as const,
    })),
    commitNotesImport: vi.fn(async (): Promise<import('../../shared/ipc').NotesImportCommit> => ({ ok: true })),
    takeNotesImportNotice: vi.fn(async () => notice),
    showReplacedNotesFolder: vi.fn(async () => undefined),
    suspendWrites: vi.fn(),
    resumeWrites: vi.fn(),
    reload: vi.fn(),
    chooseNotesExportDestination: vi.fn(async (): Promise<NotesFileChoice> => ({ ok: true, fileName: 'Notes.zip' })),
    startNotesExport: vi.fn(async (): Promise<NotesExportResult> => success),
    cancelNotesOperation: vi.fn(async (): Promise<void> => undefined),
    setNotesMenuState: vi.fn(async () => undefined),
    onNotesProgress: (listener: typeof progress) => {
      progress = listener
      return stops[1]!
    },
    onNotesMenuCommand: (listener: typeof command) => {
      command = listener
      return stops[2]!
    },
  }
  const operations = new DesktopDataOperations(api, store)
  operations.start()
  return {
    operations,
    api,
    store,
    stops,
    change: (value: typeof snapshot) => {
      snapshot = value
      changed()
    },
    progress: (value: NotesArchiveProgress) => progress(value),
    command: (value: NotesMenuCommand) => command(value),
  }
}

afterEach(() => vi.useRealTimers())

describe('desktop notes operations', () => {
  // @requirement PRODUCT.md §25.3
  it.each([null, '~/Tree/Replaced Notes/2026-10-23 14-05-09'])(
    'shows a one-shot import result with folder=%s',
    async (replacedFolder) => {
      vi.useFakeTimers()
      const { operations, api } = harness({ fileName: 'Browser.zip', replacedFolder })
      await Promise.resolve()
      expect(operations.getSnapshot()).toMatchObject({ phase: 'done', showFolder: replacedFolder !== null })
      await vi.advanceTimersByTimeAsync(6000)
      expect(operations.getSnapshot().phase).toBe(replacedFolder === null ? 'idle' : 'done')
      if (replacedFolder !== null) {
        operations.showReplacedFolder()
        expect(api.showReplacedNotesFolder).toHaveBeenCalledOnce()
      }
      operations.dispose()
    },
  )

  it('reports an import flush failure with its saved-changes reason', async () => {
    const { operations, api, store } = harness()
    store.flushPersistence.mockRejectedValueOnce(new Error('Disk full'))
    await operations.importNotes()
    expect(operations.getSnapshot()).toEqual({
      phase: 'failed',
      text: 'Import failed. Your latest changes could not be saved: Disk full',
    })
    expect(api.prepareNotesImport).not.toHaveBeenCalled()
    expect(api.cancelNotesOperation).toHaveBeenCalledOnce()
    operations.dispose()
  })
  // @requirement PRODUCT.md §25.3
  it('prepares, exports from confirmation, flushes before suspension and reloads after commit', async () => {
    const { operations, api, store } = harness()
    await operations.importNotes()
    expect(operations.getSnapshot().phase).toBe('confirming')
    await operations.exportNotes(true)
    expect(operations.getSnapshot()).toEqual({ phase: 'confirming', text: 'Exported “Notes.zip”.' })
    expect(operations.getConfirmation()).toBeDefined()
    const flush = deferred<void>()
    store.flushPersistence.mockReturnValueOnce(flush.promise)
    const replace = operations.replaceNotes()
    expect(operations.getSnapshot().phase).toBe('replacing')
    expect(api.suspendWrites).not.toHaveBeenCalled()
    flush.resolve()
    await replace
    expect(api.suspendWrites).toHaveBeenCalledOnce()
    expect(api.commitNotesImport).toHaveBeenCalledOnce()
    expect(api.reload).toHaveBeenCalledOnce()
    expect(api.resumeWrites).not.toHaveBeenCalled()
    operations.dispose()
  })

  // @requirement PRODUCT.md §25.3
  it('allows import in the load-error state without flushing and cancels confirmation', async () => {
    const { operations, api, store, change } = harness()
    change({ status: 'error' })
    expect(api.setNotesMenuState).toHaveBeenLastCalledWith({ canExport: false, canImport: true })
    await operations.importNotes()
    expect(store.flushPersistence).not.toHaveBeenCalled()
    await operations.cancel()
    expect(operations.getConfirmation()).toBeUndefined()
    expect(api.cancelNotesOperation).toHaveBeenCalledOnce()
    expect(operations.getSnapshot().phase).toBe('idle')
    operations.dispose()
  })

  // @requirement PRODUCT.md §25.3
  it.each([false, true])(
    'resumes only before the replacement journal (restartRequired=%s)',
    async (restartRequired) => {
      const { operations, api } = harness()
      await operations.importNotes()
      api.commitNotesImport.mockResolvedValueOnce({ ok: false, restartRequired, message: 'Disk full' })
      await operations.replaceNotes()
      expect(operations.getSnapshot().phase).toBe(restartRequired ? 'restart' : 'failed')
      expect(api.resumeWrites).toHaveBeenCalledTimes(restartRequired ? 0 : 1)
      expect(api.reload).not.toHaveBeenCalled()
      await operations.importNotes()
      expect(api.chooseNotesImportArchive).toHaveBeenCalledTimes(restartRequired ? 1 : 2)
      operations.dispose()
    },
  )

  it('keeps writes suspended and blocks interaction when the commit IPC response is lost', async () => {
    const { operations, api } = harness()
    await operations.importNotes()
    api.commitNotesImport.mockRejectedValueOnce(new Error('IPC lost'))
    await operations.replaceNotes()
    expect(operations.getSnapshot().phase).toBe('restart')
    expect(operations.getConfirmation()).toBeDefined()
    expect(api.resumeWrites).not.toHaveBeenCalled()
    operations.dismiss()
    expect(operations.getSnapshot().phase).toBe('restart')
    operations.dispose()
  })

  it('does not commit after the final flush fails and clears prepared staging', async () => {
    const { operations, api, store } = harness()
    await operations.importNotes()
    store.flushPersistence.mockRejectedValueOnce(new Error('Disk full'))
    await operations.replaceNotes()
    expect(api.commitNotesImport).not.toHaveBeenCalled()
    expect(api.suspendWrites).not.toHaveBeenCalled()
    expect(api.cancelNotesOperation).toHaveBeenCalledOnce()
    expect(operations.getSnapshot()).toEqual({
      phase: 'failed',
      text: 'Import failed. Your latest changes could not be saved: Disk full',
    })
    operations.dispose()
  })
  // @requirement PRODUCT.md §25.1
  it('updates menu availability only when it changes, and rejects unavailable exports', async () => {
    const { operations, api, change } = harness()
    expect(api.setNotesMenuState).toHaveBeenCalledExactlyOnceWith({ canExport: true, canImport: true })
    change({ status: 'ready' })
    expect(api.setNotesMenuState).toHaveBeenCalledTimes(1)
    for (const state of [{ status: 'loading' }, { status: 'error' }, { status: 'ready', persistenceLocked: true }]) {
      change(state)
      await operations.exportNotes()
    }
    expect(api.chooseNotesExportDestination).not.toHaveBeenCalled()
    expect(api.setNotesMenuState).toHaveBeenLastCalledWith({ canExport: false, canImport: false })
    operations.dispose()
  })

  // @requirement PRODUCT.md §25.2
  it('flushes before starting, rejects duplicate commands, reports progress and expires complete success', async () => {
    vi.useFakeTimers()
    const { operations, api, store, progress, command } = harness()
    const flush = deferred<void>()
    store.flushPersistence.mockReturnValueOnce(flush.promise)
    const job = operations.exportNotes()
    await Promise.resolve()
    expect(operations.getSnapshot()).toEqual({ phase: 'running', text: 'Exporting Notes…' })
    expect(api.startNotesExport).not.toHaveBeenCalled()
    command('export')
    command('import')
    expect(api.chooseNotesExportDestination).toHaveBeenCalledTimes(1)
    expect(api.setNotesMenuState).toHaveBeenLastCalledWith({ canExport: false, canImport: false })
    progress({ imagesDone: 1, imageCount: 2 })
    expect(operations.getSnapshot()).toEqual({ phase: 'running', text: 'Exporting Notes… 1 of 2 images' })
    flush.resolve()
    await job
    expect(api.startNotesExport).toHaveBeenCalledOnce()
    expect(operations.getSnapshot()).toEqual({ phase: 'done', text: 'Exported “Notes.zip”.' })
    await vi.advanceTimersByTimeAsync(5999)
    expect(operations.getSnapshot().phase).toBe('done')
    await vi.advanceTimersByTimeAsync(1)
    expect(operations.getSnapshot()).toEqual({ phase: 'idle' })
    operations.dispose()
  })

  // @requirement PRODUCT.md §25.2
  it('does not flush when the native panel is canceled', async () => {
    const { operations, api, store } = harness()
    api.chooseNotesExportDestination.mockResolvedValueOnce({ ok: false, canceled: true })
    await operations.exportNotes()
    expect(operations.getSnapshot().phase).toBe('idle')
    expect(store.flushPersistence).not.toHaveBeenCalled()
    expect(api.startNotesExport).not.toHaveBeenCalled()
    operations.dispose()
  })

  // @requirement PRODUCT.md §25.2
  it('keeps incomplete success and worker failure until OK, without a stale success timer', async () => {
    vi.useFakeTimers()
    const { operations, api } = harness()
    await operations.exportNotes()
    api.startNotesExport.mockResolvedValueOnce({
      ok: false,
      message: 'Your notes are too large to export as one archive.',
    })
    await operations.exportNotes()
    await vi.advanceTimersByTimeAsync(6000)
    expect(operations.getSnapshot()).toEqual({
      phase: 'failed',
      text: 'Export failed. Your notes are too large to export as one archive.',
    })
    operations.dismiss()
    api.startNotesExport.mockResolvedValueOnce({
      ...success,
      summary: { imageCount: 1, missingImageCount: 1, archiveBytes: 50 },
    } as NotesExportResult)
    await operations.exportNotes()
    await vi.advanceTimersByTimeAsync(6000)
    expect(operations.getSnapshot()).toEqual({
      phase: 'done',
      text: 'Exported “Notes.zip”. 1 image could not be found and was not included.',
    })
    operations.dismiss()
    expect(operations.getSnapshot().phase).toBe('idle')
    operations.dispose()
  })

  // @requirement PRODUCT.md §25.2
  it('releases the chosen destination after a failed flush and permits a retry', async () => {
    const { operations, api, store } = harness()
    store.flushPersistence.mockRejectedValueOnce(new Error('Disk full'))
    await operations.exportNotes()
    expect(operations.getSnapshot()).toEqual({
      phase: 'failed',
      text: 'Export failed. Your latest changes could not be saved: Disk full',
    })
    expect(api.cancelNotesOperation).toHaveBeenCalledOnce()
    expect(api.startNotesExport).not.toHaveBeenCalled()
    await operations.exportNotes()
    expect(operations.getSnapshot().phase).toBe('done')
    operations.dispose()
  })

  // @requirement PRODUCT.md §25.2
  it('cancels during a flush and ignores its late completion after a new export', async () => {
    const { operations, api, store } = harness()
    const flush = deferred<void>()
    store.flushPersistence.mockReturnValueOnce(flush.promise)
    const old = operations.exportNotes()
    await Promise.resolve()
    await operations.cancel()
    await operations.exportNotes()
    flush.resolve()
    await old
    expect(api.startNotesExport).toHaveBeenCalledTimes(1)
    expect(operations.getSnapshot().phase).toBe('done')
    operations.dispose()
  })

  // @requirement PRODUCT.md §25.2
  it('waits for cancellation cleanup and ignores late progress and worker results', async () => {
    const { operations, api, progress } = harness()
    const result = deferred<NotesExportResult>()
    const cleanup = deferred<void>()
    api.startNotesExport.mockReturnValueOnce(result.promise)
    api.cancelNotesOperation.mockReturnValueOnce(cleanup.promise)
    const old = operations.exportNotes()
    await vi.waitFor(() => expect(api.startNotesExport).toHaveBeenCalledOnce())
    const cancel = operations.cancel()
    progress({ imagesDone: 2, imageCount: 2 })
    expect(operations.getSnapshot().phase).toBe('canceling')
    await operations.exportNotes()
    expect(api.chooseNotesExportDestination).toHaveBeenCalledTimes(1)
    cleanup.resolve()
    await cancel
    result.resolve(success)
    await old
    expect(operations.getSnapshot().phase).toBe('idle')
    operations.dispose()
  })

  it('stops listeners and timers on disposal and ignores a late native choice', async () => {
    const { operations, api, stops } = harness()
    const choice = deferred<{ ok: true; fileName: string }>()
    api.chooseNotesExportDestination.mockReturnValueOnce(choice.promise)
    const job = operations.exportNotes()
    operations.dispose()
    choice.resolve({ ok: true, fileName: 'Late.zip' })
    await job
    expect(api.startNotesExport).not.toHaveBeenCalled()
    for (const stop of stops) expect(stop).toHaveBeenCalledOnce()
  })

  it('turns unexpected bridge failures into a persistent failure and reports cleanup failures', async () => {
    const { operations, api, store } = harness()
    api.chooseNotesExportDestination.mockRejectedValueOnce(new Error('Panel failed'))
    api.cancelNotesOperation.mockRejectedValueOnce(new Error('IPC lost'))
    await operations.exportNotes()
    expect(operations.getSnapshot()).toEqual({
      phase: 'failed',
      text: 'Export failed. The export stopped unexpectedly.',
    })
    expect(store.reportError).toHaveBeenCalledWith(new Error('IPC lost'))
    operations.dispose()
  })
})
