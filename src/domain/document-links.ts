import type { LinkRange } from './document-types'

export function isHttpUrl(value: string): boolean {
  if (/\s/.test(value)) return false
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

/** Keep unaffected links and recognize the URL token changed by a native text edit. */
export function linksAfterTextEdit(text: string, links: readonly LinkRange[], nextText: string): LinkRange[] {
  return reconcileLinkTextEdit(text, links, nextText).links
}

export function reconcileLinkTextEdit(
  text: string,
  links: readonly LinkRange[],
  nextText: string,
  draft?: LinkRange,
): { links: LinkRange[]; draft?: LinkRange; createsNewLink: boolean } {
  if (text === nextText)
    return { links: normalizeLinks(links, text), createsNewLink: false, ...(draft === undefined ? {} : { draft }) }
  let start = 0
  while (start < text.length && start < nextText.length && text[start] === nextText[start]) start += 1
  let oldEnd = text.length
  let newEnd = nextText.length
  while (oldEnd > start && newEnd > start && text[oldEnd - 1] === nextText[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }
  const delta = nextText.length - text.length
  const isPureAppend = start === oldEnd
  const insertedIntroducesWhitespace = /\s/.test(nextText.slice(start, newEnd))
  const editedLink = [...links, ...(draft === undefined ? [] : [draft])].find((link) => {
    if (!(link.start <= start && oldEnd <= link.end && start <= link.end)) return false
    // A pure append exactly at a link's end that starts with whitespace begins new, unrelated
    // text rather than extending the link; leave the link untouched instead of absorbing it.
    if (isPureAppend && link.end === start && insertedIntroducesWhitespace) return false
    return true
  })
  const retained = links
    .filter((link) => link !== editedLink && (link.end <= start || link.start >= oldEnd))
    .map((link) => (link.start >= oldEnd ? { ...link, start: link.start + delta, end: link.end + delta } : { ...link }))
  if (editedLink !== undefined) {
    const projected = {
      start: editedLink.start,
      end: editedLink.end + delta,
      url: nextText.slice(editedLink.start, editedLink.end + delta),
    }
    if (isHttpUrl(projected.url))
      return { links: normalizeLinks([...retained, projected], nextText), createsNewLink: false }
    return {
      links: normalizeLinks(retained, nextText),
      createsNewLink: false,
      ...(projected.end > projected.start ? { draft: projected } : {}),
    }
  }
  let tokenStart = Math.min(start, nextText.length)
  let tokenEnd = Math.min(newEnd, nextText.length)
  while (tokenStart > 0 && !/\s/.test(nextText[tokenStart - 1] ?? '')) tokenStart -= 1
  while (tokenEnd < nextText.length && !/\s/.test(nextText[tokenEnd] ?? '')) tokenEnd += 1
  const candidate = nextText.slice(tokenStart, tokenEnd)
  if (isHttpUrl(candidate)) {
    const untouched = retained.filter((link) => link.end <= tokenStart || link.start >= tokenEnd)
    return {
      links: normalizeLinks([...untouched, { start: tokenStart, end: tokenEnd, url: candidate }], nextText),
      createsNewLink: true,
    }
  }
  const shiftedDraft =
    draft === undefined || (start < draft.end && draft.start < oldEnd)
      ? undefined
      : draft.start >= oldEnd
        ? { ...draft, start: draft.start + delta, end: draft.end + delta }
        : draft
  return {
    links: normalizeLinks(retained, nextText),
    createsNewLink: false,
    ...(shiftedDraft === undefined ? {} : { draft: shiftedDraft }),
  }
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
  const shifted: LinkRange[] = []
  for (const link of links) {
    if (link.start < position && position < link.end) {
      // A paste strictly inside a link mirrors typing: the destination follows the new covered
      // text, and the link is dropped when that text is no longer a valid HTTP(S) URL.
      const url = `${link.url.slice(0, position - link.start)}${insertedText}${link.url.slice(position - link.start)}`
      if (isHttpUrl(url)) shifted.push({ start: link.start, end: link.end + delta, url })
      continue
    }
    shifted.push({
      ...link,
      start: link.start >= position ? link.start + delta : link.start,
      end: link.end > position ? link.end + delta : link.end,
    })
  }
  return normalizeLinks(
    [...shifted, ...inserted],
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
): { text: string; links: LinkRange[]; createsNewLink: boolean } {
  const from = Math.max(0, Math.min(start, end, text.length))
  const to = Math.max(from, Math.min(Math.max(start, end), text.length))
  const nextText = `${text.slice(0, from)}${insertedText}${text.slice(to)}`
  const reconciled = reconcileLinkTextEdit(text, links, nextText)
  return { text: nextText, links: reconciled.links, createsNewLink: reconciled.createsNewLink }
}

export interface LinkedTextEdit {
  start: number
  end: number
  inserted: string
}

/**
 * Apply several disjoint edits as one change, remapping link offsets instead of diffing text.
 * A single before/after diff cannot express an edit that touches two places at once, such as
 * wrapping a range in delimiters, so it would discard every link between the touched positions.
 */
export function replaceLinkedTextRanges(
  text: string,
  links: readonly LinkRange[],
  edits: readonly LinkedTextEdit[],
): { text: string; links: LinkRange[]; createsNewLink: boolean } {
  const ordered = edits
    .map((edit) => {
      const from = Math.max(0, Math.min(edit.start, edit.end, text.length))
      return {
        start: from,
        end: Math.max(from, Math.min(Math.max(edit.start, edit.end), text.length)),
        inserted: edit.inserted,
      }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const placements: { start: number; end: number }[] = []
  let nextText = ''
  let consumed = 0
  for (const edit of ordered) {
    if (edit.start < consumed) return { text, links: normalizeLinks(links, text), createsNewLink: false }
    nextText += text.slice(consumed, edit.start)
    placements.push({ start: nextText.length, end: nextText.length + edit.inserted.length })
    nextText += edit.inserted
    consumed = edit.end
  }
  nextText += text.slice(consumed)

  // A link ending exactly where text is inserted must not absorb the insertion, while a link
  // starting there moves behind it, so the two ends of a link shift by different amounts.
  const shift = (offset: number, isEnd: boolean): number => {
    let delta = 0
    for (const edit of ordered) {
      if (edit.end > offset) break
      if (isEnd && edit.start === offset && edit.end === offset) continue
      delta += edit.inserted.length - (edit.end - edit.start)
    }
    return offset + delta
  }
  const splitsLink = (link: LinkRange, edit: { start: number; end: number }): boolean =>
    edit.start === edit.end
      ? link.start < edit.start && edit.start < link.end
      : edit.start < link.end && edit.end > link.start
  const retained = links
    .filter((link) => !ordered.some((edit) => splitsLink(link, edit)))
    .map((link) => ({ ...link, start: shift(link.start, false), end: shift(link.end, true) }))

  const created: LinkRange[] = []
  for (const placement of placements) {
    let tokenStart = placement.start
    let tokenEnd = placement.end
    while (tokenStart > 0 && !/\s/.test(nextText[tokenStart - 1] ?? '')) tokenStart -= 1
    while (tokenEnd < nextText.length && !/\s/.test(nextText[tokenEnd] ?? '')) tokenEnd += 1
    const candidate = nextText.slice(tokenStart, tokenEnd)
    if (!isHttpUrl(candidate)) continue
    if (retained.some((link) => link.start === tokenStart && link.end === tokenEnd)) continue
    created.push({ start: tokenStart, end: tokenEnd, url: candidate })
  }
  const untouched = retained.filter((link) =>
    created.every((candidate) => link.end <= candidate.start || link.start >= candidate.end),
  )
  return {
    text: nextText,
    links: normalizeLinks([...untouched, ...created], nextText),
    createsNewLink: created.length > 0,
  }
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

export function linkAtPosition(links: readonly LinkRange[] | undefined, position: number): LinkRange | undefined {
  return links?.find((link) => link.start <= position && position < link.end)
}

export function splitLinks(links: readonly LinkRange[], position: number): { before: LinkRange[]; after: LinkRange[] } {
  return {
    before: links.filter((link) => link.end <= position).map((link) => ({ ...link })),
    after: links
      .filter((link) => link.start >= position)
      .map((link) => ({ ...link, start: link.start - position, end: link.end - position })),
  }
}
