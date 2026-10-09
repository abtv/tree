import type { Dispatch, SetStateAction } from 'react'
import { computeOffsets, ROW_HEIGHT_ESTIMATE, type ListWindow } from './list-window'
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

function rowKey(row: KeyedRow): string {
  return 'key' in row ? row.key : row.node.id
}

export function buildLayout(rows: readonly KeyedRow[], heights: ReadonlyMap<string, number>): ListLayout {
  const rowHeights = rows.map((row) => heights.get(rowKey(row)) ?? ROW_HEIGHT_ESTIMATE)
  const { offsets, total } = computeOffsets(rowHeights)
  return { offsets, total, count: rows.length }
}

export function pruneHeights(heights: Map<string, number>, rows: readonly KeyedRow[]): void {
  const ids = new Set(rows.map(rowKey))
  for (const id of heights.keys()) {
    if (!ids.has(id)) heights.delete(id)
  }
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
