import type { DataSession } from '../services'
import { openDatabase, PREFERENCE_STORE, readValue } from '../storage-schema'
import {
  backupFailure,
  backupSavedMessage,
  type BackupWorkerMessage,
  type BackupWorkerRequest,
} from '../workers/backup-protocol'

const FOLDER_KEY = 'backup-folder'

async function storedFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDatabase()
  try {
    return await readValue(db, PREFERENCE_STORE, FOLDER_KEY)
  } finally {
    db.close()
  }
}

async function rememberFolder(folder: FileSystemDirectoryHandle | undefined): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PREFERENCE_STORE, 'readwrite', { durability: 'strict' })
      const store = tx.objectStore(PREFERENCE_STORE)
      if (folder) store.put(folder, FOLDER_KEY)
      else store.delete(FOLDER_KEY)
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('The backup choice could not be saved.'))
    })
  } finally {
    db.close()
  }
}

export interface BackupActions {
  available(): boolean
  flush(): Promise<void>
  restore(folder: FileSystemDirectoryHandle): Promise<void>
}

export function supportsFolderBackup(): boolean {
  return (
    typeof window.showDirectoryPicker === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    typeof FileSystemFileHandle.prototype.createWritable === 'function'
  )
}

/** Main-thread permission/picker UI. Saved messages and status carry no notes (PRODUCT §24.5). */
export function installFolderBackup(session: DataSession, menu: HTMLElement, actions: BackupActions): void {
  const button = document.getElementById('data-backup') as HTMLButtonElement
  const status = document.getElementById('backup-status')!
  const menuButton = document.getElementById('tree-menu-button')!
  const dialog = document.getElementById('backup-confirm') as HTMLDialogElement
  const title = document.getElementById('backup-confirm-title')!
  const text = document.getElementById('backup-confirm-text')!
  const restore = document.getElementById('backup-confirm-restore') as HTMLButtonElement
  const replace = document.getElementById('backup-confirm-replace') as HTMLButtonElement
  const resume = document.getElementById('backup-confirm-resume') as HTMLButtonElement
  const stop = document.getElementById('backup-confirm-stop') as HTMLButtonElement
  const choose = document.getElementById('backup-confirm-choose') as HTMLButtonElement
  const cancel = document.getElementById('backup-confirm-cancel') as HTMLButtonElement
  if (!supportsFolderBackup()) return
  button.hidden = false
  status.hidden = false
  let folder: FileSystemDirectoryHandle | undefined
  let worker: Worker | undefined
  let paused = false
  let busy = true
  let disposed = false
  const update = (message: string, attention = false) => {
    status.textContent = message
    menuButton.classList.toggle('backup-attention', attention)
    menuButton.setAttribute('aria-label', attention ? 'Tree menu — backup needs attention' : 'Tree menu')
  }
  const refresh = () => {
    button.textContent = !folder ? 'Back Up to Folder…' : paused ? 'Resume Backing Up…' : 'Stop Backing Up'
    button.disabled = busy || !actions.available()
  }
  const stopWorker = () => {
    worker?.terminate()
    worker = undefined
  }
  const fail = (error: unknown) => {
    const failure = backupFailure(error)
    if (failure.kind === 'permission') {
      stopWorker()
      paused = true
      update(
        folder
          ? 'Backup paused — permission needed. Choose Resume Backing Up…'
          : 'Backup failed. Write permission was not granted. Choose Back Up to Folder…',
        true,
      )
    } else {
      update(
        `Backup failed. ${failure.kind === 'not-found' ? 'The folder could not be found. ' : failure.kind === 'quota' ? 'The destination is full. ' : ''}${failure.message}`,
        true,
      )
    }
    refresh()
  }
  const startWorker = () => {
    if (disposed || !folder) return
    stopWorker()
    paused = false
    update(`Backing up to “${folder.name}”…`)
    try {
      const current = new Worker(new URL('../workers/backup.worker.ts', import.meta.url), { type: 'module' })
      worker = current
      current.onmessage = ({ data }: MessageEvent<BackupWorkerMessage>) => {
        if (worker !== current || disposed) return
        if (data.state === 'writing') update(`Backing up to “${folder!.name}”…`)
        else if (data.state === 'saved') {
          const missing = data.missingImages
          update(
            `Backed up to “${folder!.name}”.${missing ? ` ${missing.toLocaleString('en-US')} ${missing === 1 ? 'image could' : 'images could'} not be found and ${missing === 1 ? 'was' : 'were'} not included.` : ''}`,
          )
        } else if (data.state === 'stopped') {
          stopped()
        } else if (data.kind === 'permission') {
          fail(new DOMException(data.message, 'NotAllowedError'))
        } else {
          update(
            `Backup failed. ${data.kind === 'not-found' ? 'The folder could not be found. ' : data.kind === 'quota' ? 'The destination is full. ' : ''}${data.message}`,
            true,
          )
        }
      }
      const stopped = () => {
        if (worker !== current || disposed) return
        stopWorker()
        paused = true
        update('Backup failed. The backup stopped unexpectedly. Choose Resume Backing Up…', true)
        refresh()
      }
      current.onerror = (event) => {
        event.preventDefault()
        stopped()
      }
      current.onmessageerror = stopped
      current.postMessage({ type: 'start', folder } satisfies BackupWorkerRequest)
    } catch (error) {
      stopWorker()
      paused = true
      fail(error)
    }
    refresh()
  }
  const remove = async () => {
    await rememberFolder(undefined)
    if (disposed) return
    stopWorker()
    folder = undefined
    paused = false
    update('Folder backup is off.')
  }
  const activate = async (next: FileSystemDirectoryHandle) => {
    await actions.flush()
    if (disposed) return
    // queryPermission never prompts. Only picker/Resume clicks may request access.
    if ((await next.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      throw new DOMException('Write permission was not granted.', 'NotAllowedError')
    }
    await rememberFolder(next)
    if (disposed) return
    folder = next
    startWorker()
  }
  const run = async (action: () => Promise<void>) => {
    busy = true
    refresh()
    try {
      await action()
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) fail(error)
    } finally {
      busy = false
      refresh()
    }
  }
  const closeDialog = () => {
    if (dialog.open) dialog.close()
  }
  const showDialog = (next?: FileSystemDirectoryHandle) => {
    const occupied = next !== undefined
    title.textContent = occupied ? 'This Folder Already Contains Notes' : 'Resume Folder Backup?'
    text.textContent = occupied
      ? `“${next.name}” contains document.json. Restore its notes, explicitly replace its backup with your current saved notes, or choose another folder. Replacing the backup cannot be undone. Existing image files are kept.`
      : `Tree needs write permission to resume backing up to “${folder!.name}”. You can also stop or choose another folder. Files already in the folder are kept.`
    restore.hidden = replace.hidden = !occupied
    resume.hidden = stop.hidden = occupied
    restore.onclick = () => {
      closeDialog()
      void actions.restore(next!)
    }
    replace.onclick = () => {
      closeDialog()
      void run(() => activate(next!))
    }
    resume.onclick = () => {
      // Start requestPermission synchronously in the click handler, preserving user activation.
      const request = folder!.requestPermission({ mode: 'readwrite' })
      closeDialog()
      void run(async () => {
        if ((await request) !== 'granted')
          throw new DOMException('Write permission was not granted.', 'NotAllowedError')
        startWorker()
      })
    }
    stop.onclick = () => {
      closeDialog()
      void run(remove)
    }
    choose.onclick = () => {
      closeDialog()
      const picking = window.showDirectoryPicker!({ mode: 'readwrite', id: 'tree-backup' })
      void run(async () => {
        const selected = await picking
        await select(selected)
      })
    }
    dialog.showModal()
    cancel.focus()
  }
  const select = async (next: FileSystemDirectoryHandle) => {
    if (disposed) return
    try {
      await next.getFileHandle('document.json')
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        await activate(next)
        return
      }
      throw error
    }
    showDialog(next)
  }
  cancel.onclick = closeDialog
  dialog.oncancel = (event) => {
    event.preventDefault()
    closeDialog()
  }
  menu.addEventListener('beforetoggle', refresh)
  button.onclick = () => {
    if (busy || !actions.available()) return
    menu.hidePopover()
    if (folder && paused) {
      showDialog()
      return
    }
    if (folder) {
      void run(remove)
      return
    }
    const picking = window.showDirectoryPicker!({ mode: 'readwrite', id: 'tree-backup' })
    void run(async () => select(await picking))
  }
  const unsubscribe = session.onSaved(() => {
    try {
      worker?.postMessage(backupSavedMessage())
    } catch (error) {
      paused = true
      stopWorker()
      fail(error)
    }
  })
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true
      stopWorker()
      unsubscribe()
    },
    { once: true },
  )
  void run(async () => {
    folder = await storedFolder()
    if (disposed) return
    if (!folder) {
      update('Folder backup is off.')
      return
    }
    if ((await folder.queryPermission({ mode: 'readwrite' })) === 'granted') startWorker()
    else {
      paused = true
      update('Backup paused — permission needed. Choose Resume Backing Up…', true)
    }
  })
}
