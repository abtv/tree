import type { TreeNode } from '../domain/document'
import type { TextMatch } from '../domain/text-search'

export interface SearchImageExcerpt {
  readonly text: string
  readonly matches: readonly TextMatch[]
  readonly ancestor?: string
  readonly replacesTitle?: true
}

/** One node as Search lists it: its text, parent path and presentation flags. */
export interface NodeResult {
  readonly id: string
  readonly text: string
  readonly path: string | null
  readonly parentId?: string
  readonly tagMatches?: readonly TextMatch[]
  readonly pathTagMatches?: readonly TextMatch[]
  readonly struckThrough?: true
  readonly starred?: true
  readonly marked?: true
  readonly pathStruckMatches?: readonly TextMatch[]
  readonly imageExcerpt?: SearchImageExcerpt
  /** The node's image, so Search can show a thumbnail; its natural size reserves the thumbnail box. */
  readonly attachment?: { readonly id: string; readonly width?: number; readonly height?: number }
}

export function label(node: TreeNode): string {
  const text = node.text.slice(0, 160).replace(/\s+/g, ' ').trim()
  return text || (node.attachment === undefined ? 'Empty node' : 'Image')
}

export function resultText(node: TreeNode): string {
  return node.text || label(node)
}

/** Completion ranges use the same compact labels and separators as search paths. */
export function completionPath(ancestors: readonly TreeNode[]): Pick<NodeResult, 'parentId' | 'pathStruckMatches'> {
  const pathStruckMatches: TextMatch[] = []
  let offset = 0
  for (const ancestor of ancestors) {
    const length = label(ancestor).length
    if (ancestor.struckThrough) pathStruckMatches.push({ start: offset, end: offset + length })
    offset += length + 3
  }
  return {
    ...(ancestors.length > 0 ? { parentId: ancestors[ancestors.length - 1]!.id } : {}),
    ...(pathStruckMatches.length > 0 ? { pathStruckMatches } : {}),
  }
}

export function nodePresentation(
  node: TreeNode,
): Pick<NodeResult, 'struckThrough' | 'starred' | 'marked' | 'attachment'> {
  return {
    ...(node.struckThrough ? { struckThrough: true as const } : {}),
    ...(node.starred ? { starred: true as const } : {}),
    ...(node.marked ? { marked: true as const } : {}),
    ...(node.attachment === undefined
      ? {}
      : {
          attachment: {
            id: node.attachment.id,
            ...(node.attachment.width === undefined ? {} : { width: node.attachment.width }),
            ...(node.attachment.height === undefined ? {} : { height: node.attachment.height }),
          },
        }),
  }
}

export function completionPresentation(node: TreeNode, ancestors: readonly TreeNode[]): Partial<NodeResult> {
  return { ...completionPath(ancestors), ...nodePresentation(node) }
}
