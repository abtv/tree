import type { LinkRange } from '../domain/document'

/**
 * The selection a Normal-mode caret draws: a block over exactly one text character, or a collapsed
 * caret on the terminal image character (or on an empty node, where no text character exists).
 */
export type NormalCaretTarget = { kind: 'block'; start: number; end: number } | { kind: 'collapsed'; position: number }

/**
 * Resolve the Normal-mode caret target from a text position. A block is always one character, so a
 * caret on a hyperlink character can never select past the character or the link boundary.
 */
export function normalCaretTarget(textLength: number, position: number, hasAttachment: boolean): NormalCaretTarget {
  if (hasAttachment && position === textLength) return { kind: 'collapsed', position: textLength }
  if (textLength === 0) return { kind: 'collapsed', position: 0 }
  const cursor = Math.min(Math.max(position, 0), textLength - 1)
  return { kind: 'block', start: cursor, end: cursor + 1 }
}

/**
 * The saved pending-link draft while it still addresses the text it was captured against. Once an
 * edit changes that slice, the draft is stale and must not steer link reconciliation.
 */
export function currentLinkDraft(text: string, draft: LinkRange | undefined): LinkRange | undefined {
  if (draft === undefined || text.slice(draft.start, draft.end) !== draft.url) return undefined
  return draft
}
