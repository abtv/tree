import type { ReactNode } from 'react'
import { markedPieces, type CaretMark } from './agenda-row-caret'

/** Text with the stand-in caret and selection marks of an Agenda row without an editor drawn in place. */
export function markedNodes(
  text: string,
  start: number,
  end: number,
  marks: readonly CaretMark[],
  includeEnd: boolean,
): ReactNode[] {
  return markedPieces(text, start, end, marks, includeEnd).map((piece, index) =>
    piece.className === undefined ? (
      piece.text
    ) : (
      <span key={index} className={piece.className}>
        {piece.text}
      </span>
    ),
  )
}
