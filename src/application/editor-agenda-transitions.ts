import { newDatedNodeText } from '../domain/agenda-date-edits'
import { dayNumberOf, type DayNumber } from '../domain/calendar-date'
import {
  createLastChild,
  MAX_DOCUMENT_DEPTH,
  MAX_DOCUMENT_DEPTH_ERROR,
  requireNode,
  type Document,
  type NodeId,
} from '../domain/document'
import type { AgendaRow } from './agenda-rows'
import { dayKey, type AgendaState } from './agenda-state'
import type { RejectedTransition, StructuralTransition } from './editor-command-transitions'

export interface AgendaCreateTransition extends StructuralTransition {
  agenda: AgendaState
}

/**
 * Create `YYYY-MM-DD ` as the last child of the scope for `day` and make it the active occurrence
 * (`plans/agenda.md` §9). The day is unfolded and, when it lay inside a gap, revealed so the new row
 * is visible. Returns `undefined` when `day` precedes the earliest canonical date.
 */
export function createDayNodeTransition(
  document: Document,
  agenda: AgendaState,
  rows: readonly AgendaRow[],
  day: DayNumber,
  createId: () => NodeId,
): AgendaCreateTransition | RejectedTransition | undefined {
  if (day < dayNumberOf({ year: 0, month: 1, day: 1 })) return undefined
  const scope = agenda.scopeParentId
  if (scope !== null && requireNode(document, scope).ancestors.length + 1 >= MAX_DOCUMENT_DEPTH)
    return { kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR }
  const id = createId()
  const text = newDatedNodeText(day)
  const collapsed = new Set(agenda.collapsed)
  collapsed.delete(dayKey(day))
  // Stryker disable next-line ConditionalExpression: Node rows exist only beneath their day header, so matching them gives the same answer.
  const shown = rows.some((row) => row.kind === 'day' && row.day === day)
  return {
    document: createLastChild(document, scope, id, text),
    location: { currentParentId: scope, selectedNodeId: id },
    focus: { nodeId: id, cursor: text.length },
    agenda: {
      ...agenda,
      collapsed,
      revealed: shown ? agenda.revealed : new Set(agenda.revealed).add(day),
      selectedKey: `node:${day}:${id}`,
      activeOccurrence: { nodeId: id, day },
    },
  }
}
