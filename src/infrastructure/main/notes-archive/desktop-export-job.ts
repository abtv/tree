import { readFileSync, writeSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { collectAttachmentIds, validatePersistedState } from '../../../domain/document'
import { archiveNotSavedMessage, exportFailureMessage } from '../../../application/notes-archive/archive-messages'
import { NotesArchiveError } from '../../../application/notes-archive/archive-policy'
import {
  INVALID_NOTES_MESSAGE,
  exportNotesArchive,
  type NotesArchiveSource,
} from '../../../application/notes-archive/export-notes'
import { createZipWriter } from '../../archive/zip-writer'
import { findNewestValidDocument } from '../file-services'
import type { ArchiveWorkerChannel, ArchiveWorkerTask } from './archive-worker-protocol'

type ExportTask = Extract<ArchiveWorkerTask, { type: 'export' }>

/**
 * Runs one desktop export inside the archive worker: writes the newest stored version that opens
 * (PRODUCT §16.1) from the snapshot to the temporary file, flushes it and reports `written`. The
 * main process renames the file into place, so an export that fails or is cancelled leaves none.
 */
export async function runDesktopExport(task: ExportTask, channel: ArchiveWorkerChannel): Promise<void> {
  // A FileHandle, unlike a bare descriptor, is closed when the main process terminates the worker.
  let output: FileHandle | undefined
  try {
    const newest = await findNewestValidDocument(task.snapshotDirectory)
    const source: NotesArchiveSource = {
      async readHead() {
        if (newest === null) return undefined
        if ('error' in newest) throw new NotesArchiveError(INVALID_NOTES_MESSAGE)
        let ids: string[]
        try {
          ids = [...collectAttachmentIds(validatePersistedState(newest.value).document)]
        } catch {
          throw new NotesArchiveError(INVALID_NOTES_MESSAGE)
        }
        // Pinned before any image is read, so attachment cleanup cannot remove one meanwhile.
        await channel.request({ type: 'pin', ids })
        // Opened only for valid notes, so an export refused here creates no file.
        try {
          output = await open(task.temporaryPath, 'wx')
        } catch (error) {
          throw new NotesArchiveError(archiveNotSavedMessage(error))
        }
        return newest.value
      },
      async readImage(id) {
        try {
          return readFileSync(join(task.attachmentsDirectory, `${id}.png`))
        } catch (error) {
          if (isNotFound(error)) return undefined
          throw error
        }
      },
    }
    const writer = createZipWriter((chunk) => {
      try {
        if (output === undefined) throw new Error('The archive file is not open.')
        writeFully(output.fd, chunk)
      } catch (error) {
        throw new NotesArchiveError(archiveNotSavedMessage(error))
      }
    })
    let reportedPercent = -1
    const summary = await exportNotesArchive(source, writer, ({ imagesDone, imageCount }) => {
      const percent = imageCount === 0 ? 100 : Math.floor((imagesDone * 100) / imageCount)
      if (percent === reportedPercent) return
      reportedPercent = percent
      channel.post({ type: 'progress', imagesDone, imageCount })
    })
    try {
      const file = output!
      output = undefined
      await file.sync()
      await file.close()
    } catch (error) {
      throw new NotesArchiveError(archiveNotSavedMessage(error))
    }
    channel.post({ type: 'written', summary })
  } catch (error) {
    // The main process removes the temporary file; the original failure is the one to report.
    await output?.close().catch(() => undefined)
    channel.post({ type: 'error', message: exportFailureMessage(error) })
  }
}

function writeFully(descriptor: number, bytes: Uint8Array): void {
  let offset = 0
  while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset)
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
