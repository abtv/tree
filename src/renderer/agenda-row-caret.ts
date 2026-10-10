/**
 * The caret and selection of an Agenda row without an editor (a day, a gap, a contextual ancestor or an
 * occurrence that is not the active one). Such a row has no native text control, so its caret is state
 * kept here and drawn as markup (`docs/PRODUCT.md` §23.4). Pure: no DOM, React or store.
 */

/** `anchor` and `focus` are UTF-16 offsets into the row's text; both equal means a collapsed caret. */
export interface RowCaret {
  key: string
  anchor: number
  focus: number
}

/**
 * How the stand-in caret is drawn: a block in Vim Normal, a thin line in Insert and standard editing,
 * an inclusive highlight in Vim Visual, and nothing in whole-node Visual.
 */
export type RowCaretMode = 'normal' | 'insert' | 'visual' | 'hidden'

export interface CaretMark {
  start: number
  end: number
  className: 'agenda-caret' | 'agenda-selection'
}

export interface MarkedPiece {
  text: string
  className?: string
}

/** A caret on arrival: offset zero, as every arrival at a row without an editor places it. */
export function arrivalCaret(key: string): RowCaret {
  return { key, anchor: 0, focus: 0 }
}

/** Normal and Visual rest on a character, so their last offset is `length - 1`; the others reach `length`. */
export function maxOffset(length: number, mode: RowCaretMode): number {
  return mode === 'normal' || mode === 'visual' ? Math.max(0, length - 1) : length
}

export function clampCaret(caret: RowCaret, length: number, mode: RowCaretMode): RowCaret {
  const maximum = maxOffset(length, mode)
  const focus = Math.max(0, Math.min(caret.focus, maximum))
  // Normal has no range: whatever selection existed before a mode change collapses to the caret.
  const anchor = mode === 'normal' ? focus : Math.max(0, Math.min(caret.anchor, maximum))
  return anchor === caret.anchor && focus === caret.focus ? caret : { ...caret, anchor, focus }
}

/** The selected span `[start, end)`; a Vim Visual selection includes both of its end characters. */
export function selectionRange(caret: RowCaret, length: number, mode: RowCaretMode): { start: number; end: number } {
  const clamped = clampCaret(caret, length, mode)
  const start = Math.min(clamped.anchor, clamped.focus)
  const end = Math.max(clamped.anchor, clamped.focus)
  if (mode === 'visual') return { start, end: Math.min(length, end + 1) }
  return { start, end }
}

/** What a copy command takes: the selection, or in Vim Normal the character under the block caret. */
export function copyRange(caret: RowCaret, length: number, mode: RowCaretMode): { start: number; end: number } {
  const range = selectionRange(caret, length, mode)
  if (range.end > range.start || mode !== 'normal') return range
  return { start: range.start, end: Math.min(length, range.start + 1) }
}

export function caretMarks(caret: RowCaret, length: number, mode: RowCaretMode): CaretMark[] {
  if (mode === 'hidden') return []
  const clamped = clampCaret(caret, length, mode)
  const range = selectionRange(clamped, length, mode)
  if (range.end > range.start) return [{ ...range, className: 'agenda-selection' }]
  if (mode === 'normal' || mode === 'visual') {
    const at = Math.min(clamped.focus, Math.max(0, length - 1))
    return [{ start: at, end: length === 0 ? at : at + 1, className: 'agenda-caret' }]
  }
  return [{ start: clamped.focus, end: clamped.focus, className: 'agenda-caret' }]
}

/**
 * Splits `text[start, end)` into pieces at the mark boundaries. An empty mark belongs to the region
 * that contains its offset, and a mark at the end of the text to the region that reaches `includeEnd`.
 */
export function markedPieces(
  text: string,
  start: number,
  end: number,
  marks: readonly CaretMark[],
  includeEnd: boolean,
): MarkedPiece[] {
  if (marks.length === 0) return [{ text: text.slice(start, end) }]
  const cuts = new Set<number>([start, end])
  for (const mark of marks) {
    if (mark.start > start && mark.start < end) cuts.add(mark.start)
    if (mark.end > start && mark.end < end) cuts.add(mark.end)
  }
  const points = [...cuts].sort((left, right) => left - right)
  const pieces: MarkedPiece[] = []
  const empties = marks.filter(
    (mark) =>
      mark.start === mark.end && mark.start >= start && (mark.start < end || (includeEnd && mark.start === end)),
  )
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!
    const to = points[index + 1]!
    for (const mark of empties) if (mark.start === from) pieces.push({ text: '', className: mark.className })
    const covering = marks.find((mark) => mark.start < mark.end && mark.start <= from && mark.end >= to)
    pieces.push(
      covering === undefined
        ? { text: text.slice(from, to) }
        : { text: text.slice(from, to), className: covering.className },
    )
  }
  for (const mark of empties)
    if (mark.start === end && points.length > 0) pieces.push({ text: '', className: mark.className })
  if (start === end) {
    pieces.length = 0
    for (const mark of empties) pieces.push({ text: '', className: mark.className })
    if (pieces.length === 0) pieces.push({ text: '' })
  }
  return pieces
}
