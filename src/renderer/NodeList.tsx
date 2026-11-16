import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'
import type { TreeNode } from '../domain/document'
import { buildVisibleRows, selectedSubtreeRowRange, type VisibleRow } from '../application/visible-rows'
import { NodeRow } from './NodeRow'
import type { NodeDragCaretFreeze } from './drag-caret-freeze'
import { computeListWindow, shouldWindow, WINDOW_OVERSCAN, type ListWindow } from './list-window'
import {
  buildLayout,
  collectWindowIndices,
  EMPTY_HEIGHTS,
  EMPTY_LAYOUT,
  measureElement,
  measuredScrollDelta,
  pruneHeights,
  type LayoutState,
} from './node-list-layout'
import { DROP_LEVEL_STEP_PX, dropMarkerFor } from './node-drag'
import type { DropTarget } from '../application/drop-targets'
import {
  notifyViewportLayout,
  onViewportScroll,
  scrollViewportAfterMeasurement,
  viewportBounds,
} from './scroll-viewport'
import { useNodeListDrag } from './use-node-list-drag'

interface NodeListProps {
  lineNumbers?: boolean
  nodes: readonly TreeNode[]
  visibleRows?: readonly VisibleRow[]
  colorDepthOffset?: number
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
  breadcrumbTargets?: ReadonlyMap<string | null, DropTarget> | undefined
  onBreadcrumbTarget?: ((parentId: string | null | undefined) => void) | undefined
}

const NEVER_EXPANDED = (): boolean => false

