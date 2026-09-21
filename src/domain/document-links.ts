import type { LinkRange } from './document-types'

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

export function normalizeLinks(links: readonly LinkRange[], text: string, requireMatchingText = true): LinkRange[] {
  const sorted = links
    .filter(
      (link) =>
        link.start >= 0 &&
        link.end > link.start &&
        link.end <= text.length &&
        (!requireMatchingText || text.slice(link.start, link.end) === link.url) &&
        isHttpUrl(link.url),
    )
    .sort((a, b) => a.start - b.start)
  const result: LinkRange[] = []
  for (const link of sorted) {
    if ((result.at(-1)?.end ?? 0) > link.start) continue
    result.push({ ...link })
  }
  return result
}

export function insertLinks(
  links: readonly LinkRange[],
  position: number,
  insertedText: string,
  insertedLinks?: readonly LinkRange[],
): LinkRange[] {
  const delta = insertedText.length
  const inserted =
    insertedLinks === undefined
      ? isHttpUrl(insertedText)
        ? [{ start: position, end: position + delta, url: insertedText }]
        : []
      : insertedLinks
          .filter((link) => insertedText.slice(link.start, link.end) === link.url)
          .map((link) => ({ ...link, start: link.start + position, end: link.end + position }))
  return normalizeLinks(
    [
      ...links.map((link) => ({
        ...link,
        start: link.start >= position ? link.start + delta : link.start,
        end: link.end > position ? link.end + delta : link.end,
      })),
      ...inserted,
    ],
    ' '.repeat(Math.max(position + delta, ...links.map((link) => link.end + delta), 0)),
    false,
  )
}

export function replaceLinkedText(
  text: string,
  links: readonly LinkRange[],
  start: number,
  end: number,
  insertedText: string,
): { text: string; links: LinkRange[] } {
  let from = Math.max(0, Math.min(start, end, text.length))
  let to = Math.max(from, Math.min(Math.max(start, end), text.length))
  if (from === to) {
    const containingLink = links.find((link) => link.start < from && from < link.end)
    if (containingLink !== undefined) {
      from = from - containingLink.start <= containingLink.end - from ? containingLink.start : containingLink.end
      to = from
    }
  }
  const withoutRange = `${text.slice(0, from)}${text.slice(to)}`
  const retained = links
    .filter((link) => link.end <= from || link.start >= to)
    .map((link) => ({
      ...link,
      start: link.start >= to ? link.start - (to - from) : link.start,
      end: link.end >= to ? link.end - (to - from) : link.end,
    }))
  const nextText = `${withoutRange.slice(0, from)}${insertedText}${withoutRange.slice(from)}`
  return { text: nextText, links: insertLinks(retained, from, insertedText) }
}

export function linksForLine(links: readonly LinkRange[] | undefined, lines: string[], lineIndex: number): LinkRange[] {
  if (links === undefined) return []
  let lineStart = 0
  for (let index = 0; index < lineIndex; index += 1) lineStart += (lines[index] ?? '').length + 1
  const lineEnd = lineStart + (lines[lineIndex] ?? '').length
  return links
    .filter((link) => link.start >= lineStart && link.end <= lineEnd)
    .map((link) => ({ ...link, start: link.start - lineStart, end: link.end - lineStart }))
}

export function splitLinks(links: readonly LinkRange[], position: number): { before: LinkRange[]; after: LinkRange[] } {
  return {
    before: links.filter((link) => link.end <= position).map((link) => ({ ...link })),
    after: links
      .filter((link) => link.start >= position)
      .map((link) => ({ ...link, start: link.start - position, end: link.end - position })),
  }
}
