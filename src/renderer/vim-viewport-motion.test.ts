// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { viewportBounds, viewportScrollEdges } from './scroll-viewport'
import { contextViewport, moveViewportSelection, readViewportRows, viewportMotionTarget } from './vim-viewport-motion'
import type { VimViewportMotion } from './vim-keyboard-types'
import { createEditorStoreDouble } from './test/editor-store-double'

// The content is scrolled to both ends by default, so H, M, and L keep no edge context.
vi.mock('./scroll-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scroll-viewport')>()),
  viewportBounds: vi.fn(() => ({ top: 0, bottom: 100 })),
  viewportScrollEdges: vi.fn(() => ({ atStart: true, atEnd: true })),
}))

type ViewportRow = Parameters<typeof viewportMotionTarget>[0][number]
const viewport = { top: 0, bottom: 100 }
const rows: ViewportRow[] = ['a', 'b', 'c', 'd'].map((nodeId, index) => ({
  nodeId,
  top: index * 20,
  bottom: (index + 1) * 20,
}))

function mountRows(records: readonly ViewportRow[]): HTMLElement[] {
  return records.map(({ nodeId, top, bottom }) => {
    const row = document.createElement('div')
    row.className = 'node-row'
    if (nodeId !== undefined) row.dataset.nodeId = nodeId
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 10, bottom - top))
    document.body.append(row)
    return row
  })
}

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllMocks()
  vi.mocked(viewportScrollEdges).mockReturnValue({ atStart: true, atEnd: true })
})

describe('viewport motion target', () => {
  it.each<[VimViewportMotion, string]>([
    ['top', 'a'],
    ['middle', 'b'],
    ['bottom', 'd'],
    ['half-down', 'd'],
    ['half-up', 'a'],
  ])('selects %s from the current row', (motion, target) => {
    expect(viewportMotionTarget(rows, viewport, 'b', motion)).toBe(target)
  })

  it.each<[VimViewportMotion, number, string]>([
    ['top', 2, 'b'],
    ['top', 99, 'd'],
    ['bottom', 2, 'c'],
    ['bottom', 99, 'a'],
    ['middle', 99, 'b'],
    ['half-down', 99, 'd'],
    ['half-up', 99, 'a'],
  ])('preserves %s count %i and its edge clamp', (motion, count, target) => {
    expect(viewportMotionTarget(rows, viewport, 'b', motion, count)).toBe(target)
  })

  it.each<[VimViewportMotion, string]>([
    ['top', 'a'],
    ['middle', 'a'],
    ['bottom', 'b'],
  ])('prefers fully visible rows for %s', (motion, target) => {
    const clippedRows = [
      { nodeId: 'clipped-top', top: -10, bottom: 10 },
      { nodeId: 'a', top: 10, bottom: 40 },
      { nodeId: 'b', top: 40, bottom: 70 },
      { nodeId: 'clipped-bottom', top: 70, bottom: 110 },
    ]
    expect(viewportMotionTarget(clippedRows, viewport, 'clipped-top', motion)).toBe(target)
  })

  it.each<VimViewportMotion>(['top', 'middle', 'bottom', 'half-up', 'half-down'])(
    'falls back to the only clipped row for %s',
    (motion) => {
      expect(viewportMotionTarget([{ nodeId: 'clipped', top: -10, bottom: 110 }], viewport, 'clipped', motion)).toBe(
        'clipped',
      )
    },
  )

  it.each<[VimViewportMotion, string]>([
    ['half-down', 'c'],
    ['half-up', 'b'],
  ])('uses the visible edge when %s starts outside the viewport', (motion, target) => {
    expect(viewportMotionTarget(rows, viewport, 'outside', motion)).toBe(target)
  })

  it.each<[VimViewportMotion, string, string]>([
    ['half-up', 'a', 'a'],
    ['half-down', 'd', 'd'],
  ])('clamps %s at the current edge', (motion, current, target) => {
    expect(viewportMotionTarget(rows, viewport, current, motion)).toBe(target)
  })

  it('includes clipped rows in half-page motions', () => {
    const clippedRows = [
      { nodeId: 'clipped-top', top: -10, bottom: 10 },
      { nodeId: 'a', top: 10, bottom: 40 },
      { nodeId: 'b', top: 40, bottom: 70 },
      { nodeId: 'clipped-bottom', top: 70, bottom: 110 },
    ]
    expect(viewportMotionTarget(clippedRows, viewport, 'clipped-top', 'half-down')).toBe('b')
    expect(viewportMotionTarget(clippedRows, viewport, 'clipped-bottom', 'half-up')).toBe('a')
  })

  it('excludes rows merely touching viewport edges and handles empty rows', () => {
    expect(viewportMotionTarget([], viewport, 'a', 'top')).toBeUndefined()
    expect(
      viewportMotionTarget(
        [
          { nodeId: 'above', top: -20, bottom: 0 },
          { nodeId: 'below', top: 100, bottom: 120 },
        ],
        viewport,
        'above',
        'bottom',
      ),
    ).toBeUndefined()
  })

  it('retains rows without IDs in the index calculation and returns undefined for their target', () => {
    const missingIdRows = [
      { nodeId: undefined, top: 0, bottom: 20 },
      { nodeId: 'b', top: 20, bottom: 40 },
      { nodeId: 'c', top: 40, bottom: 60 },
    ]
    expect(viewportMotionTarget(missingIdRows, viewport, 'c', 'top')).toBeUndefined()
    expect(viewportMotionTarget(missingIdRows, viewport, 'c', 'top', 2)).toBe('b')
  })
})

