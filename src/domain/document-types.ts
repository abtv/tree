export type NodeId = string
export type AttachmentId = string
export type AttachmentSummary = ReadonlyMap<AttachmentId, number>

export const MAX_DOCUMENT_DEPTH = 20

export interface AttachmentReference {
  readonly id: AttachmentId
  readonly mimeType: 'image/png'
}

export interface LinkRange {
  readonly start: number
  readonly end: number
  readonly url: string
}

export interface TreeNode {
  readonly id: NodeId
  readonly text: string
  readonly links?: readonly LinkRange[]
  readonly attachment?: AttachmentReference
  /** Present only on a struck-through node (`docs/PRODUCT.md` §2.5); it never affects the children. */
  readonly struckThrough?: true
  readonly children: readonly TreeNode[]
}

export interface Document {
  readonly roots: readonly TreeNode[]
}

export interface Location {
  readonly currentParentId: NodeId | null
  readonly selectedNodeId: NodeId
}

/**
 * Persisted view state: remembered expansion choices and where the selected row sits in the window,
 * as its distance in CSS pixels from the top of the viewport.
 */
export interface PersistedView {
  readonly expandedIds: readonly NodeId[]
  readonly selectedRowTop?: number
}

export interface PersistedEditorState {
  readonly version: 1 | 2 | 3 | 4
  readonly document: Document
  readonly location: Location
  readonly view?: PersistedView
}

export const EMPTY_PERSISTED_VIEW: PersistedView = { expandedIds: [] }

export interface LocatedNode {
  readonly node: TreeNode
  readonly parent: TreeNode | null
  readonly siblings: readonly TreeNode[]
  readonly index: number
  readonly ancestors: readonly TreeNode[]
}

export interface BuildNode {
  id: NodeId
  text: string
  links?: LinkRange[]
  attachment?: AttachmentReference
  struckThrough?: true
  children: BuildNode[]
}

export type NodeIndex = ReadonlyMap<NodeId, NodeId | null>
