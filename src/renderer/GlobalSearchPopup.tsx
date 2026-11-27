import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { flushSync } from 'react-dom'
import type { EditorStore } from '../application/editor-store'
import type { SearchImageExcerpt } from '../application/node-result'
import type { InferredSearchMarker } from '../domain/node-search-query'
import type { TextMatch } from '../domain/text-search'
import type { ShortcutProfile } from './shortcut-profile'
import { captureFocusRestoration } from './editor-dom'
import { GlobalSearchSession, hasGroupHeading, startsSearchGroup } from './global-search-session'
import { OutlineRootIcon } from './LocationBar'
import { SearchPendingLabel } from './SearchPendingLabel'
import { useSearchDecorations } from './search-decorations'
import { computeListWindow, ROW_HEIGHT_ESTIMATE } from './list-window'
import { GlobalSearchSuggestions } from './GlobalSearchSuggestions'
import { SearchQueryInput } from './SearchQueryInput'
import { isCommittedCompositionInput } from './editor-composition'
import { initialSearchHeading } from './node-flags'
import { AttachmentThumbnail } from './AttachmentPreview'
import { computeSearchResultWindow, SEARCH_RESULT_VIEWPORT_ROWS } from './search-result-window'
import { SearchResultLayout } from './search-result-layout'
import { SEARCH_THUMBNAIL_BLOCK_MARGIN, searchThumbnailSize } from './search-thumbnail-layout'

const RESULT_EDGE_INSET = 12
const IMAGE_EXCERPT_LINE_HEIGHT = 16
const RESULT_KEYS = '↑↓ Select   ↵ Open   Esc Close'
const SINGLE_SUGGESTION_KEYS = '↑↓ Select   ↵ Open   Tab Apply   Esc Close'
const SUGGESTION_KEYS = '↑↓ Select   ↵/Tab Apply   Esc Close'

function updateResultEdges(element: HTMLElement): void {
  element.toggleAttribute('data-scroll-before', element.scrollTop > 1)
  element.toggleAttribute('data-scroll-after', element.scrollHeight - element.clientHeight - element.scrollTop > 1)
}

function revealResult(row: HTMLElement, first: boolean): void {
  const list = row.closest<HTMLElement>('.node-search-results')
  if (list === null) return
  const viewport = list.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  if (
    first &&
    rowBox.bottom - row.parentElement!.getBoundingClientRect().top <= list.clientHeight - RESULT_EDGE_INSET
  ) {
    list.scrollTop = 0
    updateResultEdges(list)
    return
  }

  const target =
    rowBox.height > list.clientHeight - RESULT_EDGE_INSET * 2
      ? (row.querySelector('.node-search-match')?.getBoundingClientRect() ?? rowBox)
      : rowBox
  const top = viewport.top + RESULT_EDGE_INSET
  const bottom = viewport.bottom - RESULT_EDGE_INSET
  if (target.top < top) list.scrollTop = Math.max(0, list.scrollTop + target.top - top)
  else if (target.bottom > bottom) {
    list.scrollTop += target.height > bottom - top ? target.top - top : target.bottom - bottom
  }
  updateResultEdges(list)
}

const NO_MATCHES: readonly TextMatch[] = []