describe('viewport DOM reader', () => {
  it('reads bounds and each row rectangle once in DOM order, retaining missing IDs', () => {
    const mounted = mountRows([
      { nodeId: 'b', top: -10, bottom: 20 },
      { nodeId: undefined, top: 20, bottom: 40 },
      { nodeId: 'a', top: 100, bottom: 120 },
    ])
    const unrelated = document.createElement('div')
    const unrelatedRect = vi.spyOn(unrelated, 'getBoundingClientRect')
    document.body.append(unrelated)

    expect(readViewportRows()).toEqual({
      viewport,
      rows: [
        { nodeId: 'b', top: -10, bottom: 20 },
        { nodeId: undefined, top: 20, bottom: 40 },
        { nodeId: 'a', top: 100, bottom: 120 },
      ],
    })
    expect(viewportBounds).toHaveBeenCalledOnce()
    for (const row of mounted) expect(row.getBoundingClientRect).toHaveBeenCalledOnce()
    expect(unrelatedRect).not.toHaveBeenCalled()
  })

  it('returns an empty row list when the DOM has no rows', () => {
    expect(readViewportRows()).toEqual({ viewport, rows: [] })
  })
})

describe('context viewport', () => {
  const both = { atStart: false, atEnd: false }

  it('removes one row of context from each edge the content can still scroll past', () => {
    expect(contextViewport(viewport, both)).toEqual({ top: 25, bottom: 75 })
    expect(contextViewport(viewport, { atStart: true, atEnd: false })).toEqual({ top: 0, bottom: 75 })
    expect(contextViewport(viewport, { atStart: false, atEnd: true })).toEqual({ top: 25, bottom: 100 })
    expect(contextViewport(viewport, { atStart: true, atEnd: true })).toEqual(viewport)
  })

  it('shrinks the context in a short content area', () => {
    expect(contextViewport({ top: 10, bottom: 50 }, both)).toEqual({ top: 20, bottom: 40 })
  })
})

