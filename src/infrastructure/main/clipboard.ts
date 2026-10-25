import type { ClipboardPayload, ClipboardWritePayload } from '../../shared/ipc'
import { MAX_ATTACHMENT_BYTES } from '../../shared/attachment-limits'
import { extractClipboardLinks } from '../../shared/clipboard-links'

export interface NativeClipboard {
  read(): Promise<Array<{ types: string[]; getType(type: string): Promise<Blob> | Promise<unknown> }>>
  readText(): Promise<string>
  readHTML?(): string | Promise<string>
  writeRichText?(text: string, html: string): Promise<void>
  writePlainText?(text: string): Promise<void>
  writeImage?(png: Uint8Array): Promise<void>
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
      if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error('Clipboard image is too large (maximum 25 MiB).')
      return { kind: 'image', png: new Uint8Array(await blob.arrayBuffer()) }
    }
  }
  const text = await clipboard.readText()
  const html = (await clipboard.readHTML?.()) ?? ''
  const links = extractClipboardLinks(html, text)
  return links.length === 0 ? { kind: 'text', text } : { kind: 'text', text, links }
}
