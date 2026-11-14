import type { AttachmentId, Document, TreeNode } from './document-types'
import { attachmentSummary, inheritAttachmentIds } from './document-attachments'

/** One enrichment shares replacements across immutable current/undo/redo snapshots. */
export function imageSearchTextEnrichment(id: AttachmentId, searchText: string): (document: Document) => Document {
  const nodes = new WeakMap<TreeNode, TreeNode>()
  const documents = new WeakMap<Document, Document>()
  let paths: readonly (readonly number[])[] = []
  const matches = (document: Document, path: readonly number[]): boolean => {
    let siblings = document.roots
    let node: TreeNode | undefined
    for (const index of path) {
      node = siblings[index]
      if (node === undefined) return false
      siblings = node.children
    }
    return node?.attachment?.id === id
  }
  const collect = (siblings: readonly TreeNode[], prefix: readonly number[], found: number[][]): void => {
    for (let index = 0; index < siblings.length; index++) {
      const node = siblings[index]!
      if (node.attachment?.id === id) found.push([...prefix, index])
      if (node.children.length) collect(node.children, [...prefix, index], found)
    }
  }
  const replace = (
    siblings: readonly TreeNode[],
    targets: readonly (readonly number[])[],
    depth: number,
  ): readonly TreeNode[] => {
    const groups = new Map<number, (readonly number[])[]>()
    for (const path of targets) {
      const index = path[depth]!
      const group = groups.get(index) ?? []
      group.push(path)
      groups.set(index, group)
    }
    let output: TreeNode[] | undefined
    for (const [index, group] of groups) {
      const node = siblings[index]!
      let next = nodes.get(node)
      if (next === undefined) {
        const descendants = group.filter((path) => path.length > depth + 1)
        const children = descendants.length ? replace(node.children, descendants, depth + 1) : node.children
        const attachment = node.attachment
        const changed = attachment?.id === id && attachment.searchText !== searchText
        next =
          changed || children !== node.children
            ? {
                ...node,
                children,
                ...(changed ? { attachment: { ...attachment, searchText } } : {}),
              }
            : node
        nodes.set(node, next)
      }
      if (next !== node) {
        output ??= siblings.slice()
        output[index] = next
      }
    }
    return output ?? siblings
  }

  return (document) => {
    const count = attachmentSummary(document).get(id)
    if (count === undefined) return document
    const cached = documents.get(document)
    if (cached !== undefined) return cached
    // Content edits usually keep image positions. Validate every position and multiplicity
    // before reusing them; structural changes fall back to finding all occurrences again.
    if (paths.length !== count || !paths.every((path) => matches(document, path))) {
      const found: number[][] = []
      collect(document.roots, [], found)
      paths = found
    }
    const roots = replace(document.roots, paths, 0)
    const next = roots === document.roots ? document : { roots }
    inheritAttachmentIds(document, next)
    documents.set(document, next)
    return next
  }
}