describe('viewport selection dispatch', () => {
  it.each<[VimViewportMotion, string, number]>([
    ['top', 'a', 2],
    ['middle', 'b', 2],
    ['bottom', 'd', 3],
    ['half-down', 'd', 9],
    ['half-up', 'a', 9],
  ])('applies the %s column rule and synchronizes after selection', (motion, target, column) => {
    mountRows(rows)
    const store = createEditorStoreDouble({
      snapshot: {
        status: 'ready',
        document: {
          roots: [
            { id: 'a', text: '  alpha', children: [] },
            { id: 'b', text: ' \tbravo', children: [] },
            { id: 'c', text: 'charlie', children: [] },
            { id: 'd', text: '   delta', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'b' },
      },
    })
    const syncImageCaretToFocus = vi.fn(() => {
      expect(store.selectNode).toHaveBeenCalledExactlyOnceWith(target, column)
    })
    moveViewportSelection({ store, syncImageCaretToFocus }, 'b', motion, 9)
    expect(syncImageCaretToFocus).toHaveBeenCalledOnce()
  })

  it.each<[VimViewportMotion, number]>([
    ['top', 5],
    ['middle', 5],
    ['bottom', 5],
    ['half-up', 9],
    ['half-down', 9],
  ])('lands %s on an attached image only for a line motion', (motion, column) => {
    mountRows([{ nodeId: 'image', top: 0, bottom: 20 }])
    const store = createEditorStoreDouble({
      snapshot: {
        status: 'ready',
        document: {
          roots: [
            { id: 'image', text: '  abc', children: [], attachment: { id: 'attachment', mimeType: 'image/png' } },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'image' },
      },
    })
    const syncImageCaretToFocus = vi.fn()
    moveViewportSelection({ store, syncImageCaretToFocus }, 'image', motion, 9)
    expect(store.selectNode).toHaveBeenCalledExactlyOnceWith('image', column)
    expect(syncImageCaretToFocus).toHaveBeenCalledOnce()
  })

  it('chooses H and L outside the edge context, except where the content is scrolled to an end', () => {
    // The content area is 100 high, so the context is 25: only c (40-60) lies wholly inside 25-75.
    const store = createEditorStoreDouble({
      snapshot: {
        status: 'ready',
        document: { roots: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id, children: [] })) },
        location: { currentParentId: null, selectedNodeId: 'b' },
      },
    })
    mountRows(rows)
    vi.mocked(viewportScrollEdges).mockReturnValue({ atStart: false, atEnd: false })
    moveViewportSelection({ store, syncImageCaretToFocus: vi.fn() }, 'b', 'top', 0)
    expect(store.selectNode).toHaveBeenLastCalledWith('c', 0)
    moveViewportSelection({ store, syncImageCaretToFocus: vi.fn() }, 'b', 'bottom', 0)
    expect(store.selectNode).toHaveBeenLastCalledWith('c', 0)
    // Scrolled to the start, H may use the first row; at the end, L may use the last.
    vi.mocked(viewportScrollEdges).mockReturnValue({ atStart: true, atEnd: false })
    moveViewportSelection({ store, syncImageCaretToFocus: vi.fn() }, 'b', 'top', 0)
    expect(store.selectNode).toHaveBeenLastCalledWith('a', 0)
    vi.mocked(viewportScrollEdges).mockReturnValue({ atStart: false, atEnd: true })
    moveViewportSelection({ store, syncImageCaretToFocus: vi.fn() }, 'b', 'bottom', 0)
    expect(store.selectNode).toHaveBeenLastCalledWith('d', 0)
  })

  it('falls back to the whole content area when no row lies inside the edge context', () => {
    vi.mocked(viewportScrollEdges).mockReturnValue({ atStart: false, atEnd: false })
    mountRows([{ nodeId: 'low', top: 80, bottom: 100 }])
    const store = createEditorStoreDouble({
      snapshot: {
        status: 'ready',
        document: { roots: [{ id: 'low', text: 'low', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'low' },
      },
    })
    moveViewportSelection({ store, syncImageCaretToFocus: vi.fn() }, 'low', 'top', 0)
    expect(store.selectNode).toHaveBeenCalledExactlyOnceWith('low', 0)
  })

  it('does not apply the edge context to the half-page motions', () => {
    vi.mocked(viewportScrollEdges).mockReturnValue({ atStart: false, atEnd: false })
    mountRows(rows)
    const store = createEditorStoreDouble({
      snapshot: {
        status: 'ready',
        document: { roots: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id, children: [] })) },
        location: { currentParentId: null, selectedNodeId: 'a' },
      },
    })
    moveViewportSelection({ store, syncImageCaretToFocus: vi.fn() }, 'a', 'half-down', 0)
    expect(store.selectNode).toHaveBeenLastCalledWith('c', 0)
  })

  it('passes the count through to the target selector', () => {
    mountRows(rows)
    const store = createEditorStoreDouble({
      snapshot: {
        status: 'ready',
        document: { roots: [{ id: 'b', text: 'bravo', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'b' },
      },
    })
    moveViewportSelection({ store, syncImageCaretToFocus: vi.fn() }, 'a', 'top', 9, 2)
    expect(store.selectNode).toHaveBeenCalledExactlyOnceWith('b', 0)
  })

  it.each(['loading', 'error'] as const)('preserves the cursor when the store is %s', (status) => {
    mountRows([{ nodeId: 'node', top: 0, bottom: 20 }])
    const store = createEditorStoreDouble({
      snapshot: status === 'loading' ? { status } : { status, message: 'unavailable' },
    })
    const syncImageCaretToFocus = vi.fn()
    moveViewportSelection({ store, syncImageCaretToFocus }, 'node', 'top', 9)
    expect(store.selectNode).toHaveBeenCalledExactlyOnceWith('node', 9)
    expect(syncImageCaretToFocus).toHaveBeenCalledOnce()
  })

  it.each([[], [{ nodeId: 'outside', top: 100, bottom: 120 }], [{ nodeId: undefined, top: 0, bottom: 20 }]])(
    'does not read the store or dispatch when the target is absent: %j',
    (...records) => {
      mountRows(records)
      const store = createEditorStoreDouble()
      const syncImageCaretToFocus = vi.fn()
      moveViewportSelection({ store, syncImageCaretToFocus }, 'node', 'top', 9)
      expect(store.getSnapshot).not.toHaveBeenCalled()
      expect(store.selectNode).not.toHaveBeenCalled()
      expect(syncImageCaretToFocus).not.toHaveBeenCalled()
    },
  )
})
