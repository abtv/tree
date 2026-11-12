// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { breadcrumbAtPoint, buildLayout } from './node-list-layout'
import { ROW_HEIGHT_ESTIMATE } from './list-window'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('reuses row identities for repeated layout while applying current sparse measurements', () => {
  let reads = 0
  const rows = Array.from({ length: 10000 }, (_, index) => ({
    get key() {
      reads++
      return `row-${index}`
    },
  }))
  const initial = buildLayout(rows, new Map())
  reads = 0

  const measured = buildLayout(
    rows,
    new Map([
      ['row-1', 40],
      ['row-9999', 10],
      ['removed', 80],
    ]),
  )
  const resized = buildLayout(rows, new Map([['row-1', 60]]))
  const reset = buildLayout(rows, new Map())

  expect(reads).toBe(0)
  expect(measured.offsets[1]).toBe(ROW_HEIGHT_ESTIMATE)
  expect(measured.offsets[2]).toBe(ROW_HEIGHT_ESTIMATE + 40)
  expect(measured.total).toBe(9998 * ROW_HEIGHT_ESTIMATE + 50)
  expect(resized.total).toBe(9999 * ROW_HEIGHT_ESTIMATE + 60)
  expect(reset).toEqual(initial)
  expect(initial.total).toBe(10000 * ROW_HEIGHT_ESTIMATE)

  const changed = buildLayout([{ key: 'row-9999' }, { key: 'row-1' }], new Map([['row-1', 60]]))

  expect([...changed.offsets]).toEqual([0, ROW_HEIGHT_ESTIMATE, ROW_HEIGHT_ESTIMATE + 60])
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
