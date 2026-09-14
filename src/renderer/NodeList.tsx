import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, DragEvent, ReactNode, SetStateAction } from 'react'
import type { TreeNode } from '../domain/document'
import {
  autoScrollStep,
  computeListWindow,
  computeOffsets,
  ROW_HEIGHT_ESTIMATE,
  shouldWindow,
  WINDOW_OVERSCAN,
  type ListWindow,
} from './list-window'

interface NodeListProps {
  nodes: readonly TreeNode[]
  renderInput: (node: TreeNode, label: string) => ReactNode
  onEnter: (node: TreeNode) => void
  onMove: (nodeId: string, insertionIndex: number) => void
  focusedNodeId?: string | undefined
  structuralVersion?: number
  locked?: boolean
}

type DropHandler = (insertionIndex: number, event: DragEvent<HTMLElement>) => void

interface MutableReference<T> {
  current: T
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
  const draggedNodeIdRef = useRef<string | undefined>(undefined)
  const listRef = useRef<HTMLElement | null>(null)
  const heightsRef = useRef(new Map<string, number>())
  const observedElementsRef = useRef(new Map<string, HTMLElement>())
  const observerRef = useRef<ResizeObserver | undefined>(undefined)
  const widthRef = useRef(typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : 0)
  const [measureRevision, setMeasureRevision] = useState(0)
  const [viewport, setViewport] = useState({ start: 0, end: 0 })
  const [autoScrollDirection, setAutoScrollDirection] = useState(0)
  const [layoutState, setLayoutState] = useState<LayoutState>(() => ({
    key: `initial:${nodes.length}`,
    layout: shouldWindow(nodes.length) ? buildLayout(nodes, EMPTY_HEIGHTS) : EMPTY_LAYOUT,
    structuralVersion,
  }))
  const windowed = shouldWindow(nodes.length)

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
  }, [autoScrollDirection])

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

  const updateAutoScroll = useCallback((clientY: number): void => {
    setAutoScrollDirection(autoScrollStep(clientY, globalThis.innerHeight))
  }, [])

  const onDrop = useCallback<DropHandler>(
    (insertionIndex, event) => {
      event.preventDefault()
      setAutoScrollDirection(0)
      const nodeId = event.dataTransfer.getData('text/plain') || draggedNodeIdRef.current
      if (nodeId !== undefined) onMove(nodeId, insertionIndex)
      draggedNodeIdRef.current = undefined
    },
    [onMove],
  )
  const onDragEnd = useCallback((): void => {
    setAutoScrollDirection(0)
    draggedNodeIdRef.current = undefined
  }, [])

  const onListDragOver = useCallback(
    (event: DragEvent<HTMLElement>): void => {
      if (!windowed) return
      event.preventDefault()
      updateAutoScroll(event.clientY)
    },
    [updateAutoScroll, windowed],
  )
  const onListDragLeave = useCallback((event: DragEvent<HTMLElement>): void => {
    const related = event.relatedTarget
    if (related instanceof Node && event.currentTarget.contains(related)) return
    setAutoScrollDirection(0)
  }, [])

  const renderRow = (node: TreeNode, index: number, pinned = false, pinnedOffset = 0): React.JSX.Element => (
    <NodeRow
      draggedNodeIdRef={draggedNodeIdRef}
      index={index}
      key={node.id}
      locked={locked}
      node={node}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      onEnter={onEnter}
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
      onDragLeave={onListDragLeave}
      onDragOver={onListDragOver}
      ref={listRef}
    >
      <DropZone index={0} onDrop={onDrop} start />
      {listWindow === undefined ? nodes.map((node, index) => renderRow(node, index)) : renderWindowed(listWindow)}
      <DropZone end index={nodes.length} onDrop={onDrop} />
    </section>
  )

  function renderWindowed(windowRange: ListWindow): ReactNode {
    const leadingHeight = layout.offsets[windowRange.start] ?? 0
    const trailingHeight = layout.total - (layout.offsets[windowRange.end] ?? 0)
    const pinnedIndex = windowRange.pinnedIndex
    const pinnedNode = pinnedIndex === undefined ? undefined : nodes[pinnedIndex]
    const children: ReactNode[] = [
      <div
        aria-hidden="true"
        className="node-list-spacer"
        key="leading-spacer"
        onDragOver={onDragOver}
        onDrop={(event) => onDrop(windowRange.start, event)}
        style={{ height: leadingHeight }}
      />,
    ]
    for (let index = windowRange.start; index < windowRange.end; index += 1) {
      const node = nodes[index]
      if (node !== undefined) children.push(renderRow(node, index))
    }
    if (pinnedIndex !== undefined && pinnedNode !== undefined) {
      children.push(renderRow(pinnedNode, pinnedIndex, true, layout.offsets[pinnedIndex] ?? 0))
    }
    children.push(
      <div
        aria-hidden="true"
        className="node-list-spacer"
        key="trailing-spacer"
        onDragOver={onDragOver}
        onDrop={(event) => onDrop(windowRange.end, event)}
        style={{ height: trailingHeight }}
      />,
    )
    return children
  }
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
  onDrop: DropHandler
  onDragEnd: () => void
  draggedNodeIdRef: MutableReference<string | undefined>
  rowRef: (nodeId: string, element: HTMLDivElement | null) => void
  pinned?: boolean
  pinnedOffset?: number
  locked: boolean
}

const NodeRow = memo(function NodeRow({
  node,
  index,
  renderInput,
  onEnter,
  onDrop,
  onDragEnd,
  draggedNodeIdRef,
  rowRef,
  pinned = false,
  pinnedOffset = 0,
  locked,
}: NodeRowProps): React.JSX.Element {
  const onDropRow = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      const bounds = event.currentTarget.getBoundingClientRect()
      onDrop(event.clientY < bounds.top + bounds.height / 2 ? index : index + 1, event)
    },
    [index, onDrop],
  )
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.currentTarget.classList.add('node-row-dragging')
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', node.id)
      draggedNodeIdRef.current = node.id
    },
    [draggedNodeIdRef, node.id],
  )
  const onDragEndRow = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.currentTarget.classList.remove('node-row-dragging')
      onDragEnd()
    },
    [onDragEnd],
  )

  return (
    <div
      className={pinned ? 'node-row node-row-pinned' : 'node-row'}
      data-node-id={node.id}
      draggable={!locked}
      onDragEnd={onDragEndRow}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDropRow}
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

function onDragOver(event: DragEvent<HTMLElement>): void {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

function DropZone({
  end = false,
  index,
  onDrop,
  start = false,
}: {
  end?: boolean
  index: number
  onDrop: DropHandler
  start?: boolean
}): React.JSX.Element {
  return (
    <div
      className={`drop-zone${start ? ' drop-zone-start' : ''}${end ? ' drop-zone-end' : ''}`}
      aria-label={`Drop position ${index + 1}`}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(index, event)}
    />
  )
}
