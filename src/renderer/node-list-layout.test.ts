// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { breadcrumbAtPoint } from './node-list-layout'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('breadcrumbAtPoint', () => {
  it('uses each segment width and the full toolbar height, with whitespace remaining invalid', () => {
    document.body.innerHTML =
      '<header class="location-bar"><button data-breadcrumb-id=""></button><span data-breadcrumb-id="a"></span></header>'
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const left = this.dataset.breadcrumbId === 'a' ? 20 : 0
      const width = this.classList.contains('location-bar') ? 200 : 20
      return { left, right: left + width, top: 0, bottom: 30, height: 30, width } as DOMRect
    })
    expect(breadcrumbAtPoint(1, 0)).toEqual({ parentId: null })
    expect(breadcrumbAtPoint(20, 29)).toEqual({ parentId: 'a' })
    expect(breadcrumbAtPoint(40, 15)).toEqual({ parentId: undefined })
    expect(breadcrumbAtPoint(20, 30)).toBeUndefined()
    expect(breadcrumbAtPoint(-1, 15)).toBeUndefined()
    document.body.replaceChildren()
    expect(breadcrumbAtPoint(20, 15)).toBeUndefined()
  })
})
