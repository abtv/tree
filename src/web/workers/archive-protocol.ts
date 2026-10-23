import type { NotesArchiveSummary } from '../../application/notes-archive/export-notes'
import type { IncomingNotes, NotesCounts } from '../../application/notes-archive/import-notes'

/**
 * Messages between the page and the archive worker. The page sends only commands and the chosen
 * file; the worker reads and writes the stored notes itself, so no message carries the document
 * as an object (ADR 0022).
 */
export type ArchiveWorkerRequest =
  | { readonly type: 'export' }
  | { readonly type: 'import'; readonly file: Blob }
  | { readonly type: 'restore'; readonly folder: FileSystemDirectoryHandle }
  /** Replaces the stored head with the prepared document; valid only after `prepared`. */
  | { readonly type: 'commit-import' }

export type ArchiveWorkerMessage =
  | { readonly type: 'progress'; readonly imagesDone: number; readonly imageCount: number }
  /** Archive bytes in order; the buffer is transferred, not copied. */
  | { readonly type: 'chunk'; readonly chunk: ArrayBuffer }
  | { readonly type: 'done'; readonly summary: NotesArchiveSummary }
  | {
      readonly type: 'prepared'
      readonly incoming: IncomingNotes
      readonly current: NotesCounts | 'none' | 'invalid'
      readonly sourceBytes?: number
    }
  | { readonly type: 'committed' }
  | { readonly type: 'error'; readonly message: string }

export type ArchiveWorkerPost = (message: ArchiveWorkerMessage, transfer?: Transferable[]) => void
