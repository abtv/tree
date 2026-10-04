import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { TreeNode } from '../domain/document'
import type { NodeDragCaretFreeze } from './drag-caret-freeze'
import { autoScrollStep } from './list-window'
import { onViewportScroll, scrollViewportBy, viewportBounds } from './scroll-viewport'
import {
  dragBlock,
  dropTargetAtGap,
  dropTargetOnRow,
  gapLevels,
  isNoOpDrop,
  type DropTarget,
} from '../application/drop-targets'
import {
  HOLD_ACTIVATION_MS,
  IDLE_NODE_DRAG,
  exceedsHoldTolerance,
  dropLevelAtPoint,
  dropZoneAtPoint,
  nodeDragReducer,
  resolveNodeDrag,
  type NodeDragSource,
  type NodeDropRegion,
} from './node-drag'
import type { VisibleRow } from '../application/visible-rows'
import { breadcrumbAtPoint } from './node-list-layout'

interface UseNodeListDragOptions {
  rows: readonly VisibleRow[]
  locked: boolean
  listRef: RefObject<HTMLElement | null>
  observedElementsRef: RefObject<Map<string, HTMLElement>>
  onDrop: (nodeId: string, target: DropTarget) => void
  dragFreeze: NodeDragCaretFreeze
  breadcrumbTargets?: ReadonlyMap<string | null, DropTarget> | undefined
  onBreadcrumbTarget?: ((parentId: string | null | undefined) => void) | undefined
}

