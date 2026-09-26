import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TreeNode } from '../domain/document'
import { NodeRow } from './NodeRow'
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
import { dropMarkerFor } from './node-drag'
import { useNodeListDrag } from './use-node-list-drag'

interface NodeListProps {
  nodes: readonly TreeNode[]
  renderInput: (node: TreeNode, label: string) => ReactNode
  onEnter: (node: TreeNode) => void
  onMove: (nodeId: string, insertionIndex: number) => void
  focusedNodeId?: string | undefined
  structuralVersion?: number
  visualNodeSelection?: { anchorId: string; focusId: string } | undefined
  locked?: boolean
  onDragStart?: () => void
}

export function NodeList({
  nodes,
  renderInput,
  onEnter,
  onMove,
  focusedNodeId,
  structuralVersion = 0,
  visualNodeSelection,
  locked = false,
  onDragStart = () => undefined,
}: NodeListProps): React.JSX.Element {
  const listRef = useRef<HTMLElement | null>(null)
  const heightsRef = useRef(new Map<string, number>())
  const observedElementsRef = useRef(new Map<string, HTMLElement>())
  const observerRef = useRef<ResizeObserver | undefined>(undefined)
  const widthRef = useRef(typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : 0)
  const [measureRevision, setMeasureRevision] = useState(0)
  const [viewport, setViewport] = useState({ start: 0, end: 0 })
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

  const {
    dragPhase,
    dragSource,
    dropIndex,
    onRowPointerDown,
    onRowPointerLeave,
    onListPointerMove,
    onListPointerUp,
    onListPointerCancel,
    onLostPointerCapture,
    onListClick,
    recomputeDropIndex,
  } = useNodeListDrag({ nodes, locked, windowed, listRef, observedElementsRef, onMove, onDragStart })

  useLayoutEffect(() => {
    recomputeDropIndex()
  }, [recomputeDropIndex, layoutState.key, measureRevision, viewport])

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
  const visualAnchorIndex =
    visualNodeSelection === undefined ? -1 : nodes.findIndex((node) => node.id === visualNodeSelection.anchorId)
  const visualFocusIndex =
    visualNodeSelection === undefined ? -1 : nodes.findIndex((node) => node.id === visualNodeSelection.focusId)
  const visualStart = visualAnchorIndex < 0 || visualFocusIndex < 0 ? -1 : Math.min(visualAnchorIndex, visualFocusIndex)
  const visualEnd = visualStart < 0 ? -1 : Math.max(visualAnchorIndex, visualFocusIndex)
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
      focused={focusedNodeId !== undefined && node.id === focusedNodeId}
      visualSelected={visualStart >= 0 && index >= visualStart && index <= visualEnd}
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
