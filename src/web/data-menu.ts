import type { EditorStore } from '../application/editor-store'
import type { NotesArchiveSummary } from '../application/notes-archive/export-notes'
import type { ArchiveWorkerMessage, ArchiveWorkerRequest } from './workers/archive-protocol'

// Keep the object URL until the browser has taken the download.
const DOWNLOAD_URL_LIFETIME_MILLISECONDS = 60_000
const SUCCESS_MESSAGE_MILLISECONDS = 6_000

export function archiveFileName(now: Date): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `Tree Notes ${date}.zip`
}

export function exportProgressText(imagesDone: number, imageCount: number): string {
  if (imageCount === 0) return 'Exporting Notes…'
  return `Exporting Notes… ${imagesDone.toLocaleString('en-US')} of ${imageCount.toLocaleString('en-US')} ${imageCount === 1 ? 'image' : 'images'}`
}

export function exportResultText(fileName: string, summary: NotesArchiveSummary): string {
  const exported = `Exported “${fileName}”.`
  if (summary.missingImageCount === 0) return exported
  const count = summary.missingImageCount.toLocaleString('en-US')
  return summary.missingImageCount === 1
    ? `${exported} 1 image could not be found and was not included.`
    : `${exported} ${count} images could not be found and were not included.`
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

/**
 * Wires the Data block of the browser menu (PRODUCT §24.3). The archive is produced in a worker;
 * this thread only flushes pending edits, appends transferred chunks to a Blob and starts the
 * download, so its work does not grow with the size of the notes or images.
 */
export function installDataMenu(store: EditorStore, menu: HTMLElement): void {
  const exportButton = document.getElementById('data-export') as HTMLButtonElement
  const panel = activityPanel()
  let running = false
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  const locked = () => {
    const state = store.getSnapshot()
    return state.status === 'ready' && state.persistenceLocked === true
  }
  menu.addEventListener('beforetoggle', (event) => {
    if ((event as ToggleEvent).newState === 'open') exportButton.disabled = running || locked()
  })

  exportButton.onclick = async () => {
    menu.hidePopover()
    if (running || locked()) return
    running = true
    clearTimeout(hideTimer)
    // Ends this run; messages that a terminated worker queued earlier are ignored.
    let active = true
    let worker: Worker | undefined
    const finish = () => {
      active = false
      running = false
      worker?.terminate()
    }
    const cancel = () => {
      finish()
      panel.hide()
    }
    const fail = (message: string) => {
      finish()
      panel.show(`Export failed. ${message}`, 'OK', () => panel.hide())
    }
    panel.show(exportProgressText(0, 0), 'Cancel', cancel)
    try {
      await store.flushPersistence()
    } catch (error) {
      if (active)
        fail(`Your latest changes could not be saved: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (!active) return

    const fileName = archiveFileName(new Date())
    let archive = new Blob([], { type: 'application/zip' })
    try {
      worker = new Worker(new URL('./workers/archive.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      fail('The export stopped unexpectedly.')
      return
    }
    worker.onerror = (event) => {
      event.preventDefault()
      if (active) fail('The export stopped unexpectedly.')
    }
    worker.onmessageerror = () => {
      if (active) fail('The export stopped unexpectedly.')
    }
    worker.onmessage = (event: MessageEvent<ArchiveWorkerMessage>) => {
      if (!active) return
      const message = event.data
      if (message.type === 'chunk') {
        archive = new Blob([archive, message.chunk], { type: 'application/zip' })
      } else if (message.type === 'progress') {
        panel.show(exportProgressText(message.imagesDone, message.imageCount), 'Cancel', cancel)
      } else if (message.type === 'error') {
        fail(message.message)
      } else {
        finish()
        download(archive, fileName)
        panel.show(exportResultText(fileName, message.summary), 'OK', () => panel.hide())
        if (message.summary.missingImageCount === 0) {
          hideTimer = setTimeout(() => panel.hide(), SUCCESS_MESSAGE_MILLISECONDS)
        }
      }
    }
    worker.postMessage({ type: 'export' } satisfies ArchiveWorkerRequest)
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
