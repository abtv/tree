export { MAX_DOCUMENT_DEPTH } from './document-types'
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
  TreeNode,
} from './document-types'

export { MAX_DOCUMENT_DEPTH_ERROR } from './product-messages'

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

export { attachmentSummary, collectAttachmentIds } from './document-attachments'

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
  moveSibling,
  nodePath,
  pasteMultilineText,
  pasteText,
  removeTextRange,
  replaceSiblingRange,
  splitNode,
} from './document-operations'

export { assertDocument, parsePersistedState, serializeState, validatePersistedState } from './document-serialization'
