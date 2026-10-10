import type { EditorStore } from '../application/editor-store'
import { moveSelectionBoundaryTransition } from '../application/editor-command-transitions'
import { requireNode, type TreeNode } from '../domain/document'
import { setCaret, setEditableText } from './editor-dom'
import type { NodeVisualSelection, PendingCaret } from './node-input-types'
import type { VimCaretState } from './vim-caret-transition'
import {
  beginStructuralChildOpen,
  beginStructuralOpen,
  swapNodeVisual,
  type VimCommandState,
} from './vim-command-state'
import { applyReplaceKey, beginInsertSession, beginReplaceSession, type VimEditSessionState } from './vim-edit-session'
import type { VimKeyboardState } from './vim-keyboard-types'
import { rememberNodeRange } from './vim-visual-memory'
import { firstNonWhitespace } from './vim-editing'

interface VimKeyboardStateDeps {
  store: EditorStore
  vimMode: VimKeyboardState['mode']
  registerHandle: VimKeyboardState['register']
  commandState: VimCommandState
  session: VimEditSessionState
  readAuthority: () => { nodeId?: string; caret: VimCaretState }
  finishVimInsert: VimKeyboardState['finishInsert']
  finishVimReplace: VimKeyboardState['finishReplace']
  applyCaretState: VimKeyboardState['applyCaretState']
  syncImageCaretToFocus: VimKeyboardState['syncImageCaretToFocus']
  moveVimViewport: VimKeyboardState['moveViewport']
  changeVimMode: VimKeyboardState['setMode']
  onPreviewAttachment: VimKeyboardState['openAttachment']
  schedulePendingCaret: (pending: Pick<PendingCaret, 'nodeId' | 'input' | 'cursor'>) => void
  nodeVisualSelection: NodeVisualSelection | undefined
  setNodeVisualSelection: (selection: NodeVisualSelection | undefined) => void
  moveNodeVisual: VimKeyboardState['nodeVisual']['move']
  commandNodeVisual: VimKeyboardState['nodeVisual']['command']
  shiftNodeVisual: VimKeyboardState['nodeVisual']['shift']
  joinNodeVisual: VimKeyboardState['nodeVisual']['join']
  shiftCurrentNode: VimKeyboardState['shiftCurrentNode']
  restoreVisual: VimKeyboardState['restoreVisual']
  verticalOperator: VimKeyboardState['verticalOperator']
  repeatStructural: VimKeyboardState['repeatStructural']
  onFoldCommand: VimKeyboardState['fold']
}