function ImageExcerpt({
  excerpt,
  struck = false,
}: {
  excerpt: SearchImageExcerpt
  struck?: boolean
}): React.JSX.Element {
  const fromAncestor = excerpt.ancestor !== undefined
  return (
    <span className="recent-node-image-excerpt" data-replaces-title={excerpt.replacesTitle} title={excerpt.ancestor}>
      <svg
        className="recent-node-image-recognition"
        viewBox="0 0 16 16"
        role={fromAncestor ? undefined : 'img'}
        aria-hidden={fromAncestor || undefined}
        aria-label={fromAncestor ? undefined : 'Text in image'}
        focusable="false"
      >
        {!fromAncestor && <title>Text in image</title>}
        <path d="M5 2H2v3m9-3h3v3m0 6v3h-3m-6 0H2v-3M5 6h6M5 8h6M5 10h4" />
      </svg>
      <span className={`recent-node-image-content${struck ? ' node-text-struck' : ''}`}>
        {fromAncestor && (
          <>
            <span className="recent-node-image-source">Ancestor image</span>
            {' · '}
          </>
        )}
        {excerpt.matches.map((match, index) => (
          <Fragment key={match.start}>
            {excerpt.text.slice(excerpt.matches[index - 1]?.end ?? 0, match.start)}
            <strong className="node-search-match">{excerpt.text.slice(match.start, match.end)}</strong>
          </Fragment>
        ))}
        {excerpt.text.slice(excerpt.matches.at(-1)?.end ?? 0)}
      </span>
    </span>
  )
}

interface SearchMeasurement {
  epoch: symbol
  layout: SearchResultLayout
  viewportHeight: number
}

function SearchResultText({
  text,
  query,
  markerFragments,
  active,
  onReveal,
  tagMatches = NO_MATCHES,
  struckMatches = NO_MATCHES,
}: {
  text: string
  query: string
  markerFragments?: readonly InferredSearchMarker[] | undefined
  active: boolean
  onReveal(): void
  tagMatches?: readonly TextMatch[] | undefined
  struckMatches?: readonly TextMatch[] | undefined
}): React.JSX.Element {
  const matches = useSearchDecorations(text, query, tagMatches, markerFragments)
  const firstMatch = useRef<HTMLElement>(null)
  const previousMatches = useRef(matches)
  useEffect(() => {
    const changed = previousMatches.current !== matches
    previousMatches.current = matches
    // Selection already reveals ready matches; only newly computed highlights need another pass.
    if (!changed) return
    const row = firstMatch.current?.closest<HTMLElement>('[role="option"]')
    if (active && row) onReveal()
  }, [active, matches, onReveal])

  function renderText(start: number, end: number): React.ReactNode {
    const parts: React.ReactNode[] = []
    let offset = start
    for (const range of struckMatches) {
      const from = Math.max(offset, range.start)
      const to = Math.min(end, range.end)
      if (from >= to) continue
      parts.push(text.slice(offset, from))
      parts.push(
        <span className="node-text-struck" key={from}>
          {text.slice(from, to)}
        </span>,
      )
      offset = to
    }
    parts.push(text.slice(offset, end))
    return parts
  }

  return (
    <>
      {matches.map((match, index) => (
        <Fragment key={match.start}>
          {renderText(matches[index - 1]?.end ?? 0, match.start)}
          <strong ref={index === 0 ? firstMatch : undefined} className="node-search-match">
            {renderText(match.start, match.end)}
          </strong>
        </Fragment>
      ))}
      {renderText(matches.at(-1)?.end ?? 0, text.length)}
    </>
  )
}

