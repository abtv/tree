export { EMPTY_PERSISTED_VIEW, MAX_DOCUMENT_DEPTH } from './document-types'
export type {
  AttachmentId,
  AttachmentReference,
  AttachmentSummary,
  Document,
  LinkRange,
  LocatedNode,
  Location,
  NodeId,
  NodeIndex,
  PersistedEditorState,
  PersistedView,
  TreeNode,
} from './document-types'

export { JOIN_ATTACHMENTS_ERROR, MAX_DOCUMENT_DEPTH_ERROR } from './product-messages'

export {
  isHttpUrl,
  linkAtPosition,
  linksAfterTextEdit,
  normalizeLinks,
  reconcileLinkTextEdit,
  replaceLinkedText,
  replaceLinkedTextRanges,
} from './document-links'

export type { LinkedTextEdit } from './document-links'

export { buildNodeIndex, locateNode, releaseNodeIndex, requireNode } from './document-index'

export { attachmentSummary, collectAttachmentIds, isValidAttachmentId } from './document-attachments'

export {
  attachImage,
  cloneDocument,
  cloneNode,
  cloneNodeWithNewIds,
  createFirstChild,
  createInitialDocument,
  deleteLink,
  deleteNode,
  displayedNodes,
  editNodeContent,
  editNodeText,
  ensureRoot,
  insertSiblingAfter,
  insertSiblingBefore,
  insertSubtreeSibling,
  isValidLocation,
  joinSiblingRange,
  moveSibling,
  nodePath,
  normalizeVisibleLocation,
  pasteMultilineText,
  pasteText,
  removeTextRange,
  replaceSiblingRange,
  shiftSiblingRange,
  splitNode,
  subtreeHeight,
  wouldExceedMaximumDepth,
} from './document-operations'
export type { SiblingRangeJoin, SiblingRangeShift } from './document-operations'

export { assertDocument, parsePersistedState, serializeState, validatePersistedState } from './document-serialization'
export type { ViewState } from './document-serialization'
