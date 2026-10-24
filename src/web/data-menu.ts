import type { EditorStore } from '../application/editor-store'
import {
  archiveFileName,
  exportProgressText,
  exportResultText,
  importConfirmationText,
  importProgressText,
  restoreProgressText,
  type ImportConfirmationText,
} from '../application/notes-archive/archive-messages'
import type { DataSession } from './services'
import type { ArchiveWorkerMessage, ArchiveWorkerRequest } from './workers/archive-protocol'
import { installFolderBackup, supportsFolderBackup } from './backup/backup-controller'
import type { MenuFocus } from './menu-focus'

// Keep the object URL until the browser has taken the download.
const DOWNLOAD_URL_LIFETIME_MILLISECONDS = 60_000
const SUCCESS_MESSAGE_MILLISECONDS = 6_000

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

interface ActivityPanel {
  show(text: string, action: 'Cancel' | 'OK', onAction: () => void): void
  hide(): void
}

function activityPanel(restoreFocus: () => void): ActivityPanel {
  const panel = document.getElementById('data-activity')!
  const text = document.getElementById('data-activity-text')!
  const button = document.getElementById('data-activity-action') as HTMLButtonElement
  return {
    show(message, action, onAction) {
      text.textContent = message
      button.textContent = action
      button.onclick = onAction
      panel.hidden = false
    },
    hide() {
      const focused = panel.contains(document.activeElement)
      panel.hidden = true
      text.textContent = ''
      button.onclick = null
      if (focused) restoreFocus()
    },
  }
}

