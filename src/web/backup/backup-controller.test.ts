// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFolderBackup, supportsFolderBackup } from './backup-controller'
import { BrowserMenuCommands } from '../menu-commands'
import type { BackupWorkerMessage } from '../workers/backup-protocol'

const storage = vi.hoisted(() => ({
  read: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  close: vi.fn(),
  transaction: vi.fn(),
}))
vi.mock('../storage-schema', () => ({
  PREFERENCE_STORE: 'preferences',
  readValue: storage.read,
  openDatabase: async () => ({ transaction: storage.transaction, close: storage.close }),
}))

class BackupWorker {
  static instances: BackupWorker[] = []
  onmessage: ((event: { data: BackupWorkerMessage }) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    BackupWorker.instances.push(this)
  }
  send(data: BackupWorkerMessage) {
    this.onmessage?.({ data })
  }
}

function folder(occupied = false) {
  return {
    name: 'Backup',
    queryPermission: vi.fn(async () => 'granted'),
    requestPermission: vi.fn(async () => 'granted'),
    getFileHandle: vi.fn(async () => {
      if (!occupied) throw Object.assign(new Error('missing'), { name: 'NotFoundError' })
      return {}
    }),
  }
}

function useBrowserExceptions() {
  // jsdom's DOMException can have a different Error realm from the application under test.
  vi.stubGlobal(
    'DOMException',
    class extends Error {
      constructor(message: string, name: string) {
        super(message)
        this.name = name
      }
    },
  )
}

async function fixture(stored?: ReturnType<typeof folder>, supported = true) {
  document.body.innerHTML = `
    <div id="tree-menu"></div><button id="tree-menu-button"></button><button id="data-backup" hidden></button>
    <span id="backup-status" hidden></span><dialog id="backup-confirm">
    <h2 id="backup-confirm-title"></h2><p id="backup-confirm-text"></p>
    <button id="backup-confirm-restore"></button><button id="backup-confirm-replace"></button>
    <button id="backup-confirm-resume"></button><button id="backup-confirm-stop"></button>
    <button id="backup-confirm-choose"></button><button id="backup-confirm-cancel"></button></dialog>`
  const dialog = document.getElementById('backup-confirm') as HTMLDialogElement
  dialog.showModal = vi.fn(() => {
    dialog.open = true
  })
  dialog.close = vi.fn(() => {
    dialog.open = false
  })
  const next = folder()
  const picker = vi.fn(async () => next)
  if (supported) window.showDirectoryPicker = picker as unknown as NonNullable<Window['showDirectoryPicker']>
  storage.read.mockResolvedValueOnce(stored)
  const unsubscribe = vi.fn()
  let saved = () => {}
  const session = {
    onSaved: vi.fn((listener: () => void) => {
      saved = listener
      return unsubscribe
    }),
    suspendWrites: vi.fn(),
    discardStagedImages: vi.fn(),
  }
  const actions = {
    closeMenu: vi.fn(),
    restoreFocus: vi.fn(),
    available: vi.fn(() => true),
    flush: vi.fn<() => Promise<void>>(async () => undefined),
    restore: vi.fn(async () => undefined),
  }
  const refresh = installFolderBackup(
    session,
    document.getElementById('tree-menu')!,
    new BrowserMenuCommands(),
    actions,
  )
  const button = (id: string) => document.getElementById(id) as HTMLButtonElement
  await vi.waitFor(() => expect(button('data-backup').disabled).toBe(false))
  return {
    next,
    picker,
    saved: () => saved(),
    unsubscribe,
    actions,
    dialog,
    refresh,
    button,
    status: () => document.getElementById('backup-status')!.textContent,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  storage.read.mockReset()
  BackupWorker.instances = []
  vi.stubGlobal('Worker', BackupWorker)
  vi.stubGlobal(
    'FileSystemFileHandle',
    class {
      createWritable() {}
    },
  )
  storage.transaction.mockImplementation(() => {
    const tx = { objectStore: () => storage, oncomplete: null as (() => void) | null }
    queueMicrotask(() => tx.oncomplete?.())
    return tx
  })
})
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.body.replaceChildren()
  delete window.showDirectoryPicker
  vi.unstubAllGlobals()
})

