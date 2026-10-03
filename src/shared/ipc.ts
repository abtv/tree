import type { PersistedEditorState } from '../domain/document'
import type { LinkRange } from '../domain/document'

export const ipcChannels = {
  quit: 'tree:quit',
  quitWithoutSaving: 'tree:quit-without-saving',
  load: 'tree:load',
  save: 'tree:save',
  readClipboard: 'tree:read-clipboard',
  writeClipboard: 'tree:write-clipboard',
  writeAttachment: 'tree:write-attachment',
  readAttachment: 'tree:read-attachment',
  cleanupAttachments: 'tree:cleanup-attachments',
  showEditorContextMenu: 'tree:show-editor-context-menu',
  getAlwaysOnTop: 'tree:get-always-on-top',
  setAlwaysOnTop: 'tree:set-always-on-top',
  getVimEnabled: 'tree:get-vim-enabled',
  setVimEnabled: 'tree:set-vim-enabled',
} as const

/** Main-to-renderer notifications that the application menu changed a preference. */
export const ipcEvents = {
  alwaysOnTopChanged: 'tree:always-on-top-changed',
  vimEnabledChanged: 'tree:vim-enabled-changed',
} as const

export type ClipboardPayload =
  { kind: 'text'; text: string; links?: readonly LinkRange[] } | { kind: 'image'; png: Uint8Array }

export interface ClipboardWritePayload {
  text: string
  html: string
}

export interface EditorContextMenuRequest {
  x: number
  y: number
  selectionText: string
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  canSelectAll: boolean
}

export type EditorContextMenuCommand = 'cut' | 'copy' | 'paste' | 'selectAll' | null

export interface TreeApi {
  quit(requestId?: string): Promise<void>
  quitWithoutSaving(): Promise<void>
  onQuitRequested(listener: (requestId: string) => void): () => void
  onQuitFailed(listener: (message: string) => void): () => void
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  readClipboard(): Promise<ClipboardPayload>
  writeClipboard?: (payload: ClipboardWritePayload) => Promise<void>
  writeAttachment(id: string, png: Uint8Array): Promise<void>
  readAttachment(id: string): Promise<Uint8Array | null>
  cleanupAttachments(referencedIds: string[]): Promise<void>
  showEditorContextMenu?: (request: EditorContextMenuRequest) => Promise<EditorContextMenuCommand>
  getAlwaysOnTop(): Promise<boolean>
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>
  getVimEnabled(): Promise<boolean>
  setVimEnabled(vimEnabled: boolean): Promise<void>
  /** Fires when the application menu changes the setting, so the renderer can follow it. */
  onAlwaysOnTopChanged?: (listener: (alwaysOnTop: boolean) => void) => () => void
  onVimEnabledChanged?: (listener: (vimEnabled: boolean) => void) => () => void
}
