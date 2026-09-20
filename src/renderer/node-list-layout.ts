import type { Dispatch, SetStateAction } from 'react'
import type { TreeNode } from '../domain/document'
import { computeOffsets, ROW_HEIGHT_ESTIMATE, type ListWindow } from './list-window'

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

export function collectWindowIndices(windowRange: ListWindow): number[] {
  const indices: number[] = []
  for (let index = windowRange.start; index < windowRange.end; index += 1) indices.push(index)
  if (windowRange.pinnedIndex !== undefined) indices.push(windowRange.pinnedIndex)
  return indices
}

export function buildLayout(nodes: readonly TreeNode[], heights: ReadonlyMap<string, number>): ListLayout {
  const rowHeights = nodes.map((node) => heights.get(node.id) ?? ROW_HEIGHT_ESTIMATE)
  const { offsets, total } = computeOffsets(rowHeights)
  return { offsets, total, count: nodes.length }
}

export function pruneHeights(heights: Map<string, number>, nodes: readonly TreeNode[]): void {
  const ids = new Set(nodes.map((node) => node.id))
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
