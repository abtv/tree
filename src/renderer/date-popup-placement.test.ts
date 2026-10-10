import { describe, expect, it } from 'vitest'
import { placeInViewport } from './date-popup-placement'

const viewport = { width: 800, height: 600 }
const size = { width: 200, height: 100 }

// @requirement PRODUCT.md §20.9
describe('placeInViewport', () => {
  it('keeps the popup below the row when it fits', () => {
    expect(placeInViewport({ left: 40, top: 300, rowTop: 270 }, size, viewport)).toEqual({ left: 40, top: 300 })
  })

  it('accepts a popup that ends exactly at the bottom edge', () => {
    expect(placeInViewport({ left: 40, top: 500, rowTop: 470 }, size, viewport)).toEqual({ left: 40, top: 500 })
  })

  it('flips above the row when the space below is too small', () => {
    expect(placeInViewport({ left: 40, top: 560, rowTop: 530 }, size, viewport)).toEqual({ left: 40, top: 430 })
  })

  it('stays below when it fits neither below nor above', () => {
    expect(placeInViewport({ left: 40, top: 80, rowTop: 50 }, { ...size, height: 560 }, viewport)).toEqual({
      left: 40,
      top: 80,
    })
  })

  it('flips when the popup fits above with no space to spare', () => {
    expect(placeInViewport({ left: 40, top: 580, rowTop: 100 }, size, viewport)).toEqual({ left: 40, top: 0 })
  })

  it('shifts left at the right edge and never past the left edge', () => {
    expect(placeInViewport({ left: 700, top: 300, rowTop: 270 }, size, viewport).left).toBe(600)
    expect(placeInViewport({ left: -20, top: 300, rowTop: 270 }, size, viewport).left).toBe(0)
    expect(placeInViewport({ left: 10, top: 300, rowTop: 270 }, { ...size, width: 900 }, viewport).left).toBe(0)
  })
})
