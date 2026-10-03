import type { TreeNode } from '../domain/document'
import type { ClipboardContent } from '../shared/ipc'

export function vimSelectionClipboardContent(text: string, start: number, end: number): ClipboardContent | undefined {
  const selected = text.slice(Math.max(0, Math.min(start, end)), Math.max(start, end))
  return selected.length === 0 ? undefined : { kind: 'text', text: selected }
}

export function vimNodeClipboardContent(node: TreeNode, imageCaret: boolean): ClipboardContent | undefined {
  if (imageCaret) return node.attachment === undefined ? undefined : { kind: 'image', attachmentId: node.attachment.id }
  return node.text.length === 0 ? undefined : { kind: 'text', text: node.text }
}

export function vimNormalClipboardContent(
  nodes: readonly TreeNode[],
  imageCaret: boolean,
): ClipboardContent | undefined {
  return nodes.length === 1 ? vimNodeClipboardContent(nodes[0]!, imageCaret) : undefined
}

export function vimForestClipboardContent(nodes: readonly TreeNode[]): ClipboardContent | undefined {
  if (nodes.length === 0) return undefined
  if (nodes.length === 1) {
    const node = nodes[0]!
    return vimNodeClipboardContent(node, node.text.length === 0)
  }
  return { kind: 'text', text: nodes.map((node) => node.text).join('\n') }
}
