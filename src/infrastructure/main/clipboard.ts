import type { LinkRange } from '../../domain/document'
import type { ClipboardPayload, ClipboardWritePayload } from '../../shared/ipc'

const MAX_CLIPBOARD_HTML_LENGTH = 1_048_576
const MAX_CLIPBOARD_LINKS = 100

export interface NativeClipboard {
  read(): Promise<Array<{ types: string[]; getType(type: string): Promise<Blob> | Promise<unknown> }>>
  readText(): Promise<string>
  readHTML?(): string | Promise<string>
  writeRichText?(text: string, html: string): Promise<void>
  writeText?(text: string): void
  writeHTML?(html: string): void
}

export async function writeClipboard(clipboard: NativeClipboard, payload: ClipboardWritePayload): Promise<void> {
  if (clipboard.writeRichText !== undefined) {
    await clipboard.writeRichText(payload.text, payload.html)
    return
  }
  clipboard.writeText?.(payload.text)
  clipboard.writeHTML?.(payload.html)
}

export async function readClipboard(clipboard: NativeClipboard): Promise<ClipboardPayload> {
  const items = await clipboard.read()
  for (const item of items) {
    const imageType = item.types.find((type) => type.toLowerCase() === 'image/png')
    if (imageType !== undefined) {
      const blob = (await item.getType(imageType)) as Blob
      return { kind: 'image', png: new Uint8Array(await blob.arrayBuffer()) }
    }
  }
  const text = await clipboard.readText()
  const html = (await clipboard.readHTML?.()) ?? ''
  const links = html.length === 0 || html.length > MAX_CLIPBOARD_HTML_LENGTH ? [] : extractClipboardLinks(html, text)
  return links.length === 0 ? { kind: 'text', text } : { kind: 'text', text, links }
}

export function extractClipboardLinks(html: string, text: string): LinkRange[] {
  if (html.length > MAX_CLIPBOARD_HTML_LENGTH) return []
  const links: LinkRange[] = []
  let searchFrom = 0
  let scanFrom = 0
  let anchorsExamined = 0
  while (links.length < MAX_CLIPBOARD_LINKS && anchorsExamined < MAX_CLIPBOARD_LINKS) {
    const opening = findAnchorTag(html, scanFrom, false)
    if (opening === undefined) break
    anchorsExamined += 1
    const closing = findAnchorTag(html, opening.end, true)
    if (closing === undefined) break
    scanFrom = closing.end

    const url = decodeHtml(readQuotedHref(html.slice(opening.start, opening.end)) ?? '')
    const label = extractAnchorLabel(html, opening.end, closing.start)
    if (label.length === 0) continue
    const start = text.indexOf(label, searchFrom)
    if (start < 0) continue
    links.push({ start, end: start + label.length, url })
    searchFrom = start + label.length
  }
  return links
}

interface AnchorTagRange {
  start: number
  end: number
}

function findAnchorTag(html: string, from: number, closing: boolean): AnchorTagRange | undefined {
  let searchFrom = from
  while (searchFrom < html.length) {
    const start = html.indexOf('<', searchFrom)
    if (start < 0) return undefined
    searchFrom = start + 1
    let nameStart = start + 1
    if (closing) {
      if (html[nameStart] !== '/') continue
      nameStart += 1
    } else if (html[nameStart] === '/') {
      continue
    }
    if (html[nameStart]?.toLowerCase() !== 'a' || !isTagNameBoundary(html[nameStart + 1])) continue
    const end = findTagEnd(html, nameStart + 1)
    if (end < 0) return undefined
    return { start, end: end + 1 }
  }
  return undefined
}

function isTagNameBoundary(value: string | undefined): boolean {
  return value === undefined || value === '>' || value === '/' || isHtmlWhitespace(value)
}

function findTagEnd(html: string, from: number): number {
  let quote: string | undefined
  for (let index = from; index < html.length; index += 1) {
    const character = html[index]!
    if (quote !== undefined) {
      if (character === quote) quote = undefined
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index
    }
  }
  return -1
}

function readQuotedHref(openingTag: string): string | undefined {
  let index = 2
  while (index < openingTag.length - 1) {
    while (isHtmlWhitespace(openingTag[index])) index += 1
    if (openingTag[index] === '>' || openingTag[index] === '/') return undefined
    const nameStart = index
    while (
      index < openingTag.length &&
      !isHtmlWhitespace(openingTag[index]) &&
      openingTag[index] !== '=' &&
      openingTag[index] !== '>'
    ) {
      index += 1
    }
    if (nameStart === index) {
      index += 1
      continue
    }
    const name = openingTag.slice(nameStart, index).toLowerCase()
    while (isHtmlWhitespace(openingTag[index])) index += 1
    if (openingTag[index] !== '=') {
      if (name === 'href') return undefined
      continue
    }
    index += 1
    while (isHtmlWhitespace(openingTag[index])) index += 1
    const quote = openingTag[index]
    if (quote === '"' || quote === "'") {
      const valueStart = index + 1
      const valueEnd = openingTag.indexOf(quote, valueStart)
      if (valueEnd < 0) return undefined
      if (name === 'href') return openingTag.slice(valueStart, valueEnd)
      index = valueEnd + 1
    } else {
      while (index < openingTag.length && !isHtmlWhitespace(openingTag[index]) && openingTag[index] !== '>') {
        index += 1
      }
      if (name === 'href') return undefined
    }
  }
  return undefined
}

function extractAnchorLabel(html: string, from: number, to: number): string {
  let label = ''
  let cursor = from
  while (cursor < to) {
    const tagStart = html.indexOf('<', cursor)
    if (tagStart < 0 || tagStart >= to) {
      label += html.slice(cursor, to)
      break
    }
    label += html.slice(cursor, tagStart)
    const tagEnd = html.indexOf('>', tagStart + 1)
    if (tagEnd < 0 || tagEnd >= to) {
      label += html.slice(tagStart, to)
      break
    }
    const tag = html.slice(tagStart, tagEnd + 1)
    if (/^<br\s*\/?\s*>$/i.test(tag)) label += '\n'
    cursor = tagEnd + 1
  }
  return decodeHtml(label)
}

function isHtmlWhitespace(value: string | undefined): boolean {
  return value !== undefined && (value === ' ' || value === '\t' || value === '\n' || value === '\r' || value === '\f')
}

function decodeHtml(value: string): string {
  return value.replace(/&(?:amp|quot|lt|gt|nbsp|#(?:\d+|x[\da-f]+));/gi, (reference) => {
    switch (reference.toLowerCase()) {
      case '&amp;':
        return '&'
      case '&quot;':
        return '"'
      case '&lt;':
        return '<'
      case '&gt;':
        return '>'
      case '&nbsp;':
        return '\u00a0'
    }

    const numeric = reference.slice(2, -1)
    const codePoint =
      numeric[0]?.toLowerCase() === 'x' ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10)
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '\ufffd'
    return String.fromCodePoint(codePoint)
  })
}
