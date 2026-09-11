import type { ClipboardPayload } from '../../shared/ipc'

export interface NativeClipboard {
  read(): Promise<Array<{ types: string[]; getType(type: string): Promise<Blob> | Promise<unknown> }>>
  readText(): Promise<string>
}

export async function readClipboard(clipboard: NativeClipboard): Promise<ClipboardPayload> {
  const items = await clipboard.read()
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (imageType !== undefined) {
      const blob = (await item.getType(imageType)) as Blob
      return { kind: 'image', png: new Uint8Array(await blob.arrayBuffer()) }
    }
  }
  return { kind: 'text', text: await clipboard.readText() }
}
