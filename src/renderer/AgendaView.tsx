import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { AgendaState } from '../application/agenda-state'
import type { Document } from '../domain/document'
import { requireNode } from '../domain/document'
import { findCanonicalDates } from '../domain/date-recognition'
import type { VimTextCommandState } from './editor-input-handlers'
import { clearCommandAssembly } from './vim-command-state'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { AgendaRow } from './AgendaRow'
import { createViewportReveal } from './viewport-reveal'
import { agendaListWindow } from './agenda-list-layout'
import { buildLayout, EMPTY_HEIGHTS, measureElement, pruneHeights } from './node-list-layout'
import { shouldWindow } from './list-window'
import { notifyViewportLayout, onViewportScroll, viewportBounds } from './scroll-viewport'

export function AgendaView({
  store,
  agenda,
  document,
  vim,
  renderInput,
  renderAttachment,
  renderText,
}: {
  store: EditorStore
  agenda: AgendaState
  document: Document
  vim?: VimTextCommandState | undefined
  renderInput?: ((node: import('../domain/document').TreeNode, day: number) => ReactNode) | undefined
  renderAttachment?: ((node: import('../domain/document').TreeNode, editable: boolean) => ReactNode) | undefined
  renderText?: ((node: import('../domain/document').TreeNode, day: number) => ReactNode) | undefined
}): React.JSX.Element {
  const elements = useRef(new Map<string, HTMLDivElement>())
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
  useEffect(() => {
    if (!windowed) return undefined
    const unsubscribe = onViewportScroll(updateViewport)
    globalThis.addEventListener('resize', updateViewport)
    return () => {
      unsubscribe()
      globalThis.removeEventListener('resize', updateViewport)
    }
  }, [updateViewport, windowed])
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
    if (element.querySelector('.node-input') === null) element.focus({ preventScroll: true })
    if (reveal.current !== 'none')
      viewportReveal.begin(element, reveal.current === 'keyboard', () => {
        const state = store.getSnapshot()
        return state.status === 'ready' && state.agenda?.selectedKey === agenda.selectedKey
      })
    else viewportReveal.cancel()
  }, [agenda.selectedKey, store, viewportReveal])
  // A changed row array needs compatible offsets immediately, before the measuring effect commits.
  const layout = layoutState.rows === rows ? layoutState.layout : buildLayout(rows, EMPTY_HEIGHTS)
  const range = agendaListWindow(rows, layout, viewport, agenda.selectedKey)
  const renderRow = (index: number, pinned = false): React.JSX.Element => {
    const row = rows[index]!
    const node = row.kind === 'node' ? requireNode(document, row.nodeId).node : undefined
    const editable =
      row.kind === 'node' &&
      row.role === 'match' &&
      ((agenda.activeOccurrence?.nodeId === row.nodeId && agenda.activeOccurrence.day === row.day) ||
        new Set(findCanonicalDates(node!.text, node!.links).map((date) => date.day)).size <= 1)
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
        expanded={row.kind === 'gap' ? row.expanded : !agenda.collapsed.has(row.key)}
        pinned={pinned}
        pinnedOffset={layout.offsets[index] ?? 0}
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
      aria-label="Agenda timeline"
      onKeyDown={(event) =>
        !event.defaultPrevented &&
        !(event.target instanceof Element && event.target.closest('.node-input')) &&
        createAgendaKeyDownHandler({
          store,
          vim,
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
