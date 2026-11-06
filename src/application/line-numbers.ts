import type { AgendaRow } from './agenda-rows'

/** Number projected node occurrences, excluding timeline headings and folded-away rows. */
export function agendaLineNumbers(rows: readonly AgendaRow[]): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>()
  for (const row of rows) {
    if (row.kind === 'node') numbers.set(row.key, numbers.size + 1)
  }
  return numbers
}
