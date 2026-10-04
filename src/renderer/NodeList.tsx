import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TreeNode } from '../domain/document'
import { buildVisibleRows, type VisibleRow } from '../application/visible-rows'
import { NodeRow } from './NodeRow'
import type { NodeDragCaretFreeze } from './drag-caret-freeze'
import { computeListWindow, shouldWindow, WINDOW_OVERSCAN, type ListWindow } from './list-window'
import {
  buildLayout,
  collectWindowIndices,
  EMPTY_HEIGHTS,
  EMPTY_LAYOUT,
  measureElement,
  pruneHeights,
  type LayoutState,
} from './node-list-layout'
import { DROP_LEVEL_STEP_PX, dropMarkerFor } from './node-drag'
import type { DropTarget } from '../application/drop-targets'
import { onViewportScroll, viewportBounds } from './scroll-viewport'
import { useNodeListDrag } from './use-node-list-drag'

interface NodeListProps {
  nodes: readonly TreeNode[]
  visibleRows?: readonly VisibleRow[]
  renderInput: (node: TreeNode, label: string) => ReactNode
  onActivate?: (node: TreeNode) => void
  onEnter: (node: TreeNode) => void
  onDrop: (nodeId: string, target: DropTarget) => void
  isExpanded?: ((nodeId: string) => boolean) | undefined
  onToggleExpansion?: ((node: TreeNode) => void) | undefined
  dragFreeze: NodeDragCaretFreeze
  focusedNodeId?: string | undefined
  structuralVersion?: number
  visualNodeSelection?: { anchorId: string; focusId: string } | undefined
  locked?: boolean
}

const NEVER_EXPANDED = (): boolean => false

