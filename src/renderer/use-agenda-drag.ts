import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { AgendaRow } from '../application/agenda-rows'
import { dayKey } from '../application/agenda-state'
import type { DayNumber } from '../domain/calendar-date'
import {
  agendaDragSource,
  agendaDropTarget,
  agendaRowKeyAtPoint,
  type AgendaDragSource,
  type AgendaDropTarget,
  type AgendaRowRegion,
} from './agenda-drop-targets'
import type { NodeDragCaretFreeze } from './drag-caret-freeze'
import { autoScrollStep } from './list-window'
import { HOLD_ACTIVATION_MS, IDLE_NODE_DRAG, exceedsHoldTolerance, nodeDragReducer, resolveNodeDrag } from './node-drag'
import { onViewportScroll, scrollViewportBy, viewportBounds } from './scroll-viewport'

interface UseAgendaDragOptions {
  rows: readonly AgendaRow[]
  locked: boolean
  listRef: RefObject<HTMLElement | null>
  elementsRef: RefObject<Map<string, HTMLElement>>
  onDrop: (source: AgendaDragSource, targetDay: DayNumber) => void
  dragFreeze: NodeDragCaretFreeze
}

interface AgendaDrag {
  /** The key of the row being dragged while the gesture is active. */
  sourceKey: string | undefined
  /** The key of the day header that outlines the drop target. */
  dropHeaderKey: string | undefined
  onListPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onListPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void
  onListPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onListPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onListPointerCancel: () => void
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void
  onListClick: (event: ReactMouseEvent<HTMLElement>) => void
}

/**
 * Press-and-hold dragging of a dated Agenda occurrence onto another day. It reuses the Tree gesture
 * state machine (`node-drag.ts`) and caret freeze, and differs only in what a drop means: a drop on any
 * row of another day changes the date, never the parent or the order (`plans/agenda.md` §11, m18).
 */
