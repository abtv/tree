import type { EditorStore } from '../application/editor-store'
import type { NotesArchiveSummary } from '../application/notes-archive/export-notes'
import type { NotesCounts } from '../application/notes-archive/import-notes'
import type { DataSession } from './services'
import type { ArchiveWorkerMessage, ArchiveWorkerRequest, IncomingNotes } from './workers/archive-protocol'
import { installFolderBackup, supportsFolderBackup } from './backup/backup-controller'

// Keep the object URL until the browser has taken the download.
const DOWNLOAD_URL_LIFETIME_MILLISECONDS = 60_000
const SUCCESS_MESSAGE_MILLISECONDS = 6_000

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))
const count = (value: number, singular: string, plural: string) =>
  `${value.toLocaleString('en-US')} ${value === 1 ? singular : plural}`

export function archiveFileName(now: Date): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `Tree Notes ${date}.zip`
}

function progressText(action: string, imagesDone: number, imageCount: number): string {
  if (imageCount === 0) return `${action} Notes…`
  return `${action} Notes… ${imagesDone.toLocaleString('en-US')} of ${count(imageCount, 'image', 'images')}`
}

export const exportProgressText = (imagesDone: number, imageCount: number) =>
  progressText('Exporting', imagesDone, imageCount)
export const importProgressText = (imagesDone: number, imageCount: number) =>
  progressText('Importing', imagesDone, imageCount)

export function exportResultText(fileName: string, summary: NotesArchiveSummary): string {
  const exported = `Exported “${fileName}”.`
  if (summary.missingImageCount === 0) return exported
  const count = summary.missingImageCount.toLocaleString('en-US')
  return summary.missingImageCount === 1
    ? `${exported} 1 image could not be found and was not included.`
    : `${exported} ${count} images could not be found and were not included.`
}

/** Formats a file size in decimal units, as the Finder does. */
export function fileSizeText(bytes: number): string {
  if (bytes < 1000) return count(bytes, 'byte', 'bytes')
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1000
  let unit = 0
  while (value >= 999.95 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: value < 100 ? 1 : 0 })} ${units[unit]}`
}

const notesText = (notes: NotesCounts) =>
  `${count(notes.nodeCount, 'node', 'nodes')} and ${count(notes.imageCount, 'image', 'images')}`

export interface ImportConfirmationText {
  readonly incoming: string
  readonly current: string
  readonly missing: string | undefined
}

export function importConfirmationText(
  fileName: string,
  fileBytes: number,
  incoming: IncomingNotes,
  current: NotesCounts | 'none' | 'invalid',
  restoring = false,
): ImportConfirmationText {
  const action = restoring ? 'Restoring' : 'Importing'
  return {
    incoming: `“${fileName}” (${fileSizeText(fileBytes)}) contains ${notesText(incoming)}.`,
    current:
      current === 'none'
        ? 'There are no saved notes in this browser.'
        : current === 'invalid'
          ? `The notes saved in this browser are invalid and cannot be opened. ${action} replaces them.`
          : `Your current notes have ${notesText(current)}. ${action} replaces them, and this cannot be undone.`,
    missing:
      incoming.missingImageCount === 0
        ? undefined
        : incoming.missingImageCount === 1
          ? `1 image that the notes use is not in the ${restoring ? 'folder' : 'archive'}. Its node will show “Image could not be loaded.”`
          : `${incoming.missingImageCount.toLocaleString('en-US')} images that the notes use are not in the ${restoring ? 'folder' : 'archive'}. Their nodes will show “Image could not be loaded.”`,
  }
}

interface ActivityPanel {
  show(text: string, action: 'Cancel' | 'OK', onAction: () => void): void
  hide(): void
}

function activityPanel(): ActivityPanel {
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
      panel.hidden = true
      text.textContent = ''
      button.onclick = null
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
 * Wires the Data block of the browser menu (PRODUCT §24.3, §24.4). One export or import runs at a
 * time, and neither is available in the locked save-failure state.
 */
export function installDataMenu(store: EditorStore, menu: HTMLElement, session: DataSession): void {
  const exportButton = document.getElementById('data-export') as HTMLButtonElement
  const importButton = document.getElementById('data-import') as HTMLButtonElement
  const fileInput = document.getElementById('data-import-file') as HTMLInputElement
  const dialog = document.getElementById('import-confirm') as HTMLDialogElement
  const dialogExport = document.getElementById('import-confirm-export') as HTMLButtonElement
  const dialogReplace = document.getElementById('import-confirm-replace') as HTMLButtonElement
  const dialogCancel = document.getElementById('import-confirm-cancel') as HTMLButtonElement
  const dialogStatus = document.getElementById('import-confirm-status')!
  const panel = activityPanel()
  let running = false
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  const locked = () => {
    const state = store.getSnapshot()
    return state.status === 'ready' && state.persistenceLocked === true
  }
  installFolderBackup(session, menu, {
    available: () => !running && !locked(),
    restore: (folder) => startImport(folder),
    flush: () => store.flushPersistence(),
  })
  menu.addEventListener('beforetoggle', (event) => {
    if ((event as ToggleEvent).newState !== 'open') return
    exportButton.disabled = running || locked()
    importButton.disabled = running || locked()
  })

  exportButton.onclick = () => {
    menu.hidePopover()
    if (running || locked()) return
    running = true
    clearTimeout(hideTimer)
    let cancel = () => {}
    const cancelExport = () => {
      cancel()
      running = false
      panel.hide()
    }
    cancel = startExport(store, (update) => {
      if (update.state === 'running') {
        panel.show(update.text, 'Cancel', cancelExport)
        return
      }
      running = false
      panel.show(update.text, 'OK', () => panel.hide())
      if (update.state === 'done' && update.complete) {
        hideTimer = setTimeout(() => panel.hide(), SUCCESS_MESSAGE_MILLISECONDS)
      }
    })
  }

  importButton.onclick = () => {
    menu.hidePopover()
    if (running || locked()) return
    fileInput.click()
  }
  fileInput.onchange = () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file !== undefined && !running && !locked()) void startImport(file)
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
      if (dialog.open) dialog.close()
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
    running = true
    clearTimeout(hideTimer)
    let active = true
    let committing = false
    // Assigned once below, but `stop` may run before that when the worker cannot start.
    let worker: Worker | undefined = undefined
    let cancelExport: (() => void) | undefined
    let resumeWrites: (() => void) | undefined
    const stop = () => {
      active = false
      running = false
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

    panel.show(importProgressText(0, 0), 'Cancel', cancel)
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
          panel.show(importProgressText(message.imagesDone, message.imageCount), 'Cancel', cancel)
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
        else fail('The import stopped unexpectedly.')
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
