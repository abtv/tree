import { newDatedNodeText, splitDateEdit } from '../domain/agenda-date-edits'
import { dayNumberOf, type DayNumber } from '../domain/calendar-date'
import {
  createLastChild,
  editNodeContent,
  insertSiblingAfter,
  insertSiblingBefore,
  MAX_DOCUMENT_DEPTH,
  MAX_DOCUMENT_DEPTH_ERROR,
  requireNode,
  splitNode,
  type Document,
  type Location,
  type NodeId,
} from '../domain/document'
import { replaceLinkedTextRanges } from '../domain/document-links'
import type { AgendaRow } from './agenda-rows'
import { dayKey, type AgendaState } from './agenda-state'
import type { RejectedTransition, SiblingInsertionPosition, StructuralTransition } from './editor-command-transitions'

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

/** The new node is the next active occurrence on `day`; its row sits beside the origin's, so it is visible. */
function activateNewNode(agenda: AgendaState, id: NodeId, day: DayNumber): AgendaState {
  return { ...agenda, selectedKey: `node:${day}:${id}`, activeOccurrence: { nodeId: id, day } }
}

/**
 * `Enter` inside a dated node on `day` (`plans/agenda.md` §9, m17): the ordinary split of the Tree, then
 * the new part receives the displayed day's date unless it already holds it, all in one document change.
 * Like the Tree, a caret at the start of non-empty text inserts the new node before instead.
 */
export function splitDatedNodeTransition(
  document: Document,
  location: Location,
  agenda: AgendaState,
  day: DayNumber,
  cursor: number,
  createId: () => NodeId,
): AgendaCreateTransition {
  const id = createId()
  const selected = requireNode(document, location.selectedNodeId).node
  const split =
    cursor === 0 && selected.text !== ''
      ? insertSiblingBefore(document, location.selectedNodeId, id)
      : splitNode(document, location.selectedNodeId, cursor, id)
  const created = requireNode(split, id).node
  // Stryker disable next-line ArrayDeclaration: An element without offsets is not a link range, so recognition and remapping ignore it like an empty list.
  const links = created.links ?? []
  const edit = splitDateEdit(created.text, links, day)
  const dated = edit === undefined ? undefined : replaceLinkedTextRanges(created.text, links, [edit])
  return {
    document: dated === undefined ? split : editNodeContent(split, id, dated.text, dated.links),
    location: { ...location, selectedNodeId: id },
    focus: { nodeId: id, cursor: edit?.inserted.length ?? 0 },
    agenda: activateNewNode(agenda, id, day),
  }
}

/** Vim `o`/`O` on a dated node on `day`: a real sibling after or before it that starts with the day's date. */
export function openDatedSiblingTransition(
  document: Document,
  location: Location,
  agenda: AgendaState,
  day: DayNumber,
  position: SiblingInsertionPosition,
  createId: () => NodeId,
): AgendaCreateTransition {
  const id = createId()
  const text = newDatedNodeText(day)
  const inserted =
    position === 'before'
      ? insertSiblingBefore(document, location.selectedNodeId, id)
      : insertSiblingAfter(document, location.selectedNodeId, id)
  return {
    document: editNodeContent(inserted, id, text, []),
    location: { ...location, selectedNodeId: id },
    focus: { nodeId: id, cursor: text.length },
    agenda: activateNewNode(agenda, id, day),
  }
}
