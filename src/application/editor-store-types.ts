import type { AttachmentId, Document, Location, NodeId, PersistedEditorState } from '../domain/document'
import type { ClipboardPayload, ClipboardWritePayload } from '../shared/ipc'
import type { ExpansionState } from './expansion-state'

export type ClipboardValue = ClipboardPayload

export interface EditorServices {
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  readClipboard(): Promise<ClipboardValue>
  writeClipboard?: (payload: ClipboardWritePayload) => Promise<void>
  writeAttachment(id: AttachmentId, png: Uint8Array): Promise<void>
  cleanupAttachments(referencedIds: AttachmentId[]): Promise<void>
}

export interface Clock {
  setTimeout(callback: () => void, milliseconds: number): unknown
  clearTimeout(handle: unknown): void
}

export interface FocusIntent {
  nodeId: NodeId
  cursor: number
  token: number
}

export type EditorSnapshot =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      document: Document
      location: Location
      focus: FocusIntent
      structuralVersion: number
      expansion: ExpansionState
      saveError?: string
      operationError?: string
      persistenceLocked?: boolean
      quitWithoutSavingPrompt?: boolean
    }

export const systemClock: Clock = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}
