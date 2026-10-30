import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  NotesArchiveProgress,
  NotesExportResult,
  NotesFileChoice,
  NotesMenuCommand,
  NotesImportPreparation,
} from '../../shared/ipc'
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
    prepareNotesImport: vi.fn(async (): Promise<NotesImportPreparation> => ({
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
  it('can dispose before start without registering listeners', () => {
    const h = harness()
    const subscribe = vi.spyOn(h.store, 'subscribe')
    const operations = new DesktopDataOperations(h.api, h.store)

    operations.dispose()
    operations.start()

    expect(subscribe).not.toHaveBeenCalled()
  })

  it.each(['export', 'import'] as const)('blocks other commands while choosing an %s archive', async (command) => {
    const h = harness()
    const choice = deferred<NotesFileChoice>()
    if (command === 'export') h.api.chooseNotesExportDestination.mockReturnValueOnce(choice.promise)
    else h.api.chooseNotesImportArchive.mockReturnValueOnce(choice.promise)

    const job = command === 'export' ? h.operations.exportNotes() : h.operations.importNotes()
    await h.operations.exportNotes()
    await h.operations.importNotes()
    h.operations.dismiss()

    expect(h.operations.getSnapshot()).toEqual({ phase: 'choosing' })
    expect(h.api.chooseNotesExportDestination).toHaveBeenCalledTimes(command === 'export' ? 1 : 0)
    expect(h.api.chooseNotesImportArchive).toHaveBeenCalledTimes(command === 'import' ? 1 : 0)

    choice.resolve({ ok: false, canceled: true })
    await job
    h.operations.dispose()
  })

  it('changes only import availability between loading and load error', () => {
    const h = harness()
    h.change({ status: 'loading' })
    expect(h.api.setNotesMenuState).toHaveBeenLastCalledWith({ canExport: false, canImport: false })

    h.change({ status: 'error' })

    expect(h.api.setNotesMenuState).toHaveBeenLastCalledWith({ canExport: false, canImport: true })
    h.operations.dispose()
  })

  it('treats an absent import notice as normal', async () => {
    const h = harness()

    await Promise.resolve()

    expect(h.store.reportError).not.toHaveBeenCalled()
    expect(h.operations.getSnapshot()).toEqual({ phase: 'idle' })
    h.operations.dispose()
  })

  it.each(['export', 'import'] as const)('ignores a rejected %s dialog after disposal', async (command) => {
    const h = harness()
    let reject!: (reason: unknown) => void
    const failure = new Promise<NotesFileChoice>((_resolve, fail) => {
      reject = fail
    })
    if (command === 'export') h.api.chooseNotesExportDestination.mockReturnValueOnce(failure)
    else h.api.chooseNotesImportArchive.mockReturnValueOnce(failure)

    const job = command === 'export' ? h.operations.exportNotes() : h.operations.importNotes()
    h.operations.dispose()
    reject(new Error('Late panel failure'))
    await job

    expect(h.api.cancelNotesOperation).toHaveBeenCalledOnce()
  })

  it('takes the import notice on an initial load error, but waits during loading', async () => {
    const h = harness()
    await Promise.resolve()
    h.operations.dispose()
    h.change({ status: 'loading' })
    h.api.takeNotesImportNotice.mockClear()
    const operations = new DesktopDataOperations(h.api, h.store)
    operations.start()
    expect(h.api.takeNotesImportNotice).not.toHaveBeenCalled()
    h.change({ status: 'error' })
    expect(h.api.takeNotesImportNotice).toHaveBeenCalledOnce()
    operations.dispose()
  })

  it.each(['export', 'import'] as const)('clears the old notice timer when %s starts', async (command) => {
    vi.useFakeTimers()
    const h = harness({ fileName: 'Old.zip', replacedFolder: null })
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(1)
    const choice = deferred<NotesFileChoice>()
    if (command === 'export') h.api.chooseNotesExportDestination.mockReturnValueOnce(choice.promise)
    else h.api.chooseNotesImportArchive.mockReturnValueOnce(choice.promise)
    const job = command === 'export' ? h.operations.exportNotes() : h.operations.importNotes()
    expect(h.operations.getSnapshot()).toEqual({ phase: 'choosing' })
    expect(vi.getTimerCount()).toBe(0)
    choice.resolve({ ok: false, canceled: true })
    await job
    h.operations.dispose()
  })

  it.each(['export', 'import'] as const)('does not publish a late %s error after disposal', async (command) => {
    const h = harness()
    const cleanup = deferred<void>()
    h.api.cancelNotesOperation.mockReturnValueOnce(cleanup.promise)
    if (command === 'export') h.api.chooseNotesExportDestination.mockRejectedValueOnce('Panel failed')
    else h.api.chooseNotesImportArchive.mockRejectedValueOnce('Panel failed')
    const job = command === 'export' ? h.operations.exportNotes() : h.operations.importNotes()
    await vi.waitFor(() => expect(h.api.cancelNotesOperation).toHaveBeenCalledOnce())
    h.operations.dispose()
    const state = h.operations.getSnapshot()
    cleanup.resolve()
    await job
    expect(h.operations.getSnapshot()).toBe(state)
  })

  it('does not publish cancellation completion after disposal', async () => {
    const h = harness()
    await h.operations.importNotes()
    const cleanup = deferred<void>()
    h.api.cancelNotesOperation.mockReturnValueOnce(cleanup.promise)
    const job = h.operations.cancel()
    h.operations.dispose()
    cleanup.resolve()
    await job
    expect(h.operations.getSnapshot()).toEqual({ phase: 'canceling' })
  })

  it('does not register duplicate listeners', () => {
    const h = harness()
    const subscribe = vi.spyOn(h.store, 'subscribe')
    const progress = vi.spyOn(h.api, 'onNotesProgress')

    h.operations.start()

    expect(subscribe).not.toHaveBeenCalled()
    expect(progress).not.toHaveBeenCalled()
    h.operations.dispose()
  })

  it('reports the complete result text without previous notes', async () => {
    const h = harness({ fileName: 'Fresh.zip', replacedFolder: null })
    await Promise.resolve()
    expect(h.operations.getSnapshot()).toEqual({
      phase: 'done',
      text: 'Imported “Fresh.zip”.',
      showFolder: false,
      focusAction: true,
    })
    h.operations.dispose()
  })

  it('does not cancel an idle operation', async () => {
    const h = harness()
    await h.operations.cancel()
    expect(h.api.cancelNotesOperation).not.toHaveBeenCalled()
    h.operations.dispose()
  })

  it('reports a lost commit response with restart instructions', async () => {
    const h = harness()
    await h.operations.importNotes()
    h.api.commitNotesImport.mockRejectedValueOnce('IPC lost')
    await h.operations.replaceNotes()
    expect(h.operations.getSnapshot()).toEqual({
      phase: 'restart',
      text: 'Import failed. IPC lost Restart Tree to complete the import.',
    })
    h.operations.dispose()
  })

  it('keeps both menus unavailable throughout confirmation and replacement', async () => {
    const h = harness()
    await h.operations.importNotes()
    expect(h.api.setNotesMenuState).toHaveBeenLastCalledWith({ canExport: false, canImport: false })
    const gate = deferred<void>()
    h.store.flushPersistence.mockReturnValueOnce(gate.promise)
    const job = h.operations.replaceNotes()
    await h.operations.exportNotes(true)
    expect(h.api.chooseNotesExportDestination).not.toHaveBeenCalled()
    h.operations.dismiss()
    expect(h.operations.getSnapshot().phase).toBe('replacing')
    expect(h.operations.menuCommands.getSnapshot().every((entry) => entry.enabled === false)).toBe(true)
    gate.resolve()
    await job
    h.operations.dispose()
  })

  it.each(['choice', 'flush', 'prepare'] as const)('ignores a late import %s after disposal', async (stage) => {
    const h = harness()
    const choice = deferred<NotesFileChoice>()
    const flush = deferred<void>()
    const preparation = deferred<NotesImportPreparation>()
    if (stage === 'choice') h.api.chooseNotesImportArchive.mockReturnValueOnce(choice.promise)
    if (stage === 'flush') h.store.flushPersistence.mockReturnValueOnce(flush.promise)
    if (stage === 'prepare') h.api.prepareNotesImport.mockReturnValueOnce(preparation.promise)

    const job = h.operations.importNotes()
    if (stage !== 'choice')
      await vi.waitFor(() =>
        expect(stage === 'flush' ? h.store.flushPersistence : h.api.prepareNotesImport).toHaveBeenCalledOnce(),
      )
    h.operations.dispose()
    const state = h.operations.getSnapshot()
    choice.resolve({ ok: true, fileName: 'Late.zip' })
    flush.resolve()
    preparation.resolve({ ok: false, message: 'Late' })
    await job

    expect(h.operations.getSnapshot()).toBe(state)
    expect(h.operations.getConfirmation()).toBeUndefined()
    if (stage !== 'prepare') expect(h.api.prepareNotesImport).not.toHaveBeenCalled()
  })

  it('invalidates a canceled import before a new import starts', async () => {
    const h = harness()
    const gate = deferred<NotesImportPreparation>()
    h.api.prepareNotesImport.mockReturnValueOnce(gate.promise)
    const job = h.operations.importNotes()
    await vi.waitFor(() => expect(h.api.prepareNotesImport).toHaveBeenCalledOnce())
    await h.operations.cancel()
    await h.operations.importNotes()
    const confirmation = h.operations.getConfirmation()
    gate.resolve({ ok: false, message: 'Late failure' })
    await job
    expect(h.operations.getConfirmation()).toBe(confirmation)
    expect(h.operations.getSnapshot()).toEqual({ phase: 'confirming', text: '' })
    h.operations.dispose()
  })

  it('does not suspend writes when disposed during the final flush', async () => {
    const h = harness()
    await h.operations.importNotes()
    const gate = deferred<void>()
    h.store.flushPersistence.mockReturnValueOnce(gate.promise)
    const job = h.operations.replaceNotes()
    expect(h.operations.getSnapshot()).toEqual({ phase: 'replacing', text: 'Replacing Notes…' })
    await h.operations.replaceNotes()
    h.operations.dispose()
    gate.resolve()
    await job
    expect(h.api.suspendWrites).not.toHaveBeenCalled()
    expect(h.api.commitNotesImport).not.toHaveBeenCalled()
  })

  it.each(['menu', 'notice', 'folder', 'cancel', 'dispose', 'import', 'replace'] as const)(
    'reports %s bridge failures',
    async (stage) => {
      const h = harness()
      await Promise.resolve()
      const error = new Error('Bridge failed')
      if (stage === 'menu') {
        h.api.setNotesMenuState.mockRejectedValueOnce(error)
        h.change({ status: 'error' })
      } else if (stage === 'folder') {
        h.api.showReplacedNotesFolder.mockRejectedValueOnce(error)
        h.operations.showReplacedFolder()
      } else if (stage === 'notice') {
        h.operations.dispose()
        h.api.takeNotesImportNotice.mockRejectedValueOnce(error)
        const other = new DesktopDataOperations(h.api, h.store)
        other.start()
        await Promise.resolve()
        other.dispose()
      } else {
        if (stage === 'cancel' || stage === 'replace') await h.operations.importNotes()
        h.api.cancelNotesOperation.mockRejectedValueOnce(error)
        if (stage === 'cancel') await h.operations.cancel()
        if (stage === 'dispose') h.operations.dispose()
        if (stage === 'import') {
          h.api.chooseNotesImportArchive.mockRejectedValueOnce('Panel failed')
          await h.operations.importNotes()
          expect(h.operations.getSnapshot()).toEqual({ phase: 'failed', text: 'Import failed. Panel failed' })
        }
        if (stage === 'replace') {
          h.store.flushPersistence.mockRejectedValueOnce('Disk full')
          await h.operations.replaceNotes()
          expect(h.operations.getConfirmation()).toBeUndefined()
        }
      }
      await vi.waitFor(() => expect(h.store.reportError).toHaveBeenCalledWith(error))
      h.operations.dispose()
    },
  )

  it.each([undefined, 'Import.zip'])('shows the exact import notice for %s once', async (fileName) => {
    const h = harness({ ...(fileName === undefined ? {} : { fileName }), replacedFolder: 'Old Notes' })
    await Promise.resolve()
    expect(h.operations.getSnapshot()).toEqual({
      phase: 'done',
      text: `${fileName === undefined ? 'Imported notes.' : 'Imported “Import.zip”.'} Your previous notes are in “Old Notes”.`,
      showFolder: true,
      focusAction: true,
    })
    h.change({ status: 'error' })
    expect(h.api.takeNotesImportNotice).toHaveBeenCalledOnce()
    h.operations.dispose()
  })

  it.each([false, true])('ignores late notices while busy or disposed (%s)', async (disposed) => {
    const h = harness()
    await Promise.resolve()
    h.operations.dispose()
    const notice = deferred<import('../../shared/ipc').NotesImportNotice | null>()
    h.api.takeNotesImportNotice.mockReturnValueOnce(notice.promise)
    const operations = new DesktopDataOperations(h.api, h.store)
    operations.start()
    if (disposed) operations.dispose()
    else await operations.importNotes()
    const state = operations.getSnapshot()
    notice.resolve({ fileName: 'Old.zip', replacedFolder: null })
    await Promise.resolve()
    expect(operations.getSnapshot()).toBe(state)
    operations.dispose()
  })

  it('clears success timers on dismissal and disposal', async () => {
    vi.useFakeTimers()
    const h = harness()
    await h.operations.exportNotes()
    expect(vi.getTimerCount()).toBe(1)
    h.operations.dismiss()
    expect(vi.getTimerCount()).toBe(0)
    await h.operations.exportNotes()
    const listener = vi.fn()
    h.operations.subscribe(listener)
    h.operations.dispose()
    expect(vi.getTimerCount()).toBe(0)
    h.operations.dismiss()
    expect(listener).not.toHaveBeenCalled()
  })

  it('publishes changes to subscribers and removes subscriptions', async () => {
    const { operations } = harness()
    expect(operations.getSnapshot()).toEqual({ phase: 'idle' })
    const listener = vi.fn()
    const stop = operations.subscribe(listener)

    await operations.exportNotes()

    expect(listener).toHaveBeenCalledTimes(3)
    stop()
    operations.dismiss()
    expect(listener).toHaveBeenCalledTimes(3)
    operations.dispose()
  })

  it.each(['export', 'import'] as const)('dispatches native %s independently', async (command) => {
    const h = harness()
    h.command(command)
    await vi.waitFor(() => expect(h.operations.getSnapshot().phase).toBe(command === 'export' ? 'done' : 'confirming'))

    expect(h.api.chooseNotesExportDestination).toHaveBeenCalledTimes(command === 'export' ? 1 : 0)
    expect(h.api.chooseNotesImportArchive).toHaveBeenCalledTimes(command === 'import' ? 1 : 0)
    h.operations.dispose()
  })

  it.each(['export-notes', 'import-notes'])('exposes executable command-panel entry %s', async (name) => {
    const h = harness()
    expect(h.operations.menuCommands.getSnapshot().map(({ name, enabled }) => ({ name, enabled }))).toEqual([
      { name: 'export-notes', enabled: true },
      { name: 'import-notes', enabled: true },
    ])

    await h.operations.menuCommands
      .getSnapshot()
      .find((entry) => entry.name === name)!
      .run(undefined!, undefined!)

    expect(
      name === 'export-notes' ? h.api.chooseNotesExportDestination : h.api.chooseNotesImportArchive,
    ).toHaveBeenCalledOnce()
    h.operations.dispose()
  })

  it('starts once and refuses commands and menu updates after disposal', async () => {
    const h = harness()
    h.operations.start()
    h.operations.dispose()
    h.operations.start()
    h.change({ status: 'error' })
    await h.operations.exportNotes()
    await h.operations.importNotes()

    expect(h.api.setNotesMenuState).toHaveBeenCalledTimes(1)
    expect(h.api.chooseNotesExportDestination).not.toHaveBeenCalled()
    expect(h.api.chooseNotesImportArchive).not.toHaveBeenCalled()
    for (const stop of h.stops) expect(stop).toHaveBeenCalledOnce()
  })

  it.each([{ status: 'loading' }, { status: 'ready', persistenceLocked: true }])(
    'blocks unavailable imports: %j',
    async (state) => {
      const h = harness()
      h.change(state)
      await h.operations.importNotes()
      expect(h.api.chooseNotesImportArchive).not.toHaveBeenCalled()
      h.operations.dispose()
    },
  )

  it.each(['panel', 'canceled', 'failed'] as const)('returns to confirmation after export %s', async (outcome) => {
    const h = harness()
    await h.operations.importNotes()
    const confirmation = h.operations.getConfirmation()
    await h.operations.exportNotes()
    expect(h.api.chooseNotesExportDestination).not.toHaveBeenCalled()
    if (outcome === 'panel') h.api.chooseNotesExportDestination.mockResolvedValueOnce({ ok: false, canceled: true })
    else
      h.api.startNotesExport.mockResolvedValueOnce({
        ok: false,
        canceled: outcome === 'canceled',
        message: 'Disk full',
      })

    await h.operations.exportNotes(true)

    expect(h.operations.getSnapshot()).toEqual({
      phase: 'confirming',
      text: outcome === 'failed' ? 'Export failed. Disk full' : '',
    })
    expect(h.operations.getConfirmation()).toBe(confirmation)
    h.operations.dispose()
  })

  it('returns to idle for a canceled export worker', async () => {
    const h = harness()
    h.api.startNotesExport.mockResolvedValueOnce({ ok: false, canceled: true })

    await h.operations.exportNotes()

    expect(h.operations.getSnapshot()).toEqual({ phase: 'idle' })
    h.operations.dispose()
  })

  it.each(['panel', 'canceled', 'failed'] as const)('handles import %s', async (outcome) => {
    const h = harness()
    if (outcome === 'panel') h.api.chooseNotesImportArchive.mockResolvedValueOnce({ ok: false, canceled: true })
    else
      h.api.prepareNotesImport.mockResolvedValueOnce({
        ok: false,
        canceled: outcome === 'canceled',
        message: 'Bad archive',
      })

    await h.operations.importNotes()

    expect(h.operations.getSnapshot()).toEqual(
      outcome === 'failed' ? { phase: 'failed', text: 'Import failed. Bad archive' } : { phase: 'idle' },
    )
    expect(h.operations.getConfirmation()).toBeUndefined()
    if (outcome === 'panel') expect(h.store.flushPersistence).not.toHaveBeenCalled()
    h.operations.dispose()
  })

  it('reports import progress and retains the exact preparation', async () => {
    const h = harness()
    const preparation = deferred<NotesImportPreparation>()
    h.api.prepareNotesImport.mockReturnValueOnce(preparation.promise)
    const job = h.operations.importNotes()
    expect(h.operations.getSnapshot()).toEqual({ phase: 'choosing' })
    await vi.waitFor(() => expect(h.api.prepareNotesImport).toHaveBeenCalledOnce())
    expect(h.operations.getSnapshot()).toEqual({ phase: 'running', text: 'Importing Notes…' })
    h.progress({ imagesDone: 1, imageCount: 2 })
    expect(h.operations.getSnapshot()).toEqual({ phase: 'running', text: 'Importing Notes… 1 of 2 images' })
    const result = {
      ok: true as const,
      fileName: 'Other.zip',
      fileBytes: 42,
      incoming: { nodeCount: 4, imageCount: 2, missingImageCount: 1 },
      current: 'none' as const,
    }
    preparation.resolve(result)
    await job
    expect(h.operations.getSnapshot()).toEqual({ phase: 'confirming', text: '' })
    expect(h.operations.getConfirmation()).toBe(result)
    h.operations.dispose()
  })

  it.each([false, true])('reports replacement failure details (restart=%s)', async (restartRequired) => {
    const h = harness()
    await h.operations.importNotes()
    h.api.commitNotesImport.mockResolvedValueOnce({ ok: false, message: 'Disk full', restartRequired })

    await h.operations.replaceNotes()

    expect(h.operations.getSnapshot()).toEqual({
      phase: restartRequired ? 'restart' : 'failed',
      text: `Import failed. Disk full${restartRequired ? ' Restart Tree to complete the import.' : ''}`,
    })
    if (!restartRequired) expect(h.operations.getConfirmation()).toBeUndefined()
    h.operations.dispose()
  })

  it('cancels replacement and blocks duplicate or locked replacement', async () => {
    const h = harness()
    await h.operations.replaceNotes()
    expect(h.api.commitNotesImport).not.toHaveBeenCalled()
    await h.operations.importNotes()
    h.change({ status: 'ready', persistenceLocked: true })
    await h.operations.replaceNotes()
    expect(h.api.commitNotesImport).not.toHaveBeenCalled()
    h.change({ status: 'error' })
    h.store.flushPersistence.mockClear()
    h.api.commitNotesImport.mockResolvedValueOnce({ ok: false, canceled: true })
    await h.operations.replaceNotes()
    expect(h.store.flushPersistence).not.toHaveBeenCalled()
    expect(h.operations.getSnapshot()).toEqual({ phase: 'idle' })
    expect(h.operations.getConfirmation()).toBeUndefined()
    expect(h.api.resumeWrites).toHaveBeenCalledOnce()
    h.operations.dispose()
  })

  // @requirement PRODUCT.md §25.3
  it.each([null, '~/Tree/Replaced Notes/2026-10-23 14-05-09'])(
    'shows a one-shot import result with folder=%s',
    async (replacedFolder) => {
      vi.useFakeTimers()
      const { operations, api } = harness({ fileName: 'Browser.zip', replacedFolder })
      await Promise.resolve()

      expect(operations.getSnapshot()).toMatchObject({
        phase: 'done',
        showFolder: replacedFolder !== null,
        focusAction: true,
      })

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
    expect(api.resumeWrites).not.toHaveBeenCalled()
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
    expect(api.cancelNotesOperation).toHaveBeenCalledTimes(2)
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
