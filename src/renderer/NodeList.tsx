import { memo, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction,
} from 'react'
import type { TreeNode } from '../domain/document'
import { collapseSelectionToAnchor, getCaret, setCaret } from './editor-dom'
import {
  autoScrollStep,
  computeListWindow,
  computeOffsets,
  ROW_HEIGHT_ESTIMATE,
  shouldWindow,
  WINDOW_OVERSCAN,
  type ListWindow,
} from './list-window'
import {
  HOLD_ACTIVATION_MS,
  IDLE_NODE_DRAG,
  dropMarkerFor,
  exceedsHoldTolerance,
  insertionIndexAtPoint,
  nodeDragReducer,
  shouldCommitMove,
  type NodeDropRegion,
} from './node-drag'

interface NodeListProps {
  nodes: readonly TreeNode[]
  renderInput: (node: TreeNode, label: string) => ReactNode
  onEnter: (node: TreeNode) => void
  onMove: (nodeId: string, insertionIndex: number) => void
  focusedNodeId?: string | undefined
  structuralVersion?: number
  locked?: boolean
}

interface ListLayout {
  offsets: Float64Array
  total: number
  count: number
}

interface LayoutState {
  key: string
  layout: ListLayout
  structuralVersion: number
}

const EMPTY_HEIGHTS: ReadonlyMap<string, number> = new Map()
const EMPTY_LAYOUT: ListLayout = { offsets: new Float64Array(1), total: 0, count: 0 }

