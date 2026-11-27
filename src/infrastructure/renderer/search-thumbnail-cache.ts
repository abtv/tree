import { pngPresentation, readPngDimensions } from '../../shared/png-validation'
import { SEARCH_THUMBNAIL_HEIGHT, SEARCH_THUMBNAIL_WIDTH } from '../../shared/search-thumbnail-dimensions'
import {
  createAttachmentImageCache,
  decodeAttachmentImage,
  type DecodedAttachmentImage,
  type RetainedAttachmentImage,
} from './attachment-image-cache'

const SEARCH_THUMBNAIL_CACHE_LIMIT = 96 * 1024 * 1024
const THUMBNAIL_PIXEL_WIDTH = SEARCH_THUMBNAIL_WIDTH * 2
const THUMBNAIL_PIXEL_HEIGHT = SEARCH_THUMBNAIL_HEIGHT * 2

export interface DecodedThumbnailBitmap extends RetainedAttachmentImage {
  bitmap: ImageBitmap
  colorSpace: PredefinedColorSpace
}

export type SearchThumbnail = DecodedAttachmentImage | DecodedThumbnailBitmap

type InspectableOffscreenContext = OffscreenCanvasRenderingContext2D & {
  getContextAttributes?(): CanvasRenderingContext2DSettings
}

export async function decodeSearchThumbnail(bytes: Uint8Array): Promise<SearchThumbnail> {
  const dimensions = readPngDimensions(bytes)
  if (
    dimensions === undefined ||
    (dimensions.width <= THUMBNAIL_PIXEL_WIDTH && dimensions.height <= THUMBNAIL_PIXEL_HEIGHT) ||
    typeof createImageBitmap !== 'function' ||
    typeof OffscreenCanvas !== 'function' ||
    typeof CanvasRenderingContext2D !== 'function'
  ) {
    return decodeAttachmentImage(bytes)
  }

  const presentation = pngPresentation(bytes)
  if (presentation === 'original') return decodeAttachmentImage(bytes)
  // Keep the common untagged path in sRGB, and make room for wide-gamut screenshot profiles.
  const colorSpace = presentation === 'profiled' ? 'display-p3' : 'srgb'
  const scale = Math.min(THUMBNAIL_PIXEL_WIDTH / dimensions.width, THUMBNAIL_PIXEL_HEIGHT / dimensions.height)
  const width = Math.max(1, Math.round(dimensions.width * scale))
  const height = Math.max(1, Math.round(dimensions.height * scale))
  try {
    const bitmap = await resizeSearchThumbnail(bytes, width, height, colorSpace)
    return { bitmap, colorSpace, width, height, encodedByteLength: 0, release: () => bitmap.close() }
  } catch {
    // A failure in the thumbnail path should not hide an otherwise displayable attachment.
    return decodeAttachmentImage(bytes)
  }
}

async function resizeSearchThumbnail(
  bytes: Uint8Array,
  width: number,
  height: number,
  colorSpace: PredefinedColorSpace,
): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }), {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
  })
  // Some runtimes decode the PNG but ignore the requested dimensions.
  if (bitmap.width === width && bitmap.height === height) return bitmap

  try {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { colorSpace }) as InspectableOffscreenContext | null
    if (
      context === null ||
      (colorSpace === 'display-p3' && context.getContextAttributes?.().colorSpace !== colorSpace)
    ) {
      throw new Error('Could not create a thumbnail canvas in the requested color space')
    }
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    return canvas.transferToImageBitmap()
  } finally {
    bitmap.close()
  }
}

export const searchThumbnailCache = createAttachmentImageCache(
  (id) => window.treeApi.readAttachment(id),
  decodeSearchThumbnail,
  SEARCH_THUMBNAIL_CACHE_LIMIT,
)
