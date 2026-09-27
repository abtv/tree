import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { TreeNode } from '../domain/document'
import type { NodeDragCaretFreeze } from './drag-caret-freeze'
import { autoScrollStep } from './list-window'
import {
  HOLD_ACTIVATION_MS,
  IDLE_NODE_DRAG,
  exceedsHoldTolerance,
  insertionIndexAtPoint,
  nodeDragReducer,
  resolveNodeDrag,
  shouldCommitMove,
  type NodeDragSource,
  type NodeDropRegion,
} from './node-drag'

interface UseNodeListDragOptions {
  nodes: readonly TreeNode[]
  locked: boolean
  windowed: boolean
  listRef: RefObject<HTMLElement | null>
  observedElementsRef: RefObject<Map<string, HTMLElement>>
  onMove: (nodeId: string, insertionIndex: number) => void
  dragFreeze: NodeDragCaretFreeze
}

interface NodeListDrag {
  freeze: NodeDragSource | undefined
  dropIndex: number | undefined
  onRowPointerDown: (node: TreeNode, index: number, event: ReactPointerEvent<HTMLDivElement>) => void
  onRowPointerLeave: (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => void
  onListPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onListPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onListPointerCancel: () => void
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void
  onListClick: (event: ReactMouseEvent<HTMLElement>) => void
  recomputeDropIndex: () => void
}

export function useNodeListDrag({
  nodes,
  locked,
  windowed,
  listRef,
  observedElementsRef,
  onMove,
  dragFreeze,
}: UseNodeListDragOptions): NodeListDrag {
  const [autoScrollDirection, setAutoScrollDirection] = useState(0)
  const [drag, dispatch] = useReducer(nodeDragReducer, IDLE_NODE_DRAG)
  const [dropIndex, setDropIndex] = useState<number>()
  const pointerYRef = useRef<number | undefined>(undefined)
  const pressPointRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const suppressClickRef = useRef(false)
  const sourceCandidate = drag.source
  const sourceAvailable = sourceCandidate === undefined || nodes.some((node) => node.id === sourceCandidate.nodeId)
  // One resolved state owns the freeze; every projection below reads it rather than the raw reducer
  // state, so the body class, row marker, drop marker, pointer capture, and caret suspension cannot
  // describe different gestures.
  const resolved = resolveNodeDrag(drag, { locked, sourceAvailable })
  const freeze = resolved.phase === 'dragging' ? resolved.source : undefined

  const cancelDrag = useCallback((): void => {
    dispatch({ type: 'cancel' })
    setDropIndex(undefined)
    setAutoScrollDirection(0)
  }, [])

  useEffect(() => {
    if (drag.phase !== 'idle' && resolved.phase === 'idle') dispatch({ type: 'cancel' })
  }, [drag.phase, resolved.phase])

  const computeInsertionIndex = useCallback(
    (clientY: number): number | undefined => {
      const regions: NodeDropRegion[] = []
      observedElementsRef.current.forEach((element) => {
        const index = Number(element.dataset.nodeIndex)
        if (!Number.isInteger(index) || index < 0) return
        const bounds = element.getBoundingClientRect()
        if (bounds.height <= 0) return
        regions.push({ index, top: bounds.top, bottom: bounds.bottom })
      })
      return insertionIndexAtPoint(regions, clientY)
    },
    [observedElementsRef],
  )

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
    if (resolved.phase === 'idle') return undefined
    const pointerId = resolved.source?.pointerId
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
  }, [cancelDrag, resolved.phase, resolved.source])

  const onRowPointerDown = useCallback(
    (node: TreeNode, index: number, event: ReactPointerEvent<HTMLDivElement>): void => {
      if (locked) return
      if (event.button === 2) event.preventDefault()
      if (event.target instanceof Element && event.target.closest('.node-disclosure') !== null) return
      dragFreeze.end()
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

  const onListPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
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
    pointerYRef.current = event.clientY
    setDropIndex(computeInsertionIndex(event.clientY))
    if (windowed) setAutoScrollDirection(autoScrollStep(event.clientY, globalThis.innerHeight))
  }

  const onListPointerUp = (event: ReactPointerEvent<HTMLElement>): void => {
    if (freeze !== undefined && freeze.pointerId === event.pointerId) {
      suppressClickRef.current = true
      const insertionIndex = computeInsertionIndex(event.clientY)
      if (insertionIndex !== undefined && shouldCommitMove(insertionIndex, freeze.index)) {
        onMove(freeze.nodeId, insertionIndex)
      }
    }
    dragFreeze.end(event.pointerId)
    dispatch({ type: 'release', pointerId: event.pointerId })
    setDropIndex(undefined)
    setAutoScrollDirection(0)
  }

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
    if (pointerY === undefined) return
    setDropIndex(computeInsertionIndex(pointerY))
  }, [computeInsertionIndex, freeze])

  return {
    freeze,
    dropIndex,
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
