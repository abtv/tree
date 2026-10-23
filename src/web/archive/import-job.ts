import { NotesArchiveError } from '../../application/notes-archive/archive-policy'
import {
  prepareNotesImport,
  prepareNotesFromSource,
  summarizeStoredNotes,
  type ImportImageStore,
  type PreparedNotesImport,
  type NotesImportSource,
} from '../../application/notes-archive/import-notes'
import type { ArchiveFile } from '../../application/notes-archive/zip-reader'
import { createInflater } from '../../infrastructure/archive/zip-inflate'
import type { ArchiveWorkerPost } from '../workers/archive-protocol'

export interface ImportJobStorage extends ImportImageStore {
  readHead(): Promise<unknown>
  /** Replaces the stored head in one transaction. */
  writeHead(head: unknown): Promise<void>
}

export interface ImportJob {
  prepare(file: ArchiveFile | NotesImportSource): Promise<void>
  commit(): Promise<void>
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function importFailureMessage(error: unknown, fromFolder = false): string {
  if (error instanceof NotesArchiveError) return error.message
  return fromFolder
    ? `The notes could not be restored: ${reason(error)}`
    : `The archive could not be imported: ${reason(error)}`
}

/**
 * Runs one import inside the archive worker (PRODUCT §24.4): `prepare` validates the archive and
 * stages its images, then reports both note counts; `commit` replaces the stored head. A failed
 * commit removes the staged images, so the current notes stay as they were.
 */
export function createImportJob(
  storage: ImportJobStorage,
  validateImage: (bytes: Uint8Array) => Promise<void>,
  post: ArchiveWorkerPost,
): ImportJob {
  let prepared: PreparedNotesImport | undefined
  return {
    async prepare(file) {
      let reportedPercent = -1
      try {
        const ports = {
          createInflater,
          validateImage,
          images: storage,
          onProgress: ({ imagesDone, imageCount }: { imagesDone: number; imageCount: number }) => {
            const percent = imageCount === 0 ? 100 : Math.floor((imagesDone * 100) / imageCount)
            if (percent === reportedPercent) return
            reportedPercent = percent
            post({ type: 'progress', imagesDone, imageCount })
          },
        }
        prepared =
          'readDocument' in file ? await prepareNotesFromSource(file, ports) : await prepareNotesImport(file, ports)
        // Counted last, so the comparison includes edits saved while the archive was checked.
        const current = summarizeStoredNotes(await storage.readHead())
        const { nodeCount, imageCount, missingImageCount } = prepared
        post({
          type: 'prepared',
          incoming: { nodeCount, imageCount, missingImageCount },
          current,
          ...('readDocument' in file && file.size !== undefined ? { sourceBytes: file.size } : {}),
        })
      } catch (error) {
        post({ type: 'error', message: importFailureMessage(error, 'readDocument' in file) })
      }
    },
    async commit() {
      if (prepared === undefined) return
      try {
        await storage.writeHead(prepared.head)
        post({ type: 'committed' })
      } catch (error) {
        await storage.removeImages(prepared.stagedIds).catch(() => {})
        post({ type: 'error', message: `Your notes could not be replaced: ${reason(error)}` })
      }
    },
  }
}
