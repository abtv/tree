import { requireNode, type Document, type NodeId } from '../domain/document'
import type { TextMatch } from '../domain/text-search'
import { completionPresentation, label } from './recent-nodes'

export interface AgendaPath {
  readonly text: string
  readonly struckMatches: readonly TextMatch[]
}

/** Resolve only a displayed path; labels stay current without invalidating cached row identities. */
export function agendaPath(document: Document, parentId: NodeId): AgendaPath {
  const parent = requireNode(document, parentId)
  const ancestors = [...parent.ancestors, parent.node]
  return {
    text: ancestors.map(label).join(' › '),
    struckMatches: completionPresentation(parent.node, ancestors).pathStruckMatches ?? [],
  }
}
