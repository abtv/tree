interface NodeFlags {
  readonly starred?: true
  readonly marked?: true
}

/** Names a node's mark and star for tooltips and assistive technology (`docs/PRODUCT.md` §§2.6, 2.7). */
export function nodeFlagsLabel(node: NodeFlags): string | undefined {
  if (node.marked) return node.starred ? 'Marked, starred' : 'Marked'
  return node.starred ? 'Starred' : undefined
}

/**
 * The heading of the empty-query Search list (§20.14): it names the marked and starred parts only when
 * they are present and always ends with the recent part.
 */
export function initialSearchHeading(items: readonly NodeFlags[]): string {
  const marked = items.some((item) => item.marked)
  const starred = items.some((item) => item.starred && !item.marked)
  if (marked) return starred ? 'Marked, starred and recent' : 'Marked and recent'
  return starred ? 'Starred and recent' : 'Recent'
}
