import {
  activeAgendaOccurrence,
  type AgendaOccurrence,
  focusedAgendaDay,
  dayKey,
  type AgendaState,
} from '../application/agenda-state'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { EditorStore } from '../application/editor-store'
import type { AgendaRow as AgendaRowModel } from '../application/agenda-rows'
import { agendaLineNumbers } from '../application/line-numbers'
import type { Document, TreeNode } from '../domain/document'
import { requireNode } from '../domain/document'
import { findCanonicalDates } from '../domain/date-recognition'
import type { VimTextCommandState } from './vim-session-finish'
import { clearCommandAssembly } from './vim-command-state'
import { createAgendaKeyDownHandler, type AgendaRowText } from './agenda-row-keyboard'
import { arrivalCaret, caretMarks, clampCaret, type CaretMark } from './agenda-row-caret'
import { rowCaretMode } from './agenda-row-text-keys'
import { AgendaRow } from './AgendaRow'
import { markedNodes } from './marked-nodes'
import { createViewportReveal } from './viewport-reveal'
import { agendaListWindow } from './agenda-list-layout'
import { buildLayout, EMPTY_HEIGHTS, measureElement, pruneHeights } from './node-list-layout'
import { shouldWindow } from './list-window'
import { agendaRowLabel, isAgendaMirror } from './agenda-labels'
import {
  notifyViewportLayout,
  onViewportScroll,
  scrollViewportBy,
  viewportBounds,
  viewportScroller,
} from './scroll-viewport'
import type { ShortcutProfile } from './shortcut-profile'
import { createAgendaFocusHandlers } from './agenda-row-focus'
import { AgendaViewportState } from './agenda-viewport-state'
import { selectedAgendaDay } from '../application/agenda-reconcile'
import { agendaCaret, arriveAgendaCaret, moveAgendaCaret } from './agenda-caret-state'

/** A direct match owns an editor when it is the active occurrence or has at most one date. */
function isEditableOccurrence(
  row: Pick<Extract<AgendaRowModel, { kind: 'node' }>, 'role' | 'nodeId' | 'day'>,
  node: TreeNode,
  active: AgendaOccurrence | undefined,
): boolean {
  return (
    row.role === 'match' &&
    ((active?.nodeId === row.nodeId && active.day === row.day) ||
      new Set(findCanonicalDates(node.text, node.links).map((date) => date.day)).size <= 1)
  )
}

