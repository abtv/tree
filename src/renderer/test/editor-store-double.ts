import { vi } from 'vitest'
import type { EditorSnapshot, EditorStore, FocusIntent } from '../../application/editor-store'
import type { Document, Location } from '../../domain/document'
import { displayedNodes } from '../../domain/document'
import { COLLAPSED_EXPANSION_STATE, isNodeExpanded } from '../../application/expansion-state'
import { buildVisibleRows } from '../../application/visible-rows'

/** The public surface of `EditorStore`, without the class's private branding. */
export type EditorStorePublic = { [K in keyof EditorStore]: EditorStore[K] }

/**
 * A snapshot the double may return.
 *
 * It mirrors `EditorSnapshot` but leaves the ready-state fields optional: a focused renderer test
 * exercises one handler path, and the unchecked literals this double replaces supplied only the
 * fields that path reads. In particular, omitting `focus` models "no focus token yet", which is
 * distinct from any fabricated token, and handler paths branch on that difference.
 */
export type EditorStoreSnapshotInput =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      document?: Document
      location?: Location
      focus?: FocusIntent
      structuralVersion?: number
      expansion?: import('../../application/expansion-state').ExpansionState
      agenda?: import('../../application/agenda-state').AgendaState
      saveError?: string
      operationError?: string
      persistenceLocked?: boolean
      quitWithoutSavingPrompt?: boolean
    }

export type EditorStoreDoubleOptions = Omit<Partial<EditorStorePublic>, 'getSnapshot'> & {
  /**
   * The state `getSnapshot` returns. A function is called on every read, so a test can present
   * state it mutates elsewhere. The value is passed through unchanged rather than normalized.
   */
  snapshot?: EditorStoreSnapshotInput | (() => EditorStoreSnapshotInput)
}

const defaultSnapshot: EditorStoreSnapshotInput = { status: 'loading' }

/**
 * The single test double for `EditorStore`.
 *
 * Every public member is supplied, because the production renderer always passes the real store and
 * a double that omits one makes the suite exercise a path the application never takes. The typed
 * object below fails `npm run typecheck` when a member is added, removed, or renamed on
 * `EditorStore`, so this double cannot silently drift from the class the way the
 * `as unknown as EditorStore` literals it replaces could.
 *
 * Overrides keep the exact mock a test previously wrote; unset members stay benign `vi.fn` spies.
 * `EditorStore` is a class with private state, so no structural object is assignable to it; the
 * final assertion is the one place the nominal gap is crossed, and the typed literal above is what
 * keeps the crossing honest.
 */
export function createEditorStoreDouble(options: EditorStoreDoubleOptions = {}): EditorStore {
  const { snapshot = defaultSnapshot, ...overrides } = options
  const getSnapshot = vi.fn(
    (): EditorSnapshot => (typeof snapshot === 'function' ? snapshot() : snapshot) as EditorSnapshot,
  )

  const double: EditorStorePublic = {
    openAgenda: vi.fn(),
    closeAgenda: vi.fn(),
    applyAgenda: vi.fn(),
    createAgendaDayNode: vi.fn(() => true),
    splitAgendaNode: vi.fn(() => true),
    createAgendaSibling: vi.fn(() => true),
    moveAgendaOccurrences: vi.fn(() => true),
    getAgendaRows: vi.fn(() => []),
    getSnapshot,
    subscribe: vi.fn(() => () => undefined),
    getVisibleRows: vi.fn(() => {
      const value = getSnapshot()
      return value.status === 'ready' && value.document !== undefined && value.location !== undefined
        ? buildVisibleRows(
            displayedNodes(value.document, value.location.currentParentId),
            (id) => isNodeExpanded(value.expansion ?? COLLAPSED_EXPANSION_STATE, id),
            value.location.currentParentId,
          )
        : []
    }),
    getRestoredSelectedRowTop: vi.fn(() => undefined),
    registerSelectedRowTopReader: vi.fn(() => () => undefined),
    noteViewportChange: vi.fn(),
    toggleExpansion: vi.fn(),
    applyFold: vi.fn(),
    registerPendingEditFinisher: vi.fn(() => () => undefined),
    flushPersistence: vi.fn(async () => {}),
    reportError: vi.fn(),
    requestQuitWithoutSavingPrompt: vi.fn(),
    dismissQuitWithoutSavingPrompt: vi.fn(),
    initialize: vi.fn(async () => {}),
    selectNode: vi.fn(),
    editText: vi.fn(),
    editContent: vi.fn(),
    replaceTextRange: vi.fn(),
    replaceTextRanges: vi.fn(),
    deleteLink: vi.fn(() => false),
    copy: vi.fn(async () => false),
    copyVimContent: vi.fn(async () => false),
    copyVimForest: vi.fn(async () => false),
    cut: vi.fn(async () => false),
    endTextSession: vi.fn(),
    markNextTextEditStandalone: vi.fn(),
    moveSelection: vi.fn(),
    moveSelectionBoundary: vi.fn(),
    moveHorizontal: vi.fn(() => false),
    enter: vi.fn(),
    leave: vi.fn(),
    navigateToAncestor: vi.fn(),
    createSiblingOrFirstChild: vi.fn(),
    createSibling: vi.fn(() => false),
    createChild: vi.fn(() => false),
    createSiblingWithText: vi.fn(),
    createChildWithText: vi.fn(),
    deleteSelected: vi.fn(() => false),
    deleteSiblingRange: vi.fn(() => undefined),
    pasteSubtree: vi.fn(() => false),
    pasteNodeForest: vi.fn(() => false),
    applyNodeVisual: vi.fn(() => undefined),
    shiftNodeVisual: vi.fn(() => false),
    canShiftNodeVisualOutWithinCurrentParent: vi.fn(() => true),
    joinNodes: vi.fn(() => false),
    toggleStrikethrough: vi.fn(() => false),
    deleteEmptySelected: vi.fn(),
    moveSelectedTo: vi.fn(),
    moveNodeTo: vi.fn(),
    moveNodeToParent: vi.fn(() => false),
    paste: vi.fn(async () => {}),
    undo: vi.fn(),
    redo: vi.fn(),
  }

  Object.assign(double, overrides)

  return double as EditorStore
}
