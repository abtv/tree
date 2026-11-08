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
import type { TextMatch } from '../domain/text-search'
import type { ShortcutProfile } from './shortcut-profile'
import { captureFocusRestoration } from './editor-dom'
import { GlobalSearchSession } from './global-search-session'
import { OutlineRootIcon } from './LocationBar'
import { SearchPendingLabel } from './SearchPendingLabel'
import { useSearchDecorations } from './search-decorations'
import { computeListWindow, computeOffsets } from './list-window'
import { TagSuggestionText } from './TagSuggestionText'

const RESULT_EDGE_INSET = 12

function updateResultEdges(element: HTMLElement): void {
  element.toggleAttribute('data-scroll-before', element.scrollTop > 1)
  element.toggleAttribute('data-scroll-after', element.scrollHeight - element.clientHeight - element.scrollTop > 1)
}

function revealResult(row: HTMLElement): void {
  const list = row.closest<HTMLElement>('.node-search-results')
  if (list === null) return
  const viewport = list.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
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
const NO_HEIGHTS: ReadonlyMap<string, number> = new Map()

function SearchResultText({
  text,
  query,
  active,
  onReveal,
  tagMatches = NO_MATCHES,
}: {
  text: string
  query: string
  active: boolean
  onReveal(): void
  tagMatches?: readonly TextMatch[] | undefined
}): React.JSX.Element {
  const textMatches = useSearchDecorations(text, query.startsWith('#') ? '' : query)
  const matches = query.startsWith('#') ? tagMatches : textMatches
  const firstMatch = useRef<HTMLElement>(null)
  useEffect(() => {
    const row = firstMatch.current?.closest<HTMLElement>('.recent-node-row')
    if (active && row) onReveal()
  }, [active, matches, onReveal])

  return (
    <>
      {matches.map((match, index) => (
        <Fragment key={match.start}>
          {text.slice(matches[index - 1]?.end ?? 0, match.start)}
          <strong ref={index === 0 ? firstMatch : undefined} className="node-search-match">
            {text.slice(match.start, match.end)}
          </strong>
        </Fragment>
      ))}
      {text.slice(matches.at(-1)?.end ?? 0)}
    </>
  )
}

export function GlobalSearchPopup({
  store,
  shortcuts,
  blocked,
  beforeOpen,
  beforeVisit,
  openRef,
}: {
  store: EditorStore
  shortcuts: ShortcutProfile
  blocked: boolean
  beforeOpen(): void
  beforeVisit(): void
  openRef?: { current: (() => void) | undefined }
}): React.JSX.Element | null {
  const session = useMemo(
    () =>
      new GlobalSearchSession({
        recent: () => store.recentNodes.getResults(),
        suggestions: (query) => store.searchNodeSuggestions(query),
        search: (query, publish) => store.searchNodes(query, publish),
      }),
    [store],
  )
  const { items, selected, query, completedQuery, suggestions, suggestionIndex, pending } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  )
  const [windowTop, setWindowTop] = useState(0)
  const measurementEpoch = useMemo(() => Symbol(`results:${items?.length ?? 0}`), [items])
  const [measurement, setMeasurement] = useState<{
    epoch: symbol
    heights: ReadonlyMap<string, number>
    viewportHeight: number
  }>()
  const heights = measurement?.epoch === measurementEpoch ? measurement.heights : NO_HEIGHTS
  const viewportHeight = measurement?.epoch === measurementEpoch ? measurement.viewportHeight : 560
  const layout = useMemo(
    () => computeOffsets(items?.map((item) => heights.get(item.id) ?? (item.path === null ? 34 : 52)) ?? []),
    [items, heights],
  )
  const input = useRef<HTMLInputElement>(null)
  const open = items !== undefined
  const popup = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelSize = useRef({ width: 0, height: 0 })
  const scrollAnchor = useRef<{ index: number; inset: number; heights: ReadonlyMap<string, number> } | undefined>(
    undefined,
  )
  const revealPending = useRef(false)
  const [revealRevision, setRevealRevision] = useState(0)
  const requestReveal = useCallback(() => {
    revealPending.current = true
    setRevealRevision((revision) => revision + 1)
  }, [])
  const restore = useRef<() => void>(() => undefined)

  const resultWindow = computeListWindow({
    count: items?.length ?? 0,
    offsets: layout.offsets,
    viewportStart: windowTop,
    viewportEnd: windowTop + viewportHeight,
    overscan: 2,
    focusedIndex: selected,
  })
  const renderedIndices = Array.from(
    { length: resultWindow.end - resultWindow.start },
    (_, offset) => resultWindow.start + offset,
  )
  if (resultWindow.pinnedIndex !== undefined) renderedIndices.push(resultWindow.pinnedIndex)

  const resetScroll = (): void => {
    scrollAnchor.current = undefined
    setWindowTop(0)
    if (panel.current) panel.current.scrollTop = 0
  }
  const changeQuery = (value: string): void => {
    resetScroll()
    session.edit(value)
  }
  const acceptSuggestion = (index?: number): void => {
    resetScroll()
    session.acceptSuggestion(index)
  }
  const visit = (index?: number): void => {
    const id = session.takeResult(index)
    if (id === undefined) return
    restore.current()
    beforeVisit()
    store.visitRecentNode(id)
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
        store.getSnapshot().status !== 'ready' ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      )
        return
      beforeOpen()
      restore.current = captureFocusRestoration()
      session.open()
      setWindowTop(0)
    }
    if (openRef !== undefined) openRef.current = show
    const keydown = (event: KeyboardEvent): void => {
      if (event.isComposing) return
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
        else if (
          suggestions.length > 0 &&
          (direction !== undefined || (plain && ['Enter', 'Tab'].includes(event.key)))
        ) {
          if (event.key === 'Enter' || event.key === 'Tab') acceptSuggestion()
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
      if (items === undefined || (event.target instanceof Element && event.target.closest('.recent-nodes-popup')))
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
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('blur', close)
    return () => {
      if (openRef !== undefined) openRef.current = undefined
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('blur', close)
    }
  })

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true })
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const element = popup.current
    if (element === null) return
    const center = (): void => {
      element.style.removeProperty('--search-top')
      const top = Math.max(40, (window.innerHeight - element.getBoundingClientRect().height) / 2)
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
    revealPending.current = !pending && suggestions.length === 0
  }, [items, selected, pending, suggestions.length])

  useLayoutEffect(() => {
    const element = panel.current
    if (element === null) {
      scrollAnchor.current = undefined
      return
    }
    const measure = (): void => {
      const size = { width: element.clientWidth, height: element.clientHeight }
      const widthChanged = panelSize.current.width !== size.width
      let changed = widthChanged || panelSize.current.height !== size.height
      if (widthChanged) revealPending.current = true
      panelSize.current = size
      const next = new Map(widthChanged ? NO_HEIGHTS : heights)
      for (const row of element.querySelectorAll<HTMLElement>('.recent-node-row')) {
        const id = row.dataset.resultId!
        const height = row.getBoundingClientRect().height
        if (height > 0 && next.get(id) !== height) {
          next.set(id, height)
          changed = true
        }
      }
      if (changed) {
        const anchor = computeListWindow({
          count: items?.length ?? 0,
          offsets: layout.offsets,
          viewportStart: element.scrollTop,
          viewportEnd: element.scrollTop,
          overscan: 0,
          focusedIndex: undefined,
        }).start
        scrollAnchor.current = revealPending.current
          ? undefined
          : {
              index: anchor,
              inset: element.scrollTop - (layout.offsets[anchor] ?? 0),
              heights: next,
            }
        setMeasurement({ epoch: measurementEpoch, heights: next, viewportHeight: size.height })
      }
      updateResultEdges(element)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(element)
    element.querySelectorAll('.recent-node-row').forEach((row) => observer?.observe(row))
    return () => observer?.disconnect()
  }, [
    items,
    measurement,
    measurementEpoch,
    heights,
    layout,
    resultWindow.start,
    resultWindow.end,
    resultWindow.pinnedIndex,
  ])

  useLayoutEffect(() => {
    const anchor = scrollAnchor.current
    const element = panel.current
    if (anchor?.heights !== heights) return
    scrollAnchor.current = undefined
    if (anchor !== undefined && element !== null) {
      element.scrollTop = (layout.offsets[anchor.index] ?? 0) + anchor.inset
      setWindowTop(element.scrollTop)
    }
  }, [layout, heights])

  useLayoutEffect(() => {
    if (!revealPending.current) return
    const row = panel.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (row && !pending) {
      revealResult(row)
      const top = panel.current!.scrollTop
      if (top !== windowTop) setWindowTop(top)
      else revealPending.current = false
    }
  }, [items, selected, pending, suggestions.length, windowTop, layout, revealRevision])

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
      const next = state.status === 'ready' ? state.document : undefined
      if (next === document) return
      document = next
      resetScroll()
      session.refresh()
    })
  })

  if (items === undefined) return null
  const displayedQuery = pending ? completedQuery : query
  return (
    <div ref={popup} className="recent-nodes-popup" role="dialog" aria-modal="true" aria-label="Search">
      <div className="recent-nodes-title">Search</div>
      <input
        ref={input}
        type="search"
        className="node-search-input"
        aria-label="Search query"
        placeholder="Search all nodes by text or #tag"
        value={query}
        data-editor-focus-borrow=""
        onChange={(event) => changeQuery(event.target.value)}
        onCompositionStart={() => {
          session.beginComposition()
        }}
        onCompositionEnd={(event) => {
          resetScroll()
          session.endComposition(event.currentTarget.value)
        }}
      />
      {suggestions.length > 0 && (
        <>
          <div className="node-search-section-title node-search-tags-heading">Tags</div>
          <div className="node-search-tags" role="listbox" aria-label="Tags">
            {suggestions.map((name, index) => (
              <div
                key={name}
                role="option"
                data-result-divider={
                  index < suggestions.length - 1 && index !== suggestionIndex && index + 1 !== suggestionIndex
                    ? ''
                    : undefined
                }
                aria-selected={index === suggestionIndex}
                className={`node-search-tag${index === suggestionIndex ? ' command-row-selected' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => acceptSuggestion(index)}
                ref={(element) => {
                  if (index === suggestionIndex) element?.scrollIntoView({ block: 'nearest' })
                }}
              >
                <TagSuggestionText name={name} query={query} />
              </div>
            ))}
          </div>
        </>
      )}
      {(suggestions.length === 0 || items.length > 0) && (
        <div className="node-search-section-title node-search-results-heading">
          <span>{query === '' ? 'Recent' : 'Results'}</span>
          {query !== '' && suggestions.length === 0 && items.length > 0 && (
            <output
              className="node-search-position"
              aria-label="Result position"
              title={`Result ${selected + 1} of ${items.length}`}
            >
              {selected + 1} / {items.length}
            </output>
          )}
        </div>
      )}
      <div
        ref={panel}
        role="listbox"
        aria-label={query === '' ? 'Recent nodes' : 'Search results'}
        aria-busy={pending}
        className="node-search-results"
        onScroll={(event) => {
          updateResultEdges(event.currentTarget)
          // Retained paint and replacement rows must move together in this external scroll event.
          flushSync(() => setWindowTop(event.currentTarget.scrollTop))
        }}
        data-editor-focus-borrow=""
        aria-activedescendant={items[selected] === undefined ? undefined : `recent-node-${selected}`}
      >
        {items.length === 0 ? (
          suggestions.length > 0 ? null : (
            <div className="recent-node-empty">{displayedQuery === '' ? 'No recent nodes' : 'No results'}</div>
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
                return (
                  <div
                    key={item.id}
                    id={`recent-node-${index}`}
                    data-result-id={item.id}
                    data-result-divider={
                      index < items.length - 1 &&
                      (suggestions.length > 0 || (index !== selected && index + 1 !== selected))
                        ? ''
                        : undefined
                    }
                    role="option"
                    aria-selected={suggestions.length === 0 && index === selected}
                    className={`recent-node-row${suggestions.length === 0 && index === selected ? ' command-row-selected' : ''}`}
                    style={{
                      position: 'absolute',
                      top: layout.offsets[index]! - windowTop,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => visit(index)}
                  >
                    <span className="recent-node-title-line">
                      <span className="recent-node-text">
                        <SearchResultText
                          text={item.text}
                          query={displayedQuery}
                          tagMatches={item.tagMatches}
                          active={suggestions.length === 0 && index === selected && !pending}
                          onReveal={requestReveal}
                        />
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
                    {item.path !== null && (
                      <span className="recent-node-path">
                        <SearchResultText
                          text={item.path}
                          query={displayedQuery}
                          tagMatches={item.pathTagMatches}
                          active={suggestions.length === 0 && index === selected && !pending}
                          onReveal={requestReveal}
                        />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <div className="node-search-footer">
        <span>
          {pending && suggestions.length === 0 ? (
            <SearchPendingLabel previous="↑ ↓ select · Enter open · Esc close" />
          ) : suggestions.length > 0 ? (
            '↑ ↓ select · Enter/Tab apply · Esc close'
          ) : (
            '↑ ↓ select · Enter open · Esc close'
          )}
        </span>
      </div>
    </div>
  )
}