export function NodeList({
  lineNumbers = false,
  nodes,
  visibleRows: suppliedVisibleRows,
  colorDepthOffset = 0,
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
  breadcrumbTargets,
  onBreadcrumbTarget,
}: NodeListProps): React.JSX.Element {
  const listRef = useRef<HTMLElement | null>(null)
  const heightsRef = useRef(new Map<string, number>())
  const observedElementsRef = useRef(new Map<string, HTMLElement>())
  const pendingMeasurementsRef = useRef(new Set<string>())
  const observerRef = useRef<ResizeObserver | undefined>(undefined)
  const widthRef = useRef(typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : 0)
  const [measureRevision, setMeasureRevision] = useState(0)
  const [measuredHeights, setMeasuredHeights] = useState<ReadonlyMap<string, number>>(EMPTY_HEIGHTS)
  const [measurementScrollTop, setMeasurementScrollTop] = useState(0)
  const committedStructuralVersion = useRef(structuralVersion)
  const appliedCorrection = useRef<LayoutState['correction']>(undefined)
  const [viewport, setViewport] = useState({ start: 0, end: 0 })
  // The rendered, windowed, and measured row list is the flattened projection of `nodes` and every
  // expanded node's descendants (docs/PRODUCT.md §2.4), not `nodes` itself; a collapsed subtree still
  // costs exactly one row here regardless of its own size (`buildVisibleRows`).
  const visibleRows = suppliedVisibleRows ?? buildVisibleRows(nodes, isExpanded)
  const lineNumberDigits = Math.max(2, String(visibleRows.length).length)
  const [layoutState, setLayoutState] = useState<LayoutState>(() => ({
    key: `initial:${visibleRows.length}`,
    layout: shouldWindow(visibleRows.length) ? buildLayout(visibleRows, EMPTY_HEIGHTS) : EMPTY_LAYOUT,
    structuralVersion,
    correction: undefined,
  }))
  const windowed = shouldWindow(visibleRows.length)

  useLayoutEffect(() => {
    const correction = layoutState.correction
    if (correction === undefined || appliedCorrection.current === correction) return
    appliedCorrection.current = correction
    scrollViewportAfterMeasurement(correction.delta, correction.beforeTop)
    setLayoutState((current) => (current.correction === correction ? { ...current, correction: undefined } : current))
  }, [layoutState.correction])

  const publishMeasurements = useCallback(() => {
    // External measurement publication is synchronous; layout effects also finish before input.
    setMeasurementScrollTop(listRef.current?.closest('.scroll-viewport')?.scrollTop ?? globalThis.scrollY)
    setMeasuredHeights(new Map(heightsRef.current))
    setMeasureRevision((revision) => revision + 1)
  }, [])

  const measureRow = useCallback((nodeId: string, element: HTMLElement | null) => {
    if (element === null) {
      const observed = observedElementsRef.current.get(nodeId)
      if (observed !== undefined) {
        observedElementsRef.current.delete(nodeId)
        pendingMeasurementsRef.current.delete(nodeId)
        observerRef.current?.unobserve(observed)
      }
      return
    }
    observedElementsRef.current.set(nodeId, element)
    pendingMeasurementsRef.current.add(nodeId)
    observerRef.current?.observe(element)
  }, [])

  // Editor refs project rich content while React attaches siblings. Read geometry only after
  // that stage, so each subsequent editor does not invalidate the previous row's layout read.
  // Run after every commit: draining pending refs cannot enqueue another measurement itself.
  useLayoutEffect(() => {
    let changed = false
    for (const nodeId of pendingMeasurementsRef.current) {
      const element = observedElementsRef.current.get(nodeId)
      if (element !== undefined)
        measureElement(nodeId, element, heightsRef.current, () => {
          changed = true
        })
    }
    pendingMeasurementsRef.current.clear()
    if (changed) publishMeasurements()
  })

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
      // Content growth must expand the scroll range before reveal observers run in this frame.
      if (changed) flushSync(publishMeasurements)
    })
    observerRef.current = observer
    observedElementsRef.current.forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
      observerRef.current = undefined
    }
  }, [publishMeasurements])

  useEffect(() => {
    const onResize = (): void => {
      const width = globalThis.innerWidth
      if (widthRef.current === width) return
      widthRef.current = width
      heightsRef.current.clear()
      for (const id of observedElementsRef.current.keys()) pendingMeasurementsRef.current.add(id)
      flushSync(publishMeasurements)
    }
    globalThis.addEventListener('resize', onResize)
    return () => globalThis.removeEventListener('resize', onResize)
  }, [publishMeasurements])

  // Resolve the new offsets before committing its window. An effect would first commit a
  // window based on the previous (possibly empty) layout and remount still-visible editors.
  const layoutKey = `${structuralVersion}:${measureRevision}:${visibleRows.length}`
  if (layoutState.key !== layoutKey) {
    const layout = windowed ? buildLayout(visibleRows, measuredHeights) : EMPTY_LAYOUT
    const compatible =
      windowed && layoutState.structuralVersion === structuralVersion && layoutState.layout.count === layout.count
    const pending = layoutState.correction?.delta ?? 0
    const delta = compatible ? measuredScrollDelta(layoutState.layout, layout, viewport.start) : -pending
    const correction = compatible ? pending + delta : 0
    if (delta !== 0) setViewport({ start: viewport.start + delta, end: viewport.end + delta })
    setLayoutState({
      key: layoutKey,
      layout,
      structuralVersion,
      correction:
        correction === 0
          ? undefined
          : {
              delta: correction,
              beforeTop: layoutState.correction?.beforeTop ?? measurementScrollTop,
            },
    })
  }

  useLayoutEffect(() => {
    if (committedStructuralVersion.current === structuralVersion) return
    pruneHeights(heightsRef.current, visibleRows)
    setMeasuredHeights((previous) => {
      if (previous.size === 0) return previous
      const next = new Map(previous)
      pruneHeights(next, visibleRows)
      return next.size === previous.size ? previous : next
    })
    committedStructuralVersion.current = structuralVersion
  }, [structuralVersion, visibleRows])

  const updateViewport = useCallback(() => {
    const element = listRef.current
    if (element === null) return
    const { top } = element.getBoundingClientRect()
    const bounds = viewportBounds()
    const start = Math.max(0, bounds.top - top)
    const end = Math.max(0, bounds.bottom - top)
    setViewport((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [])

  useLayoutEffect(() => {
    notifyViewportLayout()
    // Revealing a grown row can scroll synchronously; anchor to that resulting position.
    // Keep the ordinary list ready for its first transition to a window too.
    updateViewport()
  }, [layoutState.key, measureRevision, structuralVersion, updateViewport, windowed])

  useEffect(() => {
    // Commit the rows and their anchored offset together when native scroll is delivered.
    const unsubscribe = onViewportScroll(() => flushSync(updateViewport))
    globalThis.addEventListener('resize', updateViewport)
    return () => {
      unsubscribe()
      globalThis.removeEventListener('resize', updateViewport)
    }
  }, [updateViewport])

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
  } = useNodeListDrag({
    rows: visibleRows,
    locked,
    listRef,
    observedElementsRef,
    onDrop,
    dragFreeze,
    breadcrumbTargets,
    onBreadcrumbTarget,
  })

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
  const visualRange = selectedSubtreeRowRange(visibleRows, visualNodeSelection)
  const windowOffset = listWindow === undefined ? 0 : (layout.offsets[listWindow.start] ?? 0)
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
      colorDepth={depth + colorDepthOffset}
      dragging={freeze?.nodeId === node.id}
      dropAfter={dropMarker?.index === index && !dropMarker.before}
      dropBefore={dropMarker?.index === index && dropMarker.before}
      dropLevel={dropMarker?.index === index ? dropLevel : undefined}
      dropOn={dropRow === index}
      expanded={isExpanded(node.id)}
      focused={focusedNodeId !== undefined && node.id === focusedNodeId}
      visualSelected={visualRange !== undefined && index >= visualRange.start && index <= visualRange.end}
      index={index}
      lineNumber={lineNumbers ? index + 1 : undefined}
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
      data-window-start={listWindow === undefined ? undefined : viewport.start}
      className={`node-list${lineNumbers ? ' line-numbered' : ''}${listWindow === undefined ? '' : ' node-list-windowed'}${invalidDrop ? ' node-list-drop-invalid' : ''}`}
      onClickCapture={onListClick}
      onLostPointerCapture={onLostPointerCapture}
      onPointerCancel={onListPointerCancel}
      onPointerMove={onListPointerMove}
      onPointerUp={onListPointerUp}
      ref={listRef}
      style={
        {
          ...(listWindow === undefined ? {} : { height: layout.total }),
          '--row-indent': `${DROP_LEVEL_STEP_PX}px`,
          '--line-number-digits': lineNumberDigits,
        } as React.CSSProperties
      }
    >
      <span aria-hidden="true" className="line-number-sizer">
        {'9'.repeat(lineNumberDigits)}
      </span>
      <div className={`outline-content${listWindow === undefined ? '' : ' node-list-window-anchor'}`}>
        <div
          style={{ position: 'relative', ...(listWindow === undefined ? {} : { top: windowOffset - viewport.start }) }}
        >
          <DropZone index={0} start />
          {listWindow === undefined
            ? visibleRows.map((row, index) => renderRow(row.node, row.depth, index))
            : renderWindowed(listWindow)}
          <DropZone end index={visibleRows.length} />
        </div>
      </div>
    </section>
  )

  function renderWindowed(windowRange: ListWindow): ReactNode {
    const pinnedIndex = windowRange.pinnedIndex
    const pinnedRow = pinnedIndex === undefined ? undefined : visibleRows[pinnedIndex]
    const children: ReactNode[] = []
    for (let index = windowRange.start; index < windowRange.end; index += 1) {
      const row = visibleRows[index]
      if (row !== undefined) children.push(renderRow(row.node, row.depth, index))
    }
    if (pinnedIndex !== undefined && pinnedRow !== undefined) {
      children.push(
        renderRow(
          pinnedRow.node,
          pinnedRow.depth,
          pinnedIndex,
          true,
          (layout.offsets[pinnedIndex] ?? 0) - windowOffset,
        ),
      )
    }
    if (pinnedSourceIndex !== undefined) {
      const sourceRow = visibleRows[pinnedSourceIndex]!
      children.push(
        renderRow(
          sourceRow.node,
          sourceRow.depth,
          pinnedSourceIndex,
          true,
          (layout.offsets[pinnedSourceIndex] ?? 0) - windowOffset,
        ),
      )
    }
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
