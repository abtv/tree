import type { AttachmentId, Document, Location, NodeId, PersistedEditorState } from '../domain/document'
import type { ClipboardContent, ClipboardPayload, ClipboardWritePayload } from '../shared/ipc'
import type { AttachmentDimensions } from '../domain/attachment-dimensions'
import type { ExpansionState } from './expansion-state'
import type { DayNumber } from '../domain/calendar-date'
import type { AgendaState } from './agenda-state'

export type ClipboardValue = ClipboardPayload

/** Opening the notes must finish a committed replacement before another archive can replace them. */
export class NotesRecoveryRequiredError extends Error {}

export interface EditorServices {
  /** A cut or paste can still change the document after its platform I/O finishes. */
  onPendingEditsChanged?(pending: boolean): void
  imageToText?(attachmentId: AttachmentId): Promise<string[]>
  loadEmojiHistory?(): Promise<unknown>
  saveEmojiHistory?(names: readonly string[]): Promise<void>
  today?(): DayNumber
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  readClipboard(): Promise<ClipboardValue>
  writeClipboard?: (payload: ClipboardWritePayload) => Promise<void>
  writeClipboardContent?: (payload: ClipboardContent) => Promise<void>
  writeAttachment(id: AttachmentId, png: Uint8Array): Promise<void>
  /** Reads the PNG header sizes of up to `MAX_ATTACHMENT_SIZE_BATCH` attachments; null when unreadable. */
  readAttachmentDimensions?(ids: readonly AttachmentId[]): Promise<Array<AttachmentDimensions | null>>
  cleanupAttachments(referencedIds: AttachmentId[]): Promise<void>
}

export interface Clock {
  setTimeout(callback: () => void, milliseconds: number): unknown
  clearTimeout(handle: unknown): void
}

export interface FocusIntent {
  /** Reveal the caret line when arriving at a read-only projected row. */
  readonly revealLine?: boolean
  /** Going back: place the row at this distance from the top of the window (`docs/PRODUCT.md` §7.1). */
  readonly returnRowTop?: number
  nodeId: NodeId
  cursor: number
  token: number
}

export type EditorSnapshot =
  | { status: 'loading' }
  | { status: 'error'; message: string; notesRecoveryRequired?: true; operationError?: string }
  | {
      status: 'ready'
      document: Document
      location: Location
      focus: FocusIntent
      structuralVersion: number
      expansion: ExpansionState
      agenda?: AgendaState
      saveError?: string
      operationError?: string
      persistenceLocked?: boolean
      quitWithoutSavingPrompt?: boolean
    }

export const systemClock: Clock = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}
