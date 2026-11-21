import type { AttachmentDimensions } from './attachment-dimensions'
import { attachmentSummary, inheritAttachmentIds } from './document-attachments'
import type { AttachmentId, Document, TreeNode } from './document-types'

/**
 * How an enrichment treats a stored size: `fill` sets only a missing size, as the header backfill does;
 * `replace` also corrects a different size, as a decoded image does (`docs/PRODUCT.md` §17).
 */
export type AttachmentSizeMode = 'fill' | 'replace'

/** The ids of attachments that some node references without a stored size, once each, in tree order. */
export function attachmentIdsWithoutDimensions(document: Document): AttachmentId[] {
  if (attachmentSummary(document).size === 0) return []
  const ids = new Set<AttachmentId>()
  const stack = [...document.roots].reverse()
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.attachment !== undefined && node.attachment.width === undefined) ids.add(node.attachment.id)
    for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]!)
  }
  return [...ids]
}

/**
 * Returns a function that stores the given sizes in every reference to their attachments. It copies only
 * the ancestor paths of changed nodes and shares each replacement across the current, undo and redo
 * snapshots, so the history keeps its structural sharing. Attachment summaries carry over unchanged.
 */
export function attachmentSizeEnrichment(
  sizes: ReadonlyMap<AttachmentId, AttachmentDimensions>,
  mode: AttachmentSizeMode,
): (document: Document) => Document {
  const nodes = new WeakMap<TreeNode, TreeNode>()
  const documents = new WeakMap<Document, Document>()

  const enrichNode = (node: TreeNode): TreeNode => {
    const cached = nodes.get(node)
    if (cached !== undefined) return cached
    const children = enrichList(node.children)
    const attachment = node.attachment
    const size = attachment === undefined ? undefined : sizes.get(attachment.id)
    const changed =
      attachment !== undefined &&
      size !== undefined &&
      (mode === 'replace'
        ? attachment.width !== size.width || attachment.height !== size.height
        : attachment.width === undefined)
    const next =
      changed || children !== node.children
        ? {
            ...node,
            children,
            ...(changed ? { attachment: { ...attachment, width: size.width, height: size.height } } : {}),
          }
        : node
    nodes.set(node, next)
    return next
  }

  const enrichList = (siblings: readonly TreeNode[]): readonly TreeNode[] => {
    let output: TreeNode[] | undefined
    for (let index = 0; index < siblings.length; index += 1) {
      const node = siblings[index]!
      const next = enrichNode(node)
      if (next !== node) {
        output ??= siblings.slice()
        output[index] = next
      }
    }
    return output ?? siblings
  }

  return (document) => {
    const cached = documents.get(document)
    if (cached !== undefined) return cached
    const summary = attachmentSummary(document)
    let next = document
    if ([...sizes.keys()].some((id) => summary.has(id))) {
      const roots = enrichList(document.roots)
      if (roots !== document.roots) {
        next = { roots }
        inheritAttachmentIds(document, next)
      }
    }
    documents.set(document, next)
    return next
  }
}
