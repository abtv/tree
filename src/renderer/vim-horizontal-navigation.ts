import type { TreeNode } from '../domain/document'
import { characterBoundaries, characterStart } from '../domain/text-characters'
import { horizontalCaretTransition, type VimCaretState } from './vim-caret-transition'

interface CharacterRow {
  text: string
  attachment?: TreeNode['attachment']
}

interface HorizontalNavigationOptions<T extends CharacterRow> {
  node: T
  caret: VimCaretState
  direction: 'left' | 'right'
  count: number
  adjacent: (node: T) => T | undefined
}

/** Consume visible-character steps in batches; ask for another row only at a node boundary. */
export function horizontalNavigation<T extends CharacterRow>({
  node,
  caret,
  direction,
  count,
  adjacent,
}: HorizontalNavigationOptions<T>): {
  node: T
  caret: VimCaretState
} {
  if (node.text.length === 0 && node.attachment !== undefined) caret = { cursor: 0, imageActive: true }
  let remaining = count
  while (remaining > 0) {
    if (direction === 'left' && caret.imageActive && node.text.length > 0) {
      caret = horizontalCaretTransition(caret, direction, 1, node.text, true)
      remaining -= 1
      continue
    }
    const boundaries = characterBoundaries(node.text)
    const index = Math.max(0, boundaries.indexOf(caret.cursor))
    const lastIndex = Math.max(0, boundaries.length - (node.attachment === undefined ? 2 : 1))
    const distance = direction === 'left' ? index : lastIndex - index
    if (distance > 0) {
      const steps = Math.min(remaining, distance)
      caret = horizontalCaretTransition(caret, direction, steps, node.text, node.attachment !== undefined)
      remaining -= steps
      if (remaining === 0) break
    }
    const next = adjacent(node)
    if (next === undefined) break
    node = next
    caret = {
      cursor:
        direction === 'left'
          ? node.attachment === undefined
            ? characterStart(node.text, node.text.length)
            : node.text.length
          : 0,
      imageActive: node.attachment !== undefined && (direction === 'left' || node.text.length === 0),
    }
    remaining -= 1
  }
  return { node, caret }
}
