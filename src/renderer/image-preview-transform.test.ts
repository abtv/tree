import { describe, expect, it } from 'vitest'
import { constrainPreview, INITIAL_PREVIEW_TRANSFORM, zoomPreview } from './image-preview-transform'

const geometry = { width: 600, height: 400, viewportWidth: 600, viewportHeight: 400 }

describe('image preview geometry', () => {
  it('preserves the image point under the zoom anchor', () => {
    const result = zoomPreview(INITIAL_PREVIEW_TRANSFORM, 2, geometry, { x: 100, y: 50 })

    expect(result).toEqual({ scale: 2, x: -100, y: -50 })
    expect(zoomPreview(result, 0.5, geometry, { x: 100, y: 50 })).toEqual(INITIAL_PREVIEW_TRANSFORM)
  })

  it('bounds scale and recenters when zooming back to fit', () => {
    expect(zoomPreview(INITIAL_PREVIEW_TRANSFORM, 100, geometry).scale).toBe(16)
    expect(zoomPreview({ scale: 2, x: 100, y: -100 }, 0.01, geometry)).toEqual(INITIAL_PREVIEW_TRANSFORM)
  })

  it('stops panning at image edges and centers axes that fit', () => {
    expect(constrainPreview({ scale: 2, x: -1000, y: 1000 }, geometry)).toEqual({ scale: 2, x: -300, y: 200 })
    expect(constrainPreview({ scale: 2, x: 200, y: 100 }, { ...geometry, height: 100 })).toEqual({
      scale: 2,
      x: 200,
      y: 0,
    })
  })

  it('reconstrains the image when the viewport grows', () => {
    expect(
      constrainPreview({ scale: 2, x: 300, y: 200 }, { ...geometry, viewportWidth: 1000, viewportHeight: 1000 }),
    ).toEqual({ scale: 2, x: 100, y: 0 })
  })
})
