import type { PersistedEditorState } from '../domain/document'
import type { LinkRange } from '../domain/document'
import type { NotesArchiveProgress, NotesArchiveSummary } from '../application/notes-archive/export-notes'
import type { IncomingNotes, NotesCounts } from '../application/notes-archive/import-notes'

/** Rejects saves and image writes after the notes were replaced, until the window reloads them. */
export const NOTES_REPLACED_MESSAGE = 'The notes were replaced. Reload the window to continue.'

export const ipcChannels = {
  quit: 'tree:quit',
  quitWithoutSaving: 'tree:quit-without-saving',
  load: 'tree:load',
  save: 'tree:save',
  readClipboard: 'tree:read-clipboard',
  writeClipboard: 'tree:write-clipboard',
  writeClipboardContent: 'tree:write-clipboard-content',
  writeAttachment: 'tree:write-attachment',
  readAttachment: 'tree:read-attachment',
  cleanupAttachments: 'tree:cleanup-attachments',
  showEditorContextMenu: 'tree:show-editor-context-menu',
  getAlwaysOnTop: 'tree:get-always-on-top',
  setAlwaysOnTop: 'tree:set-always-on-top',
  getVimEnabled: 'tree:get-vim-enabled',
  setVimEnabled: 'tree:set-vim-enabled',
  getAppearance: 'tree:get-appearance',
  setAppearance: 'tree:set-appearance',
  getCommandHistory: 'tree:get-command-history',
  getEmojiHistory: 'tree:get-emoji-history',
  setEmojiHistory: 'tree:set-emoji-history',
  setCommandHistory: 'tree:set-command-history',
  getRecentNodes: 'tree:get-recent-nodes',
  setRecentNodes: 'tree:set-recent-nodes',
  chooseNotesExportDestination: 'tree:notes-choose-export-destination',
  startNotesExport: 'tree:notes-start-export',
  chooseNotesImportArchive: 'tree:notes-choose-import-archive',
  prepareNotesImport: 'tree:notes-prepare-import',
  commitNotesImport: 'tree:notes-commit-import',
  cancelNotesOperation: 'tree:notes-cancel',
  takeNotesImportNotice: 'tree:notes-take-import-notice',
  showReplacedNotesFolder: 'tree:notes-show-replaced-folder',
  setNotesMenuState: 'tree:notes-set-menu-state',
} as const

/** Main-to-renderer notifications: menu commands, preference changes and notes archive progress. */
export const ipcEvents = {
  alwaysOnTopChanged: 'tree:always-on-top-changed',
  vimEnabledChanged: 'tree:vim-enabled-changed',
  appearanceChanged: 'tree:appearance-changed',
  notesProgress: 'tree:notes-progress',
  notesMenuCommand: 'tree:notes-menu-command',
  viewMenuCommand: 'tree:view-menu-command',
  findMenuCommand: 'tree:find-menu-command',
} as const

/** A notes operation that ended without a result: the user cancelled it or Tree quit. */
export interface NotesOperationCanceled {
  readonly ok: false
  readonly canceled: true
}

export interface NotesOperationFailed {
  readonly ok: false
  readonly canceled?: false
  /** The reason, without the `Export failed.` or `Import failed.` prefix. */
  readonly message: string
}

/** Only the chosen file's name crosses IPC; the main process keeps its path (ADR 0024). */
export type NotesFileChoice = { readonly ok: true; readonly fileName: string } | NotesOperationCanceled

export type NotesExportResult =
  | { readonly ok: true; readonly fileName: string; readonly summary: NotesArchiveSummary }
  | NotesOperationCanceled
  | NotesOperationFailed

export type NotesImportPreparation =
  | {
      readonly ok: true
      readonly fileName: string
      readonly fileBytes: number
      readonly incoming: IncomingNotes
      readonly current: NotesCounts | 'none' | 'invalid'
    }
  | NotesOperationCanceled
  | NotesOperationFailed

export type NotesImportCommit =
  | { readonly ok: true }
  | NotesOperationCanceled
  | (NotesOperationFailed & {
      /** The replacement passed its journal: only a restart can complete it (ADR 0024). */
      readonly restartRequired: boolean
    })

/** The result of a replacement that finished, shown once after the window reloads. */
export interface NotesImportNotice {
  /** Absent when the replacement was completed from an older journal that did not record it. */
  readonly fileName?: string
  /** The Replaced Notes folder as display text, or null when there were no previous notes. */
  readonly replacedFolder: string | null
}

export type { NotesArchiveProgress }

export interface NotesMenuState {
  readonly canExport: boolean
  readonly canImport: boolean
}
export type NotesMenuCommand = 'export' | 'import'
export type ViewMenuCommand = 'tree' | 'agenda'
export type FindMenuCommand = 'find' | 'next' | 'previous' | 'all'

export type ClipboardPayload =
  { kind: 'text'; text: string; links?: readonly LinkRange[] } | { kind: 'image'; png: Uint8Array }

export interface ClipboardWritePayload {
  text: string
  html: string
}

export type ClipboardContent = { kind: 'text'; text: string } | { kind: 'image'; attachmentId: string }

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
  getRecentNodes?: () => Promise<string[]>
  setRecentNodes?: (value: readonly string[]) => Promise<void>
  getAppearance: () => Promise<'system' | 'light' | 'dark'>
  setAppearance: (value: 'system' | 'light' | 'dark') => Promise<void>
  getCommandHistory: () => Promise<string[]>
  getEmojiHistory?: () => Promise<string[]>
  setEmojiHistory?: (value: readonly string[]) => Promise<void>
  setCommandHistory: (value: string[]) => Promise<void>
  onAppearanceChanged?: (listener: (value: 'system' | 'light' | 'dark') => void) => () => void
  quit(requestId?: string): Promise<void>
  quitWithoutSaving(): Promise<void>
  onQuitRequested(listener: (requestId: string) => void): () => void
  onQuitFailed(listener: (message: string) => void): () => void
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  readClipboard(): Promise<ClipboardPayload>
  writeClipboard?: (payload: ClipboardWritePayload) => Promise<void>
  writeClipboardContent?: (payload: ClipboardContent) => Promise<void>
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
  onViewMenuCommand?: (listener: (command: ViewMenuCommand) => void) => () => void
  onFindMenuCommand?: (listener: (command: FindMenuCommand) => void) => () => void
  /** Notes export and import (PRODUCT §25); one operation runs at a time. */
  chooseNotesExportDestination?: () => Promise<NotesFileChoice>
  startNotesExport?: () => Promise<NotesExportResult>
  chooseNotesImportArchive?: () => Promise<NotesFileChoice>
  prepareNotesImport?: () => Promise<NotesImportPreparation>
  commitNotesImport?: () => Promise<NotesImportCommit>
  /** Ends the running or prepared operation; its pending request resolves as cancelled. */
  cancelNotesOperation?: () => Promise<void>
  takeNotesImportNotice?: () => Promise<NotesImportNotice | null>
  showReplacedNotesFolder?: () => Promise<void>
  onNotesProgress?: (listener: (progress: NotesArchiveProgress) => void) => () => void
  setNotesMenuState?: (state: NotesMenuState) => Promise<void>
  onNotesMenuCommand?: (listener: (command: NotesMenuCommand) => void) => () => void
}