describe('folder backup controller', () => {
  it('leaves backup unavailable without loading a folder when the picker is unsupported', async () => {
    const f = await fixture(undefined, false)

    f.refresh()
    f.button('data-backup').click()

    expect(document.getElementById('backup-status')!.hidden).toBe(true)
    expect(f.button('data-backup').hidden).toBe(true)
    expect(storage.read).not.toHaveBeenCalled()
    expect(f.picker).not.toHaveBeenCalled()
    expect(BackupWorker.instances).toEqual([])
  })

  it('refreshes availability when the menu opens', async () => {
    const f = await fixture()
    f.actions.available.mockReturnValue(false)

    document.getElementById('tree-menu')!.dispatchEvent(new Event('beforetoggle'))

    expect(f.button('data-backup').disabled).toBe(true)

    f.actions.available.mockReturnValue(true)
    document.getElementById('tree-menu')!.dispatchEvent(new Event('beforetoggle'))

    expect(f.button('data-backup').disabled).toBe(false)
  })

  it('does not restart backup after a pending Resume permission completes on a closed page', async () => {
    const stored = folder()
    stored.queryPermission.mockResolvedValue('prompt')
    let grant!: (permission: string) => void
    stored.requestPermission.mockImplementationOnce(() => new Promise((resolve) => (grant = resolve)))
    const f = await fixture(stored)
    f.button('data-backup').click()
    f.button('backup-confirm-resume').click()

    window.dispatchEvent(new Event('pagehide'))
    grant('granted')
    await vi.waitFor(() => expect(f.button('data-backup').disabled).toBe(false))

    expect(BackupWorker.instances).toEqual([])
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('terminates a worker whose start message fails and keeps backup available for retry', async () => {
    vi.stubGlobal(
      'Worker',
      class extends BackupWorker {
        override postMessage = vi.fn(() => {
          throw new Error('worker port closed')
        })
      },
    )
    const f = await fixture(folder())
    const worker = BackupWorker.instances[0]!

    worker.send({ state: 'saved', missingImages: 0 })

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(f.status()).toBe('Backup failed. worker port closed')
    expect(f.button('data-backup').textContent).toBe('Resume Backing Up…')
    expect(f.button('tree-menu-button').getAttribute('aria-label')).toBe('Tree menu — backup needs attention')
  })

  it('ignores a saved notification while folder backup is off', async () => {
    const f = await fixture()

    f.saved()

    expect(f.status()).toBe('Folder backup is off.')
    expect(f.button('data-backup').textContent).toBe('Back Up to Folder…')
    expect(BackupWorker.instances).toEqual([])
  })

  it('rechecks data-operation availability at activation even if the button has not refreshed', async () => {
    const f = await fixture()
    expect(f.button('data-backup').disabled).toBe(false)
    f.actions.available.mockReturnValue(false)

    f.button('data-backup').click()

    expect(f.picker).not.toHaveBeenCalled()
    expect(f.actions.closeMenu).not.toHaveBeenCalled()
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('does not move focus back to the editor when confirmation closes after focus left the dialog', async () => {
    const stored = folder()
    stored.queryPermission.mockResolvedValue('prompt')
    const f = await fixture(stored)
    f.button('data-backup').click()
    f.button('tree-menu-button').focus()

    f.button('backup-confirm-cancel').click()

    expect(f.dialog.open).toBe(false)
    expect(document.activeElement).toBe(f.button('tree-menu-button'))
    expect(f.actions.restoreFocus).not.toHaveBeenCalled()
    expect(stored.requestPermission).not.toHaveBeenCalled()
  })

  it.each([
    ['NotFoundError', 'The folder could not be found. '],
    ['QuotaExceededError', 'The destination is full. '],
  ] as const)('explains a %s while activating the selected folder', async (name, explanation) => {
    useBrowserExceptions()
    const f = await fixture()
    f.next.queryPermission.mockRejectedValueOnce(new DOMException('Storage unavailable', name))

    f.button('data-backup').click()
    await vi.waitFor(() => expect(f.button('data-backup').disabled).toBe(false))

    expect(f.status()).toBe(`Backup failed. ${explanation}Storage unavailable`)
    expect(f.button('tree-menu-button').getAttribute('aria-label')).toBe('Tree menu — backup needs attention')
    expect(storage.put).not.toHaveBeenCalled()
    expect(BackupWorker.instances).toEqual([])
    expect(f.actions.closeMenu).toHaveBeenCalledOnce()
  })

  it('does not remember a selected folder when write permission is denied', async () => {
    useBrowserExceptions()
    const f = await fixture()
    f.next.queryPermission.mockResolvedValue('denied')

    f.button('data-backup').click()
    await vi.waitFor(() =>
      expect(f.status()).toBe('Backup failed. Write permission was not granted. Choose Back Up to Folder…'),
    )

    expect(storage.put).not.toHaveBeenCalled()
    expect(BackupWorker.instances).toEqual([])
    expect(f.button('data-backup').textContent).toBe('Back Up to Folder…')
    expect(f.button('data-backup').disabled).toBe(false)
  })

  it('keeps a stored backup paused when the user denies Resume permission', async () => {
    useBrowserExceptions()
    const stored = folder()
    stored.queryPermission.mockResolvedValue('prompt')
    stored.requestPermission.mockResolvedValue('denied')
    const f = await fixture(stored)

    f.button('data-backup').click()
    f.button('backup-confirm-resume').click()
    await vi.waitFor(() => expect(f.button('data-backup').disabled).toBe(false))

    expect(f.status()).toBe('Backup paused — permission needed. Choose Resume Backing Up…')
    expect(f.button('tree-menu-button').getAttribute('aria-label')).toBe('Tree menu — backup needs attention')
    expect(f.dialog.open).toBe(false)
    expect(BackupWorker.instances).toEqual([])
    expect(storage.delete).not.toHaveBeenCalled()
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('terminates a worker that loses permission and resumes with a new worker after permission is granted', async () => {
    useBrowserExceptions()
    const f = await fixture(folder())
    const oldWorker = BackupWorker.instances[0]!

    oldWorker.send({ state: 'failed', kind: 'permission', message: 'revoked' })

    expect(oldWorker.terminate).toHaveBeenCalledOnce()
    expect(f.status()).toBe('Backup paused — permission needed. Choose Resume Backing Up…')
    f.button('data-backup').click()
    f.button('backup-confirm-resume').click()
    await vi.waitFor(() => expect(BackupWorker.instances).toHaveLength(2))
    oldWorker.onerror!(new Event('error', { cancelable: true }))
    oldWorker.send({ state: 'saved', missingImages: 0 })

    expect(f.status()).toBe('Backing up to “Backup”…')
    expect(BackupWorker.instances[1]!.terminate).not.toHaveBeenCalled()
    f.saved()
    expect(BackupWorker.instances[1]!.postMessage).toHaveBeenLastCalledWith({ type: 'saved' })
  })

  it('offers Resume when constructing the backup worker fails', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('worker unavailable')
        }
      },
    )
    const f = await fixture(folder())

    expect(f.status()).toBe('Backup failed. worker unavailable')
    expect(f.button('data-backup').textContent).toBe('Resume Backing Up…')

    vi.stubGlobal('Worker', BackupWorker)
    f.button('data-backup').click()
    f.button('backup-confirm-resume').click()
    await vi.waitFor(() => expect(BackupWorker.instances).toHaveLength(1))

    expect(f.status()).toBe('Backing up to “Backup”…')
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it('reports an aborted folder-preference write even when the transaction has no error object', async () => {
    const f = await fixture()
    storage.transaction.mockImplementationOnce(() => {
      const tx = { objectStore: () => storage, error: null, onabort: null as (() => void) | null }
      queueMicrotask(() => tx.onabort?.())
      return tx
    })

    f.button('data-backup').click()
    await vi.waitFor(() => expect(f.status()).toBe('Backup failed. The backup choice could not be saved.'))

    expect(BackupWorker.instances).toEqual([])
    expect(f.button('data-backup').textContent).toBe('Back Up to Folder…')
    expect(storage.close).toHaveBeenCalledTimes(2)
  })

  it('does not inspect a folder returned by a picker after the page was closed', async () => {
    const f = await fixture()
    let choose!: (value: ReturnType<typeof folder>) => void
    f.picker.mockReturnValueOnce(
      new Promise((resolve) => {
        choose = resolve
      }),
    )
    f.button('data-backup').click()

    window.dispatchEvent(new Event('pagehide'))
    choose(f.next)
    await vi.waitFor(() => expect(f.button('data-backup').disabled).toBe(false))

    expect(f.next.getFileHandle).not.toHaveBeenCalled()
    expect(f.actions.flush).not.toHaveBeenCalled()
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('does not inspect stored-folder permission after pagehide interrupts its loading', async () => {
    const stored = folder()
    let loaded!: (value: ReturnType<typeof folder>) => void
    storage.read.mockImplementationOnce(() => new Promise((resolve) => (loaded = resolve)))
    const pending = fixture()
    await vi.waitFor(() => expect(loaded).toBeDefined())

    window.dispatchEvent(new Event('pagehide'))
    loaded(stored)
    const f = await pending

    expect(stored.queryPermission).not.toHaveBeenCalled()
    expect(BackupWorker.instances).toEqual([])
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('does not start a worker when pagehide occurs while remembering the selected folder', async () => {
    const f = await fixture()
    const tx = { objectStore: () => storage, oncomplete: null as (() => void) | null }
    storage.transaction.mockReturnValueOnce(tx)
    f.button('data-backup').click()
    await vi.waitFor(() => expect(storage.put).toHaveBeenCalledOnce())

    window.dispatchEvent(new Event('pagehide'))
    tx.oncomplete!()
    await vi.waitFor(() => expect(f.button('data-backup').disabled).toBe(false))

    expect(BackupWorker.instances).toEqual([])
    expect(f.status()).toBe('Folder backup is off.')
    expect(storage.close).toHaveBeenCalledTimes(2)
  })

  it('reports folder inspection errors without treating the folder as empty', async () => {
    const f = await fixture()
    f.next.getFileHandle.mockRejectedValueOnce(new Error('read failed'))

    f.button('data-backup').click()
    await vi.waitFor(() => expect(f.status()).toBe('Backup failed. read failed'))

    expect(f.actions.flush).not.toHaveBeenCalled()
    expect(f.dialog.open).toBe(false)
    expect(storage.put).not.toHaveBeenCalled()
    expect(BackupWorker.instances).toEqual([])
  })

  it('does not activate or remember a selected folder after pagehide interrupts its pending save', async () => {
    const f = await fixture()
    let finish!: () => void
    f.actions.flush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    f.button('data-backup').click()
    await vi.waitFor(() => expect(f.actions.flush).toHaveBeenCalledOnce())

    window.dispatchEvent(new Event('pagehide'))
    finish()
    await vi.waitFor(() => expect(f.button('data-backup').disabled).toBe(false))

    expect(f.next.queryPermission).not.toHaveBeenCalled()
    expect(storage.put).not.toHaveBeenCalled()
    expect(BackupWorker.instances).toEqual([])
  })

  it('keeps the active worker when removing the stored backup choice fails', async () => {
    const f = await fixture(folder())
    const worker = BackupWorker.instances[0]!
    storage.transaction.mockImplementationOnce(() => {
      const tx = { objectStore: () => storage, error: new Error('quota'), onabort: null as (() => void) | null }
      queueMicrotask(() => tx.onabort?.())
      return tx
    })

    f.button('data-backup').click()
    await vi.waitFor(() => expect(f.status()).toBe('Backup failed. quota'))

    expect(worker.terminate).not.toHaveBeenCalled()
    expect(f.button('data-backup').textContent).toBe('Stop Backing Up')
    expect(storage.close).toHaveBeenCalledTimes(2)
    f.saved()
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'saved' })
  })

  it('pauses and allows retry when posting a saved notification to the worker fails', async () => {
    const f = await fixture(folder())
    const worker = BackupWorker.instances[0]!
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('port closed')
    })

    f.saved()
    worker.send({ state: 'saved', missingImages: 0 })

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(f.status()).toBe('Backup failed. port closed')
    expect(f.button('data-backup').textContent).toBe('Resume Backing Up…')
  })

  it('stops a paused backup from its confirmation dialog without requesting permission', async () => {
    const stored = folder()
    stored.queryPermission.mockResolvedValue('prompt')
    const f = await fixture(stored)
    f.button('data-backup').click()

    f.button('backup-confirm-stop').click()
    await vi.waitFor(() => expect(f.status()).toBe('Folder backup is off.'))

    expect(f.dialog.open).toBe(false)
    expect(stored.requestPermission).not.toHaveBeenCalled()
    expect(storage.delete).toHaveBeenCalledExactlyOnceWith('backup-folder')
    expect(BackupWorker.instances).toEqual([])
  })

  it('chooses another folder directly from the paused-backup dialog', async () => {
    const stored = folder()
    stored.queryPermission.mockResolvedValue('prompt')
    const f = await fixture(stored)
    f.button('data-backup').click()

    f.button('backup-confirm-choose').click()

    expect(f.picker).toHaveBeenCalledExactlyOnceWith({ mode: 'readwrite', id: 'tree-backup' })
    expect(f.dialog.open).toBe(false)
    await vi.waitFor(() => expect(BackupWorker.instances).toHaveLength(1))
    expect(storage.put).toHaveBeenCalledExactlyOnceWith(f.next, 'backup-folder')
    expect(stored.requestPermission).not.toHaveBeenCalled()
  })

  it('closes a backup confirmation on Escape and restores focus without changing storage', async () => {
    const stored = folder()
    stored.queryPermission.mockResolvedValue('prompt')
    const f = await fixture(stored)
    f.button('data-backup').click()
    const event = new Event('cancel', { cancelable: true })

    f.dialog.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(f.dialog.open).toBe(false)
    expect(f.actions.restoreFocus).toHaveBeenCalledOnce()
    expect(storage.put).not.toHaveBeenCalled()
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it.each([
    ['not-found', 'The folder could not be found. '],
    ['quota', 'The destination is full. '],
    ['other', ''],
  ] as const)('keeps backup available for retry after a %s worker failure', async (kind, prefix) => {
    const f = await fixture(folder())
    const worker = BackupWorker.instances[0]!

    worker.send({ state: 'failed', kind, message: 'write failed' })

    expect(f.status()).toBe(`Backup failed. ${prefix}write failed`)
    expect(document.getElementById('tree-menu-button')!.getAttribute('aria-label')).toBe(
      'Tree menu — backup needs attention',
    )
    expect(document.getElementById('tree-menu-button')!.classList.contains('backup-attention')).toBe(true)
    expect(worker.terminate).not.toHaveBeenCalled()
    worker.send({ state: 'saved', missingImages: 0 })
    expect(document.getElementById('tree-menu-button')!.classList.contains('backup-attention')).toBe(false)
    expect(document.getElementById('tree-menu-button')!.getAttribute('aria-label')).toBe('Tree menu')
  })

  it('honors current data-operation availability and leaves a canceled picker unchanged', async () => {
    const f = await fixture()
    f.actions.available.mockReturnValue(false)
    f.refresh()
    f.button('data-backup').click()
    expect(f.picker).not.toHaveBeenCalled()
    expect(f.button('data-backup').disabled).toBe(true)
    f.actions.available.mockReturnValue(true)
    f.refresh()
    f.picker.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'AbortError' }))

    f.button('data-backup').click()
    await vi.waitFor(() => expect(f.button('data-backup').disabled).toBe(false))

    expect(f.status()).toBe('Folder backup is off.')
    expect(storage.put).not.toHaveBeenCalled()
    expect(BackupWorker.instances).toEqual([])
  })

  it('does not remember a new folder when flushing pending edits fails', async () => {
    const f = await fixture()
    f.actions.flush.mockRejectedValueOnce(new Error('local save failed'))

    f.button('data-backup').click()
    await vi.waitFor(() => expect(f.status()).toBe('Backup failed. local save failed'))

    expect(storage.put).not.toHaveBeenCalled()
    expect(f.next.queryPermission).not.toHaveBeenCalled()
    expect(BackupWorker.instances).toEqual([])
  })

  it('requires a directory picker and writable file handles', () => {
    expect(supportsFolderBackup()).toBe(false)
    window.showDirectoryPicker = vi.fn()
    expect(supportsFolderBackup()).toBe(true)
    vi.stubGlobal('FileSystemFileHandle', class {})
    expect(supportsFolderBackup()).toBe(false)
    vi.stubGlobal('FileSystemFileHandle', undefined)
    expect(supportsFolderBackup()).toBe(false)
  })

  it('flushes notes before remembering a new folder and starts one backup worker', async () => {
    const f = await fixture()
    expect(f.status()).toBe('Folder backup is off.')
    expect(document.getElementById('backup-status')!.hidden).toBe(false)

    f.button('data-backup').click()
    await vi.waitFor(() => expect(BackupWorker.instances).toHaveLength(1))
    const worker = BackupWorker.instances[0]!

    expect(f.picker).toHaveBeenCalledExactlyOnceWith({ mode: 'readwrite', id: 'tree-backup' })
    expect(f.next.getFileHandle).toHaveBeenCalledWith('document.json')
    expect(f.actions.flush).toHaveBeenCalledOnce()
    expect(f.next.queryPermission).toHaveBeenCalledExactlyOnceWith({ mode: 'readwrite' })
    expect(storage.put).toHaveBeenCalledExactlyOnceWith(f.next, 'backup-folder')
    expect(storage.transaction).toHaveBeenCalledWith('preferences', 'readwrite', { durability: 'strict' })
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'start', folder: f.next })
    expect(worker.url.pathname).toMatch(/\/workers\/backup\.worker\.ts$/)
    expect(worker.options).toEqual({ type: 'module' })
    expect(f.button('data-backup').textContent).toBe('Stop Backing Up')

    f.saved()
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'saved' })
    f.button('data-backup').click()
    await vi.waitFor(() => expect(f.status()).toBe('Folder backup is off.'))

    expect(storage.delete).toHaveBeenCalledExactlyOnceWith('backup-folder')
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(f.button('data-backup').textContent).toBe('Back Up to Folder…')
  })

  it.each([0, 1, 2])('reports a finished backup with %i missing images', async (missingImages) => {
    const f = await fixture(folder())
    const worker = BackupWorker.instances[0]!

    worker.send({ state: 'saved', missingImages })

    expect(f.status()).toBe(
      `Backed up to “Backup”.${missingImages === 0 ? '' : missingImages === 1 ? ' 1 image could not be found and was not included.' : ' 2 images could not be found and were not included.'}`,
    )
    worker.send({ state: 'writing' })
    expect(f.status()).toBe('Backing up to “Backup”…')
  })

  it('never prompts for stored-folder access until Resume is clicked', async () => {
    const stored = folder()
    stored.queryPermission.mockResolvedValue('prompt')
    const f = await fixture(stored)
    expect(BackupWorker.instances).toEqual([])
    expect(stored.requestPermission).not.toHaveBeenCalled()
    expect(stored.queryPermission).toHaveBeenCalledExactlyOnceWith({ mode: 'readwrite' })
    expect(f.status()).toBe('Backup paused — permission needed. Choose Resume Backing Up…')
    expect(f.button('tree-menu-button').getAttribute('aria-label')).toBe('Tree menu — backup needs attention')

    f.button('data-backup').click()

    expect(f.dialog.open).toBe(true)
    expect(document.getElementById('backup-confirm-title')!.textContent).toBe('Resume Folder Backup?')
    expect(document.getElementById('backup-confirm-text')!.textContent).toBe(
      'Tree needs write permission to resume backing up to “Backup”. You can also stop or choose another folder. Files already in the folder are kept.',
    )
    expect(f.button('backup-confirm-restore').hidden).toBe(true)
    expect(f.button('backup-confirm-resume').hidden).toBe(false)
    f.button('backup-confirm-resume').click()
    expect(stored.requestPermission).toHaveBeenCalledExactlyOnceWith({ mode: 'readwrite' })
    await vi.waitFor(() => expect(BackupWorker.instances).toHaveLength(1))
    expect(f.dialog.open).toBe(false)
  })

  it.each(['restore', 'replace', 'cancel'] as const)(
    'requires an explicit %s choice for an occupied folder',
    async (choice) => {
      const f = await fixture()
      const occupied = folder(true)
      f.picker.mockResolvedValueOnce(occupied)
      f.button('data-backup').click()
      await vi.waitFor(() => expect(f.dialog.open).toBe(true))
      expect(BackupWorker.instances).toEqual([])
      expect(f.actions.flush).not.toHaveBeenCalled()
      expect(document.getElementById('backup-confirm-title')!.textContent).toBe('This Folder Already Contains Notes')
      expect(document.getElementById('backup-confirm-text')!.textContent).toBe(
        '“Backup” contains document.json. Restore its notes, explicitly replace its backup with your current saved notes, or choose another folder. Replacing the backup cannot be undone. Existing image files are kept.',
      )
      expect(f.button('backup-confirm-restore').hidden).toBe(false)
      expect(f.button('backup-confirm-resume').hidden).toBe(true)
      expect(document.activeElement).toBe(f.button('backup-confirm-cancel'))

      f.button(`backup-confirm-${choice}`).click()

      expect(f.dialog.open).toBe(false)
      if (choice === 'restore') expect(f.actions.restore).toHaveBeenCalledExactlyOnceWith(occupied)
      else if (choice === 'replace') {
        await vi.waitFor(() => expect(BackupWorker.instances).toHaveLength(1))
        expect(storage.put).toHaveBeenCalledExactlyOnceWith(occupied, 'backup-folder')
      } else expect(storage.put).not.toHaveBeenCalled()
    },
  )

  it.each(['stopped', 'error', 'messageerror'] as const)(
    'pauses when its worker emits %s and ignores late status',
    async (kind) => {
      const f = await fixture(folder())
      const worker = BackupWorker.instances[0]!
      const event = new Event('error', { cancelable: true })

      if (kind === 'stopped') worker.send({ state: 'stopped', message: 'stopped' })
      else if (kind === 'error') worker.onerror!(event)
      else worker.onmessageerror!()
      worker.send({ state: 'saved', missingImages: 0 })

      expect(f.status()).toBe('Backup failed. The backup stopped unexpectedly. Choose Resume Backing Up…')
      expect(f.button('tree-menu-button').getAttribute('aria-label')).toBe('Tree menu — backup needs attention')
      expect(f.button('data-backup').textContent).toBe('Resume Backing Up…')
      expect(worker.terminate).toHaveBeenCalledOnce()
      if (kind === 'error') expect(event.defaultPrevented).toBe(true)
    },
  )

  it('stops and unsubscribes on pagehide without accepting queued worker messages', async () => {
    const f = await fixture(folder())
    const worker = BackupWorker.instances[0]!

    window.dispatchEvent(new Event('pagehide'))
    worker.send({ state: 'saved', missingImages: 0 })

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
    expect(f.status()).toBe('Backing up to “Backup”…')
  })
})
