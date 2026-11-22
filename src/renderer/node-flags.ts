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
 * The heading of the empty-query Search list (§20.14): it names the parts that are present, and both
 * parts when the list is empty.
 */
export function initialSearchHeading(items: readonly NodeFlags[]): string {
  const marked = items.some((item) => item.marked)
  const starred = items.some((item) => item.starred && !item.marked)
  if (marked !== starred) return marked ? 'Marked' : 'Starred'
  return 'Marked and starred'
}
