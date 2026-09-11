import type { PersistedEditorState } from '../domain/document'

export const ipcChannels = {
  load: 'tree:load',
  save: 'tree:save',
  readClipboard: 'tree:read-clipboard',
  writeAttachment: 'tree:write-attachment',
  hasAttachment: 'tree:has-attachment',
  readAttachment: 'tree:read-attachment',
  cleanupAttachments: 'tree:cleanup-attachments',
} as const

export type ClipboardPayload = { kind: 'text'; text: string } | { kind: 'image'; png: Uint8Array }

export interface TreeApi {
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  readClipboard(): Promise<ClipboardPayload>
  writeAttachment(id: string, png: Uint8Array): Promise<void>
  hasAttachment(id: string): Promise<boolean>
  readAttachment(id: string): Promise<Uint8Array | null>
  cleanupAttachments(referencedIds: string[]): Promise<void>
}
