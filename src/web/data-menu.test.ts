// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import { installDataMenu } from './data-menu'
import type { ArchiveWorkerMessage } from './workers/archive-protocol'
import type { BackupActions } from './backup/backup-controller'

const backup = vi.hoisted(() => ({ supported: false, install: vi.fn() }))

vi.mock('./backup/backup-controller', () => ({
  supportsFolderBackup: () => backup.supported,
  installFolderBackup: backup.install,
}))

class ArchiveWorker {
  static instances: ArchiveWorker[] = []
  onmessage: ((event: { data: ArchiveWorkerMessage }) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    ArchiveWorker.instances.push(this)
  }
  send(data: ArchiveWorkerMessage) {
    this.onmessage?.({ data })
  }
}

function mockDownload() {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:https://tree.test/archive')
      static revokeObjectURL = vi.fn()
    },
  )
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
}

function fixture() {
  document.body.innerHTML = `
    <div id="tree-menu"></div>
    <button id="data-export"></button><button id="data-import"></button><button id="data-restore"></button>
    <input id="data-import-file" type="file">
    <div id="data-activity" hidden><span id="data-activity-text"></span><button id="data-activity-action"></button></div>
    <dialog id="import-confirm">
      <p id="import-confirm-incoming"></p><p id="import-confirm-current"></p><p id="import-confirm-missing"></p>
      <span id="import-confirm-status"></span><button id="import-confirm-export"></button>
      <button id="import-confirm-replace"></button><button id="import-confirm-cancel"></button>
    </dialog>`
  const dialog = document.getElementById('import-confirm') as HTMLDialogElement
  dialog.showModal = vi.fn(() => {
    dialog.open = true
  })
  dialog.close = vi.fn(() => {
    dialog.open = false
  })
  let locked = false
  let refresh = () => {}
  const flushPersistence = vi.fn<() => Promise<void>>(async () => undefined)
  const store = {
    getSnapshot: () => ({ status: 'ready', persistenceLocked: locked }),
    flushPersistence,
    subscribe: (listener: () => void) => {
      refresh = listener
      return () => {}
    },
  }
  const resume = vi.fn()
  const session = {
    suspendWrites: vi.fn(() => resume),
    discardStagedImages: vi.fn(async () => undefined),
    onSaved: vi.fn(),
  }
  const focus = { close: vi.fn(), restore: vi.fn(), dispose: vi.fn() }
  const menu = document.getElementById('tree-menu')!
  const result = installDataMenu(store as unknown as EditorStore, menu, session, focus)
  const button = (id: string) => document.getElementById(id) as HTMLButtonElement
  const choose = (file = new File(['zip'], 'notes.zip')) => {
    const input = document.getElementById('data-import-file') as HTMLInputElement
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change'))
    return file
  }
  return {
    ...result,
    button,
    choose,
    dialog,
    session,
    resume,
    focus,
    flushPersistence,
    lock: (notify = true) => {
      locked = true
      if (notify) refresh()
    },
    status: () => document.getElementById('data-activity-text')!.textContent,
  }
}