interface NodeListDrag {
  freeze: NodeDragSource | undefined
  dropIndex: number | undefined
  dropLevel: number | undefined
  dropRow: number | undefined
  invalidDrop: boolean
  onRowPointerDown: (node: TreeNode, index: number, event: ReactPointerEvent<HTMLDivElement>) => void
  onRowPointerLeave: (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => void
  onListPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onListPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onListPointerCancel: () => void
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void
  onListClick: (event: ReactMouseEvent<HTMLElement>) => void
  recomputeDropIndex: () => void
}

type ResolvedDrop =
  | { kind: 'gap'; gap: number; level: number; target: DropTarget | undefined }
  | { kind: 'row'; row: number; target: DropTarget | undefined }
  | { kind: 'breadcrumb'; parentId: string | null | undefined; target: DropTarget | undefined }

export function useNodeListDrag({
  rows,
  locked,
  listRef,
  observedElementsRef,
  onDrop,
  dragFreeze,
  breadcrumbTargets,
  onBreadcrumbTarget,
}: UseNodeListDragOptions): NodeListDrag {
  const [autoScrollDirection, setAutoScrollDirection] = useState(0)
  const [drag, dispatch] = useReducer(nodeDragReducer, IDLE_NODE_DRAG)
  const [drop, setDrop] = useState<ResolvedDrop>()
  const pointerXRef = useRef<number | undefined>(undefined)
  const pointerYRef = useRef<number | undefined>(undefined)
  const pressPointRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const suppressClickRef = useRef(false)
  const sourceCandidate = drag.source
  const sourceAvailable = sourceCandidate === undefined || rows.some((row) => row.node.id === sourceCandidate.nodeId)
  // One resolved state owns the freeze; every projection below reads it rather than the raw reducer
  // state, so the body class, row marker, drop marker, pointer capture, and caret suspension cannot
  // describe different gestures.
  const resolved = resolveNodeDrag(drag, { locked, sourceAvailable })
  const freeze = resolved.phase === 'dragging' ? resolved.source : undefined
  const invalidDrop = freeze !== undefined && drop !== undefined && drop.target === undefined

  const breadcrumbTarget =
    freeze !== undefined && drop?.kind === 'breadcrumb' && drop.target !== undefined ? drop.parentId : undefined
  useEffect(() => {
    onBreadcrumbTarget?.(breadcrumbTarget)
    return () => onBreadcrumbTarget?.(undefined)
  }, [breadcrumbTarget, onBreadcrumbTarget])

  const cancelDrag = useCallback((): void => {
    dispatch({ type: 'cancel' })
    setDrop(undefined)
    setAutoScrollDirection(0)
  }, [])

  useEffect(() => {
    if (drag.phase !== 'idle' && resolved.phase === 'idle') dispatch({ type: 'cancel' })
  }, [drag.phase, resolved.phase])

  const computeDrop = useCallback(
    (clientX: number, clientY: number): ResolvedDrop | undefined => {
      const breadcrumb = breadcrumbAtPoint(clientX, clientY)
      if (breadcrumb !== undefined)
        return {
          kind: 'breadcrumb',
          parentId: breadcrumb.parentId,
          target: breadcrumb.parentId === undefined ? undefined : breadcrumbTargets?.get(breadcrumb.parentId),
        }
      const regions: NodeDropRegion[] = []
      observedElementsRef.current.forEach((element) => {
        const index = Number(element.dataset.nodeIndex)
        if (!Number.isInteger(index) || index < 0) return
        const bounds = element.getBoundingClientRect()
        if (bounds.height <= 0) return
        regions.push({ index, top: bounds.top, bottom: bounds.bottom })
      })
      const zone = dropZoneAtPoint(regions, clientY)
      if (zone === undefined) return undefined
      const source = drag.source
      if (source === undefined) return undefined
      const block = dragBlock(rows, source.nodeId)
      if (block === undefined) return undefined
      if ('row' in zone) return { kind: 'row', row: zone.row, target: dropTargetOnRow(rows, block, zone.row) }
      const levels = gapLevels(rows, block, zone.gap)
      if (levels === undefined)
        return { kind: 'gap', gap: zone.gap, level: rows[block.start]!.depth, target: undefined }
      const origin = pressPointRef.current
      const level = dropLevelAtPoint(rows[block.start]!.depth, origin?.x ?? clientX, clientX, levels)
      return { kind: 'gap', gap: zone.gap, level, target: dropTargetAtGap(rows, block, zone.gap, level) }
    },
    [drag.source, observedElementsRef, rows, breadcrumbTargets],
  )

  useEffect(() => {
    if (autoScrollDirection === 0) return undefined
    const direction = autoScrollDirection
    let frame = 0
    function step(): void {
      scrollViewportBy(direction)
      frame = globalThis.requestAnimationFrame(step)
    }
    frame = globalThis.requestAnimationFrame(step)
    return () => globalThis.cancelAnimationFrame(frame)
  }, [autoScrollDirection, resolved.phase])

  useEffect(() => {
    if (resolved.phase !== 'pending' || resolved.source === undefined) return undefined
    const pointerId = resolved.source.pointerId
    const nodeId = resolved.source.nodeId
    const timeout = globalThis.setTimeout(() => {
      if (!observedElementsRef.current.has(nodeId)) return
      dispatch({ type: 'hold', pointerId })
    }, HOLD_ACTIVATION_MS)
    return () => globalThis.clearTimeout(timeout)
  }, [resolved.phase, resolved.source, observedElementsRef])

  useEffect(() => {
    if (freeze === undefined) return undefined
    const pointerId = freeze.pointerId
    const list = listRef.current
    if (list !== null) setCapture(list, pointerId)
    document.body.classList.add('node-drag-active')
    dragFreeze.begin(freeze.nodeId, pointerId)
    return () => {
      document.body.classList.remove('node-drag-active')
      if (list !== null) releaseCapture(list, pointerId)
    }
  }, [dragFreeze, freeze, listRef])

  useEffect(() => {
    document.body.classList.toggle('node-drag-invalid', invalidDrop)
    return () => document.body.classList.remove('node-drag-invalid')
  }, [invalidDrop])

  const onRowPointerDown = useCallback(
    (node: TreeNode, index: number, event: ReactPointerEvent<HTMLDivElement>): void => {
      if (locked) return
      if (event.button === 2) event.preventDefault()
      if (
        event.target instanceof Element &&
        event.target.closest('.node-enter-control, .node-disclosure-triangle') !== null
      )
        return
      dragFreeze.end()
      suppressClickRef.current = false
      pressPointRef.current = { x: event.clientX, y: event.clientY }
      pointerYRef.current = event.clientY
      pointerXRef.current = event.clientX
      setAutoScrollDirection(0)
      dispatch({
        type: 'press',
        source: { nodeId: node.id, index, pointerId: event.pointerId },
        button: event.button,
        isPrimary: event.isPrimary,
        pointerType: event.pointerType,
      })
    },
    [dragFreeze, locked],
  )

  const onRowPointerLeave = useCallback(
    (nodeId: string, event: ReactPointerEvent<HTMLDivElement>): void => {
      if (resolved.phase !== 'pending' || resolved.source?.nodeId !== nodeId) return
      // Chromium resets the hovered element when the window loses focus and reports the reset
      // with no buttons pressed. That is not the held pointer leaving the row, so the pending
      // hold survives; a real leave still cancels while the primary button is held.
      if (event.buttons === 0) return
      cancelDrag()
    },
    [cancelDrag, resolved.phase, resolved.source],
  )

  const onListPointerMove = useCallback(
    (event: Pick<PointerEvent, 'clientX' | 'clientY'>): void => {
      if (resolved.phase === 'idle' || resolved.source === undefined) return
      if (resolved.phase === 'pending') {
        const origin = pressPointRef.current
        if (origin !== undefined && exceedsHoldTolerance(origin.x, origin.y, event.clientX, event.clientY)) {
          cancelDrag()
          return
        }
        const row = observedElementsRef.current.get(resolved.source.nodeId)
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
      pointerXRef.current = event.clientX
      pointerYRef.current = event.clientY
      const nextDrop = computeDrop(event.clientX, event.clientY)
      setDrop((previous) => (sameDrop(previous, nextDrop) ? previous : nextDrop))
      const { top, bottom } = viewportBounds()
      setAutoScrollDirection(nextDrop?.kind === 'breadcrumb' ? 0 : autoScrollStep(event.clientY - top, bottom - top))
    },
    [resolved, cancelDrag, observedElementsRef, computeDrop],
  )

  const onListPointerUp = useCallback(
    (event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'target'>): void => {
      if (freeze !== undefined && freeze.pointerId === event.pointerId) {
        suppressClickRef.current = event.target instanceof Node && listRef.current?.contains(event.target) === true
        const resolvedDrop = computeDrop(event.clientX, event.clientY)
        const sourceBlock = dragBlock(rows, freeze.nodeId)
        if (
          resolvedDrop?.target !== undefined &&
          sourceBlock !== undefined &&
          !isNoOpDrop(rows, sourceBlock, resolvedDrop.target)
        )
          onDrop(freeze.nodeId, resolvedDrop.target)
      }
      dragFreeze.end(event.pointerId)
      dispatch({ type: 'release', pointerId: event.pointerId })
      setDrop(undefined)
      setAutoScrollDirection(0)
    },
    [freeze, computeDrop, rows, onDrop, dragFreeze, listRef],
  )

  useEffect(() => {
    if (resolved.phase === 'idle') return undefined
    const pointerId = resolved.source?.pointerId
    const outsideList = (event: PointerEvent): boolean =>
      event.target instanceof Node && !listRef.current?.contains(event.target)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancelDrag()
    }
    const onBlur = (): void => cancelDrag()
    const onNativeDragStart = (event: DragEvent): void => {
      if (resolved.phase === 'dragging' && event.target instanceof Node && listRef.current?.contains(event.target))
        event.preventDefault()
    }
    // Native capture can be unavailable; outside events still use the same target and release paths.
    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerId === pointerId && resolved.phase === 'dragging' && outsideList(event)) onListPointerMove(event)
    }
    const onPointerUp = (event: PointerEvent): void => {
      if (pointerId === undefined || event.pointerId !== pointerId) return
      if (outsideList(event)) onListPointerUp(event)
      else {
        dispatch({ type: 'release', pointerId: event.pointerId })
        setDrop(undefined)
        setAutoScrollDirection(0)
      }
    }
    globalThis.addEventListener('keydown', onKeyDown)
    globalThis.addEventListener('blur', onBlur)
    globalThis.addEventListener('dragstart', onNativeDragStart)
    globalThis.addEventListener('pointermove', onPointerMove)
    const onPointerCancel = (event: PointerEvent): void => {
      if (event.pointerId === pointerId && outsideList(event)) cancelDrag()
    }
    globalThis.addEventListener('pointercancel', onPointerCancel)
    globalThis.addEventListener('pointerup', onPointerUp)
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown)
      globalThis.removeEventListener('blur', onBlur)
      globalThis.removeEventListener('dragstart', onNativeDragStart)
      globalThis.removeEventListener('pointermove', onPointerMove)
      globalThis.removeEventListener('pointercancel', onPointerCancel)
      globalThis.removeEventListener('pointerup', onPointerUp)
    }
  }, [cancelDrag, resolved.phase, resolved.source, listRef, onListPointerMove, onListPointerUp])

  const onListPointerCancel = (): void => cancelDrag()

  const onLostPointerCapture = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerId === freeze?.pointerId) cancelDrag()
  }

  const onListClick = useCallback((event: ReactMouseEvent<HTMLElement>): void => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const recomputeDropIndex = useCallback((): void => {
    if (freeze === undefined) return
    const pointerY = pointerYRef.current
    const pointerX = pointerXRef.current
    if (pointerY === undefined || pointerX === undefined) return
    const nextDrop = computeDrop(pointerX, pointerY)
    setDrop((previous) => (sameDrop(previous, nextDrop) ? previous : nextDrop))
  }, [computeDrop, freeze])

  // Auto-scroll moves rows under a stationary pointer; an unwindowed list has no viewport state that
  // would otherwise trigger the recomputation.
  useEffect(() => {
    if (freeze === undefined) return undefined
    return onViewportScroll(recomputeDropIndex)
  }, [freeze, recomputeDropIndex])

  return {
    freeze,
    dropIndex: drop?.kind === 'gap' ? drop.gap : undefined,
    dropLevel: drop?.kind === 'gap' ? drop.level : undefined,
    dropRow: freeze !== undefined && drop?.kind === 'row' && drop.target !== undefined ? drop.row : undefined,
    invalidDrop,
    onRowPointerDown,
    onRowPointerLeave,
    onListPointerMove,
    onListPointerUp,
    onListPointerCancel,
    onLostPointerCapture,
    onListClick,
    recomputeDropIndex,
  }
}

function sameDrop(left: ResolvedDrop | undefined, right: ResolvedDrop | undefined): boolean {
  if (left?.kind !== right?.kind) return false
  if (left === undefined || right === undefined) return true
  if (left.target?.parentId !== right.target?.parentId || left.target?.index !== right.target?.index) return false
  if (left.kind === 'row' && right.kind === 'row') return left.row === right.row
  if (left.kind === 'breadcrumb' && right.kind === 'breadcrumb') return left.parentId === right.parentId
  if (left.kind !== 'gap' || right.kind !== 'gap') return false
  return (
    left.gap === right.gap &&
    left.level === right.level &&
    left.target?.parentId === right.target?.parentId &&
    left.target?.index === right.target?.index
  )
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
