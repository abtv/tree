import type { AgendaState } from '../application/agenda-state'
import { calendarDateOf, weekdayOf, type DayNumber } from '../domain/calendar-date'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function agendaDateLabel(day: DayNumber, today: DayNumber, weekday = false): string {
  const date = calendarDateOf(day)
  const year = date.year === calendarDateOf(today).year ? '' : ` ${String(date.year).padStart(4, '0')}`
  return `${weekday ? `${weekdays[weekdayOf(day)]} ` : ''}${months[date.month - 1]} ${date.day}${year}`
}

export const AGENDA_INVALID_ITEM_HINT = 'Add a date to keep this item in Agenda'

export function agendaPendingMoveMessage(count: number): string {
  return `Moving ${count} ${count === 1 ? 'item' : 'items'} · p to put · Esc to cancel`
}

/**
 * The transient status-bar message; at most one exists at a time. A pending move and an invalid item cannot
 * coexist, because any text edit cancels the move and only a text edit makes an item invalid.
 */
export function agendaStatusMessage(
  agenda: Pick<AgendaState, 'pinnedOccurrence' | 'pendingMove'> | undefined,
): string | undefined {
  if (agenda?.pinnedOccurrence !== undefined) return AGENDA_INVALID_ITEM_HINT
  return agenda?.pendingMove === undefined ? undefined : agendaPendingMoveMessage(agenda.pendingMove.length)
}

/** A live mirror is another day's occurrence of the node whose occurrence is active. */
export function isAgendaMirror(
  agenda: Pick<AgendaState, 'activeOccurrence'>,
  row: { readonly nodeId: string; readonly day: DayNumber; readonly role: 'match' | 'context' },
): boolean {
  const active = agenda.activeOccurrence
  return row.role === 'match' && active !== undefined && active.nodeId === row.nodeId && active.day !== row.day
}

export function agendaGapLabel(start: DayNumber, end: DayNumber, today: DayNumber): string {
  return `${end - start + 1} empty days · ${agendaDateLabel(start, today)} – ${agendaDateLabel(end, today)}`
}
