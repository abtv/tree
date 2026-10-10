import type { TreeNode } from '../domain/document'
import { findCanonicalDates } from '../domain/date-recognition'
import { dateLikeDecorations, type TextDecoration } from './editor-dom'

/**
 * Agenda text decorations: the displayed day's date in the accent color, other recognized dates in the
 * secondary color, and text resembling a date underlined (docs/PRODUCT.md §20.10, §23.9).
 */
export function agendaDecorations(node: TreeNode, day: number): TextDecoration[] {
  return [
    ...findCanonicalDates(node.text, node.links).map((date) => ({
      start: date.start,
      end: date.end,
      className: date.day === day ? 'agenda-date-active' : 'agenda-date-secondary',
    })),
    ...dateLikeDecorations(node),
  ].sort((left, right) => left.start - right.start)
}

/** Tree rows keep the plain textarea unless a token resembles a date, so ordinary text is unchanged. */
export function treeDecorations(node: TreeNode): TextDecoration[] | undefined {
  const decorations = dateLikeDecorations(node)
  return decorations.length === 0 ? undefined : decorations
}
