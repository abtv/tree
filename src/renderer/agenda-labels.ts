import { pinnedAgendaOccurrence, activeAgendaOccurrence } from '../application/agenda-state'
import type { AgendaRow } from '../application/agenda-rows'
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

/** The invalid-item hint is runtime-only and does not alter row heights. */
export function agendaStatusMessage(agenda: Pick<AgendaState, 'activity'> | undefined): string | undefined {
  return pinnedAgendaOccurrence(agenda) === undefined ? undefined : AGENDA_INVALID_ITEM_HINT
}

/** A live mirror is another day's occurrence of the node whose occurrence is active. */
export function isAgendaMirror(
  agenda: Pick<AgendaState, 'activity'>,
  row: { readonly nodeId: string; readonly day: DayNumber; readonly role: 'match' | 'context' },
): boolean {
  const active = activeAgendaOccurrence(agenda)
  return row.role === 'match' && active !== undefined && active.nodeId === row.nodeId && active.day !== row.day
}

/**
 * The source text of a day row or an empty separator; these offsets are the
 * caret offsets of the row (`docs/PRODUCT.md` §23.4). The Today badge is separate presentation.
 */
export function agendaRowLabel(
  row: Extract<AgendaRow, { readonly kind: 'day' | 'separator' }>,
  today: DayNumber,
): string {
  if (row.kind === 'separator') return ''
  return agendaDateLabel(row.day, today, true)
}
