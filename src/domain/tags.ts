import type { DateTextRange } from './date-recognition'
import type { TreeNode } from './document-types'

export interface TagRange extends DateTextRange {
  readonly name: string
}

/** Literal, case-sensitive tags. Offsets are UTF-16, like document links and selections. */
export function findTags(text: string, excluded: readonly DateTextRange[] = []): readonly TagRange[] {
  const tags: TagRange[] = []
  for (const match of text.matchAll(/(?:^|\s)#([\p{L}\p{Nd}_-]+)/gu)) {
    const name = match[1]!
    const end = match.index + match[0].length
    const start = end - name.length - 1
    if (!excluded.some((range) => range.start < end && range.end > start)) tags.push({ start, end, name })
  }
  return tags
}

const cachedTags = new WeakMap<TreeNode, readonly TagRange[]>()

export function nodeTags(node: TreeNode): readonly TagRange[] {
  let tags = cachedTags.get(node)
  if (tags === undefined) {
    tags = findTags(node.text, node.links)
    cachedTags.set(node, tags)
  }
  return tags
}

export function tagFragment(text: string, caret: number): TagRange | undefined {
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return undefined
  if (/^[\p{L}\p{Nd}_-]/u.test(text.slice(caret))) return undefined
  const fragment = /(?:^|\s)#([\p{L}\p{Nd}_-]*)$/u.exec(text.slice(0, caret))
  if (fragment === null) return undefined
  const name = fragment[1]!
  return { start: caret - name.length - 1, end: caret, name }
}
