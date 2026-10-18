import type { ClipboardPayload } from '../shared/ipc'
import { extractClipboardLinks } from '../infrastructure/main/clipboard'
import { MAX_ATTACHMENT_BYTES } from '../electron/main/ipc-security'

/** Capture event-owned data synchronously; the store may wait for an earlier clipboard operation. */
export function capturePasteClipboard(data: DataTransfer): () => Promise<ClipboardPayload> {
  const image = Array.from(data.files).find((file) => file.type === 'image/png')
  const text = data.getData('text/plain')
  const html = data.getData('text/html')
  return async () => {
    if (image !== undefined) {
      if (image.size > MAX_ATTACHMENT_BYTES) throw new Error('Clipboard image is too large (maximum 25 MiB).')
      return { kind: 'image', png: new Uint8Array(await image.arrayBuffer()) }
    }
    return { kind: 'text', text, links: extractClipboardLinks(html, text) }
  }
}
