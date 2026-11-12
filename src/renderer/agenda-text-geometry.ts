import type { AgendaRow } from '../application/agenda-rows'
import type { TreeNode } from '../domain/document'
import type { DayNumber } from '../domain/calendar-date'
import { visualTextGeometry, richTextHtml } from './editor-dom'
import { agendaDecorations } from './date-decorations'

export type AgendaTextGeometry = ReturnType<typeof visualTextGeometry>

/** Occurrence-aware geometry; a windowed-out row must use Agenda's own width and indentation. */
export function measureAgendaRow(
  row: AgendaRow,
  text: string,
  focusedDay: boolean,
  node?: TreeNode,
  today?: DayNumber,
): AgendaTextGeometry | undefined {
  const mounted = document.querySelector<HTMLElement>(`[data-agenda-key="${CSS.escape(row.key)}"]`)
  const element = mounted?.querySelector<HTMLElement>('.node-input,.agenda-text,.agenda-label') ?? mounted
  const editorDestination = row.kind === 'node' && row.role === 'match'
  if (element !== undefined && element !== null && (!editorDestination || element.classList.contains('node-input'))) {
    return element.getBoundingClientRect().width > 0 ? visualTextGeometry(element) : undefined
  }

  const content = document.querySelector<HTMLElement>('.agenda-list > .outline-content > div')
  if (content === null || content.getBoundingClientRect().width === 0) return undefined
  const wrapper = document.createElement('div')
  wrapper.className =
    row.kind === 'day' && focusedDay
      ? 'current-parent agenda-row agenda-focused-heading'
      : `agenda-row agenda-row-${row.kind}${row.kind === 'day' && row.isToday ? ' agenda-today' : ''}`
  // Agenda is visually flat; semantic ancestor depth affects color, not indentation.
  wrapper.style.setProperty('--row-depth', '0')
  Object.assign(wrapper.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
  })
  wrapper.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.className =
    row.kind === 'node'
      ? editorDestination
        ? 'node-input'
        : 'agenda-text'
      : `agenda-label${row.kind === 'day' && !row.content ? ' agenda-label-empty' : ''}`
  if (node !== undefined && row.kind === 'node')
    label.innerHTML = richTextHtml(node, agendaDecorations(node, row.day, today))
  else label.textContent = text
  if (row.kind === 'day' && focusedDay) wrapper.textContent = text
  else wrapper.append(label)
  content.append(wrapper)
  try {
    const geometry = visualTextGeometry(row.kind === 'day' && focusedDay ? wrapper : label)
    return {
      position: geometry.position,
      dispose: () => {
        geometry.dispose()
        wrapper.remove()
      },
    }
  } catch (error) {
    wrapper.remove()
    throw error
  }
}
