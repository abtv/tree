// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { breadcrumbAtPoint, buildLayout, EMPTY_LAYOUT, measureElement, measuredScrollDelta } from './node-list-layout'
import { ROW_HEIGHT_ESTIMATE } from './list-window'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

// @requirement PRODUCT.md §20.1
// @requirement PRODUCT.md §23.6
it.each([
  { start: 25, heights: [50, 25, 25], delta: 25 },
  { start: 30.5, heights: [12.5, 25, 25], delta: -12.5 },
  { start: 49.5, heights: [50, 10, 80], delta: 25 },
  { start: 0, heights: [50, 25, 25], delta: 0 },
  { start: -10, heights: [50, 25, 25], delta: 0 },
  { start: 75, heights: [30, 35, 25], delta: 15 },
])('preserves the first visible row at $start after measurements change', ({ start, heights, delta }) => {
  const rows = heights.map((_, index) => ({ key: String(index) }))
  const before = buildLayout(rows, new Map())
  const after = buildLayout(rows, new Map(heights.map((height, index) => [String(index), height])))

  expect(measuredScrollDelta(before, after, start)).toBe(delta)
})

it('does not compensate an empty, unchanged or incompatible layout', () => {
  const before = buildLayout([{ key: 'a' }, { key: 'b' }], new Map())
  const after = buildLayout([{ key: 'a' }], new Map([['a', 50]]))

  expect(measuredScrollDelta(EMPTY_LAYOUT, before, 25)).toBe(0)
  expect(measuredScrollDelta(before, before, 25)).toBe(0)
  expect(measuredScrollDelta(before, after, 25)).toBe(0)
})

// @requirement PRODUCT.md §22.1
it('does not index unmeasured rows when opening a large list', () => {
  let reads = 0
  const rows = Array.from({ length: 100000 }, (_, index) => ({
    get key() {
      reads++
      return `row-${index}`
    },
  }))

  const initial = buildLayout(rows, new Map())
  const confirmed = buildLayout(rows, new Map([['row-0', ROW_HEIGHT_ESTIMATE]]))

  expect(reads).toBe(0)
  expect(confirmed).toBe(initial)
  expect(initial.total).toBe(100000 * ROW_HEIGHT_ESTIMATE)

  const measured = buildLayout(rows, new Map([['row-1', 40]]))

  expect(reads).toBe(2)
  expect(measured.offsets[2]).toBe(ROW_HEIGHT_ESTIMATE + 40)
})

// @requirement PRODUCT.md §22.1
it('bounds offset reads when anchoring measurements near the end of a large list', () => {
  const rows = Array.from({ length: 10000 }, (_, index) => ({ key: String(index) }))
  const before = buildLayout(rows, new Map())
  const after = buildLayout(rows, new Map([['0', 50]]))
  let reads = 0
  const offsets = new Proxy(before.offsets, {
    get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++
      return Reflect.get(target, key, target)
    },
  })

  expect(measuredScrollDelta({ ...before, offsets }, after, before.total - 5)).toBe(25)
  expect(reads).toBeLessThan(40)
})

it('records an estimated row height without invalidating unchanged layout, then reports a real resize', () => {
  const element = document.createElement('div')
  const bounds = vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, ROW_HEIGHT_ESTIMATE))
  const heights = new Map<string, number>()
  const revise = vi.fn()

  measureElement('row', element, heights, revise)

  expect(heights.get('row')).toBe(ROW_HEIGHT_ESTIMATE)
  expect(revise).not.toHaveBeenCalled()

  bounds.mockReturnValue(new DOMRect(0, 0, 100, ROW_HEIGHT_ESTIMATE * 2))
  measureElement('row', element, heights, revise)

  expect(heights.get('row')).toBe(ROW_HEIGHT_ESTIMATE * 2)
  expect(revise).toHaveBeenCalledOnce()

  measureElement('row', element, heights, revise)

  expect(revise).toHaveBeenCalledOnce()

  bounds.mockReturnValue(new DOMRect(0, 0, 100, 0))
  measureElement('row', element, heights, revise)

  expect(heights.get('row')).toBe(ROW_HEIGHT_ESTIMATE * 2)
  expect(revise).toHaveBeenCalledOnce()
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
  const measured = buildLayout(
    rows,
    new Map([
      ['row-1', 40],
      ['row-9999', 10],
      ['removed', 80],
    ]),
  )
  reads = 0

  const resized = buildLayout(rows, new Map([['row-1', 60]]))
  const newlyMeasured = buildLayout(rows, new Map([['row-5000', 50]]))
  const removed = buildLayout(rows, new Map([['removed', 80]]))
  const reset = buildLayout(rows, new Map())

  expect(reads).toBe(0)
  expect(measured.offsets[1]).toBe(ROW_HEIGHT_ESTIMATE)
  expect(measured.offsets[2]).toBe(ROW_HEIGHT_ESTIMATE + 40)
  expect(measured.total).toBe(9998 * ROW_HEIGHT_ESTIMATE + 50)
  expect(resized.total).toBe(9999 * ROW_HEIGHT_ESTIMATE + 60)
  expect(newlyMeasured.total).toBe(9999 * ROW_HEIGHT_ESTIMATE + 50)
  expect(removed).toBe(initial)
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