export function createVimKeyboardState(deps: VimKeyboardStateDeps, node: TreeNode): VimKeyboardState {
  const {
    store,
    vimMode,
    registerHandle,
    commandState,
    session,
    readAuthority,
    finishVimInsert,
    finishVimReplace,
    applyCaretState,
    syncImageCaretToFocus,
    moveVimViewport,
    changeVimMode,
    onPreviewAttachment,
    schedulePendingCaret,
    nodeVisualSelection,
    setNodeVisualSelection,
    moveNodeVisual,
    commandNodeVisual,
    shiftNodeVisual,
    joinNodeVisual,
    shiftCurrentNode,
    restoreVisual,
    verticalOperator,
    repeatStructural,
    onFoldCommand,
  } = deps
  return {
    mode: vimMode,
    register: registerHandle,
    get commandState(): VimCommandState {
      return commandState
    },
    beginInsert: (nodeId, baseline, position, change) => {
      beginInsertSession(session, { nodeId, baseline, position, change })
    },
    finishInsert: finishVimInsert,
    beginReplace: (nodeId, _input, baseline, position) => {
      beginReplaceSession(session, { nodeId, baseline, position })
    },
    handleReplaceKey: (input, key) => {
      const result = applyReplaceKey(session.replace, key)
      if (result === undefined) return false
      setEditableText(input, result.workingText)
      setCaret(input, result.cursor)
      return true
    },
    finishReplace: (input, retreatCursor, preserveDomSelection) => {
      return finishVimReplace(input, retreatCursor, preserveDomSelection)
    },
    imageTextCursor: {
      get current() {
        return readAuthority().caret.imageTextReturnCursor
      },
      set current(value: number | undefined) {
        const authority = readAuthority()
        if (authority.nodeId !== undefined)
          applyCaretState(
            authority.nodeId,
            { ...authority.caret, imageTextReturnCursor: value },
            false,
            'preserve-selection',
          )
      },
    },
    getCaretState: (nodeId, cursor, imageActive) =>
      readAuthority().nodeId === nodeId
        ? { ...readAuthority().caret, cursor }
        : { cursor, imageActive, imageTextReturnCursor: undefined },
    applyCaretState,
    moveBoundary: (boundary, cursor, count) => {
      const state = store.getSnapshot()
      if (state.status !== 'ready') return
      const target = moveSelectionBoundaryTransition(
        state.document,
        state.location,
        store.getVisibleRows(),
        boundary,
        cursor,
        count,
      )
      if (target === undefined) return
      const destination = requireNode(state.document, target.nodeId).node
      store.selectNode(target.nodeId, firstNonWhitespace(destination.text))
      syncImageCaretToFocus()
    },
    moveViewport: moveVimViewport,
    syncImageCaretToFocus,
    setMode: changeVimMode,
    openAttachment: onPreviewAttachment,
    setImageCaret: (nodeId, active, fromFocus) => {
      const snapshot = store.getSnapshot()
      if (snapshot.status !== 'ready') return
      const target = requireNode(snapshot.document, nodeId).node
      applyCaretState(
        nodeId,
        {
          cursor: active
            ? target.text.length
            : Math.min(readAuthority().caret.cursor, Math.max(0, target.text.length - 1)),
          imageActive: active,
          imageTextReturnCursor: active ? readAuthority().caret.imageTextReturnCursor : undefined,
        },
        fromFocus,
      )
    },
    scheduleCaret: (input, cursor) => {
      schedulePendingCaret({
        nodeId: node.id,
        input,
        cursor,
      })
    },
    nodeVisual: {
      enter: (nodeId) => {
        const state = store.getSnapshot()
        if (state.status !== 'ready' || state.location.currentParentId === nodeId) return false
        if (
          state.agenda !== undefined &&
          (state.agenda.pinnedOccurrence !== undefined || state.agenda.activeOccurrence?.nodeId !== nodeId)
        )
          return false
        setNodeVisualSelection({ anchorId: nodeId, focusId: nodeId })
        if (state.agenda === undefined) rememberNodeRange(commandState, state.document, nodeId, nodeId)
        return true
      },
      move: moveNodeVisual,
      swap: () => {
        if (nodeVisualSelection !== undefined) {
          setNodeVisualSelection({
            anchorId: nodeVisualSelection.focusId,
            focusId: nodeVisualSelection.anchorId,
          })
          const state = store.getSnapshot()
          if (state.status === 'ready' && state.agenda !== undefined) {
            const day = state.agenda.activeOccurrence?.day
            if (day !== undefined) {
              store.applyAgenda({ kind: 'select', key: `node:${day}:${nodeVisualSelection.anchorId}` })
              syncImageCaretToFocus()
            }
          } else swapNodeVisual(commandState)
        }
      },
      exit: () => setNodeVisualSelection(undefined),
      command: commandNodeVisual,
      shift: shiftNodeVisual,
      join: joinNodeVisual,
      selection: () => nodeVisualSelection,
    },
    shiftCurrentNode,
    restoreVisual,
    verticalOperator,
    beginStructuralOpen: (position) => {
      beginStructuralOpen(commandState, node.id, position)
    },
    beginStructuralChildOpen: () => {
      beginStructuralChildOpen(commandState, node.id)
    },
    repeatStructural,
    fold: onFoldCommand,
  }
}
