import type { TreeNode } from '../domain/document'
import { dayNumberOf } from '../domain/calendar-date'
import { findCanonicalDates } from '../domain/date-recognition'
import { dateLikeDecorations, type TextDecoration } from './editor-dom'
import { nodeTags } from '../domain/tags'

function tagDecorations(node: TreeNode): TextDecoration[] {
  return nodeTags(node).map(({ start, end }) => ({ start, end, className: 'tag-text' }))
}

/** Local calendar day for presentation; Agenda supplies its captured Today instead. */
export function localToday(): number {
  const date = new Date()
  return dayNumberOf({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

function dateColor(day: number, today: number): string {
  return day < today ? 'date-past' : day > today ? 'date-future' : 'date-today'
}

/** Date color expresses time; font weight identifies the displayed day's date. */
export function agendaDecorations(node: TreeNode, day: number, today = localToday()): TextDecoration[] {
  return [
    ...findCanonicalDates(node.text, node.links).map((date) => ({
      start: date.start,
      end: date.end,
      className: `${date.day === day ? 'agenda-date-active' : 'agenda-date-secondary'} ${dateColor(date.day, today)}`,
    })),
    ...dateLikeDecorations(node),
    ...tagDecorations(node),
  ].sort((left, right) => left.start - right.start)
}

/** Tree dates are semibold; undecorated rows keep the plain textarea. */
export function treeDecorations(node: TreeNode, today = localToday()): TextDecoration[] | undefined {
  const decorations = [
    ...findCanonicalDates(node.text, node.links).map((date) => ({
      start: date.start,
      end: date.end,
      className: `agenda-date-active ${dateColor(date.day, today)}`,
    })),
    ...dateLikeDecorations(node),
    ...tagDecorations(node),
  ].sort((left, right) => left.start - right.start)
  return decorations.length === 0 ? undefined : decorations
}
