import type { EditorStore } from '../application/editor-store'
import { locateNode } from '../domain/document'
import { isNodeExpanded } from '../application/expansion-state'
import type { NodeVisualSelection, PendingVisualSelection } from './node-input-types'
import type { VimCommandState } from './vim-command-state'
import { rememberNodeRange, resolveVisualMemory } from './vim-visual-memory'
import type { VimMode } from './vim-editing'

interface RestoreVisualDeps {
  store: EditorStore
  commandState: VimCommandState
  setNodeVisualSelection: (selection: NodeVisualSelection | undefined) => void
  changeVimMode: (mode: VimMode) => void
  syncImageCaretToFocus: () => void
  schedulePendingVisualSelection: (selection: PendingVisualSelection) => void
}

export function restoreVisual(deps: RestoreVisualDeps): void {
  const {
    store,
    commandState,
    setNodeVisualSelection,
    changeVimMode,
    syncImageCaretToFocus,
    schedulePendingVisualSelection,
  } = deps
  const state = store.getSnapshot()
  if (state.status !== 'ready') return
  const restore = resolveVisualMemory(commandState.lastVisual, state.document, state.location, (id) =>
    isNodeExpanded(state.expansion, id),
  )
  if (restore === undefined) return
  if (restore.kind === 'nodes') {
    setNodeVisualSelection({ anchorId: restore.anchorId, focusId: restore.focusId })
    store.selectNode(restore.focusId, 0)
    changeVimMode('visual-node')
    syncImageCaretToFocus()
    return
  }
  const start = Math.min(restore.anchor, restore.focus)
  store.selectNode(restore.nodeId, start)
  schedulePendingVisualSelection({
    nodeId: restore.nodeId,
    start,
    end: Math.max(restore.anchor, restore.focus) + 1,
    endpoints: { anchor: restore.anchor, focus: restore.focus, hadText: restore.hadText },
  })
  changeVimMode('visual')
}

interface MoveNodeVisualDeps {
  store: EditorStore
  commandState: VimCommandState
  nodeVisualSelection: NodeVisualSelection | undefined
  setNodeVisualSelection: (selection: NodeVisualSelection | undefined) => void
  syncImageCaretToFocus: () => void
}

export function moveNodeVisual(deps: MoveNodeVisualDeps, direction: 'up' | 'down' | 'first' | 'last', count = 1): void {
  const { store, commandState, nodeVisualSelection, setNodeVisualSelection, syncImageCaretToFocus } = deps
  const state = store.getSnapshot()
  if (state.status !== 'ready' || nodeVisualSelection === undefined) return
  // Whole-node Visual extension stays within the focused node's actual sibling array, whatever
  // depth it is displayed at through inline expansion.
  const located = locateNode(state.document, nodeVisualSelection.focusId)
  if (located === undefined) return
  const nodes = located.siblings
  const index = located.index
  if (nodes.length === 0) return
  const targetIndex =
    direction === 'first'
      ? 0
      : direction === 'last'
        ? nodes.length - 1
        : Math.max(0, Math.min(nodes.length - 1, index + (direction === 'down' ? count : -count)))
  const target = nodes[targetIndex]
  if (target === undefined) return
  setNodeVisualSelection({ ...nodeVisualSelection, focusId: target.id })
  rememberNodeRange(commandState, state.document, nodeVisualSelection.anchorId, target.id)
  store.selectNode(target.id, 0)
  syncImageCaretToFocus()
}