export function useAgendaDrag({
  rows,
  locked,
  listRef,
  elementsRef,
  onDrop,
  dragFreeze,
}: UseAgendaDragOptions): AgendaDrag {
  const [autoScrollDirection, setAutoScrollDirection] = useState(0)
  const [drag, dispatch] = useReducer(nodeDragReducer, IDLE_NODE_DRAG)
  const [target, setTarget] = useState<AgendaDropTarget>()
  const [source, setSource] = useState<AgendaDragSource>()
  const pressPointRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const pointerRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const suppressClickRef = useRef(false)
  const rowsByKey = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows])
  const sourceAvailable = drag.source === undefined || (source !== undefined && rowsByKey.has(source.key))
  // One resolved state owns the freeze, so the body class, row marker, outline, pointer capture, and
  // caret suspension cannot describe different gestures.
  const resolved = resolveNodeDrag(drag, { locked, sourceAvailable })
  const freeze = resolved.phase === 'dragging' && source !== undefined ? source : undefined
  const pointerId = resolved.source?.pointerId
  const invalidDrop = freeze !== undefined && target?.kind === 'invalid'

  const cancelDrag = useCallback((): void => {
    dispatch({ type: 'cancel' })
    setTarget(undefined)
    setAutoScrollDirection(0)
  }, [])

  useEffect(() => {
    if (drag.phase !== 'idle' && resolved.phase === 'idle') dispatch({ type: 'cancel' })
  }, [drag.phase, resolved.phase])

  const computeTarget = useCallback(
    (clientY: number): AgendaDropTarget | undefined => {
      if (source === undefined) return undefined
      const regions: AgendaRowRegion[] = []
      elementsRef.current.forEach((element, key) => {
        const bounds = element.getBoundingClientRect()
        regions.push({ key, top: bounds.top, bottom: bounds.bottom })
      })
      const key = agendaRowKeyAtPoint(regions, clientY)
      const row = key === undefined ? undefined : rowsByKey.get(key)
      return row === undefined ? undefined : agendaDropTarget(row, source)
    },
    [elementsRef, rowsByKey, source],
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
    if (resolved.phase !== 'pending' || pointerId === undefined) return undefined
    const key = source?.key
    const timeout = globalThis.setTimeout(() => {
      if (key === undefined || !elementsRef.current.has(key)) return
      dispatch({ type: 'hold', pointerId })
    }, HOLD_ACTIVATION_MS)
    return () => globalThis.clearTimeout(timeout)
  }, [resolved.phase, pointerId, elementsRef, source])

  useEffect(() => {
    if (freeze === undefined || pointerId === undefined) return undefined
    const list = listRef.current
    if (list !== null) setCapture(list, pointerId)
    document.body.classList.add('node-drag-active')
    dragFreeze.begin(freeze.nodeId, pointerId)
    return () => {
      document.body.classList.remove('node-drag-active')
      if (list !== null) releaseCapture(list, pointerId)
    }
  }, [dragFreeze, freeze, listRef, pointerId])

  useEffect(() => {
    document.body.classList.toggle('node-drag-invalid', invalidDrop)
    return () => document.body.classList.remove('node-drag-invalid')
  }, [invalidDrop])

  const onListPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (locked || !(event.target instanceof Element)) return
      if (event.target.closest('.node-enter-control, .node-disclosure-triangle') !== null) return
      const key = event.target.closest<HTMLElement>('[data-agenda-key]')?.dataset.agendaKey
      const row = key === undefined ? undefined : rowsByKey.get(key)
      const candidate = row === undefined ? undefined : agendaDragSource(row)
      if (candidate === undefined) return
      dragFreeze.end()
      suppressClickRef.current = false
      setSource(candidate)
      pressPointRef.current = { x: event.clientX, y: event.clientY }
      pointerRef.current = pressPointRef.current
      setAutoScrollDirection(0)
      dispatch({
        type: 'press',
        source: { nodeId: candidate.nodeId, index: rows.indexOf(row!), pointerId: event.pointerId },
        button: event.button,
        isPrimary: event.isPrimary,
        pointerType: event.pointerType,
      })
    },
    [dragFreeze, locked, rows, rowsByKey],
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
        const element = elementsRef.current.get(source?.key ?? '')
        if (element === undefined) {
          cancelDrag()
          return
        }
        const bounds = element.getBoundingClientRect()
        const inside =
          event.clientY >= bounds.top &&
          event.clientY < bounds.bottom &&
          event.clientX >= bounds.left &&
          event.clientX <= bounds.right
        if (!inside) cancelDrag()
        return
      }
      pointerRef.current = { x: event.clientX, y: event.clientY }
      const next = computeTarget(event.clientY)
      setTarget((previous) => (sameTarget(previous, next) ? previous : next))
      const { top, bottom } = viewportBounds()
      setAutoScrollDirection(autoScrollStep(event.clientY - top, bottom - top))
    },
    [resolved, cancelDrag, elementsRef, computeTarget, source],
  )

  const onListPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      // A reset hover reports no buttons (the window lost focus); only a held pointer leaving cancels.
      if (resolved.phase === 'pending' && event.buttons !== 0) cancelDrag()
    },
    [cancelDrag, resolved.phase],
  )

  const onListPointerUp = useCallback(
    (event: Pick<PointerEvent, 'pointerId' | 'clientY' | 'target'>): void => {
      if (freeze !== undefined && pointerId === event.pointerId) {
        suppressClickRef.current = event.target instanceof Node && listRef.current?.contains(event.target) === true
        const dropped = computeTarget(event.clientY)
        if (dropped?.kind === 'day') onDrop(freeze, dropped.day)
      }
      dragFreeze.end(event.pointerId)
      dispatch({ type: 'release', pointerId: event.pointerId })
      setTarget(undefined)
      setAutoScrollDirection(0)
    },
    [freeze, pointerId, computeTarget, onDrop, dragFreeze, listRef],
  )

  useEffect(() => {
    if (resolved.phase === 'idle') return undefined
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
        setTarget(undefined)
        setAutoScrollDirection(0)
      }
    }
    const onPointerCancel = (event: PointerEvent): void => {
      if (event.pointerId === pointerId && outsideList(event)) cancelDrag()
    }
    globalThis.addEventListener('keydown', onKeyDown)
    globalThis.addEventListener('blur', onBlur)
    globalThis.addEventListener('dragstart', onNativeDragStart)
    globalThis.addEventListener('pointermove', onPointerMove)
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
  }, [cancelDrag, resolved.phase, pointerId, listRef, onListPointerMove, onListPointerUp])

  const onLostPointerCapture = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerId === pointerId && freeze !== undefined) cancelDrag()
  }

  const onListClick = useCallback((event: ReactMouseEvent<HTMLElement>): void => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  // Auto-scroll moves rows under a stationary pointer, so the target is recomputed on every scroll.
  useEffect(() => {
    if (freeze === undefined) return undefined
    return onViewportScroll(() => {
      const point = pointerRef.current
      if (point === undefined) return
      const next = computeTarget(point.y)
      setTarget((previous) => (sameTarget(previous, next) ? previous : next))
    })
  }, [freeze, computeTarget])

  return {
    sourceKey: freeze?.key,
    dropHeaderKey: freeze !== undefined && target?.kind === 'day' ? dayKey(target.day) : undefined,
    onListPointerDown,
    onListPointerLeave,
    onListPointerMove,
    onListPointerUp,
    onListPointerCancel: cancelDrag,
    onLostPointerCapture,
    onListClick,
  }
}

function sameTarget(left: AgendaDropTarget | undefined, right: AgendaDropTarget | undefined): boolean {
  if (left?.kind !== right?.kind) return false
  return left?.kind !== 'day' || (right?.kind === 'day' && left.day === right.day)
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
