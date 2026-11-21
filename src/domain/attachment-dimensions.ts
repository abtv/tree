/** The largest PNG side Tree accepts, in pixels (`docs/PRODUCT.md` §17). */
export const MAX_ATTACHMENT_DIMENSION = 32_767
/** The largest PNG area Tree accepts, in pixels (`docs/PRODUCT.md` §17). */
export const MAX_ATTACHMENT_PIXELS = 64 * 1024 * 1024

/** The natural size of an attached image, in image pixels. */
export interface AttachmentDimensions {
  readonly width: number
  readonly height: number
}

/** True for a pair of positive integers within the attachment size limits of `docs/PRODUCT.md` §17. */
export function isValidAttachmentDimensions(width: unknown, height: unknown): boolean {
  return isSide(width) && isSide(height) && (width as number) * (height as number) <= MAX_ATTACHMENT_PIXELS
}

function isSide(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_ATTACHMENT_DIMENSION
}