/** Starts a new archive worker; `onStopped` runs when it cannot start or stops unexpectedly. */
function startArchiveWorker(
  onMessage: (message: ArchiveWorkerMessage) => void,
  onStopped: () => void,
): Worker | undefined {
  let worker: Worker
  try {
    worker = new Worker(new URL('./workers/archive.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    onStopped()
    return undefined
  }
  worker.onerror = (event) => {
    event.preventDefault()
    onStopped()
  }
  worker.onmessageerror = onStopped
  worker.onmessage = (event: MessageEvent<ArchiveWorkerMessage>) => onMessage(event.data)
  return worker
}

type ExportUpdate =
  | { readonly state: 'running'; readonly text: string }
  | { readonly state: 'done'; readonly text: string; readonly complete: boolean }
  | { readonly state: 'failed'; readonly text: string }

/**
 * Saves pending edits, then exports the saved notes from a worker (PRODUCT §24.3). This thread only
 * appends transferred chunks to a Blob and starts the download, so its work does not grow with the
 * size of the notes or images. Returns a function that cancels the export.
 */
function startExport(store: EditorStore, update: (state: ExportUpdate) => void): () => void {
  // Ends this run; messages that a terminated worker queued earlier are ignored.
  let active = true
  let worker: Worker | undefined
  const stop = () => {
    active = false
    worker?.terminate()
  }
  const fail = (message: string) => {
    if (!active) return
    stop()
    update({ state: 'failed', text: `Export failed. ${message}` })
  }
  update({ state: 'running', text: exportProgressText(0, 0) })
  void (async () => {
    try {
      await store.flushPersistence()
    } catch (error) {
      fail(`Your latest changes could not be saved: ${reason(error)}`)
      return
    }
    if (!active) return
    const fileName = archiveFileName(new Date())
    let archive = new Blob([], { type: 'application/zip' })
    worker = startArchiveWorker(
      (message) => {
        if (!active) return
        if (message.type === 'chunk') {
          archive = new Blob([archive, message.chunk], { type: 'application/zip' })
        } else if (message.type === 'progress') {
          update({ state: 'running', text: exportProgressText(message.imagesDone, message.imageCount) })
        } else if (message.type === 'error') {
          fail(
            message.message +
              (message.message.endsWith('as one archive.') && supportsFolderBackup()
                ? ' Use Back Up to Folder… instead.'
                : ''),
          )
        } else if (message.type === 'done') {
          stop()
          download(archive, fileName)
          update({
            state: 'done',
            text: exportResultText(fileName, message.summary),
            complete: message.summary.missingImageCount === 0,
          })
        }
      },
      () => fail('The export stopped unexpectedly.'),
    )
    worker?.postMessage({ type: 'export' } satisfies ArchiveWorkerRequest)
  })()
  return stop
}

interface ImportDialog {
  open(text: ImportConfirmationText, canExport: boolean): void
  close(): void
}

/**
 * Wires the Data block of the browser menu (PRODUCT §24.3–§24.6). One export, import or restore
 * runs at a time, and none is available in the locked save-failure state.
 */
export function installDataMenu(store: EditorStore, menu: HTMLElement, session: DataSession, focus: MenuFocus): void {
  const exportButton = document.getElementById('data-export') as HTMLButtonElement
  const importButton = document.getElementById('data-import') as HTMLButtonElement
  const restoreButton = document.getElementById('data-restore') as HTMLButtonElement
  const fileInput = document.getElementById('data-import-file') as HTMLInputElement
  const dialog = document.getElementById('import-confirm') as HTMLDialogElement
  const dialogExport = document.getElementById('import-confirm-export') as HTMLButtonElement
  const dialogReplace = document.getElementById('import-confirm-replace') as HTMLButtonElement
  const dialogCancel = document.getElementById('import-confirm-cancel') as HTMLButtonElement
  const dialogStatus = document.getElementById('import-confirm-status')!
  const panel = activityPanel(focus.restore)
  let running = false
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  const locked = () => {
    const state = store.getSnapshot()
    return state.status === 'ready' && state.persistenceLocked === true
  }
  const refreshBackup = installFolderBackup(session, menu, {
    closeMenu: focus.close,
    restoreFocus: focus.restore,
    available: () => !running && !locked(),
    restore: (folder) => startImport(folder),
    flush: () => store.flushPersistence(),
  })
  const refresh = () => {
    const disabled = running || locked()
    for (const button of [exportButton, importButton, restoreButton]) {
      if (button.disabled !== disabled) button.disabled = disabled
    }
    refreshBackup()
  }
  const setRunning = (value: boolean) => {
    running = value
    refresh()
  }
  store.subscribe(refresh)
  menu.addEventListener('beforetoggle', refresh)
  refresh()
  restoreButton.hidden = !supportsFolderBackup()

  exportButton.onclick = () => {
    focus.close()
    if (running || locked()) return
    setRunning(true)
    clearTimeout(hideTimer)
    let cancel = () => {}
    const cancelExport = () => {
      cancel()
      setRunning(false)
      panel.hide()
    }
    cancel = startExport(store, (update) => {
      if (update.state === 'running') {
        panel.show(update.text, 'Cancel', cancelExport)
        return
      }
      setRunning(false)
      panel.show(update.text, 'OK', () => panel.hide())
      if (update.state === 'done' && update.complete) {
        hideTimer = setTimeout(() => panel.hide(), SUCCESS_MESSAGE_MILLISECONDS)
      }
    })
  }

  importButton.onclick = () => {
    focus.close()
    if (running || locked()) return
    fileInput.click()
  }
  fileInput.onchange = () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file !== undefined && !running && !locked()) void startImport(file)
  }

  restoreButton.onclick = () => {
    focus.close()
    if (running || locked()) return
    // Read access is enough; the picker must open from this click's user activation.
    void (async () => window.showDirectoryPicker!({ mode: 'read', id: 'tree-backup' }))().then(
      (folder) => startImport(folder),
      (error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        clearTimeout(hideTimer)
        panel.show(`Restore failed. The folder could not be opened: ${reason(error)}`, 'OK', () => panel.hide())
      },
    )
  }

  let onDialogCancel = () => {}
  dialog.oncancel = (event) => {
    event.preventDefault()
    onDialogCancel()
  }
  const importDialog: ImportDialog = {
    open(text, canExport) {
      document.getElementById('import-confirm-incoming')!.textContent = text.incoming
      document.getElementById('import-confirm-current')!.textContent = text.current
      const missing = document.getElementById('import-confirm-missing')!
      missing.textContent = text.missing ?? ''
      missing.hidden = text.missing === undefined
      dialogStatus.textContent = ''
      dialogExport.hidden = !canExport
      for (const button of [dialogExport, dialogReplace, dialogCancel]) button.disabled = false
      dialog.showModal()
      // Cancel is the default button: replacing the notes is destructive (PRODUCT §1.3).
      dialogCancel.focus()
    },
    close() {
      if (!dialog.open) return
      const focused = dialog.contains(document.activeElement)
      dialog.close()
      if (focused) focus.restore()
    },
  }

  /**
   * Validates the chosen archive and stages its images in a worker, asks for confirmation, then
   * has the worker replace the stored head while this session cannot write, and reloads. Until
   * the head is replaced, every failure or cancel removes the staged images, and the next start
   * removes those of a tab that closed (PRODUCT §24.4).
   */
  async function startImport(file: File | FileSystemDirectoryHandle): Promise<void> {
    if (running || locked()) return
    const restoring = !(file instanceof File)
    const progress = restoring ? restoreProgressText : importProgressText
    setRunning(true)
    clearTimeout(hideTimer)
    let active = true
    let committing = false
    // Assigned once below, but `stop` may run before that when the worker cannot start.
    let worker: Worker | undefined = undefined
    let cancelExport: (() => void) | undefined
    let resumeWrites: (() => void) | undefined
    const stop = () => {
      active = false
      setRunning(false)
      // A terminated worker's last image transaction was created before this one, so the
      // journal sweep also removes it.
      worker?.terminate()
      cancelExport?.()
      resumeWrites?.()
      importDialog.close()
      void session.discardStagedImages().catch(() => {})
    }
    const cancel = () => {
      if (!active || committing) return
      stop()
      panel.hide()
    }
    const fail = (message: string) => {
      if (!active) return
      stop()
      panel.show(`${restoring ? 'Restore' : 'Import'} failed. ${message}`, 'OK', () => panel.hide())
    }
    const replace = async () => {
      if (!active) return
      committing = true
      cancelExport?.()
      for (const button of [dialogExport, dialogReplace, dialogCancel]) button.disabled = true
      dialogStatus.textContent = 'Replacing Notes…'
      try {
        await store.flushPersistence()
      } catch (error) {
        committing = false
        fail(`Your latest changes could not be saved: ${reason(error)}`)
        return
      }
      // No save may follow the replaced head, or it would restore the previous notes.
      resumeWrites = session.suspendWrites()
      worker?.postMessage({ type: 'commit-import' } satisfies ArchiveWorkerRequest)
    }
    onDialogCancel = cancel
    dialogCancel.onclick = cancel
    dialogReplace.onclick = () => void replace()
    dialogExport.onclick = () => {
      dialogExport.disabled = true
      dialogReplace.disabled = true
      cancelExport = startExport(store, (update) => {
        dialogStatus.textContent = update.text
        if (update.state === 'running') return
        cancelExport = undefined
        dialogExport.disabled = false
        dialogReplace.disabled = false
      })
    }

    panel.show(progress(0, 0), 'Cancel', cancel)
    try {
      await store.flushPersistence()
    } catch (error) {
      fail(`Your latest changes could not be saved: ${reason(error)}`)
      return
    }
    if (!active) return
    worker = startArchiveWorker(
      (message) => {
        if (!active) return
        if (message.type === 'progress') {
          panel.show(progress(message.imagesDone, message.imageCount), 'Cancel', cancel)
        } else if (message.type === 'prepared') {
          panel.hide()
          importDialog.open(
            importConfirmationText(
              file.name,
              file instanceof File ? file.size : (message.sourceBytes ?? 0),
              message.incoming,
              message.current,
              restoring,
            ),
            typeof message.current === 'object',
          )
        } else if (message.type === 'committed') {
          location.reload()
        } else if (message.type === 'error') {
          committing = false
          fail(message.message)
        }
      },
      () => {
        // A worker that stops during the commit may already have replaced the head; reloading
        // opens whichever head is stored, and the startup sweep removes the images only when
        // the commit did not end the journal.
        if (committing) location.reload()
        else fail(`The ${restoring ? 'restore' : 'import'} stopped unexpectedly.`)
      },
    )
    worker?.postMessage(
      file instanceof File
        ? ({ type: 'import', file } satisfies ArchiveWorkerRequest)
        : ({ type: 'restore', folder: file } satisfies ArchiveWorkerRequest),
    )
  }
}

function download(archive: Blob, fileName: string): void {
  const url = URL.createObjectURL(archive)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MILLISECONDS)
}
