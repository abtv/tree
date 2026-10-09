import { nextActiveDay } from '../domain/agenda-date-edits'
import { findCanonicalDates } from '../domain/date-recognition'
import { isValidLocation, locateNode, type Document, type NodeId, type Location } from '../domain/document'
import { agendaProjection, buildAgendaRows, type AgendaRow } from './agenda-rows'
import { dayKey, selectAgendaRow, type AgendaState } from './agenda-state'

/** Scope membership excludes the scope node itself, just like the domain projection. */
export function isInAgendaScope(document: Document, state: AgendaState, nodeId: NodeId): boolean {
  const located = locateNode(document, nodeId)
  return (
    located !== undefined &&
    (state.scopeParentId === null || located.ancestors.some((node) => node.id === state.scopeParentId))
  )
}

/** A pending move survives navigation only; every document change cancels it without an Undo entry (D4). */
export function withoutPendingMove(state: AgendaState): AgendaState {
  if (state.pendingMove === undefined) return state
  const rest = { ...state }
  delete rest.pendingMove
  return rest
}

export function reconcileAgenda(
  document: Document,
  changed: AgendaState,
  preservePresentation = false,
): AgendaState | undefined {
  const state = withoutPendingMove(changed)
  if (state.scopeParentId !== null && locateNode(document, state.scopeParentId) === undefined) return undefined
  let next = isValidLocation(document, state.origin.location)
    ? state
    : {
        ...state,
        origin: { location: agendaOriginLocation(document, state), cursor: 0 },
      }
  const active = state.activeOccurrence
  if (active !== undefined) {
    const located = locateNode(document, active.nodeId)
    // The located guard duplicates scope membership's missing-node check; it narrows the node type.
    if (located !== undefined && isInAgendaScope(document, state, active.nodeId)) {
      const day = nextActiveDay(
        findCanonicalDates(located.node.text, located.node.links).map((date) => date.day),
        active.day,
      )
      if (day === undefined) {
        if (state.pinnedOccurrence === undefined) next = { ...next, pinnedOccurrence: active }
      } else {
        const valid = { ...next }
        delete valid.pinnedOccurrence
        next =
          state.pinnedOccurrence === undefined && day === active.day
            ? next
            : {
                ...valid,
                activeOccurrence: { nodeId: active.nodeId, day },
                selectedKey: `node:${day}:${active.nodeId}`,
              }
        // A live edit continues in the nearest remaining occurrence. History never unfolds it.
        // If the day is unchanged, the active path is already visible; deleting its absent folds is equivalent.
        if (day !== active.day && !preservePresentation) {
          const collapsed = new Set(next.collapsed)
          collapsed.delete(dayKey(day))
          for (const ancestor of located.ancestors) collapsed.delete(`node:${day}:${ancestor.id}`)
          if (collapsed.size !== next.collapsed.size) next = { ...next, collapsed }
        }
      }
    }
  }
  return reconcileAgendaSelection(next, buildAgendaRows(agendaProjection(document, next), next))
}

/** Prefer the old day before Today when a deleted row or gap no longer exists. */
export function reconcileAgendaSelection(state: AgendaState, rows: readonly AgendaRow[]): AgendaState {
  if (rows.some((row) => row.key === state.selectedKey)) return state
  const previousDay = selectedAgendaDay(state.selectedKey) ?? state.today
  // Stryker disable next-line MethodExpression: Node days duplicate headers; gaps have no day, so dropping this filter gives the same nearest day.
  const headers = rows.filter((row) => row.kind === 'day')
  const day = nextActiveDay(
    headers.map((row) => row.day),
    previousDay,
  )!
  return selectAgendaRow(
    state,
    rows.find((row) => row.key === dayKey(day))!,
  )
}

export function selectedAgendaDay(key: string): number | undefined {
  const match = /^(?:day|node):(-?\d+)(?::|$)/.exec(key)
  return match === null ? undefined : Number(match[1])
}

/** Restore the recorded Tree location when it exists, otherwise its nearest surviving scope. */
export function agendaOriginLocation(document: Document, state: AgendaState, previousDocument = document): Location {
  const origin = state.origin.location
  if (isValidLocation(document, origin)) return origin
  // Treating null as an ID still falls through to the first root; this guard expresses container scope.
  if (origin.currentParentId !== null) {
    const parent = locateNode(previousDocument, origin.currentParentId)
    const path =
      parent === undefined
        ? [origin.currentParentId]
        : [...parent.ancestors.map((node) => node.id), parent.node.id].reverse()
    for (const id of path) {
      if (locateNode(document, id) !== undefined) return { currentParentId: id, selectedNodeId: id }
    }
  }
  return { currentParentId: null, selectedNodeId: document.roots[0]!.id }
}

/** History chooses only visible occurrences; it does not change folds or revealed days. */
export function agendaHistorySelection(
  document: Document,
  state: AgendaState,
  nodeId: NodeId,
  reference = selectedAgendaDay(state.selectedKey) ?? state.today,
): AgendaState {
  if (!isInAgendaScope(document, state, nodeId)) return state
  // The projection is scoped too, so removing the preceding scope guard cannot find an outside occurrence.
  const rows = buildAgendaRows(agendaProjection(document, state), state)
  const occurrences = rows.filter(
    // The ID test alone excludes day/gap rows, which have no nodeId; the kind guard narrows the union.
    (row): row is Extract<AgendaRow, { kind: 'node' }> => row.kind === 'node' && row.nodeId === nodeId,
  )
  const day = nextActiveDay(
    occurrences.map((row) => row.day),
    reference,
  )
  const row = occurrences.find((row) => row.day === day)
  if (row === undefined) return state
  const next = selectAgendaRow(state, row)
  // Rechecking visible selection when no pin changed is equivalent; avoid that extra projection work.
  return next.pinnedOccurrence === state.pinnedOccurrence
    ? next
    : reconcileAgendaSelection(next, buildAgendaRows(agendaProjection(document, next), next))
}