export function NodeList({
  nodes,
  renderInput,
  onEnter,
  onMove,
  focusedNodeId,
  structuralVersion = 0,
  locked = false,
}: NodeListProps): React.JSX.Element {
  const listRef = useRef<HTMLElement | null>(null)
  const heightsRef = useRef(new Map<string, number>())
  const observedElementsRef = useRef(new Map<string, HTMLElement>())
  const observerRef = useRef<ResizeObserver | undefined>(undefined)
  const widthRef = useRef(typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : 0)
  const [measureRevision, setMeasureRevision] = useState(0)
  const [viewport, setViewport] = useState({ start: 0, end: 0 })
  const [autoScrollDirection, setAutoScrollDirection] = useState(0)
  const [drag, dispatch] = useReducer(nodeDragReducer, IDLE_NODE_DRAG)
  const [dropIndex, setDropIndex] = useState<number>()
  const pointerYRef = useRef<number | undefined>(undefined)
  const pressPointRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const selectionGuardRef = useRef<{ nodeId: string; pointerId: number; caret: number } | undefined>(undefined)
  const suppressClickRef = useRef(false)
  const [layoutState, setLayoutState] = useState<LayoutState>(() => ({
    key: `initial:${nodes.length}`,
    layout: shouldWindow(nodes.length) ? buildLayout(nodes, EMPTY_HEIGHTS) : EMPTY_LAYOUT,
    structuralVersion,
  }))
  const windowed = shouldWindow(nodes.length)
  const dragSourceCandidate = drag.source
  const sourceAvailable =
    dragSourceCandidate === undefined || nodes.some((node) => node.id === dragSourceCandidate.nodeId)
  const dragPhase = locked || !sourceAvailable ? 'idle' : drag.phase
  const dragSource = dragPhase === 'idle' ? undefined : dragSourceCandidate

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

  const cancelDrag = useCallback((): void => {
    dispatch({ type: 'cancel' })
    setDropIndex(undefined)
    setAutoScrollDirection(0)
  }, [])

  const clearSelectionGuard = useCallback((): void => {
    const guard = selectionGuardRef.current
    if (guard === undefined) return
    selectionGuardRef.current = undefined
    const input = findRowInput(guard.nodeId, observedElementsRef.current)
    if (input === null) return
    input.focus({ preventScroll: true })
    setCaret(input, guard.caret)
  }, [])

  const computeInsertionIndex = useCallback((clientY: number): number | undefined => {
    const regions: NodeDropRegion[] = []
    observedElementsRef.current.forEach((element) => {
      const index = Number(element.dataset.nodeIndex)
      if (!Number.isInteger(index) || index < 0) return
      const bounds = element.getBoundingClientRect()
      if (bounds.height <= 0) return
      regions.push({ index, top: bounds.top, bottom: bounds.bottom })
    })
    return insertionIndexAtPoint(regions, clientY)
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
    const key = `${structuralVersion}:${measureRevision}:${nodes.length}`
    if (layoutState.key === key) return
    if (layoutState.structuralVersion !== structuralVersion) pruneHeights(heightsRef.current, nodes)
    setLayoutState({
      key,
      layout: shouldWindow(nodes.length) ? buildLayout(nodes, heightsRef.current) : EMPTY_LAYOUT,
      structuralVersion,
    })
  }, [layoutState.key, layoutState.structuralVersion, measureRevision, nodes, structuralVersion])

  const updateViewport = useCallback(() => {
    const element = listRef.current
    if (element === null) return
    const { top } = element.getBoundingClientRect()
    const start = Math.max(0, -top)
    const end = Math.max(0, globalThis.innerHeight - top)
    setViewport((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [])

  useLayoutEffect(() => {
    if (windowed) updateViewport()
  }, [layoutState.key, measureRevision, structuralVersion, updateViewport, windowed])

  useEffect(() => {
    if (!windowed) return undefined
    const onScroll = (): void => updateViewport()
    globalThis.addEventListener('scroll', onScroll, { passive: true })
    globalThis.addEventListener('resize', onScroll)
    return () => {
      globalThis.removeEventListener('scroll', onScroll)
      globalThis.removeEventListener('resize', onScroll)
    }
  }, [updateViewport, windowed])

  useEffect(() => {
    if (autoScrollDirection === 0) return undefined
    const direction = autoScrollDirection
    let frame = 0
    function step(): void {
      globalThis.scrollBy(0, direction)
      frame = globalThis.requestAnimationFrame(step)
    }
    frame = globalThis.requestAnimationFrame(step)
    return () => globalThis.cancelAnimationFrame(frame)
  }, [autoScrollDirection, dragPhase])

  useEffect(() => {
    if (dragPhase !== 'pending' || dragSource === undefined) return undefined
    const pointerId = dragSource.pointerId
    const nodeId = dragSource.nodeId
    const timeout = globalThis.setTimeout(() => {
      if (!observedElementsRef.current.has(nodeId)) return
      dispatch({ type: 'hold', pointerId })
    }, HOLD_ACTIVATION_MS)
    return () => globalThis.clearTimeout(timeout)
  }, [dragPhase, dragSource])

  useEffect(() => {
    const onPointerEnd = (event: PointerEvent): void => {
      if (event.pointerId === selectionGuardRef.current?.pointerId) clearSelectionGuard()
    }
    globalThis.addEventListener('pointerup', onPointerEnd)
    globalThis.addEventListener('pointercancel', onPointerEnd)
    return () => {
      globalThis.removeEventListener('pointerup', onPointerEnd)
      globalThis.removeEventListener('pointercancel', onPointerEnd)
      selectionGuardRef.current = undefined
    }
  }, [clearSelectionGuard])

  useEffect(() => {
    if (dragPhase !== 'dragging' || dragSource === undefined) return undefined
    const pointerId = dragSource.pointerId
    const list = listRef.current
    if (list !== null) setCapture(list, pointerId)
    document.body.classList.add('node-drag-active')
    const input = findRowInput(dragSource.nodeId, observedElementsRef.current)
    if (input !== null && document.activeElement === input) {
      collapseSelectionToAnchor(input)
      selectionGuardRef.current = { nodeId: dragSource.nodeId, pointerId, caret: getCaret(input) }
      input.blur()
    }
    return () => {
      document.body.classList.remove('node-drag-active')
      if (list !== null) releaseCapture(list, pointerId)
    }
  }, [dragPhase, dragSource])

  useEffect(() => {
    if (drag.phase === 'idle') return undefined
    const pointerId = drag.source?.pointerId
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancelDrag()
    }
    const onBlur = (): void => cancelDrag()
    const onPointerUp = (event: PointerEvent): void => {
      if (pointerId === undefined || event.pointerId !== pointerId) return
      dispatch({ type: 'release', pointerId: event.pointerId })
      setDropIndex(undefined)
      setAutoScrollDirection(0)
    }
    globalThis.addEventListener('keydown', onKeyDown)
    globalThis.addEventListener('blur', onBlur)
    globalThis.addEventListener('pointerup', onPointerUp)
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown)
      globalThis.removeEventListener('blur', onBlur)
      globalThis.removeEventListener('pointerup', onPointerUp)
    }
  }, [cancelDrag, drag.phase, drag.source])

  useLayoutEffect(() => {
    if (dragPhase !== 'dragging') return
    const pointerY = pointerYRef.current
    if (pointerY === undefined) return
    setDropIndex(computeInsertionIndex(pointerY))
  }, [computeInsertionIndex, dragPhase, layoutState.key, measureRevision, viewport])

  const onRowPointerDown = useCallback(
    (node: TreeNode, index: number, event: ReactPointerEvent<HTMLDivElement>): void => {
      if (locked) return
      if (event.target instanceof Element && event.target.closest('.node-disclosure') !== null) return
      clearSelectionGuard()
      suppressClickRef.current = false
      pressPointRef.current = { x: event.clientX, y: event.clientY }
      pointerYRef.current = undefined
      setAutoScrollDirection(0)
      dispatch({
        type: 'press',
        source: { nodeId: node.id, index, pointerId: event.pointerId },
        button: event.button,
        isPrimary: event.isPrimary,
        pointerType: event.pointerType,
      })
    },
    [clearSelectionGuard, locked],
  )

  const onRowPointerLeave = useCallback(
    (nodeId: string, event: ReactPointerEvent<HTMLDivElement>): void => {
      if (dragPhase !== 'pending' || dragSource?.nodeId !== nodeId) return
      // Chromium resets the hovered element when the window loses focus and reports the reset
      // with no buttons pressed. That is not the held pointer leaving the row, so the pending
      // hold survives; a real leave still cancels while the primary button is held.
      if (event.buttons === 0) return
      cancelDrag()
    },
    [cancelDrag, dragPhase, dragSource],
  )

  const onListPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (dragPhase === 'idle' || dragSource === undefined) return
    if (dragPhase === 'pending') {
      const origin = pressPointRef.current
      if (origin !== undefined && exceedsHoldTolerance(origin.x, origin.y, event.clientX, event.clientY)) {
        cancelDrag()
        return
      }
      const row = observedElementsRef.current.get(dragSource.nodeId)
      if (row === undefined) {
        cancelDrag()
        return
      }
      const bounds = row.getBoundingClientRect()
      const inside =
        event.clientY >= bounds.top &&
        event.clientY < bounds.bottom &&
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right
      if (!inside) cancelDrag()
      return
    }
    pointerYRef.current = event.clientY
    setDropIndex(computeInsertionIndex(event.clientY))
    if (windowed) setAutoScrollDirection(autoScrollStep(event.clientY, globalThis.innerHeight))
  }

  const onListPointerUp = (event: ReactPointerEvent<HTMLElement>): void => {
    if (dragPhase === 'dragging' && dragSource !== undefined && dragSource.pointerId === event.pointerId) {
      suppressClickRef.current = true
      const insertionIndex = computeInsertionIndex(event.clientY)
      if (insertionIndex !== undefined && shouldCommitMove(insertionIndex, dragSource.index)) {
        onMove(dragSource.nodeId, insertionIndex)
      }
    }
    clearSelectionGuard()
    dispatch({ type: 'release', pointerId: event.pointerId })
    setDropIndex(undefined)
    setAutoScrollDirection(0)
  }

  const onListPointerCancel = (): void => cancelDrag()

  const onLostPointerCapture = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerId === dragSource?.pointerId) cancelDrag()
  }

  const onListClick = useCallback((event: ReactMouseEvent<HTMLElement>): void => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const layout = layoutState.layout
  const focusedIndex =
    windowed && focusedNodeId !== undefined ? nodes.findIndex((node) => node.id === focusedNodeId) : -1
  const listWindow = windowed
    ? computeListWindow({
        count: nodes.length,
        offsets: layout.offsets,
        viewportStart: viewport.start,
        viewportEnd: viewport.end,
        overscan: WINDOW_OVERSCAN,
        focusedIndex: focusedIndex >= 0 ? focusedIndex : undefined,
      })
    : undefined
  const dropMarker = dropMarkerFor(
    dragPhase === 'dragging' ? dropIndex : undefined,
    nodes.length,
    listWindow === undefined ? undefined : collectWindowIndices(listWindow),
  )

  const renderRow = (node: TreeNode, index: number, pinned = false, pinnedOffset = 0): React.JSX.Element => (
    <NodeRow
      dragging={dragPhase === 'dragging' && dragSource?.nodeId === node.id}
      dropAfter={dropMarker?.index === index && !dropMarker.before}
      dropBefore={dropMarker?.index === index && dropMarker.before}
      index={index}
      key={node.id}
      node={node}
      onEnter={onEnter}
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
      className="node-list"
      onClickCapture={onListClick}
      onLostPointerCapture={onLostPointerCapture}
      onPointerCancel={onListPointerCancel}
      onPointerMove={onListPointerMove}
      onPointerUp={onListPointerUp}
      ref={listRef}
    >
      <DropZone index={0} start />
      {listWindow === undefined ? nodes.map((node, index) => renderRow(node, index)) : renderWindowed(listWindow)}
      <DropZone end index={nodes.length} />
    </section>
  )

  function renderWindowed(windowRange: ListWindow): ReactNode {
    const leadingHeight = layout.offsets[windowRange.start] ?? 0
    const trailingHeight = layout.total - (layout.offsets[windowRange.end] ?? 0)
    const pinnedIndex = windowRange.pinnedIndex
    const pinnedNode = pinnedIndex === undefined ? undefined : nodes[pinnedIndex]
    const children: ReactNode[] = [
      <div aria-hidden="true" className="node-list-spacer" key="leading-spacer" style={{ height: leadingHeight }} />,
    ]
    for (let index = windowRange.start; index < windowRange.end; index += 1) {
      const node = nodes[index]
      if (node !== undefined) children.push(renderRow(node, index))
    }
    if (pinnedIndex !== undefined && pinnedNode !== undefined) {
      children.push(renderRow(pinnedNode, pinnedIndex, true, layout.offsets[pinnedIndex] ?? 0))
    }
    children.push(
      <div aria-hidden="true" className="node-list-spacer" key="trailing-spacer" style={{ height: trailingHeight }} />,
    )
    return children
  }
}

