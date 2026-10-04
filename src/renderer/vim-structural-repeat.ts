import type { EditorStore } from '../application/editor-store'
import { locateNode } from '../domain/document'
import { nodeRegister, visualCommandRegister, type VimEditSessionState } from './vim-edit-session'
import type { VimStructuralChange } from './vim-keyboard-types'

interface StructuralRepeatDeps {
  store: EditorStore
  session: VimEditSessionState
}

export function repeatStructural(deps: StructuralRepeatDeps, change: VimStructuralChange, cursor: number): boolean {
  const { store, session } = deps
  const state = store.getSnapshot()
  if (state.status !== 'ready' || state.persistenceLocked === true) return false
  if (change.kind === 'structural-delete') {
    // The register changes only when the deletion happened (a heading or locked store changes nothing).
    const span = change.span
    const located = locateNode(state.document, state.location.selectedNodeId)
    if (located === undefined || located.siblings.length - located.index < span) return false
    const removed = store.deleteSiblingRange(span)
    if (removed !== undefined)
      session.register =
        removed.length === 1
          ? nodeRegister(removed[0]!)
          : { kind: 'nodes', value: { nodes: removed, sourceIds: removed.map((node) => node.id) } }
    return removed !== undefined
  } else if (change.kind === 'structural-open' || change.kind === 'structural-child-open') {
    if (change.kind === 'structural-open') store.createSiblingWithText(change.position, change.text)
    else store.createChildWithText(change.text)
    const next = store.getSnapshot()
    return next.status === 'ready' && next.document !== state.document
  } else if (change.kind === 'structural-put')
    return store.pasteNodeForest(
      state.location.selectedNodeId,
      change.position,
      { nodes: [change.source], sourceIds: change.sourceIds },
      change.repeat ?? 1,
      change.past === true,
    )
  else if (change.kind === 'structural-forest-put')
    return store.pasteNodeForest(
      state.location.selectedNodeId,
      change.position,
      change.source,
      change.repeat ?? 1,
      change.past === true,
    )
  else {
    // A repeated whole-node Visual mutation applies to the current node's own actual siblings.
    const located = locateNode(state.document, state.location.selectedNodeId)
    if (located === undefined || state.location.selectedNodeId === state.location.currentParentId) return false
    const end = located.siblings[located.index + change.span - 1]
    if (end === undefined) return false
    if (change.kind === 'structural-shift')
      return store.shiftNodeVisual(change.direction, located.node.id, end.id, change.count, cursor)
    if (change.kind === 'structural-join')
      return store.joinNodes({ anchorId: located.node.id, focusId: end.id }, change.spaced)
    const result = store.applyNodeVisual(
      change.command,
      located.node.id,
      end.id,
      change.source,
      change.text,
      change.repeat,
    )
    if (result !== undefined) {
      const nextRegister = visualCommandRegister(change.command, result)
      if (nextRegister !== undefined) session.register = nextRegister
    }
    return result !== undefined
  }
}