beforeEach(() => {
  backup.supported = false
  backup.install.mockReset().mockReturnValue(() => undefined)
  ArchiveWorker.instances = []
  vi.stubGlobal('Worker', ArchiveWorker)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('browser data operations', () => {
  it('ignores prepared messages queued after an import was canceled', async () => {
    const f = fixture()
    f.choose()
    await Promise.resolve()
    const worker = ArchiveWorker.instances[0]!
    f.button('data-activity-action').click()

    worker.send({ type: 'prepared', incoming: { nodeCount: 1, imageCount: 0, missingImageCount: 0 }, current: 'none' })

    expect(f.dialog.open).toBe(false)
    expect(document.getElementById('data-activity')!.hidden).toBe(true)
    expect(f.isRunning()).toBe(false)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('keeps explicit outside focus when the import confirmation closes', async () => {
    const f = fixture()
    f.choose()
    await Promise.resolve()
    ArchiveWorker.instances[0]!.send({
      type: 'prepared',
      incoming: { nodeCount: 1, imageCount: 0, missingImageCount: 0 },
      current: 'none',
    })
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()

    f.button('import-confirm-cancel').click()

    expect(f.dialog.open).toBe(false)
    expect(document.activeElement).toBe(outside)
    expect(f.focus.restore).not.toHaveBeenCalled()
  })

  it('publishes the three available data commands and refreshes backup when opening the menu', () => {
    backup.supported = true
    const refreshBackup = vi.fn()
    backup.install.mockReturnValueOnce(refreshBackup)
    const f = fixture()

    expect(f.commands.getSnapshot().map(({ name, enabled }) => ({ name, enabled }))).toEqual([
      { name: 'export-notes', enabled: true },
      { name: 'import-notes', enabled: true },
      { name: 'restore-from-folder', enabled: true },
    ])
    refreshBackup.mockClear()
    document.getElementById('tree-menu')!.dispatchEvent(new Event('beforetoggle'))

    expect(refreshBackup).toHaveBeenCalledOnce()
    f.lock()
    expect(f.commands.getSnapshot().every(({ enabled }) => !enabled)).toBe(true)
  })

  it('keeps an export failure visible until it is acknowledged', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.flushPersistence.mockRejectedValueOnce(new Error('Storage unavailable'))
    f.button('data-export').click()

    await vi.advanceTimersByTimeAsync(6_000)

    expect(document.getElementById('data-activity')!.hidden).toBe(false)
    expect(f.status()).toBe('Export failed. Your latest changes could not be saved: Storage unavailable')
    expect(f.button('data-activity-action').textContent).toBe('OK')
    f.button('data-activity-action').click()
    expect(document.getElementById('data-activity')!.hidden).toBe(true)
  })

  it('ignores an empty file selection without saving or starting an import', async () => {
    const f = fixture()
    const input = document.getElementById('data-import-file') as HTMLInputElement

    input.dispatchEvent(new Event('change'))
    await Promise.resolve()

    expect(f.flushPersistence).not.toHaveBeenCalled()
    expect(f.isRunning()).toBe(false)
    expect(ArchiveWorker.instances).toEqual([])
    expect(document.getElementById('data-activity')!.hidden).toBe(true)
  })

  it.each(['export', 'import'] as const)(
    'ignores a save rejection that arrives after the user canceled %s',
    async (operation) => {
      const f = fixture()
      let reject!: (error: Error) => void
      f.flushPersistence.mockReturnValueOnce(
        new Promise<void>((_resolve, fail) => {
          reject = fail
        }),
      )
      if (operation === 'export') f.button('data-export').click()
      else f.choose()
      f.button('data-activity-action').click()

      reject(new Error('Late storage failure'))
      await Promise.resolve()
      await Promise.resolve()

      expect(f.isRunning()).toBe(false)
      expect(ArchiveWorker.instances).toEqual([])
      expect(document.getElementById('data-activity')!.hidden).toBe(true)
      expect(f.status()).toBe('')
      expect(f.focus.restore).not.toHaveBeenCalled()
    },
  )

  it.each(['export', 'import', 'restore'] as const)(
    'checks a newly locked store before activating the stale enabled %s button',
    async (operation) => {
      backup.supported = true
      const f = fixture()
      const picker = vi.fn()
      vi.stubGlobal('showDirectoryPicker', picker)
      const input = document.getElementById('data-import-file') as HTMLInputElement
      const openFile = vi.spyOn(input, 'click').mockImplementation(() => {})
      f.lock(false)

      f.button(`data-${operation}`).click()
      await Promise.resolve()

      expect(f.flushPersistence).not.toHaveBeenCalled()
      expect(openFile).not.toHaveBeenCalled()
      expect(picker).not.toHaveBeenCalled()
      expect(ArchiveWorker.instances).toEqual([])
      expect(f.isRunning()).toBe(false)
    },
  )

  it('starts import in the bundled module worker after saving', async () => {
    const f = fixture()
    const file = f.choose()
    await Promise.resolve()
    const worker = ArchiveWorker.instances[0]!

    expect(worker.url.pathname).toMatch(/\/workers\/archive\.worker\.ts$/)
    expect(worker.options).toEqual({ type: 'module' })
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'import', file })
    f.button('data-activity-action').click()
  })

  it.each(['export', 'import'] as const)(
    'keeps a new %s activity visible after the previous export success timer expires',
    async (operation) => {
      vi.useFakeTimers()
      mockDownload()
      const f = fixture()
      f.button('data-export').click()
      await Promise.resolve()
      ArchiveWorker.instances[0]!.send({
        type: 'done',
        summary: { imageCount: 0, missingImageCount: 0, archiveBytes: 0 },
      })

      if (operation === 'export') f.button('data-export').click()
      else f.choose()
      await vi.advanceTimersByTimeAsync(6_000)

      expect(f.isRunning()).toBe(true)
      expect(document.getElementById('data-activity')!.hidden).toBe(false)
      expect(f.status()).toBe(operation === 'export' ? 'Exporting Notes…' : 'Importing Notes…')
      f.button('data-activity-action').click()
    },
  )

  it('downloads an export from confirmation and leaves the prepared import ready for replacement', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 23, 12))
    const download = mockDownload()
    const f = fixture()
    f.choose()
    await Promise.resolve()
    const importing = ArchiveWorker.instances[0]!
    importing.send({
      type: 'prepared',
      incoming: { nodeCount: 1, imageCount: 0, missingImageCount: 0 },
      current: { nodeCount: 2, imageCount: 0 },
    })
    f.button('import-confirm-export').click()
    await Promise.resolve()
    const exporting = ArchiveWorker.instances[1]!

    exporting.send({ type: 'done', summary: { imageCount: 0, missingImageCount: 0, archiveBytes: 0 } })

    expect(download).toHaveBeenCalledOnce()
    expect(document.getElementById('import-confirm-status')!.textContent).toBe('Exported “Tree Notes 2026-10-23.zip”.')
    expect(f.dialog.open).toBe(true)
    expect(f.isRunning()).toBe(true)
    expect(f.button('import-confirm-replace').disabled).toBe(false)
    expect(f.button('import-confirm-export').disabled).toBe(false)
    expect(importing.terminate).not.toHaveBeenCalled()
    f.button('import-confirm-cancel').click()
    expect(exporting.terminate).toHaveBeenCalledOnce()
  })

  it('connects backup availability, saving and focus to the active data operation', async () => {
    const f = fixture()
    const actions = backup.install.mock.lastCall![3] as BackupActions

    expect(actions.available()).toBe(true)
    await actions.flush()
    expect(f.flushPersistence).toHaveBeenCalledOnce()
    actions.closeMenu()
    actions.restoreFocus()
    expect(f.focus.close).toHaveBeenCalledOnce()
    expect(f.focus.restore).toHaveBeenCalledOnce()
    f.button('data-export').click()
    expect(actions.available()).toBe(false)
    f.button('data-activity-action').click()
    expect(actions.available()).toBe(true)
    f.lock()
    expect(actions.available()).toBe(false)
  })

  it('routes a folder selected by backup confirmation into restore and rejects it while another operation runs', async () => {
    const f = fixture()
    const actions = backup.install.mock.lastCall![3] as BackupActions
    const folder = { name: 'Selected Backup' } as FileSystemDirectoryHandle

    await actions.restore(folder)

    expect(ArchiveWorker.instances).toHaveLength(1)
    expect(ArchiveWorker.instances[0]!.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'restore', folder })
    await actions.restore(folder)
    expect(ArchiveWorker.instances).toHaveLength(1)
    expect(f.flushPersistence).toHaveBeenCalledOnce()
    f.button('data-activity-action').click()
  })

  it('keeps a prepared import after an export from confirmation fails and restores the confirmation controls', async () => {
    const f = fixture()
    f.choose()
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
    const importing = ArchiveWorker.instances[0]!
    importing.send({
      type: 'prepared',
      incoming: { nodeCount: 2, imageCount: 0, missingImageCount: 0 },
      current: { nodeCount: 1, imageCount: 0 },
    })

    f.button('import-confirm-export').click()
    expect(f.button('import-confirm-export').disabled).toBe(true)
    expect(f.button('import-confirm-replace').disabled).toBe(true)
    expect(f.button('import-confirm-cancel').disabled).toBe(false)
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(2))
    const exporting = ArchiveWorker.instances[1]!
    exporting.send({ type: 'progress', imagesDone: 1, imageCount: 2 })
    expect(document.getElementById('import-confirm-status')!.textContent).toBe('Exporting Notes… 1 of 2 images')
    exporting.send({ type: 'error', message: 'archive too large' })

    expect(f.dialog.open).toBe(true)
    expect(importing.terminate).not.toHaveBeenCalled()
    expect(document.getElementById('import-confirm-status')!.textContent).toBe('Export failed. archive too large')
    expect(f.button('import-confirm-export').disabled).toBe(false)
    expect(f.button('import-confirm-replace').disabled).toBe(false)
    f.button('import-confirm-cancel').click()
    expect(importing.terminate).toHaveBeenCalledOnce()
    expect(exporting.terminate).toHaveBeenCalledOnce()
  })

  it('cancels the nested export together with its prepared import and ignores its late completion', async () => {
    const f = fixture()
    f.choose()
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
    const importing = ArchiveWorker.instances[0]!
    importing.send({
      type: 'prepared',
      incoming: { nodeCount: 2, imageCount: 0, missingImageCount: 0 },
      current: { nodeCount: 1, imageCount: 0 },
    })
    f.button('import-confirm-export').click()
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(2))
    const exporting = ArchiveWorker.instances[1]!

    f.button('import-confirm-cancel').click()
    exporting.send({ type: 'done', summary: { imageCount: 0, missingImageCount: 0, archiveBytes: 0 } })

    expect(importing.terminate).toHaveBeenCalledOnce()
    expect(exporting.terminate).toHaveBeenCalledOnce()
    expect(f.session.discardStagedImages).toHaveBeenCalledOnce()
    expect(f.dialog.open).toBe(false)
    expect(f.isRunning()).toBe(false)
    expect(f.status()).toBe('')
  })

  it.each(['import', 'export'] as const)('recovers when the %s worker cannot be constructed', async (operation) => {
    const f = fixture()
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('worker unavailable')
        }
      },
    )

    if (operation === 'import') f.choose()
    else f.button('data-export').click()
    await vi.waitFor(() => expect(f.isRunning()).toBe(false))

    expect(f.status()).toBe(
      operation === 'import'
        ? 'Import failed. The import stopped unexpectedly.'
        : 'Export failed. The export stopped unexpectedly.',
    )
    expect(f.button('data-import').disabled).toBe(false)
    expect(f.button('data-export').disabled).toBe(false)
    expect(f.session.discardStagedImages).toHaveBeenCalledTimes(operation === 'import' ? 1 : 0)
  })

  it.each([false, true])(
    'suggests folder backup for an oversized archive only when supported (%s)',
    async (supported) => {
      backup.supported = supported
      const f = fixture()
      f.button('data-export').click()
      await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))

      ArchiveWorker.instances[0]!.send({ type: 'error', message: 'The notes cannot be exported as one archive.' })

      expect(f.status()).toBe(
        `Export failed. The notes cannot be exported as one archive.${supported ? ' Use Back Up to Folder… instead.' : ''}`,
      )
    },
  )

  it('opens restore with read-only permission and displays folder validation progress before confirmation', async () => {
    backup.supported = true
    const folder = { kind: 'directory', name: 'My Backup' }
    const picker = vi.fn(async () => folder)
    vi.stubGlobal('showDirectoryPicker', picker)
    const f = fixture()

    f.button('data-restore').click()
    expect(picker).toHaveBeenCalledExactlyOnceWith({ mode: 'read', id: 'tree-backup' })
    expect(f.focus.close).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
    const worker = ArchiveWorker.instances[0]!
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'restore', folder })
    worker.send({ type: 'progress', imagesDone: 1, imageCount: 3 })
    expect(f.status()).toBe('Restoring Notes… 1 of 3 images')
    worker.send({
      type: 'prepared',
      sourceBytes: 2048,
      incoming: { nodeCount: 3, imageCount: 2, missingImageCount: 1 },
      current: 'none',
    })

    expect(f.dialog.open).toBe(true)
    expect(document.getElementById('import-confirm-incoming')!.textContent).toBe(
      '“My Backup” (2 KB) contains 3 nodes and 2 images.',
    )
    expect(document.getElementById('import-confirm-current')!.textContent).toBe(
      'There are no saved notes in this browser.',
    )
    expect(document.getElementById('import-confirm-missing')!.hidden).toBe(false)
    expect(document.getElementById('import-confirm-missing')!.textContent).toBe(
      '1 image that the notes use is not in the folder. Its node will show “Image could not be loaded.”',
    )
    f.button('import-confirm-cancel').click()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(f.session.discardStagedImages).toHaveBeenCalledOnce()
  })

  it.each(['AbortError', 'NotAllowedError'])('handles a restore picker %s without creating a worker', async (name) => {
    vi.useFakeTimers()
    backup.supported = true
    vi.stubGlobal(
      'showDirectoryPicker',
      vi.fn(async () => {
        throw Object.assign(new Error('permission refused'), { name })
      }),
    )
    const f = fixture()

    f.button('data-restore').click()
    await vi.advanceTimersByTimeAsync(0)

    expect(f.status()).toBe(
      name === 'AbortError' ? '' : 'Restore failed. The folder could not be opened: permission refused',
    )
    expect(ArchiveWorker.instances).toEqual([])
    expect(f.flushPersistence).not.toHaveBeenCalled()
    expect(f.isRunning()).toBe(false)
    if (name !== 'AbortError') {
      f.button('data-activity-action').focus()
      f.button('data-activity-action').click()
      expect(document.getElementById('data-activity')!.hidden).toBe(true)
      expect(f.status()).toBe('')
      expect(f.focus.restore).toHaveBeenCalledOnce()
    }
  })

  it.each(['committed', 'onerror', 'onmessageerror'] as const)(
    'reloads after %s during replacement without resuming writes or sweeping the committed head',
    async (completion) => {
      const reload = vi.fn()
      const f = fixture()
      f.choose()
      await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
      const worker = ArchiveWorker.instances[0]!
      worker.send({
        type: 'prepared',
        incoming: { nodeCount: 1, imageCount: 0, missingImageCount: 0 },
        current: 'none',
      })
      f.button('import-confirm-replace').click()
      await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'commit-import' }))
      vi.stubGlobal('location', { reload })

      if (completion === 'committed') worker.send({ type: 'committed' })
      else if (completion === 'onerror') worker.onerror!(new Event('error', { cancelable: true }))
      else worker.onmessageerror!()

      expect(reload).toHaveBeenCalledOnce()
      expect(f.session.suspendWrites).toHaveBeenCalledOnce()
      expect(f.resume).not.toHaveBeenCalled()
      expect(f.session.discardStagedImages).not.toHaveBeenCalled()
    },
  )

  it('cancels an import while its initial save is pending and ignores the later resolution', async () => {
    const f = fixture()
    let finish!: () => void
    f.flushPersistence.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    f.choose()

    f.button('data-activity-action').click()
    finish()
    await Promise.resolve()

    expect(ArchiveWorker.instances).toEqual([])
    expect(f.isRunning()).toBe(false)
    expect(f.session.discardStagedImages).toHaveBeenCalledOnce()
    expect(f.session.suspendWrites).not.toHaveBeenCalled()
  })

  it('keeps the current notes writable when the final replacement save fails', async () => {
    const f = fixture()
    f.choose()
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
    const worker = ArchiveWorker.instances[0]!
    worker.send({ type: 'prepared', incoming: { nodeCount: 1, imageCount: 0, missingImageCount: 0 }, current: 'none' })
    f.flushPersistence.mockRejectedValueOnce(new Error('quota'))

    f.button('import-confirm-replace').click()
    await vi.waitFor(() => expect(f.isRunning()).toBe(false))

    expect(worker.postMessage).not.toHaveBeenCalledWith({ type: 'commit-import' })
    expect(f.session.suspendWrites).not.toHaveBeenCalled()
    expect(f.session.discardStagedImages).toHaveBeenCalledOnce()
    expect(f.status()).toBe('Import failed. Your latest changes could not be saved: quota')
  })

  it.each([0, 1])(
    'downloads completed archive bytes and retains missing-image warnings (%i missing)',
    async (missingImageCount) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 9, 23, 14, 5))
      const NativeURL = URL
      const createObjectURL = vi.fn(() => 'blob:https://tree.test/archive')
      const revokeObjectURL = vi.fn()
      vi.stubGlobal(
        'URL',
        class extends NativeURL {
          static createObjectURL = createObjectURL
          static revokeObjectURL = revokeObjectURL
        },
      )
      const downloads: Array<{ name: string; href: string; hidden: boolean | string; connected: boolean }> = []
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ name: this.download, href: this.href, hidden: this.hidden, connected: this.isConnected })
      })
      const f = fixture()
      f.button('data-export').click()
      await Promise.resolve()
      const worker = ArchiveWorker.instances[0]!

      worker.send({ type: 'chunk', chunk: new Uint8Array([1, 2]).buffer })
      worker.send({ type: 'chunk', chunk: new Uint8Array([3]).buffer })
      worker.send({ type: 'done', summary: { imageCount: 2, missingImageCount, archiveBytes: 3 } })

      expect(downloads).toEqual([
        { name: 'Tree Notes 2026-10-23.zip', href: 'blob:https://tree.test/archive', hidden: true, connected: true },
      ])
      expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ size: 3, type: 'application/zip' }),
      )
      expect(document.querySelector('a[download]')).toBeNull()
      expect(worker.terminate).toHaveBeenCalledOnce()
      expect(f.isRunning()).toBe(false)
      expect(f.status()).toBe(
        `Exported “Tree Notes 2026-10-23.zip”.${missingImageCount ? ' 1 image could not be found and was not included.' : ''}`,
      )
      vi.advanceTimersByTime(5_999)
      expect(document.getElementById('data-activity')!.hidden).toBe(false)
      vi.advanceTimersByTime(1)
      expect(document.getElementById('data-activity')!.hidden).toBe(missingImageCount === 0)
      vi.advanceTimersByTime(53_999)
      expect(revokeObjectURL).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:https://tree.test/archive')
    },
  )

  it('disables all data commands when persistence is locked', () => {
    const f = fixture()
    expect(f.button('data-export').disabled).toBe(false)
    expect(f.button('data-import').disabled).toBe(false)
    expect(f.button('data-restore').hidden).toBe(true)

    f.lock()
    f.button('data-export').click()
    f.choose()

    expect(f.button('data-export').disabled).toBe(true)
    expect(f.button('data-import').disabled).toBe(true)
    expect(f.flushPersistence).not.toHaveBeenCalled()
    expect(ArchiveWorker.instances).toEqual([])
  })

  it('opens the file picker from the import command without saving prematurely', () => {
    const f = fixture()
    const picker = vi.spyOn(document.getElementById('data-import-file')!, 'click').mockImplementation(() => {})

    f.button('data-import').click()

    expect(f.focus.close).toHaveBeenCalledOnce()
    expect(picker).toHaveBeenCalledOnce()
    expect(f.flushPersistence).not.toHaveBeenCalled()
    expect(f.isRunning()).toBe(false)
  })

  it('cancels export during a pending save without starting a worker', async () => {
    const f = fixture()
    let finish!: () => void
    f.flushPersistence.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    f.button('data-export').click()
    expect(f.isRunning()).toBe(true)
    expect(f.button('data-import').disabled).toBe(true)
    expect(f.status()).toBe('Exporting Notes…')

    f.button('data-activity-action').click()
    finish()
    await Promise.resolve()

    expect(f.isRunning()).toBe(false)
    expect(ArchiveWorker.instances).toEqual([])
    expect(document.getElementById('data-activity')!.hidden).toBe(true)
  })

  it.each(['export', 'import'] as const)(
    'reports a failed save before %s without starting a worker',
    async (operation) => {
      const f = fixture()
      f.flushPersistence.mockRejectedValueOnce(new Error('disk full'))

      if (operation === 'export') f.button('data-export').click()
      else f.choose()
      await vi.waitFor(() => expect(f.isRunning()).toBe(false))

      expect(f.status()).toBe(
        `${operation === 'export' ? 'Export' : 'Import'} failed. Your latest changes could not be saved: disk full`,
      )
      expect(ArchiveWorker.instances).toEqual([])
      expect(f.button('data-activity-action').textContent).toBe('OK')
    },
  )

  it('forwards export progress, cancels the worker, and ignores late completion', async () => {
    const f = fixture()
    f.button('data-export').click()
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
    const worker = ArchiveWorker.instances[0]!
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'export' })
    expect(f.focus.close).toHaveBeenCalledOnce()

    worker.send({ type: 'progress', imagesDone: 2, imageCount: 4 })
    expect(f.status()).toBe('Exporting Notes… 2 of 4 images')
    f.button('data-activity-action').focus()
    f.button('data-activity-action').click()
    worker.send({ type: 'done', summary: { imageCount: 4, missingImageCount: 0, archiveBytes: 10 } })

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(f.focus.restore).toHaveBeenCalledOnce()
    expect(f.status()).toBe('')
    expect(f.isRunning()).toBe(false)
  })

  it.each(['onerror', 'onmessageerror'] as const)('reports an export worker failure through %s', async (kind) => {
    const f = fixture()
    f.button('data-export').click()
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
    const worker = ArchiveWorker.instances[0]!
    const event = new Event('error', { cancelable: true })

    if (kind === 'onerror') worker.onerror!(event)
    else worker.onmessageerror!()

    expect(f.status()).toBe('Export failed. The export stopped unexpectedly.')
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(f.isRunning()).toBe(false)
    if (kind === 'onerror') expect(event.defaultPrevented).toBe(true)
  })

  it.each(['none', 'invalid', { nodeCount: 2, imageCount: 1 }] as const)(
    'prepares an import for current state %j and discards it on cancel',
    async (current) => {
      const f = fixture()
      const file = f.choose()
      await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
      const worker = ArchiveWorker.instances[0]!
      expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'import', file })

      worker.send({ type: 'prepared', incoming: { nodeCount: 3, imageCount: 2, missingImageCount: 0 }, current })

      expect(f.dialog.open).toBe(true)
      expect(f.button('import-confirm-export').hidden).toBe(typeof current !== 'object')
      expect(document.getElementById('data-activity')!.hidden).toBe(true)
      expect(document.getElementById('import-confirm-missing')!.hidden).toBe(true)
      expect(document.getElementById('import-confirm-missing')!.textContent).toBe('')
      expect(document.getElementById('import-confirm-status')!.textContent).toBe('')
      expect(document.activeElement).toBe(f.button('import-confirm-cancel'))
      const event = new Event('cancel', { cancelable: true })
      f.dialog.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(f.dialog.open).toBe(false)
      expect(f.focus.restore).toHaveBeenCalledOnce()
      expect(f.session.discardStagedImages).toHaveBeenCalledOnce()
      expect(f.session.suspendWrites).not.toHaveBeenCalled()
      expect(worker.terminate).toHaveBeenCalledOnce()
      expect(f.isRunning()).toBe(false)
    },
  )

  it('suspends writes only after the replacement save and resumes after a worker rejection', async () => {
    const f = fixture()
    f.choose()
    await vi.waitFor(() => expect(ArchiveWorker.instances).toHaveLength(1))
    const worker = ArchiveWorker.instances[0]!
    worker.send({ type: 'prepared', incoming: { nodeCount: 3, imageCount: 2, missingImageCount: 1 }, current: 'none' })
    expect(document.getElementById('import-confirm-missing')!.hidden).toBe(false)
    let finish!: () => void
    f.flushPersistence.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )

    f.button('import-confirm-replace').click()

    expect(f.button('import-confirm-cancel').disabled).toBe(true)
    expect(document.getElementById('import-confirm-status')!.textContent).toBe('Replacing Notes…')
    expect(f.button('import-confirm-export').disabled).toBe(true)
    expect(f.button('import-confirm-replace').disabled).toBe(true)
    expect(f.session.suspendWrites).not.toHaveBeenCalled()
    f.dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(worker.terminate).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'commit-import' }))
    expect(f.session.suspendWrites).toHaveBeenCalledOnce()
    worker.send({ type: 'error', message: 'transaction failed' })

    expect(f.resume).toHaveBeenCalledOnce()
    expect(f.status()).toBe('Import failed. transaction failed')
    expect(f.isRunning()).toBe(false)
    expect(f.session.discardStagedImages).toHaveBeenCalledOnce()
  })
})