function setCapture(element: HTMLElement, pointerId: number): void {
  if (typeof element.setPointerCapture !== 'function') return
  try {
    element.setPointerCapture(pointerId)
  } catch {
    return
  }
}

function releaseCapture(element: HTMLElement, pointerId: number): void {
  if (typeof element.releasePointerCapture !== 'function' || !element.hasPointerCapture(pointerId)) return
  try {
    element.releasePointerCapture(pointerId)
  } catch {
    return
  }
}

function findRowInput(nodeId: string, rows: Map<string, HTMLElement>): HTMLElement | null {
  const row = rows.get(nodeId)
  return row?.querySelector<HTMLElement>('.node-input') ?? null
}

function collectWindowIndices(windowRange: ListWindow): number[] {
  const indices: number[] = []
  for (let index = windowRange.start; index < windowRange.end; index += 1) indices.push(index)
  if (windowRange.pinnedIndex !== undefined) indices.push(windowRange.pinnedIndex)
  return indices
}

function buildLayout(nodes: readonly TreeNode[], heights: ReadonlyMap<string, number>): ListLayout {
  const rowHeights = nodes.map((node) => heights.get(node.id) ?? ROW_HEIGHT_ESTIMATE)
  const { offsets, total } = computeOffsets(rowHeights)
  return { offsets, total, count: nodes.length }
}

