import type { Dispatch, SetStateAction } from 'react'
import { ROW_HEIGHT_ESTIMATE, type ListWindow } from './list-window'
import type { VisibleRow } from '../application/visible-rows'

export interface ListLayout {
  offsets: Float64Array
  total: number
  count: number
}

export interface LayoutState {
  key: string
  layout: ListLayout
  structuralVersion: number
}

export const EMPTY_HEIGHTS: ReadonlyMap<string, number> = new Map()
export const EMPTY_LAYOUT: ListLayout = { offsets: new Float64Array(1), total: 0, count: 0 }

/** Pointer capture belongs to the list, so breadcrumb targets are resolved by geometry. */
export function breadcrumbAtPoint(
  clientX: number,
  clientY: number,
): { parentId: string | null | undefined } | undefined {
  const toolbar = document.querySelector<HTMLElement>('.location-bar')
  if (toolbar === null) return undefined
  const bounds = toolbar.getBoundingClientRect()
  if (clientY < bounds.top || clientY >= bounds.bottom || clientX < bounds.left || clientX >= bounds.right)
    return undefined
  for (const segment of toolbar.querySelectorAll<HTMLElement>('[data-breadcrumb-id]')) {
    const rect = segment.getBoundingClientRect()
    if (clientX >= rect.left && clientX < rect.right) return { parentId: segment.dataset.breadcrumbId || null }
  }
  return { parentId: undefined }
}

export function collectWindowIndices(windowRange: ListWindow): number[] {
  const indices: number[] = []
  for (let index = windowRange.start; index < windowRange.end; index += 1) indices.push(index)
  if (windowRange.pinnedIndex !== undefined) indices.push(windowRange.pinnedIndex)
  return indices
}

type KeyedRow = VisibleRow | { readonly key: string }

// Row arrays are immutable projections. Weak keys release indexes with the retired projection;
// only identities and uniform estimates are cached, never DOM measurements or document content.
const estimatedLayouts = new WeakMap<readonly KeyedRow[], { layout: ListLayout; indices: Map<string, number> }>()

function rowKey(row: KeyedRow): string {
  return 'key' in row ? row.key : row.node.id
}

export function buildLayout(rows: readonly KeyedRow[], heights: ReadonlyMap<string, number>): ListLayout {
  let estimated = estimatedLayouts.get(rows)
  if (estimated === undefined) {
    const offsets = new Float64Array(rows.length + 1)
    const indices = new Map<string, number>()
    for (let index = 0; index < rows.length; index++) {
      indices.set(rowKey(rows[index]!), index)
      offsets[index + 1] = (index + 1) * ROW_HEIGHT_ESTIMATE
    }
    estimated = { layout: { offsets, total: rows.length * ROW_HEIGHT_ESTIMATE, count: rows.length }, indices }
    estimatedLayouts.set(rows, estimated)
  }

  const changes: { index: number; delta: number }[] = []
  for (const [key, height] of heights) {
    const index = estimated.indices.get(key)
    if (index !== undefined && height !== ROW_HEIGHT_ESTIMATE)
      changes.push({ index, delta: height - ROW_HEIGHT_ESTIMATE })
  }
  if (changes.length === 0) return estimated.layout
  changes.sort((left, right) => left.index - right.index)

  const offsets = estimated.layout.offsets.slice()
  let delta = 0
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index]!
    delta += change.delta
    const end = changes[index + 1]?.index ?? rows.length
    for (let offset = change.index + 1; offset <= end; offset++) offsets[offset]! += delta
  }
  return { offsets, total: estimated.layout.total + delta, count: rows.length }
}

export function pruneHeights(heights: Map<string, number>, rows: readonly KeyedRow[]): void {
  const missing = new Set(heights.keys())
  for (const row of rows) {
    if (missing.size === 0) return
    missing.delete(rowKey(row))
  }
  for (const id of missing) heights.delete(id)
}

export function measureElement(
  nodeId: string,
  element: HTMLElement,
  heights: Map<string, number>,
  setMeasureRevision: Dispatch<SetStateAction<number>>,
): void {
  const height = element.getBoundingClientRect().height
  if (height <= 0 || heights.get(nodeId) === height) return
  heights.set(nodeId, height)
  setMeasureRevision((revision) => revision + 1)
}
