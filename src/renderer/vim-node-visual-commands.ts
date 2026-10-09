import type { EditorStore, NodeVisualCommand } from '../application/editor-store'
import { agendaVisualTarget } from '../application/agenda-visual-selection'
import { locateNode } from '../domain/document'
import { isNodeExpanded } from '../application/expansion-state'
import type { NodeVisualSelection, PendingVisualSelection } from './node-input-types'
import {
  beginStructuralVisual,
  clearCommandAssembly,
  recordRepeatChange,
  type VimCommandState,
} from './vim-command-state'
import { rememberIncomingNodes, rememberNodeRange, resolveVisualMemory } from './vim-visual-memory'
import type { VimMode } from './vim-editing'
import { registerSource, visualCommandRegister, type VimEditSessionState } from './vim-edit-session'

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
    if (state.agenda !== undefined) return
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
  if (state.agenda !== undefined) {
    const target = agendaVisualTarget(
      store.getAgendaRows(),
      state.agenda.activeOccurrence?.day ?? NaN,
      nodeVisualSelection,
      direction,
      count,
    )
    if (target === undefined || target.nodeId === nodeVisualSelection.focusId) return
    setNodeVisualSelection({ ...nodeVisualSelection, focusId: target.nodeId })
    store.applyAgenda({ kind: 'select', key: target.key })
    syncImageCaretToFocus()
    return
  }
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

interface CommandNodeVisualDeps {
  store: EditorStore
  session: VimEditSessionState
  commandState: VimCommandState
  nodeVisualSelection: NodeVisualSelection | undefined
  setNodeVisualSelection: (selection: NodeVisualSelection | undefined) => void
  changeVimMode: (mode: VimMode) => void
  syncImageCaretToFocus: () => void
}

export function commandNodeVisual(deps: CommandNodeVisualDeps, command: NodeVisualCommand, count = 1): void {
  const {
    store,
    session,
    commandState,
    nodeVisualSelection,
    setNodeVisualSelection,
    changeVimMode,
    syncImageCaretToFocus,
  } = deps
  if (nodeVisualSelection === undefined) return
  const state = store.getSnapshot()
  if (state.status !== 'ready') return
  if (state.agenda !== undefined) {
    if (command !== 'd' || !store.startAgendaMove(1, nodeVisualSelection)) return
    clearCommandAssembly(commandState)
    setNodeVisualSelection(undefined)
    changeVimMode('normal')
    syncImageCaretToFocus()
    return
  }
  // The anchor and focus of a whole-node Visual range always share a real parent (see
  // `moveNodeVisual`), so the anchor's actual siblings resolve the span.
  const anchorLocated = locateNode(state.document, nodeVisualSelection.anchorId)
  if (anchorLocated === undefined) return
  const focus = anchorLocated.siblings.findIndex((node) => node.id === nodeVisualSelection.focusId)
  if (focus < 0) return
  const span = Math.abs(anchorLocated.index - focus) + 1
  const source = registerSource(session.register)
  const repeat = command === 'p' || command === 'P' ? count : 1
  const result = store.applyNodeVisual(
    command,
    nodeVisualSelection.anchorId,
    nodeVisualSelection.focusId,
    source,
    '',
    repeat,
  )
  if (result === undefined) return
  const nextRegister = visualCommandRegister(command, result)
  if (nextRegister !== undefined) session.register = nextRegister
  if (command === 'y') void store.copyVimForest(result.nodes).catch((error: unknown) => store.reportError(error))
  if ((command === 'p' || command === 'P') && source !== undefined) {
    // `gv` after a Visual put selects the incoming nodes: the copies start at the selected node.
    const next = store.getSnapshot()
    if (next.status === 'ready')
      rememberIncomingNodes(commandState, next.document, next.location.selectedNodeId, source.nodes.length * repeat)
  }
  if (command === 'c' || command === 's') {
    beginStructuralVisual(commandState, nodeVisualSelection.focusId, command, span)
    changeVimMode('insert')
  } else {
    if (command !== 'y')
      recordRepeatChange(commandState, {
        kind: 'structural-visual',
        command,
        span,
        ...(source === undefined ? {} : { source }),
        ...(repeat > 1 ? { repeat } : {}),
      })
    changeVimMode('normal')
    syncImageCaretToFocus()
  }
  // The command exits whole-node Visual mode, so an unfinished `g` prefix must not survive into
  // the mode the command lands in.
  clearCommandAssembly(commandState)
  setNodeVisualSelection(undefined)
}

interface VerticalOperatorDeps {
  store: EditorStore
  session: VimEditSessionState
  commandState: VimCommandState
  changeVimMode: (mode: VimMode) => void
}

