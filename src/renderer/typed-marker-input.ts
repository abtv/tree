import type { LinkRange } from '../domain/document'
import { lowercaseTypedMarkerText } from '../domain/tags'

/** Adapt native input data and UTF-16 selection offsets to the marker typing rule. */
export function normalizeTypedInput(
  text: string,
  cursor: number,
  data: string | null | undefined,
  links: readonly LinkRange[] = [],
): { text: string; cursor: number } {
  if (!data || text.slice(cursor - data.length, cursor) !== data) return { text, cursor }
  const normalized = lowercaseTypedMarkerText(text, cursor - data.length, cursor, links)
  return { text: normalized, cursor: cursor + normalized.length - text.length }
}
