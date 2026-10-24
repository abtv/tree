export interface PreviewTransform {
  scale: number
  x: number
  y: number
}

export interface PreviewGeometry {
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

export const INITIAL_PREVIEW_TRANSFORM: PreviewTransform = { scale: 1, x: 0, y: 0 }

export function constrainPreview(transform: PreviewTransform, geometry: PreviewGeometry): PreviewTransform {
  const scale = Math.max(1, Math.min(16, transform.scale))
  const limitX = Math.max(0, (geometry.width * scale - geometry.viewportWidth) / 2)
  const limitY = Math.max(0, (geometry.height * scale - geometry.viewportHeight) / 2)
  return {
    scale,
    x: limitX === 0 ? 0 : Math.max(-limitX, Math.min(limitX, transform.x)),
    y: limitY === 0 ? 0 : Math.max(-limitY, Math.min(limitY, transform.y)),
  }
}

export function zoomPreview(
  transform: PreviewTransform,
  factor: number,
  geometry: PreviewGeometry,
  anchor = { x: 0, y: 0 },
): PreviewTransform {
  const scale = Math.max(1, Math.min(16, transform.scale * factor))
  const ratio = scale / transform.scale
  return constrainPreview(
    { scale, x: anchor.x - (anchor.x - transform.x) * ratio, y: anchor.y - (anchor.y - transform.y) * ratio },
    geometry,
  )
}