export function verticalOperator(
  deps: VerticalOperatorDeps,
  nodeId: string,
  operator: 'd' | 'y' | 'c',
  direction: 'down' | 'up',
  count: number,
): void {
  const { store, session, commandState, changeVimMode } = deps
  const state = store.getSnapshot()
  if (state.status !== 'ready' || state.location.currentParentId === nodeId) return
  // The range is the node's own actual siblings, whatever depth it is displayed at, so expanded
  // descendant rows never count as members.
  const located = locateNode(state.document, nodeId)
  if (located === undefined) return
  const edge = Math.max(
    0,
    Math.min(located.siblings.length - 1, located.index + (direction === 'down' ? count : -count)),
  )
  const first = located.siblings[Math.min(located.index, edge)]
  const last = located.siblings[Math.max(located.index, edge)]
  if (first === undefined || last === undefined) return
  const span = Math.abs(located.index - edge) + 1
  const result = store.applyNodeVisual(operator, first.id, last.id)
  if (result === undefined) return
  const nextRegister = visualCommandRegister(operator, result)
  if (nextRegister !== undefined) session.register = nextRegister
  if (operator === 'c') {
    beginStructuralVisual(commandState, nodeId, 'c', span)
    changeVimMode('insert')
  } else if (operator === 'd') {
    recordRepeatChange(commandState, { kind: 'structural-visual', command: 'd', span })
  }
}

interface ShiftNodeVisualDeps {
  store: EditorStore
  commandState: VimCommandState
  nodeVisualSelection: NodeVisualSelection | undefined
}

// Whole-node Visual keeps its endpoint IDs, direction, and mode across `>` and `<`: the moved rows
// keep their IDs, so only the store changes and the selection state is left alone.
export function shiftNodeVisual(
  deps: ShiftNodeVisualDeps,
  direction: 'in' | 'out',
  count: number,
  confineOutdentToCurrentParent = false,
): void {
  const { store, commandState, nodeVisualSelection } = deps
  if (nodeVisualSelection === undefined) return
  const { anchorId, focusId } = nodeVisualSelection
  const state = store.getSnapshot()
  if (state.status !== 'ready') return
  if (state.agenda !== undefined) return
  const anchor = locateNode(state.document, anchorId)
  const focus = anchor?.siblings.findIndex((node) => node.id === focusId) ?? -1
  if (anchor === undefined || focus < 0) return
  const span = Math.abs(anchor.index - focus) + 1
  if (store.shiftNodeVisual(direction, anchorId, focusId, count, undefined, confineOutdentToCurrentParent))
    recordRepeatChange(commandState, { kind: 'structural-shift', direction, span, count })
}

interface JoinNodeVisualDeps {
  store: EditorStore
  commandState: VimCommandState
  nodeVisualSelection: NodeVisualSelection | undefined
  changeVimMode: (mode: VimMode) => void
  syncImageCaretToFocus: () => void
  setNodeVisualSelection: (selection: NodeVisualSelection | undefined) => void
}

// `J` and `gJ` end whole-node Visual mode only when the join happened; a rejected or impossible
// join leaves the mode and the selected range alone.
export function joinNodeVisual(deps: JoinNodeVisualDeps, spaced: boolean): void {
  const { store, commandState, nodeVisualSelection, changeVimMode, syncImageCaretToFocus, setNodeVisualSelection } =
    deps
  if (nodeVisualSelection === undefined) return
  const { anchorId, focusId } = nodeVisualSelection
  const state = store.getSnapshot()
  if (state.status !== 'ready') return
  if (state.agenda !== undefined) return
  const anchor = locateNode(state.document, anchorId)
  const focus = anchor?.siblings.findIndex((node) => node.id === focusId) ?? -1
  if (anchor === undefined || focus < 0) return
  const span = Math.abs(anchor.index - focus) + 1
  if (!store.joinNodes({ anchorId, focusId }, spaced)) return
  recordRepeatChange(commandState, { kind: 'structural-join', span, spaced })
  changeVimMode('normal')
  syncImageCaretToFocus()
  clearCommandAssembly(commandState)
  setNodeVisualSelection(undefined)
}

interface ShiftCurrentNodeDeps {
  store: EditorStore
  commandState: VimCommandState
  schedulePendingVisualSelection: (selection: PendingVisualSelection) => void
}

export function shiftCurrentNode(
  deps: ShiftCurrentNodeDeps,
  nodeId: string,
  direction: 'in' | 'out',
  count: number,
  selection: { start: number; end: number },
  cursor?: number,
  confineOutdentToCurrentParent = false,
): void {
  const { store, commandState, schedulePendingVisualSelection } = deps
  if (!store.shiftNodeVisual(direction, nodeId, nodeId, count, cursor, confineOutdentToCurrentParent)) return
  recordRepeatChange(commandState, { kind: 'structural-shift', direction, span: 1, count })
  // The store's focus intent collapses the caret when the moved row renders; the layout effect
  // below restores the selection once it has.
  schedulePendingVisualSelection({ nodeId, ...selection })
}
