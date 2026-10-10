import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { AgendaRow as AgendaRowModel } from '../application/agenda-rows'
import type { AgendaState } from '../application/agenda-state'
import type { Document, TreeNode } from '../domain/document'
import { requireNode } from '../domain/document'
import { findCanonicalDates } from '../domain/date-recognition'
import type { VimTextCommandState } from './editor-input-handlers'
import { clearCommandAssembly } from './vim-command-state'
import { createAgendaKeyDownHandler, type AgendaRowText } from './agenda-row-keyboard'
import { arrivalCaret, caretMarks, clampCaret, type CaretMark, type RowCaret } from './agenda-row-caret'
import { rowCaretMode } from './agenda-row-text-keys'
import { AgendaRow } from './AgendaRow'
import { markedNodes } from './marked-nodes'
import { createViewportReveal } from './viewport-reveal'
import { agendaListWindow } from './agenda-list-layout'
import { buildLayout, EMPTY_HEIGHTS, measureElement, pruneHeights } from './node-list-layout'
import { shouldWindow } from './list-window'
import { agendaRowLabel, isAgendaMirror } from './agenda-labels'
import { isPendingMoveSource } from '../application/agenda-pending-move'
import { agendaVisualSources, type AgendaVisualEndpoints } from '../application/agenda-visual-selection'
import {
  notifyViewportLayout,
  onViewportScroll,
  scrollViewportBy,
  viewportBounds,
  viewportScroller,
} from './scroll-viewport'
import type { NodeDragCaretFreeze } from './drag-caret-freeze'
import { useAgendaDrag } from './use-agenda-drag'

/** A direct match owns an editor when it is the active occurrence or has at most one date. */
function isEditableOccurrence(
  row: Extract<AgendaRowModel, { kind: 'node' }>,
  node: TreeNode,
  active: AgendaState['activeOccurrence'],
): boolean {
  return (
    row.role === 'match' &&
    ((active?.nodeId === row.nodeId && active.day === row.day) ||
      new Set(findCanonicalDates(node.text, node.links).map((date) => date.day)).size <= 1)
  )
}