export function AgendaView({
  lineNumbers = false,
  store,
  agenda,
  document,
  vim,
  renderInput,
  renderAttachment,
  renderText,
  shortcuts,
  searchCaretRef,
  refreshActiveLine,
}: {
  lineNumbers?: boolean
  searchCaretRef?: { current: (() => number | undefined) | undefined }
  refreshActiveLine?: () => void
  shortcuts?: ShortcutProfile
  store: EditorStore
  agenda: AgendaState
  document: Document
  vim?: VimTextCommandState | undefined
  renderInput?: ((node: import('../domain/document').TreeNode, day: number) => ReactNode) | undefined
  renderAttachment?: ((node: import('../domain/document').TreeNode, editable: boolean) => ReactNode) | undefined
  renderText?:
    | ((
        node: import('../domain/document').TreeNode,
        day: number,
        marks: readonly CaretMark[],
        context: boolean,
      ) => ReactNode)
    | undefined
}): React.JSX.Element {
  const elements = useRef(new Map<string, HTMLDivElement>())
  // The caret of a row without an editor is renderer state: it changes on every motion key, so it
  // stays out of the store and the document. Navigation supplies the arrival offset.
  const snapshot = store.getSnapshot()
  const focus = snapshot.status === 'ready' ? snapshot.focus : undefined
  const focusedDay = focusedAgendaDay(agenda)
  const selectedDay = selectedAgendaDay(agenda.selectedKey)
  const selectedNode =
    focus !== undefined && agenda.selectedKey === `node:${selectedDay}:${focus.nodeId}`
      ? requireNode(document, focus.nodeId).node
      : undefined
  const arrival = {
    key: agenda.selectedKey,
    focusToken: focus?.token,
    cursor: agenda.selectionCursor ?? 0,
    surface:
      selectedNode !== undefined &&
      selectedDay !== undefined &&
      isEditableOccurrence(
        { role: 'match', nodeId: selectedNode.id, day: selectedDay },
        selectedNode,
        activeAgendaOccurrence(agenda),
      )
        ? ('native' as const)
        : ('synthetic' as const),
  }
  const [caretState, setCaretState] = useState(() => arriveAgendaCaret(undefined, arrival))
  const currentCaret = arriveAgendaCaret(caretState, arrival)
  if (currentCaret !== caretState) setCaretState(currentCaret)
  const caret = agendaCaret(currentCaret)
  // Key handlers read the caret between renders, so a ref mirrors it and every write updates both.
  const caretRef = useRef(caret)
  const [viewportState] = useState(() => new AgendaViewportState<Document, readonly AgendaRowModel[]>())
  useLayoutEffect(() => {
    if (searchCaretRef === undefined) return
    searchCaretRef.current = currentCaret.kind === 'native' ? () => undefined : () => caretRef.current.focus
    return () => {
      searchCaretRef.current = undefined
    }
  }, [searchCaretRef, currentCaret.kind])
  useLayoutEffect(() => {
    caretRef.current = caret
  })
  const textOfRow = useCallback(
    (row: AgendaRowModel): string => {
      const state = store.getSnapshot()
      if (state.status !== 'ready' || state.agenda === undefined) return ''
      if (row.kind === 'node') return requireNode(state.document, row.nodeId).node.text
      return agendaRowLabel(row, state.agenda.today, row.kind === 'day' && focusedAgendaDay(state.agenda) !== undefined)
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
          isEditableOccurrence(row, requireNode(state.document, row.nodeId).node, activeAgendaOccurrence(state.agenda))
        )
      },
      caret: () => {
        const state = store.getSnapshot()
        const key = state.status === 'ready' ? (state.agenda?.selectedKey ?? '') : ''
        return caretRef.current.key === key ? caretRef.current : arrivalCaret(key)
      },
      setCaret: (next, revealLine = false) => {
        caretRef.current = next
        if (revealLine) viewportState.revealLine(next)
        setCaretState((current) => moveAgendaCaret(current, next))
      },
      copy: (text) => {
        void store.copyVimContent({ kind: 'text', text }).catch((error: unknown) => store.reportError(error))
      },
    }),
    [store, textOfRow, viewportState],
  )
  const marksFor = (row: AgendaRowModel): readonly CaretMark[] | undefined => {
    if (row.key !== agenda.selectedKey) return undefined
    const text = textOfRow(row)
    const mode = rowCaretMode(vim)
    return caretMarks(clampCaret(caret, text, mode), text, mode)
  }
  const listRef = useRef<HTMLDivElement | null>(null)
  const heights = useRef(new Map<string, number>())
  const observer = useRef<ResizeObserver | undefined>(undefined)
  const width = useRef(globalThis.innerWidth)
  const [revision, setRevision] = useState(0)
  const [viewport, setViewport] = useState({ start: 0, end: 0 })
  const viewportReveal = useMemo(() => createViewportReveal(), [])
  useLayoutEffect(() => {
    // Development StrictMode replays mount effects; restore the opening intent after its cleanup.
    viewportState.mount()
    return viewportReveal.mount()
  }, [viewportReveal, viewportState])
  const rows = store.getAgendaRows()
  const numbers = useMemo(() => (lineNumbers ? agendaLineNumbers(rows) : undefined), [lineNumbers, rows])
  const lineNumberCount = useMemo(() => rows.reduce((count, row) => count + Number(row.kind === 'node'), 0), [rows])
  const lineNumberDigits = Math.max(2, String(lineNumberCount).length)
  useLayoutEffect(() => {
    const change = viewportState.presentationChanged(agenda.presentation)
    if (change === 'restore') viewportReveal.cancel()
    else if (change === 'start') viewportScroller()?.scrollTo({ top: 0 })
  }, [agenda.presentation, viewportReveal, viewportState])
  const windowed = shouldWindow(rows.length)
  const [layoutState, setLayoutState] = useState(() => ({
    rows,
    revision: -1,
    layout: buildLayout(rows, EMPTY_HEIGHTS),
  }))
  // Opening uses the complete day extent, including context labels and rows outside the mounted window.
  const layout = layoutState.rows === rows ? layoutState.layout : buildLayout(rows, EMPTY_HEIGHTS)
  const todayRange = useMemo(() => {
    const start = rows.findIndex((row) => row.kind === 'day' && row.day === agenda.today)
    let end = start + 1
    while (start >= 0 && rows[end]?.kind === 'node') end++
    return { start, end }
  }, [rows, agenda.today])
  const openingGeometry = useRef({ layout, range: todayRange })
  useLayoutEffect(() => {
    openingGeometry.current = { layout, range: todayRange }
  }, [layout, todayRange])
  const rowRef = useCallback((key: string, element: HTMLDivElement | null): void => {
    const previous = elements.current.get(key)
    if (previous !== undefined) observer.current?.unobserve(previous.closest('.agenda-entry') ?? previous)
    if (element === null) elements.current.delete(key)
    else {
      elements.current.set(key, element)
      const measured = element.closest<HTMLElement>('.agenda-entry') ?? element
      observer.current?.observe(measured)
      measureElement(key, measured, heights.current, setRevision)
    }
  }, [])
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const resizeObserver = new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        const key = element.dataset.agendaMeasureKey ?? element.dataset.agendaKey
        const height = element.getBoundingClientRect().height
        if (key !== undefined && height > 0 && heights.current.get(key) !== height) {
          heights.current.set(key, height)
          changed = true
        }
      }
      if (changed) setRevision((value) => value + 1)
    })
    observer.current = resizeObserver
    elements.current.forEach((element) => resizeObserver.observe(element.closest('.agenda-entry') ?? element))
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
      elements.current.forEach((element, key) =>
        measureElement(key, element.closest<HTMLElement>('.agenda-entry') ?? element, heights.current, setRevision),
      )
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
    // Capture an explicit end jump before mounting wrapped rows increases the estimated extent.
    const scroller = viewportScroller()
    viewportState.followEnd(
      scroller !== undefined &&
        scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1,
    )
    const top = element.getBoundingClientRect().top
    const start = Math.max(0, viewportBounds().top - top)
    const end = Math.max(0, viewportBounds().bottom - top)
    setViewport((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [viewportState])
  useLayoutEffect(() => {
    if (windowed) {
      // Newly measured wrapped rows can grow the list after a jump to its estimated end.
      // Keep that explicit end position while the visible range settles.
      const scroller = viewportScroller()
      if (viewportState.followsEnd && scroller !== undefined) scroller.scrollTop = scroller.scrollHeight
      updateViewport()
    }
    notifyViewportLayout()
  }, [layoutState, updateViewport, windowed, viewportState])
  useLayoutEffect(() => {
    const top = viewportState.takeRestoration(layoutState.rows === rows && layoutState.revision === revision)
    if (top === undefined) return
    viewportScroller()?.scrollTo({ top })
    updateViewport()
  }, [layoutState, rows, revision, updateViewport, viewportState])
  useEffect(() => {
    if (!windowed) return undefined
    // Replace the anchored window in this event; it retains its previous paint until delivery.
    // Flush only this external event; layout-effect updates keep their existing commit ordering.
    const unsubscribe = onViewportScroll(() => {
      flushSync(updateViewport)
    })
    globalThis.addEventListener('resize', updateViewport)
    return () => {
      unsubscribe()
      globalThis.removeEventListener('resize', updateViewport)
    }
  }, [updateViewport, windowed, viewportState])
  // Rows a document change re-derives keep the selected occurrence at its viewport position, so a
  // mirror or day change around it never scrolls it away (docs/PRODUCT.md §23.7).
  const activeNodeId = activeAgendaOccurrence(agenda)?.nodeId
  // The store publishes before React renders, so the row is still where the user last saw it. A
  // keystroke that keeps the same rows measures nothing.
  useEffect(
    () =>
      store.subscribe(() => {
        const state = store.getSnapshot()
        if (state.status !== 'ready' || state.agenda === undefined) return
        const key = viewportState.anchorSource({
          nodeId: activeAgendaOccurrence(state.agenda)?.nodeId,
          document: state.document,
          rows: store.getAgendaRows(),
        })
        if (key !== undefined) viewportState.captureAnchor(elements.current.get(key)?.getBoundingClientRect().top)
      }),
    [store, viewportState],
  )
  useLayoutEffect(() => {
    const anchored = viewportState.commit(
      { key: agenda.selectedKey, nodeId: activeNodeId, document, rows },
      layoutState.rows === rows && layoutState.revision === revision,
    )
    // A commit rendered with estimated heights is transient: the measured layout follows at once and
    // moves the rows above, so the correction waits for it.
    if (anchored !== undefined) {
      const element = elements.current.get(agenda.selectedKey)
      if (element !== undefined) {
        const delta = element.getBoundingClientRect().top - anchored
        if (Math.abs(delta) >= 1) scrollViewportBy(delta)
      }
    }
  })
  const select = useCallback(
    (key: string): void => {
      viewportState.navigate('pointer')
      store.search.cancelDraft()
      store.search.interruptNavigation()
      if (vim !== undefined) clearCommandAssembly(vim.commandState)
      store.applyAgenda({ kind: 'select', key })
    },
    [store, vim, viewportState],
  )
  const toggle = useCallback(
    (key: string): void => {
      const row = store.getAgendaRows().find((candidate) => candidate.key === key)
      if (row === undefined) return
      viewportState.navigate('pointer')
      if (vim !== undefined) clearCommandAssembly(vim.commandState)
      store.applyAgenda({ kind: 'toggle-fold', key })
    },
    [store, vim, viewportState],
  )
  useLayoutEffect(() => {
    if (store.search.session.getSnapshot().draft !== undefined) return
    const element = elements.current.get(agenda.selectedKey)
    if (element === undefined) return
    if (
      element.querySelector('.node-input') === null &&
      !globalThis.document.activeElement?.matches('.search-input-line input')
    ) {
      element.focus({ preventScroll: true })
      // The editor that lost focus keeps its native selection, which would paint a second caret.
      globalThis.getSelection()?.removeAllRanges()
    }
    const caretElement = element.querySelector('.agenda-caret')
    const intent = viewportState.takeReveal(
      focusedDay === undefined && agenda.selectedKey === dayKey(agenda.today),
      focus?.revealLine && element.dataset.nodeId === focus.nodeId
        ? caretElement === null
          ? 'native'
          : 'synthetic'
        : 'none',
    )
    if (intent === 'today') {
      viewportReveal.beginRegion(
        element,
        () => {
          const list = listRef.current
          const geometry = openingGeometry.current
          if (list === null || geometry.range.start < 0) return undefined
          const bounds = list.getBoundingClientRect()
          if (bounds.width <= 0) return undefined
          const wrapper = element.closest('.agenda-entry')
          const inset = wrapper === null ? 0 : element.getBoundingClientRect().top - wrapper.getBoundingClientRect().top
          const start = geometry.layout.offsets[geometry.range.start]! + inset
          const end = geometry.layout.offsets[geometry.range.end]!
          return new DOMRect(bounds.left, bounds.top + start, bounds.width, Math.max(0, end - start))
        },
        () => {
          const state = store.getSnapshot()
          return (
            state.status === 'ready' &&
            state.agenda !== undefined &&
            focusedAgendaDay(state.agenda) === undefined &&
            state.agenda.selectedKey === dayKey(state.agenda.today)
          )
        },
      )
    } else if (intent === 'native-line' || intent === 'synthetic-line') {
      // Editable rows use the input owner's existing line-reveal intent.
      if (caretElement === null) viewportReveal.cancel()
      else
        viewportReveal.begin(caretElement, true, () => {
          const state = store.getSnapshot()
          return state.status === 'ready' && state.focus === focus
        })
    } else if (intent === 'keyboard-row' || intent === 'pointer-row')
      viewportReveal.begin(element, intent === 'keyboard-row', () => {
        const state = store.getSnapshot()
        return state.status === 'ready' && state.agenda?.selectedKey === agenda.selectedKey
      })
    else viewportReveal.cancel()
  }, [agenda.selectedKey, focusedDay, agenda.today, focus, store, viewportReveal, viewportState])
  useLayoutEffect(() => {
    const intent = viewportState.takeLine()
    if (intent === undefined) return
    const row = elements.current.get(intent.key)
    if (row === undefined || row.querySelector('.node-input') !== null) return
    const text = row.querySelector<HTMLElement>('.agenda-text,.agenda-label') ?? row
    viewportReveal.beginLine(
      () => text,
      intent.focus,
      () => {
        const state = store.getSnapshot()
        return (
          state.status === 'ready' &&
          vim?.mode === 'normal' &&
          globalThis.document.activeElement?.closest('.agenda-row') === row &&
          state.agenda?.selectedKey === intent.key &&
          caretRef.current.key === intent.key &&
          caretRef.current.focus === intent.focus
        )
      },
    )
  }, [caret, store, viewportReveal, vim, viewportState])
  // A changed row array needs compatible offsets immediately, before the measuring effect commits.
  const range = agendaListWindow(rows, layout, viewport, agenda.selectedKey)
  const windowOffset = range === undefined ? 0 : (layout.offsets[range.start] ?? 0)
  useLayoutEffect(() => refreshActiveLine?.())
  const renderRow = (index: number, pinned = false): React.JSX.Element => {
    const row = rows[index]!
    if (row.kind === 'day' && focusedDay !== undefined) {
      const heading = (
        <div
          key={row.key}
          className={`current-parent agenda-row agenda-focused-heading${pinned ? ' agenda-row-pinned' : ''}`}
          style={pinned ? { top: (layout.offsets[index] ?? 0) - windowOffset } : undefined}
          data-agenda-key={row.key}
          data-caret-end={caret.focus < caret.anchor ? 'start' : 'end'}
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
      return row.content ? (
        heading
      ) : (
        <div key={row.key} className="agenda-entry">
          {heading}
          <p className="agenda-empty-message">No entries for this day</p>
        </div>
      )
    }
    const node = row.kind === 'node' ? requireNode(document, row.nodeId).node : undefined
    const editable = row.kind === 'node' && isEditableOccurrence(row, node!, activeAgendaOccurrence(agenda))
    return (
      <AgendaRow
        lineNumber={numbers?.get(row.key)}
        key={editable ? `editor:${row.kind === 'node' ? row.nodeId : ''}` : row.key}
        row={row}
        node={node}
        renderInput={editable ? renderInput : undefined}
        renderAttachment={renderAttachment}
        renderText={renderText}
        today={agenda.today}
        selected={row.key === agenda.selectedKey}
        expanded={!agenda.collapsed.has(row.key)}
        pinned={pinned}
        pinnedOffset={(layout.offsets[index] ?? 0) - windowOffset}
        marks={editable ? undefined : marksFor(row)}
        caretAtStart={row.key === caret.key && caret.focus < caret.anchor}
        mirror={row.kind === 'node' && isAgendaMirror(agenda, row)}
        rowRef={rowRef}
        onSelect={select}
        onToggle={toggle}
      />
    )
  }
  const children: ReactNode[] = []
  if (range === undefined) rows.forEach((_, index) => children.push(renderRow(index)))
  else {
    for (let index = range.start; index < range.end; index += 1) children.push(renderRow(index))
    if (range.pinnedIndex !== undefined) children.push(renderRow(range.pinnedIndex, true))
  }
  return (
    <div
      className={`agenda-list${lineNumbers ? ' line-numbered' : ''}${range === undefined ? '' : ' agenda-list-windowed'}`}
      data-window-start={range === undefined ? undefined : viewport.start}
      style={
        {
          ...(range === undefined ? {} : { height: layout.total }),
          '--line-number-digits': lineNumberDigits,
        } as React.CSSProperties
      }
      ref={listRef}
      role="grid"
      aria-label={focusedDay === undefined ? 'Agenda timeline' : 'Focused Agenda day'}
      {...createAgendaFocusHandlers(store, vim)}
      onKeyDown={(event) =>
        !event.defaultPrevented &&
        !(event.target instanceof Element && event.target.closest('.node-input')) &&
        createAgendaKeyDownHandler({
          store,
          vim,
          rowText,
          shortcuts,
          beforeSelect: (preserve) => {
            viewportState.navigate(preserve ? 'none' : 'keyboard')
          },
        })(event)
      }
    >
      <span aria-hidden="true" className="line-number-sizer">
        {'9'.repeat(lineNumberDigits)}
      </span>
      <div className={`outline-content${range === undefined ? '' : ' agenda-window-anchor'}`}>
        <div style={range === undefined ? undefined : { position: 'relative', top: windowOffset - viewport.start }}>
          {children}
        </div>
      </div>
    </div>
  )
}
