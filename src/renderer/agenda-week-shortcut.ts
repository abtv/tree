/** The bracket key of a primary-modifier shortcut, including browser-style Shift variants. */
export function agendaWeekDirection(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey'>): -1 | 1 | undefined {
  if (event.altKey) return undefined
  if (event.key === '[' || (event.shiftKey && event.key === '{')) return -1
  if (event.key === ']' || (event.shiftKey && event.key === '}')) return 1
  return undefined
}
