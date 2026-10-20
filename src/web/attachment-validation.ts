import { validateAttachmentBytes } from '../electron/main/ipc-security'

/** Accepts only PNG bytes within the attachment limits that the browser can decode (PRODUCT §17). */
export async function validatePngAttachment(bytes: Uint8Array): Promise<void> {
  validateAttachmentBytes(bytes, () => true)
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }))
  bitmap.close()
}