export function AgendaView({
  store,
  agenda,
  document,
  vim,
  renderInput,
  renderAttachment,
  renderText,
  dragFreeze,
  locked = false,
  visualNodeSelection,
}: {
  store: EditorStore
  agenda: AgendaState
  document: Document
  dragFreeze: NodeDragCaretFreeze
  locked?: boolean
  visualNodeSelection?: AgendaVisualEndpoints | undefined
  vim?: VimTextCommandState | undefined
  renderInput?: ((node: import('../domain/document').TreeNode, day: number) => ReactNode) | undefined
  renderAttachment?: ((node: import('../domain/document').TreeNode, editable: boolean) => ReactNode) | undefined
  renderText?:
    ((node: import('../domain/document').TreeNode, day: number, marks: readonly CaretMark[]) => ReactNode) | undefined
}): React.JSX.Element {
  const elements = useRef(new Map<string, HTMLDivElement>())
  // The caret of a row without an editor is renderer state: it changes on every motion key, so it
  // stays out of the store and the document. Navigation supplies the arrival offset.
  const arrival = { key: agenda.selectedKey, anchor: agenda.selectionCursor ?? 0, focus: agenda.selectionCursor ?? 0 }
  const [caretState, setCaretState] = useState<RowCaret>(() => arrival)
  if (caretState.key !== agenda.selectedKey) setCaretState(arrival)
  const caret = caretState.key === agenda.selectedKey ? caretState : arrival
  // Key handlers read the caret between renders, so a ref mirrors it and every write updates both.
  const caretRef = useRef(caret)
  useLayoutEffect(() => {
    caretRef.current = caret
  })
  const textOfRow = useCallback(
    (row: AgendaRowModel): string => {
      const state = store.getSnapshot()
      if (state.status !== 'ready' || state.agenda === undefined) return ''
      if (row.kind === 'node') return requireNode(state.document, row.nodeId).node.text
      return agendaRowLabel(row, state.agenda.today, row.kind === 'day' && state.agenda.focusedDay !== undefined)
    },
    [store],
  )
  const rowText = useMemo<AgendaRowText>(
    () => ({
      textOf: textOfRow,
      hasEditor: (row) => {
        const state = store.getSnapshot()
        return (
          state.status === 'ready' &&
          state.agenda !== undefined &&
          row.kind === 'node' &&
          isEditableOccurrence(row, requireNode(state.document, row.nodeId).node, state.agenda.activeOccurrence)
        )
      },
      caret: () => {
        const state = store.getSnapshot()
        const key = state.status === 'ready' ? (state.agenda?.selectedKey ?? '') : ''
        return caretRef.current.key === key ? caretRef.current : arrivalCaret(key)
      },
      setCaret: (next) => {
        caretRef.current = next
        setCaretState(next)
      },
      copy: (text) => {
        void store.copyVimContent({ kind: 'text', text }).catch((error: unknown) => store.reportError(error))
      },
    }),
    [store, textOfRow],
  )
  const marksFor = (row: AgendaRowModel): readonly CaretMark[] | undefined => {
    if (row.key !== agenda.selectedKey) return undefined
    const text = textOfRow(row)
    const mode = rowCaretMode(vim)
    return caretMarks(clampCaret(caret, text.length, mode), text.length, mode)
  }
  const listRef = useRef<HTMLDivElement | null>(null)
  const heights = useRef(new Map<string, number>())
  const observer = useRef<ResizeObserver | undefined>(undefined)
  const width = useRef(globalThis.innerWidth)
  const [revision, setRevision] = useState(0)
  const [viewport, setViewport] = useState({ start: 0, end: 0 })
  const reveal = useRef<'keyboard' | 'pointer' | 'none'>('keyboard')
  const viewportReveal = useMemo(() => createViewportReveal(), [])
  useEffect(() => viewportReveal.mount(), [viewportReveal])
  const rows = store.getAgendaRows()
  const lastPresentation = useRef(agenda)
  const restoreScroll = useRef<number | undefined>(undefined)
  useLayoutEffect(() => {
    const last = lastPresentation.current
    if (last.focusedDay !== undefined && agenda.focusedDay === undefined) {
      restoreScroll.current = last.timelineReturn?.scrollTop
      reveal.current = 'none'
      viewportReveal.cancel()
    } else if (last.focusedDay !== agenda.focusedDay && last.focusedDay === undefined) {
      viewportScroller()?.scrollTo({ top: 0 })
      reveal.current = 'keyboard'
    }
    lastPresentation.current = agenda
  }, [agenda, viewportReveal])
  const visualDocument = useRef(document)
  useEffect(() => {
    const changed = visualDocument.current !== document
    visualDocument.current = document
    if (visualNodeSelection === undefined || vim === undefined) return
    const sources = agendaVisualSources(rows, agenda.activeOccurrence?.day ?? NaN, visualNodeSelection)
    if (changed || agenda.activeOccurrence?.nodeId !== visualNodeSelection.focusId || sources.length === 0) {
      clearCommandAssembly(vim.commandState)
      vim.setMode('normal')
    }
  }, [rows, agenda.activeOccurrence, visualNodeSelection, vim, document])
  const visualKeys = new Set(
    visualNodeSelection === undefined
      ? []
      : agendaVisualSources(rows, agenda.activeOccurrence?.day ?? NaN, visualNodeSelection).map(
          (source) => `node:${source.day}:${source.nodeId}`,
        ),
  )
  const windowed = shouldWindow(rows.length)
  const [layoutState, setLayoutState] = useState(() => ({
    rows,
    revision: -1,
    layout: buildLayout(rows, EMPTY_HEIGHTS),
  }))
  const rowRef = useCallback((key: string, element: HTMLDivElement | null): void => {
    const previous = elements.current.get(key)
    if (previous !== undefined) observer.current?.unobserve(previous)
    if (element === null) elements.current.delete(key)
    else {
      elements.current.set(key, element)
      observer.current?.observe(element)
      measureElement(key, element, heights.current, setRevision)
    }
  }, [])
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const resizeObserver = new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        const key = element.dataset.agendaKey
        const height = element.getBoundingClientRect().height
        if (key !== undefined && height > 0 && heights.current.get(key) !== height) {
          heights.current.set(key, height)
          changed = true
        }
      }
      if (changed) setRevision((value) => value + 1)
    })
    observer.current = resizeObserver
    elements.current.forEach((element) => resizeObserver.observe(element))
    return () => {
      resizeObserver.disconnect()
      observer.current = undefined
    }
  }, [])
  useEffect(() => {
    const resize = (): void => {
      if (width.current === globalThis.innerWidth) return
      width.current = globalThis.innerWidth
      heights.current.clear()
      elements.current.forEach((element, key) => measureElement(key, element, heights.current, setRevision))
      setRevision((value) => value + 1)
    }
    globalThis.addEventListener('resize', resize)
    return () => globalThis.removeEventListener('resize', resize)
  }, [])
  useLayoutEffect(() => {
    if (layoutState.rows === rows && layoutState.revision === revision) return
    if (layoutState.rows !== rows) pruneHeights(heights.current, rows)
    setLayoutState({ rows, revision, layout: buildLayout(rows, heights.current) })
  }, [rows, revision, layoutState])
  const updateViewport = useCallback(() => {
    const element = listRef.current
    if (element === null) return
    const top = element.getBoundingClientRect().top
    const start = Math.max(0, viewportBounds().top - top)
    const end = Math.max(0, viewportBounds().bottom - top)
    setViewport((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [])
  useLayoutEffect(() => {
    if (windowed) updateViewport()
    notifyViewportLayout()
  }, [layoutState, updateViewport, windowed])
  useLayoutEffect(() => {
    if (restoreScroll.current === undefined || layoutState.rows !== rows || layoutState.revision !== revision) return
    viewportScroller()?.scrollTo({ top: restoreScroll.current })
    restoreScroll.current = undefined
    updateViewport()
  }, [layoutState, rows, revision, updateViewport])
  useEffect(() => {
    if (!windowed) return undefined
    const unsubscribe = onViewportScroll(updateViewport)
    globalThis.addEventListener('resize', updateViewport)
    return () => {
      unsubscribe()
      globalThis.removeEventListener('resize', updateViewport)
    }
  }, [updateViewport, windowed])
  // Rows a document change re-derives keep the selected occurrence at its viewport position, so a
  // mirror or day change around it never scrolls it away (docs/PRODUCT.md §23.7).
  const previous = useRef<
    { key: string; nodeId: string | undefined; document: Document; rows: typeof rows } | undefined
  >(undefined)
  const anchorTop = useRef<number | undefined>(undefined)
  const dropping = useRef(false)
  const skipReveal = useRef(false)
  const activeNodeId = agenda.activeOccurrence?.nodeId
  // The store publishes before React renders, so the row is still where the user last saw it. A
  // keystroke that keeps the same rows measures nothing.
  useEffect(
    () =>
      store.subscribe(() => {
        const state = store.getSnapshot()
        const last = previous.current
        if (
          dropping.current ||
          state.status !== 'ready' ||
          state.agenda === undefined ||
          last === undefined ||
          last.nodeId === undefined ||
          last.nodeId !== state.agenda.activeOccurrence?.nodeId ||
          last.document === state.document ||
          last.rows === store.getAgendaRows()
        )
          return
        anchorTop.current ??= elements.current.get(last.key)?.getBoundingClientRect().top
      }),
    [store],
  )
  useLayoutEffect(() => {
    const anchored = anchorTop.current
    skipReveal.current = anchored !== undefined
    // A commit rendered with estimated heights is transient: the measured layout follows at once and
    // moves the rows above, so the correction waits for it.
    if (anchored !== undefined && layoutState.rows === rows && layoutState.revision === revision) {
      anchorTop.current = undefined
      const element = elements.current.get(agenda.selectedKey)
      if (element !== undefined) {
        const delta = element.getBoundingClientRect().top - anchored
        if (Math.abs(delta) >= 1) scrollViewportBy(delta)
      }
    }
    previous.current = { key: agenda.selectedKey, nodeId: activeNodeId, document, rows }
  })
  const select = useCallback(
    (key: string): void => {
      reveal.current = 'pointer'
      if (vim !== undefined) clearCommandAssembly(vim.commandState)
      store.applyAgenda({ kind: 'select', key })
    },
    [store, vim],
  )
  const toggle = useCallback(
    (key: string): void => {
      const row = store.getAgendaRows().find((candidate) => candidate.key === key)
      if (row === undefined) return
      reveal.current = 'pointer'
      if (vim !== undefined) clearCommandAssembly(vim.commandState)
      store.applyAgenda({ kind: row.kind === 'gap' ? 'toggle-gap' : 'toggle-fold', key })
    },
    [store, vim],
  )
  useLayoutEffect(() => {
    const element = elements.current.get(agenda.selectedKey)
    if (element === undefined) return
    if (element.querySelector('.node-input') === null) {
      element.focus({ preventScroll: true })
      // The editor that lost focus keeps its native selection, which would paint a second caret.
      globalThis.getSelection()?.removeAllRanges()
    }
    if (skipReveal.current) viewportReveal.cancel()
    else if (reveal.current !== 'none')
      viewportReveal.begin(element, reveal.current === 'keyboard', () => {
        const state = store.getSnapshot()
        return state.status === 'ready' && state.agenda?.selectedKey === agenda.selectedKey
      })
    else viewportReveal.cancel()
  }, [agenda.selectedKey, agenda.focusedDay, store, viewportReveal])
  const drag = useAgendaDrag({
    rows,
    locked,
    listRef,
    elementsRef: elements,
    dragFreeze,
    onDrop: (source, targetDay) => {
      reveal.current = 'pointer'
      // The source row may be far off-screen after a long drag; anchoring to it would scroll the moved
      // row away from the drop, so the pointer reveal places it instead.
      dropping.current = true
      try {
        store.moveAgendaOccurrences([{ nodeId: source.nodeId, day: source.day }], targetDay)
      } finally {
        dropping.current = false
      }
    },
  })
  // A changed row array needs compatible offsets immediately, before the measuring effect commits.
  const layout = layoutState.rows === rows ? layoutState.layout : buildLayout(rows, EMPTY_HEIGHTS)
  const range = agendaListWindow(rows, layout, viewport, agenda.selectedKey)
  const renderRow = (index: number, pinned = false): React.JSX.Element => {
    const row = rows[index]!
    if (row.kind === 'day' && agenda.focusedDay !== undefined) {
      return (
        <div
          key={row.key}
          className={`current-parent agenda-row agenda-focused-heading${pinned ? ' agenda-row-pinned' : ''}`}
          style={pinned ? { top: layout.offsets[index] ?? 0 } : undefined}
          data-agenda-key={row.key}
          role="row"
          aria-selected={row.key === agenda.selectedKey}
          tabIndex={row.key === agenda.selectedKey ? 0 : -1}
          ref={(element) => rowRef(row.key, element)}
          onClick={() => select(row.key)}
          onFocus={() => {
            if (row.key !== agenda.selectedKey) select(row.key)
          }}
        >
          {(() => {
            const label = agendaRowLabel(row, agenda.today, true)
            return markedNodes(label, 0, label.length, marksFor(row) ?? [], true)
          })()}
        </div>
      )
    }
    const node = row.kind === 'node' ? requireNode(document, row.nodeId).node : undefined
    const editable = row.kind === 'node' && isEditableOccurrence(row, node!, agenda.activeOccurrence)
    return (
      <AgendaRow
        key={editable ? `editor:${row.kind === 'node' ? row.nodeId : ''}` : row.key}
        row={row}
        node={node}
        renderInput={editable ? renderInput : undefined}
        renderAttachment={renderAttachment}
        renderText={renderText}
        today={agenda.today}
        selected={row.key === agenda.selectedKey}
        visualSelected={visualKeys.has(row.key)}
        expanded={row.kind === 'gap' ? row.expanded : !agenda.collapsed.has(row.key)}
        pinned={pinned}
        dragging={drag.sourceKey === row.key}
        dropTarget={drag.dropHeaderKey === row.key}
        pinnedOffset={layout.offsets[index] ?? 0}
        marks={editable ? undefined : marksFor(row)}
        mirror={row.kind === 'node' && isAgendaMirror(agenda, row)}
        pendingSource={row.kind === 'node' && isPendingMoveSource(agenda, row.nodeId, row.day)}
        rowRef={rowRef}
        onSelect={select}
        onToggle={toggle}
      />
    )
  }
  const children: ReactNode[] = []
  if (range === undefined) rows.forEach((_, index) => children.push(renderRow(index)))
  else {
    children.push(
      <div
        key="leading-spacer"
        aria-hidden="true"
        className="agenda-list-spacer"
        style={{ height: layout.offsets[range.start] ?? 0 }}
      />,
    )
    for (let index = range.start; index < range.end; index += 1) children.push(renderRow(index))
    if (range.pinnedIndex !== undefined) children.push(renderRow(range.pinnedIndex, true))
    children.push(
      <div
        key="trailing-spacer"
        aria-hidden="true"
        className="agenda-list-spacer"
        style={{ height: layout.total - (layout.offsets[range.end] ?? 0) }}
      />,
    )
  }
  return (
    <div
      className="agenda-list"
      ref={listRef}
      role="grid"
      aria-label={agenda.focusedDay === undefined ? 'Agenda timeline' : 'Focused Agenda day'}
      onClickCapture={drag.onListClick}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerCancel={drag.onListPointerCancel}
      onPointerDown={drag.onListPointerDown}
      onPointerLeave={drag.onListPointerLeave}
      onPointerMove={drag.onListPointerMove}
      onPointerUp={drag.onListPointerUp}
      onKeyDown={(event) =>
        !event.defaultPrevented &&
        !(event.target instanceof Element && event.target.closest('.node-input')) &&
        createAgendaKeyDownHandler({
          store,
          vim,
          rowText,
          beforeSelect: (preserve) => {
            reveal.current = preserve ? 'none' : 'keyboard'
          },
        })(event)
      }
    >
      {children}
    </div>
  )
}
