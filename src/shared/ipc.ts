import type { PersistedEditorState } from '../domain/document'
import type { LinkRange } from '../domain/document'

export const ipcChannels = {
  quit: 'tree:quit',
  load: 'tree:load',
  save: 'tree:save',
  readClipboard: 'tree:read-clipboard',
  writeClipboard: 'tree:write-clipboard',
  writeAttachment: 'tree:write-attachment',
  hasAttachment: 'tree:has-attachment',
  readAttachment: 'tree:read-attachment',
  cleanupAttachments: 'tree:cleanup-attachments',
} as const

export type ClipboardPayload = { kind: 'text'; text: string; links?: LinkRange[] } | { kind: 'image'; png: Uint8Array }

export interface ClipboardWritePayload {
  text: string
  html: string
}

export interface TreeApi {
  quit(requestId?: string): Promise<void>
  onQuitRequested(listener: (requestId: string) => void): () => void
  onQuitFailed(listener: (message: string) => void): () => void
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  readClipboard(): Promise<ClipboardPayload>
  writeClipboard?: (payload: ClipboardWritePayload) => Promise<void>
  writeAttachment(id: string, png: Uint8Array): Promise<void>
  hasAttachment(id: string): Promise<boolean>
  readAttachment(id: string): Promise<Uint8Array | null>
  cleanupAttachments(referencedIds: string[]): Promise<void>
}
