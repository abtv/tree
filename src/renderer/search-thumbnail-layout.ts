// Keep these limits in sync with `.search-thumbnail` in styles.css.
const MAX_THUMBNAIL_WIDTH = 120
const MAX_THUMBNAIL_HEIGHT = 48
export const SEARCH_THUMBNAIL_BLOCK_MARGIN = 6

export function searchThumbnailSize(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } | undefined {
  if (width === undefined || height === undefined) return undefined
  const scale = Math.min(1, MAX_THUMBNAIL_WIDTH / width, MAX_THUMBNAIL_HEIGHT / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
