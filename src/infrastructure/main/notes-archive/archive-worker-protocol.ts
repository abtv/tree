import type { NotesArchiveSummary } from '../../../application/notes-archive/export-notes'
import type { IncomingNotes, NotesCounts } from '../../../application/notes-archive/import-notes'

/**
 * Messages between the main process and the desktop archive worker (ADR 0024). The main process
 * passes the paths it owns as `workerData`; the worker reads and writes those files itself, so no
 * message carries the document.
 */
export type ArchiveWorkerTask =
  | {
      readonly type: 'export'
      /** A snapshot of the document files (`snapshotDocuments`). */
      readonly snapshotDirectory: string
      readonly attachmentsDirectory: string
      /** The hidden sibling of the destination; the main process renames it when it is complete. */
      readonly temporaryPath: string
    }
  | {
      readonly type: 'import'
      readonly archivePath: string
      /** An empty staging directory with `attachments/` (`createStagingDirectory`). */
      readonly stagingDirectory: string
    }

/** Worker-to-main messages. A request is answered by exactly one reply before the worker continues. */
export type ArchiveWorkerMessage =
  | { readonly type: 'progress'; readonly imagesDone: number; readonly imageCount: number }
  /** Request: keep these images from attachment cleanup until the export ends; replied by `pinned`. */
  | { readonly type: 'pin'; readonly ids: readonly string[] }
  /** Request: decode one image with the platform decoder; replied by `image-validated`. */
  | { readonly type: 'validate-image'; readonly bytes: Uint8Array }
  /** Request: the archive is staged; replied by `count` with a snapshot of the current notes. */
  | { readonly type: 'staged' }
  /** Export: the temporary file is complete and flushed. */
  | { readonly type: 'written'; readonly summary: NotesArchiveSummary }
  /** Import: staging is complete. */
  | {
      readonly type: 'prepared'
      readonly fileBytes: number
      readonly incoming: IncomingNotes
      readonly current: NotesCounts | 'none' | 'invalid'
    }
  | { readonly type: 'error'; readonly message: string }

export type ArchiveWorkerReply =
  | { readonly type: 'pinned' }
  | { readonly type: 'image-validated'; readonly decodable: boolean }
  | { readonly type: 'count'; readonly snapshotDirectory: string }

/** Sends a message; a request's promise resolves with the main process's reply. */
export interface ArchiveWorkerChannel {
  post(message: ArchiveWorkerMessage): void
  request(message: ArchiveWorkerMessage): Promise<ArchiveWorkerReply>
}
