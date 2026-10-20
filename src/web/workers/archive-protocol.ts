import type { NotesArchiveSummary } from '../../application/notes-archive/export-notes'

/**
 * Messages between the page and the archive worker. The page sends only a command; the worker
 * reads the saved notes itself, so no message carries the document as an object (ADR 0022).
 */
export type ArchiveWorkerRequest = { readonly type: 'export' }

export type ArchiveWorkerMessage =
  | { readonly type: 'progress'; readonly imagesDone: number; readonly imageCount: number }
  /** Archive bytes in order; the buffer is transferred, not copied. */
  | { readonly type: 'chunk'; readonly chunk: ArrayBuffer }
  | { readonly type: 'done'; readonly summary: NotesArchiveSummary }
  | { readonly type: 'error'; readonly message: string }

export type ArchiveWorkerPost = (message: ArchiveWorkerMessage, transfer?: Transferable[]) => void