export function NodeList({
  nodes,
  visibleRows: suppliedVisibleRows,
  renderInput,
  onActivate,
  onEnter,
  onDrop,
  isExpanded = NEVER_EXPANDED,
  onToggleExpansion,
  dragFreeze,
  focusedNodeId,
  structuralVersion = 0,
  visualNodeSelection,
  locked = false,
}: NodeListProps): React.JSX.Element {
  const listRef = useRef<HTMLElement | null>(null)
  const heightsRef = useRef(new Map<string, number>())
  const observedElementsRef = useRef(new Map<string, HTMLElement>())
  const observerRef = useRef<ResizeObserver | undefined>(undefined)
  const widthRef = useRef(typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : 0)
  const [measureRevision, setMeasureRevision] = useState(0)
  const [viewport, setViewport] = useState({ start: 0, end: 0 })
  // The rendered, windowed, and measured row list is the flattened projection of `nodes` and every
  // expanded node's descendants (docs/PRODUCT.md §2.4), not `nodes` itself; a collapsed subtree still
  // costs exactly one row here regardless of its own size (`buildVisibleRows`).
  const visibleRows = suppliedVisibleRows ?? buildVisibleRows(nodes, isExpanded)
  const [layoutState, setLayoutState] = useState<LayoutState>(() => ({
    key: `initial:${visibleRows.length}`,
    layout: shouldWindow(visibleRows.length) ? buildLayout(visibleRows, EMPTY_HEIGHTS) : EMPTY_LAYOUT,
    structuralVersion,
  }))
  const windowed = shouldWindow(visibleRows.length)

  const measureRow = useCallback((nodeId: string, element: HTMLElement | null) => {
    if (element === null) {
      const observed = observedElementsRef.current.get(nodeId)
      if (observed !== undefined) {
        observedElementsRef.current.delete(nodeId)
        observerRef.current?.unobserve(observed)
      }
      return
    }
    observedElementsRef.current.set(nodeId, element)
    observerRef.current?.observe(element)
    measureElement(nodeId, element, heightsRef.current, setMeasureRevision)
  }, [])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        const nodeId = element.dataset.nodeId
        if (nodeId === undefined) continue
        const borderBox = entry.borderBoxSize?.[0]
        const height = borderBox === undefined ? element.getBoundingClientRect().height : borderBox.blockSize
        if (height > 0 && heightsRef.current.get(nodeId) !== height) {
          heightsRef.current.set(nodeId, height)
          changed = true
        }
      }
      if (changed) setMeasureRevision((revision) => revision + 1)
    })
    observerRef.current = observer
    observedElementsRef.current.forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
      observerRef.current = undefined
    }
  }, [])

  useEffect(() => {
    const onResize = (): void => {
      const width = globalThis.innerWidth
      if (widthRef.current === width) return
      widthRef.current = width
      heightsRef.current.clear()
      setMeasureRevision((revision) => revision + 1)
    }
    globalThis.addEventListener('resize', onResize)
    return () => globalThis.removeEventListener('resize', onResize)
  }, [])

  useLayoutEffect(() => {
    const key = `${structuralVersion}:${measureRevision}:${visibleRows.length}`
    if (layoutState.key === key) return
    if (layoutState.structuralVersion !== structuralVersion) pruneHeights(heightsRef.current, visibleRows)
    setLayoutState({
      key,
      layout: shouldWindow(visibleRows.length) ? buildLayout(visibleRows, heightsRef.current) : EMPTY_LAYOUT,
      structuralVersion,
    })
  }, [layoutState.key, layoutState.structuralVersion, measureRevision, structuralVersion, visibleRows])

  const updateViewport = useCallback(() => {
    const element = listRef.current
    if (element === null) return
    const { top } = element.getBoundingClientRect()
    const start = Math.max(0, -top)
    const end = Math.max(0, viewportBounds().bottom - top)
    setViewport((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [])

  useLayoutEffect(() => {
    if (windowed) updateViewport()
  }, [layoutState.key, measureRevision, structuralVersion, updateViewport, windowed])

  useEffect(() => {
    if (!windowed) return undefined
    const onScroll = (): void => updateViewport()
    const unsubscribe = onViewportScroll(onScroll)
    globalThis.addEventListener('resize', onScroll)
    return () => {
      unsubscribe()
      globalThis.removeEventListener('resize', onScroll)
    }
  }, [updateViewport, windowed])

  const {
    freeze,
    dropIndex,
    dropLevel,
    dropRow,
    invalidDrop,
    onRowPointerDown,
    onRowPointerLeave,
    onListPointerMove,
    onListPointerUp,
    onListPointerCancel,
    onLostPointerCapture,
    onListClick,
    recomputeDropIndex,
  } = useNodeListDrag({ rows: visibleRows, locked, windowed, listRef, observedElementsRef, onDrop, dragFreeze })

  useLayoutEffect(() => {
    recomputeDropIndex()
  }, [recomputeDropIndex, layoutState.key, measureRevision, viewport])

  const layout = layoutState.layout
  const focusedIndex =
    windowed && focusedNodeId !== undefined ? visibleRows.findIndex((row) => row.node.id === focusedNodeId) : -1
  const listWindow = windowed
    ? computeListWindow({
        count: visibleRows.length,
        offsets: layout.offsets,
        viewportStart: viewport.start,
        viewportEnd: viewport.end,
        overscan: WINDOW_OVERSCAN,
        focusedIndex: focusedIndex >= 0 ? focusedIndex : undefined,
      })
    : undefined
  const sourceIndex = freeze === undefined ? -1 : visibleRows.findIndex((row) => row.node.id === freeze.nodeId)
  const pinnedSourceIndex =
    listWindow !== undefined &&
    sourceIndex >= 0 &&
    sourceIndex !== listWindow.pinnedIndex &&
    (sourceIndex < listWindow.start || sourceIndex >= listWindow.end)
      ? sourceIndex
      : undefined
  const visualAnchorIndex =
    visualNodeSelection === undefined
      ? -1
      : visibleRows.findIndex((row) => row.node.id === visualNodeSelection.anchorId)
  const visualFocusIndex =
    visualNodeSelection === undefined ? -1 : visibleRows.findIndex((row) => row.node.id === visualNodeSelection.focusId)
  const visualStart = visualAnchorIndex < 0 || visualFocusIndex < 0 ? -1 : Math.min(visualAnchorIndex, visualFocusIndex)
  const visualEnd = visualStart < 0 ? -1 : Math.max(visualAnchorIndex, visualFocusIndex)
  const dropMarker = dropMarkerFor(
    freeze === undefined ? undefined : dropIndex,
    visibleRows.length,
    listWindow === undefined
      ? undefined
      : [...collectWindowIndices(listWindow), ...(pinnedSourceIndex === undefined ? [] : [pinnedSourceIndex])],
  )

  const renderRow = (
    node: TreeNode,
    depth: number,
    index: number,
    pinned = false,
    pinnedOffset = 0,
  ): React.JSX.Element => (
    <NodeRow
      depth={depth}
      dragging={freeze?.nodeId === node.id}
      dropAfter={dropMarker?.index === index && !dropMarker.before}
      dropBefore={dropMarker?.index === index && dropMarker.before}
      dropLevel={dropMarker?.index === index ? dropLevel : undefined}
      dropOn={dropRow === index}
      expanded={isExpanded(node.id)}
      focused={focusedNodeId !== undefined && node.id === focusedNodeId}
      visualSelected={visualStart >= 0 && index >= visualStart && index <= visualEnd}
      index={index}
      key={node.id}
      node={node}
      {...(onActivate === undefined ? {} : { onActivate })}
      onEnter={onEnter}
      {...(onToggleExpansion === undefined ? {} : { onToggleExpansion })}
      onPointerDown={onRowPointerDown}
      onPointerLeave={onRowPointerLeave}
      pinned={pinned}
      pinnedOffset={pinnedOffset}
      renderInput={renderInput}
      rowRef={measureRow}
    />
  )

  return (
    <section
      aria-label="Nodes"
      className={`node-list${invalidDrop ? ' node-list-drop-invalid' : ''}`}
      onClickCapture={onListClick}
      onLostPointerCapture={onLostPointerCapture}
      onPointerCancel={onListPointerCancel}
      onPointerMove={onListPointerMove}
      onPointerUp={onListPointerUp}
      ref={listRef}
      style={{ '--row-indent': `${DROP_LEVEL_STEP_PX}px` } as React.CSSProperties}
    >
      <DropZone index={0} start />
      {listWindow === undefined
        ? visibleRows.map((row, index) => renderRow(row.node, row.depth, index))
        : renderWindowed(listWindow)}
      <DropZone end index={visibleRows.length} />
    </section>
  )

  function renderWindowed(windowRange: ListWindow): ReactNode {
    const leadingHeight = layout.offsets[windowRange.start] ?? 0
    const trailingHeight = layout.total - (layout.offsets[windowRange.end] ?? 0)
    const pinnedIndex = windowRange.pinnedIndex
    const pinnedRow = pinnedIndex === undefined ? undefined : visibleRows[pinnedIndex]
    const children: ReactNode[] = [
      <div aria-hidden="true" className="node-list-spacer" key="leading-spacer" style={{ height: leadingHeight }} />,
    ]
    for (let index = windowRange.start; index < windowRange.end; index += 1) {
      const row = visibleRows[index]
      if (row !== undefined) children.push(renderRow(row.node, row.depth, index))
    }
    if (pinnedIndex !== undefined && pinnedRow !== undefined) {
      children.push(renderRow(pinnedRow.node, pinnedRow.depth, pinnedIndex, true, layout.offsets[pinnedIndex] ?? 0))
    }
    if (pinnedSourceIndex !== undefined) {
      const sourceRow = visibleRows[pinnedSourceIndex]!
      children.push(
        renderRow(sourceRow.node, sourceRow.depth, pinnedSourceIndex, true, layout.offsets[pinnedSourceIndex] ?? 0),
      )
    }
    children.push(
      <div aria-hidden="true" className="node-list-spacer" key="trailing-spacer" style={{ height: trailingHeight }} />,
    )
    return children
  }
}

function DropZone({
  end = false,
  index,
  start = false,
}: {
  end?: boolean
  index: number
  start?: boolean
}): React.JSX.Element {
  return (
    <div
      aria-label={`Drop position ${index + 1}`}
      className={`drop-zone${start ? ' drop-zone-start' : ''}${end ? ' drop-zone-end' : ''}${start || end ? ' drop-zone-edge' : ''}`}
    />
  )
}
