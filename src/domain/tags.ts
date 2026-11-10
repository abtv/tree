import type { DateTextRange } from './date-recognition'
import type { TreeNode } from './document-types'

export interface TagRange extends DateTextRange {
  readonly name: string
}

export const TAG_PREFIXES = ['#', '@', '&'] as const
export type TagPrefix = (typeof TAG_PREFIXES)[number]

export function tagPrefix(text: string): TagPrefix | undefined {
  const prefix = text[0]
  return prefix === '#' || prefix === '@' || prefix === '&' ? prefix : undefined
}

export function tagGroupLabel(prefix: TagPrefix): string {
  return prefix === '@' ? 'People' : prefix === '&' ? 'Events' : 'Tags'
}

/** Literal, case-sensitive tags. Offsets are UTF-16, like document links and selections. */
export function findTags(
  text: string,
  excluded: readonly DateTextRange[] = [],
  prefix: TagPrefix = '#',
): readonly TagRange[] {
  const tags: TagRange[] = []
  for (const match of text.matchAll(new RegExp(`(?:^|\\s)${prefix}([\\p{L}\\p{Nd}_-]+)`, 'gu'))) {
    const name = match[1]!
    const end = match.index + match[0].length
    const start = end - name.length - 1
    if (!excluded.some((range) => range.start < end && range.end > start)) tags.push({ start, end, name })
  }
  return tags
}

const cachedTags = new Map<TagPrefix, WeakMap<TreeNode, readonly TagRange[]>>(
  TAG_PREFIXES.map((prefix) => [prefix, new WeakMap()]),
)

export function nodeTags(node: TreeNode, prefix: TagPrefix = '#'): readonly TagRange[] {
  const cache = cachedTags.get(prefix)!
  let tags = cache.get(node)
  if (tags === undefined) {
    tags = findTags(node.text, node.links, prefix)
    cache.set(node, tags)
  }
  return tags
}

export function tagFragment(text: string, caret: number, prefix: TagPrefix = '#'): TagRange | undefined {
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return undefined
  if (/^[\p{L}\p{Nd}_-]/u.test(text.slice(caret))) return undefined
  const fragment = new RegExp(`(?:^|\\s)${prefix}([\\p{L}\\p{Nd}_-]*)$`, 'u').exec(text.slice(0, caret))
  if (fragment === null) return undefined
  const name = fragment[1]!
  return { start: caret - name.length - 1, end: caret, name }
}
