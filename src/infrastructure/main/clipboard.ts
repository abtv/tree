import type { LinkRange } from '../../domain/document'
import type { ClipboardPayload, ClipboardWritePayload } from '../../shared/ipc'

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
  const links = html.length === 0 ? [] : extractClipboardLinks(html, text)
  return links.length === 0 ? { kind: 'text', text } : { kind: 'text', text, links }
}

export function extractClipboardLinks(html: string, text: string): LinkRange[] {
  const links: LinkRange[] = []
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi
  let searchFrom = 0
  for (const match of html.matchAll(anchorPattern)) {
    const url = decodeHtml(match[2] ?? '')
    const label = decodeHtml((match[3] ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
    if (label.length === 0) continue
    const start = text.indexOf(label, searchFrom)
    if (start < 0) continue
    links.push({ start, end: start + label.length, url })
    searchFrom = start + label.length
  }
  return links
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
