import type { AgendaRow } from '../application/agenda-rows'
import { computeListWindow, shouldWindow, WINDOW_OVERSCAN, type ListWindow } from './list-window'
import type { ListLayout } from './node-list-layout'

/** Occurrences, including repeated real nodes, own distinct measured positions. */
export function agendaListWindow(
  rows: readonly AgendaRow[],
  layout: ListLayout,
  viewport: { start: number; end: number },
  selectedKey: string,
): ListWindow | undefined {
  if (!shouldWindow(rows.length)) return undefined
  return computeListWindow({
    count: rows.length,
    offsets: layout.offsets,
    viewportStart: viewport.start,
    viewportEnd: viewport.end,
    overscan: WINDOW_OVERSCAN,
    focusedIndex: rows.findIndex((row) => row.key === selectedKey),
  })
}