export function GlobalSearchPopup({
  store,
  shortcuts,
  blocked,
  isEditorComposing,
  beforeOpen,
  beforeVisit,
  openRef,
}: {
  store: EditorStore
  shortcuts: ShortcutProfile
  blocked: boolean
  isEditorComposing(target: EventTarget | null): boolean
  beforeOpen(): void
  beforeVisit(): void
  openRef?: { current: (() => void) | undefined }
}): React.JSX.Element | null {
  const session = useMemo(
    () =>
      new GlobalSearchSession({
        initial: () => store.initialSearchResults(),
        suggestions: (query, uniqueOnly) => store.searchNodeSuggestions(query, uniqueOnly),
        search: (query, publish) => store.searchNodes(query, publish),
      }),
    [store],
  )
  const {
    items,
    selected,
    selectedPart,
    query,
    completedQuery,
    completedMarkerFragments,
    completionQuery,
    suggestions,
    suggestionIndex,
    pending,
  } = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const suggestionsActive = suggestions.length > 1
  const resultKeys = suggestions.length === 1 ? SINGLE_SUGGESTION_KEYS : RESULT_KEYS
  const [resultViewport, setResultViewport] = useState({ items, completedQuery, top: 0 })
  if (resultViewport.items !== items || resultViewport.completedQuery !== completedQuery) {
    // Select the first window before committing replacement rows, not after measuring the old offset.
    setResultViewport({ items, completedQuery, top: 0 })
  }
  const windowTop = resultViewport.top
  const setWindowTop = useCallback((top: number) => {
    setResultViewport((current) => (current.top === top ? current : { ...current, top }))
  }, [])
  const measurementEpoch = useMemo(() => Symbol(`results:${items?.length ?? 0}`), [items])
  const [measurement, setMeasurement] = useState<SearchMeasurement>()
  const currentMeasurement = measurement?.epoch === measurementEpoch ? measurement : undefined
  const viewportHeight = currentMeasurement?.viewportHeight ?? 560
  const estimatedLayout = useMemo(
    () =>
      SearchResultLayout.estimate(items?.length ?? 0, (index) => {
        const item = items![index]!
        const heading = hasGroupHeading(items!, index) ? ROW_HEIGHT_ESTIMATE : 0
        // The first window should load images for the rows that actually fit in it.
        const thumbnail = searchThumbnailSize(item.attachment?.width, item.attachment?.height)
        const thumbnailHeight = thumbnail === undefined ? 0 : thumbnail.height + SEARCH_THUMBNAIL_BLOCK_MARGIN
        const excerptHeight = item.imageExcerpt && !item.imageExcerpt.replacesTitle ? IMAGE_EXCERPT_LINE_HEIGHT : 0
        return ROW_HEIGHT_ESTIMATE + heading + thumbnailHeight + excerptHeight
      }),
    [items],
  )
  const layout = currentMeasurement?.layout ?? estimatedLayout
  // The heading depends only on the listed items, so selection moves and scrolling do not rescan them.
  const initialHeading = useMemo(() => initialSearchHeading(items ?? []), [items])
  // Both counter numbers reserve room for every node, so no digit or separator moves while typing or navigating.
  const capacityDigits = useMemo(
    () => (items === undefined ? 0 : String(store.searchResultCapacity()).length),
    [items, store],
  )
  const input = useRef<HTMLInputElement>(null)
  const open = items !== undefined
  const popup = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelSize = useRef({ width: 0, height: 0 })
  const scrollAnchor = useRef<{ index: number; inset: number; measurement: SearchMeasurement } | undefined>(undefined)
  const revealPending = useRef(false)
  const [revealRevision, setRevealRevision] = useState(0)
  const requestReveal = useCallback(() => {
    revealPending.current = true
    setRevealRevision((revision) => revision + 1)
  }, [])
  const restore = useRef<() => void>(() => undefined)

  const resultWindow = computeSearchResultWindow(items ?? [], layout.offsetAt, windowTop, viewportHeight, selected)
  const renderedIndices = Array.from(
    { length: resultWindow.end - resultWindow.start },
    (_, offset) => resultWindow.start + offset,
  )
  if (resultWindow.pinnedIndex !== undefined) renderedIndices.push(resultWindow.pinnedIndex)

  const acceptSuggestion = (index?: number): void => {
    let caret: number | undefined
    flushSync(() => {
      caret = session.acceptSuggestion(index)
    })
    if (caret !== undefined) input.current?.setSelectionRange(caret, caret)
  }
  const visit = (index?: number, part = selectedPart): void => {
    const id = session.takeResult(index, part)
    if (id === undefined) return
    restore.current()
    beforeVisit()
    store.openSearchResult(id)
  }

  useEffect(
    () => () => {
      session.close()
    },
    [session],
  )

  useEffect(
    () =>
      session.subscribe(() => {
        if (session.getSnapshot().items === undefined) setMeasurement(undefined)
      }),
    [session],
  )

  useEffect(() => {
    const close = (): void => {
      if (session.close()) restore.current()
    }
    const show = (): void => {
      if (
        blocked ||
        isEditorComposing(document.activeElement) ||
        store.getSnapshot().status !== 'ready' ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      )
        return
      beforeOpen()
      restore.current = captureFocusRestoration()
      session.open()
    }
    if (openRef !== undefined) openRef.current = show
    const keydown = (event: KeyboardEvent): void => {
      if (blocked || isEditorComposing(event.target)) return
      const queryComposing = event.target === input.current && (event.isComposing || session.isComposing())
      if (queryComposing && (event.key === 'Tab' || event.key === 'Escape')) {
        // Browser defaults would tab out of the modal or clear the native search input while the
        // input method owns the key. Clearing the field can end composition without a notification.
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (event.isComposing || queryComposing) return
      if (items !== undefined) {
        if (
          shortcuts.isPrimary(event) &&
          !event.shiftKey &&
          !event.altKey &&
          !shortcuts.hasNonPrimaryCtrl(event) &&
          event.key === ';'
        ) {
          event.preventDefault()
          event.stopImmediatePropagation()
          input.current?.focus({ preventScroll: true })
          return
        }
        const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        const direction =
          (plain && event.key === 'ArrowDown') ||
          (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === 'n')
            ? 1
            : (plain && event.key === 'ArrowUp') ||
                (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === 'p')
              ? -1
              : undefined
        if (event.key === 'Escape') close()
        else if (suggestions.length > 0 && plain && event.key === 'Tab') acceptSuggestion()
        else if (suggestionsActive && (direction !== undefined || (plain && event.key === 'Enter'))) {
          if (event.key === 'Enter') acceptSuggestion()
          else session.moveSuggestion(direction!)
        } else if (pending && ['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault()
          event.stopImmediatePropagation()
          return
        } else if (event.key === 'Enter') {
          visit()
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          session.moveResult(event.key === 'ArrowDown' ? 1 : -1)
        } else if (event.key !== 'Tab') return
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (
        blocked ||
        event.key !== ';' ||
        !shortcuts.isPrimary(event) ||
        event.shiftKey ||
        event.altKey ||
        shortcuts.hasNonPrimaryCtrl(event) ||
        store.getSnapshot().status !== 'ready' ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      show()
    }
    const outside = (event: PointerEvent): void => {
      if (
        blocked ||
        items === undefined ||
        (event.target instanceof Element && event.target.closest('.global-search-popup'))
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      const gesture = new AbortController()
      const cancel = (): void => gesture.abort()
      document.addEventListener('pointerdown', cancel, { capture: true, once: true, signal: gesture.signal })
      document.addEventListener('pointercancel', cancel, { capture: true, once: true, signal: gesture.signal })
      window.addEventListener('blur', cancel, { once: true, signal: gesture.signal })
      document.addEventListener(
        'click',
        (click) => {
          click.preventDefault()
          click.stopImmediatePropagation()
          cancel()
        },
        { capture: true, once: true, signal: gesture.signal },
      )
      close()
    }
    document.addEventListener('keydown', keydown, true)
    // Switching to another application keeps Search open; returning restores the input focus.
    document.addEventListener('pointerdown', outside, true)
    return () => {
      if (openRef !== undefined) openRef.current = undefined
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('pointerdown', outside, true)
    }
  })

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true })
  }, [open])

  useLayoutEffect(() => {
    // Keep the old viewport in place while its rows are still displayed. Reset only with the
    // completed presentation, before measurement and reveal run for the replacement rows.
    scrollAnchor.current = undefined
    if (panel.current !== null) panel.current.scrollTop = 0
  }, [items, completedQuery])

  useLayoutEffect(() => {
    if (!open) return
    const element = popup.current
    if (element === null) return
    const center = (): void => {
      element.style.removeProperty('--search-top')
      const top = (window.innerHeight - element.getBoundingClientRect().height) / 2
      element.style.setProperty('--search-top', `${top}px`)
    }
    center()
    window.addEventListener('resize', center)
    return () => window.removeEventListener('resize', center)
  }, [open])

  useLayoutEffect(() => {
    const element = panel.current
    if (element === null) return
    const update = (): void => updateResultEdges(element)
    update()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [items, suggestions.length])

  useLayoutEffect(() => {
    revealPending.current = !pending && !suggestionsActive
  }, [items, selected, selectedPart, pending, suggestionsActive])

  useLayoutEffect(() => {
    const element = panel.current
    if (element === null) {
      scrollAnchor.current = undefined
      panelSize.current = { width: 0, height: 0 }
      return
    }
    const measure = (fromObserver: boolean): void => {
      const size = { width: element.clientWidth, height: element.clientHeight }
      const viewportGrew = size.height > panelSize.current.height
      const widthChanged = panelSize.current.width !== size.width
      let changed = currentMeasurement === undefined || widthChanged || panelSize.current.height !== size.height
      if (widthChanged) revealPending.current = true
      panelSize.current = size
      const base = widthChanged ? estimatedLayout : layout
      const heights = new Map<number, number>()
      for (const row of element.querySelectorAll<HTMLElement>('.recent-node-entry')) {
        const index = Number(row.dataset.resultIndex)
        const height = row.getBoundingClientRect().height
        if (height > 0 && Math.abs(base.heightAt(index) - height) > 0.001) {
          heights.set(index, height)
          changed = true
        }
      }
      if (changed) {
        const next = {
          epoch: measurementEpoch,
          layout: base.withMeasurements(heights),
          // Until the panel has a measurable box, keep the usable viewport estimate.
          viewportHeight: size.width === 0 && size.height === 0 ? viewportHeight : size.height,
        }
        const anchor = computeListWindow({
          count: items?.length ?? 0,
          offsets: layout.offsetAt,
          viewportStart: element.scrollTop,
          viewportEnd: element.scrollTop,
          overscan: 0,
          focusedIndex: undefined,
        }).start
        scrollAnchor.current = revealPending.current
          ? undefined
          : {
              index: anchor,
              inset: element.scrollTop - layout.offsetAt(anchor),
              measurement: next,
            }
        const publish = () => setMeasurement(next)
        // Recentering can expose more rows in the next paint. Mount them during resize delivery.
        if (fromObserver && viewportGrew) flushSync(publish)
        else publish()
      }
      updateResultEdges(element)
    }
    measure(false)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => measure(true))
    observer?.observe(element)
    element.querySelectorAll('.recent-node-entry').forEach((row) => observer?.observe(row))
    return () => observer?.disconnect()
  }, [
    items,
    measurement,
    currentMeasurement,
    measurementEpoch,
    estimatedLayout,
    layout,
    viewportHeight,
    resultWindow.start,
    resultWindow.end,
    resultWindow.pinnedIndex,
  ])

  useLayoutEffect(() => {
    const anchor = scrollAnchor.current
    const element = panel.current
    if (anchor?.measurement !== measurement) return
    scrollAnchor.current = undefined
    if (anchor !== undefined && element !== null) {
      element.scrollTop = layout.offsetAt(anchor.index) + anchor.inset
      setWindowTop(element.scrollTop)
    }
  }, [layout, measurement, setWindowTop])

  useLayoutEffect(() => {
    if (!revealPending.current) return
    const row = panel.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (row && !pending) {
      revealResult(row, selected === 0)
      const top = panel.current!.scrollTop
      if (top !== windowTop) setWindowTop(top)
      else revealPending.current = false
    }
  }, [items, selected, selectedPart, pending, suggestionsActive, windowTop, layout, revealRevision, setWindowTop])

  useEffect(() => {
    if (!open) return
    const initial = store.getSnapshot()
    let document = initial.status === 'ready' ? initial.document : undefined
    return store.subscribe(() => {
      if (session.getSnapshot().items === undefined) return
      const state = store.getSnapshot()
      if (state.status !== 'ready') {
        session.close()
        return
      }
      if (state.document === document) return
      document = state.document
      session.refresh()
    })
  })

  if (items === undefined) return null
  const resultTotal = String(items.length)
  const counterWidth = `${Math.max(capacityDigits, resultTotal.length)}ch`

  return (
    <div ref={popup} className="global-search-popup" role="dialog" aria-modal="true" aria-label="Search">
      <SearchQueryInput
        ref={input}
        type="search"
        className="node-search-input"
        aria-label="Search query"
        placeholder="Search text, #tag, @person or &event"
        value={query}
        data-editor-focus-borrow=""
        onChange={(event) => {
          const target = event.currentTarget
          const { value } = target
          const start = target.selectionStart ?? value.length
          const end = target.selectionEnd ?? value.length
          if (session.isComposing() && isCommittedCompositionInput(event.nativeEvent))
            session.endComposition(value, start, end)
          else session.edit(value, false, start, end)
        }}
        onSelect={(event) => {
          const target = event.currentTarget
          session.updateSelection(
            target.selectionStart ?? target.value.length,
            target.selectionEnd ?? target.value.length,
          )
        }}
        onCompositionStart={() => {
          session.beginComposition()
        }}
        onCompositionEnd={(event) => {
          if (!session.isComposing()) return
          const target = event.currentTarget
          session.endComposition(
            target.value,
            target.selectionStart ?? target.value.length,
            target.selectionEnd ?? target.value.length,
          )
        }}
      />
      {suggestionsActive && (
        <GlobalSearchSuggestions
          names={suggestions}
          query={completionQuery}
          selected={suggestionIndex}
          accept={acceptSuggestion}
        />
      )}
      {(!suggestionsActive || items.length > 0) && (
        <div className="node-search-section-title node-search-results-heading">
          <span>{query === '' ? initialHeading : 'Results'}</span>
          {items.length > 0 && (
            <output
              className="node-search-position"
              aria-label={suggestionsActive ? 'Result count' : 'Result position'}
              title={suggestionsActive ? `Results: ${resultTotal}` : `Result ${selected + 1} of ${resultTotal}`}
            >
              {!suggestionsActive && (
                <>
                  <span className="node-search-position-index" style={{ inlineSize: counterWidth }}>
                    {selected + 1}
                  </span>
                  {' / '}
                </>
              )}
              <span className="node-search-position-total" style={{ inlineSize: counterWidth }}>
                {resultTotal}
              </span>
            </output>
          )}
        </div>
      )}
      <div
        ref={panel}
        role="listbox"
        aria-label={query === '' ? 'Marked and starred nodes' : 'Search results'}
        aria-busy={pending}
        className="node-search-results"
        style={{
          flexBasis: items.length > 0 ? layout.total : undefined,
          maxHeight: `calc(${SEARCH_RESULT_VIEWPORT_ROWS} * var(--node-row-min-height))`,
        }}
        onScroll={(event) => {
          updateResultEdges(event.currentTarget)
          // Retained paint and replacement rows must move together in this external scroll event.
          flushSync(() => setWindowTop(event.currentTarget.scrollTop))
        }}
        data-editor-focus-borrow=""
        aria-activedescendant={
          suggestionsActive || items[selected] === undefined ? undefined : `recent-${selectedPart}-${selected}`
        }
      >
        {items.length === 0 ? (
          suggestionsActive ? null : (
            <div className="recent-node-empty">
              {completedQuery === '' ? 'No marked or starred nodes' : 'No results'}
            </div>
          )
        ) : (
          <div
            style={{
              height: layout.total + (layout.total > viewportHeight ? RESULT_EDGE_INSET : 0),
              position: 'relative',
              overflow: 'clip',
            }}
          >
            <div style={{ position: 'sticky', top: 0, height: 0 }}>
              {renderedIndices.map((index) => {
                const item = items[index]!
                const startsGroup = startsSearchGroup(items, index)
                const active = !suggestionsActive && index === selected
                const headingSelected = active && selectedPart === 'heading'
                const nodeSelected = active && selectedPart === 'node'
                const title = item.imageExcerpt?.replacesTitle ? null : (
                  <SearchResultText
                    text={item.text}
                    query={completedQuery}
                    markerFragments={completedMarkerFragments}
                    tagMatches={item.tagMatches}
                    active={nodeSelected && !pending}
                    onReveal={requestReveal}
                  />
                )
                return (
                  <div
                    key={item.id}
                    className="recent-node-entry"
                    data-result-id={item.id}
                    data-result-index={index}
                    data-marked={item.marked ? '' : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    style={{
                      position: 'absolute',
                      top: layout.offsetAt(index) - windowTop,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    {startsGroup && index > 0 && <div className="recent-node-group-divider" aria-hidden="true" />}
                    {startsGroup && item.path !== null && (
                      <div
                        id={`recent-heading-${index}`}
                        role="option"
                        aria-selected={headingSelected}
                        className={`recent-node-group-path recent-node-path${headingSelected ? ' command-row-selected' : ''}`}
                        onClick={() => visit(index, 'heading')}
                      >
                        <SearchResultText
                          text={item.path}
                          query={completedQuery}
                          markerFragments={completedMarkerFragments}
                          tagMatches={item.pathTagMatches}
                          struckMatches={item.pathStruckMatches}
                          active={headingSelected && !pending}
                          onReveal={requestReveal}
                        />
                      </div>
                    )}
                    <div
                      id={`recent-node-${index}`}
                      role="option"
                      aria-selected={nodeSelected}
                      aria-description={item.path ?? undefined}
                      className={`recent-node-row${nodeSelected ? ' command-row-selected' : ''}`}
                      onClick={() => visit(index, 'node')}
                    >
                      <span className="recent-node-title-line">
                        {item.starred ? (
                          <span
                            className="node-star"
                            data-marked={item.marked}
                            role="img"
                            aria-label={item.marked ? 'Marked, starred' : 'Starred'}
                          >
                            ★
                          </span>
                        ) : item.marked ? (
                          <span className="node-mark" role="img" aria-label="Marked" />
                        ) : null}
                        <span
                          className={`recent-node-text${item.struckThrough && item.imageExcerpt === undefined ? ' node-text-struck' : ''}`}
                        >
                          {item.imageExcerpt?.ancestor !== undefined && <ImageExcerpt excerpt={item.imageExcerpt} />}
                          {title && item.imageExcerpt !== undefined ? (
                            <span className={item.struckThrough ? 'node-text-struck' : undefined}>{title}</span>
                          ) : (
                            title
                          )}
                          {item.imageExcerpt !== undefined && item.imageExcerpt.ancestor === undefined && (
                            <ImageExcerpt
                              excerpt={item.imageExcerpt}
                              struck={item.struckThrough === true && item.imageExcerpt.replacesTitle === true}
                            />
                          )}
                          {item.attachment !== undefined && (
                            <AttachmentThumbnail
                              attachmentId={item.attachment.id}
                              width={item.attachment.width}
                              height={item.attachment.height}
                            />
                          )}
                        </span>
                        {item.path === null && (
                          <span
                            className="recent-node-root location-icon"
                            role="img"
                            aria-label="Top level"
                            title="Top level"
                          >
                            <OutlineRootIcon />
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <div className="node-search-footer">
        {suggestionsActive ? SUGGESTION_KEYS : pending ? <SearchPendingLabel previous={resultKeys} /> : resultKeys}
      </div>
    </div>
  )
}
