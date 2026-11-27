import { SEARCH_THUMBNAIL_HEIGHT, SEARCH_THUMBNAIL_WIDTH } from '../shared/search-thumbnail-dimensions'

// Keep the slot height and margin in sync with styles.css.
const THUMBNAIL_ERROR_LINE_HEIGHT = 20
const THUMBNAIL_BLOCK_MARGIN = 6

export function searchThumbnailSize(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } | undefined {
  if (width === undefined || height === undefined) return undefined
  const scale = Math.min(1, SEARCH_THUMBNAIL_WIDTH / width, SEARCH_THUMBNAIL_HEIGHT / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Reserve room for either the fitted image or one line of failure text. */
export function searchThumbnailSlotHeight(size: { height: number } | undefined): number | undefined {
  return size === undefined ? undefined : Math.max(size.height, THUMBNAIL_ERROR_LINE_HEIGHT)
}

export function estimateSearchThumbnailBlockHeight(width: number | undefined, height: number | undefined): number {
  const slotHeight = searchThumbnailSlotHeight(searchThumbnailSize(width, height))
  return slotHeight === undefined ? 0 : slotHeight + THUMBNAIL_BLOCK_MARGIN
}