function pruneHeights(heights: Map<string, number>, nodes: readonly TreeNode[]): void {
  const ids = new Set(nodes.map((node) => node.id))
  for (const id of heights.keys()) {
    if (!ids.has(id)) heights.delete(id)
  }
}

function measureElement(
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

interface NodeRowProps {
  node: TreeNode
  index: number
  renderInput: (node: TreeNode, label: string) => ReactNode
  onEnter: (node: TreeNode) => void
  onPointerDown: (node: TreeNode, index: number, event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerLeave: (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => void
  rowRef: (nodeId: string, element: HTMLDivElement | null) => void
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  pinned?: boolean
  pinnedOffset?: number
}

const NodeRow = memo(function NodeRow({
  node,
  index,
  renderInput,
  onEnter,
  onPointerDown,
  onPointerLeave,
  rowRef,
  dragging,
  dropBefore,
  dropAfter,
  pinned = false,
  pinnedOffset = 0,
}: NodeRowProps): React.JSX.Element {
  const className = [
    pinned ? 'node-row node-row-pinned' : 'node-row',
    dragging ? 'node-row-dragging' : '',
    dropBefore ? 'node-row-drop-before' : '',
    dropAfter ? 'node-row-drop-after' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      data-node-id={node.id}
      data-node-index={index}
      onPointerDown={(event) => onPointerDown(node, index, event)}
      onPointerLeave={(event) => onPointerLeave(node.id, event)}
      ref={(element) => rowRef(node.id, element)}
      style={pinned ? { top: pinnedOffset } : undefined}
    >
      <button
        aria-label={`Enter node ${index + 1}`}
        className={`node-disclosure${node.children.length > 0 ? ' node-disclosure-has-children' : ''}`}
        onClick={() => onEnter(node)}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      />
      {renderInput(node, `Node ${index + 1}`)}
    </div>
  )
})

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
