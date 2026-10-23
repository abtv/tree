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

function harness() {
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
  // @requirement PRODUCT.md §25.1
  it('updates menu availability only when it changes, and rejects unavailable exports', async () => {
    const { operations, api, change } = harness()
    expect(api.setNotesMenuState).toHaveBeenCalledExactlyOnceWith({ canExport: true, canImport: false })
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
