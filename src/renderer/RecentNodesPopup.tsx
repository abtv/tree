import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { RecentNode } from '../application/recent-nodes'
import type { ShortcutProfile } from './shortcut-profile'
import { getSelectionEndpoints, setSelectionRange } from './editor-dom'
import { moveSuggestionIndex } from './completion-controller'
import { OutlineRootIcon } from './LocationBar'
import { SearchPendingLabel } from './SearchPendingLabel'

const RESULT_EDGE_INSET = 12

function updateResultEdges(element: HTMLElement): void {
  element.toggleAttribute('data-scroll-before', element.scrollTop > 1)
  element.toggleAttribute('data-scroll-after', element.scrollHeight - element.clientHeight - element.scrollTop > 1)
}

export function RecentNodesPopup({
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
  const [items, setItems] = useState<readonly RecentNode[]>()
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState('')
  const [completedQuery, setCompletedQuery] = useState('')
  const [suggestions, setSuggestions] = useState<readonly string[]>([])
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [pending, setPending] = useState(false)
  const [windowStart, setWindowStart] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const active = useRef(false)
  const cancelSearch = useRef<() => void>(() => undefined)
  const open = items !== undefined
  const popup = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const restore = useRef<() => void>(() => undefined)

  const changeQuery = (value: string, complete = false): void => {
    cancelSearch.current()
    setQuery(value)
    setSelected(0)
    setWindowStart(0)
    if (panel.current) panel.current.scrollTop = 0
    setSuggestionIndex(0)
    setSuggestions(complete || composing.current ? [] : store.searchNodeSuggestions(value))
    setPending(value.startsWith('#') || [...value].length >= 3)
    if (value === '') {
      setItems(store.recentNodes.getResults())
      setCompletedQuery(value)
      setPending(false)
      return
    }
    cancelSearch.current = store.searchNodes(value, (results) => {
      setItems(results)
      setCompletedQuery(value)
      setPending(false)
    })
  }

  useEffect(() => () => cancelSearch.current(), [])

  useEffect(() => {
    const close = (): void => {
      if (items === undefined) return
      active.current = false
      composing.current = false
      cancelSearch.current()
      setSuggestions([])
      setItems(undefined)
      restore.current()
    }
    const visit = (id: string): void => {
      close()
      beforeVisit()
      store.visitRecentNode(id)
    }
    const show = (): void => {
      if (
        blocked ||
        store.getSnapshot().status !== 'ready' ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      )
        return
      beforeOpen()
      active.current = true
      const origin = document.activeElement
      const selection =
        origin instanceof HTMLElement && origin.matches('.node-input') ? getSelectionEndpoints(origin) : undefined
      restore.current = () => {
        if (!(origin instanceof HTMLElement) || !origin.isConnected) return
        origin.focus({ preventScroll: true })
        if (selection !== undefined) setSelectionRange(origin, selection.anchor, selection.focus)
      }
      setItems(store.recentNodes.getResults())
      setSelected(0)
      setQuery('')
      setCompletedQuery('')
      setPending(false)
      setSuggestions([])
      setWindowStart(0)
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
        if (
          suggestions.length > 0 &&
          (direction !== undefined || (plain && ['Escape', 'Enter', 'Tab'].includes(event.key)))
        ) {
          if (event.key === 'Escape') setSuggestions([])
          else if (event.key === 'Enter' || event.key === 'Tab') changeQuery(`#${suggestions[suggestionIndex]!}`, true)
          else setSuggestionIndex((index) => moveSuggestionIndex(index, direction!, suggestions.length))
        } else if (event.key === 'Escape') close()
        else if (pending && ['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault()
          event.stopImmediatePropagation()
          return
        } else if (event.key === 'Enter') {
          const item = items[selected]
          if (item !== undefined) visit(item.id)
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const next = moveSuggestionIndex(selected, event.key === 'ArrowDown' ? 1 : -1, items.length)
          setSelected(next)
          if (panel.current) {
            const top = next * 52
            const visibleTop = panel.current.scrollTop + RESULT_EDGE_INSET
            const visibleBottom = panel.current.scrollTop + panel.current.clientHeight - RESULT_EDGE_INSET
            if (top < visibleTop || top + 52 > visibleBottom) {
              panel.current.scrollTop =
                top < visibleTop
                  ? Math.max(0, top - RESULT_EDGE_INSET)
                  : top + 52 + RESULT_EDGE_INSET - panel.current.clientHeight
              updateResultEdges(panel.current)
              setWindowStart(Math.max(0, Math.min(Math.floor(panel.current.scrollTop / 52) - 2, items.length - 40)))
            }
          }
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

  useEffect(() => {
    panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [items, selected])

  useEffect(() => {
    if (!open) return
    const initial = store.getSnapshot()
    let document = initial.status === 'ready' ? initial.document : undefined
    return store.subscribe(() => {
      if (!active.current) return
      const state = store.getSnapshot()
      if (state.status !== 'ready') {
        cancelSearch.current()
        active.current = false
        setItems(undefined)
        return
      }
      const next = state.status === 'ready' ? state.document : undefined
      if (next === document) return
      document = next
      changeQuery(query)
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
          composing.current = true
          setSuggestions([])
        }}
        onCompositionEnd={(event) => {
          composing.current = false
          changeQuery(event.currentTarget.value)
        }}
      />
      {suggestions.length > 0 && (
        <>
          <div className="node-search-section-title">Tags</div>
          <div className="node-search-tags" role="listbox" aria-label="Tags">
            {suggestions.map((name, index) => (
              <div
                key={name}
                role="option"
                aria-selected={index === suggestionIndex}
                className={`node-search-tag${index === suggestionIndex ? ' command-row-selected' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => changeQuery(`#${name}`, true)}
                ref={(element) => {
                  if (index === suggestionIndex) element?.scrollIntoView({ block: 'nearest' })
                }}
              >
                #{name}
              </div>
            ))}
          </div>
        </>
      )}
      {(suggestions.length === 0 || items.length > 0) && (
        <div className="node-search-section-title node-search-results-heading">
          <span>{query === '' ? 'Recent' : 'Results'}</span>
          {suggestions.length === 0 && items.length > 0 && (
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
          setWindowStart(Math.max(0, Math.min(Math.floor(event.currentTarget.scrollTop / 52) - 2, items.length - 40)))
        }}
        data-editor-focus-borrow=""
        aria-activedescendant={items[selected] === undefined ? undefined : `recent-node-${selected}`}
      >
        {items.length === 0 ? (
          suggestions.length > 0 ? null : (
            <div className="recent-node-empty">
              {displayedQuery === ''
                ? 'No recent nodes'
                : !displayedQuery.startsWith('#') && [...displayedQuery].length < 3
                  ? 'Enter at least 3 characters'
                  : 'No results'}
            </div>
          )
        ) : (
          <div style={{ height: items.length * 52, position: 'relative' }}>
            {items.slice(windowStart, windowStart + 40).map((item, offset) => {
              const index = windowStart + offset
              return (
                <div
                  key={item.id}
                  id={`recent-node-${index}`}
                  role="option"
                  aria-selected={suggestions.length === 0 && index === selected}
                  className={`recent-node-row${suggestions.length === 0 && index === selected ? ' command-row-selected' : ''}`}
                  style={{ position: 'absolute', top: index * 52, height: 52, width: '100%', boxSizing: 'border-box' }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (pending) return
                    active.current = false
                    composing.current = false
                    cancelSearch.current()
                    setItems(undefined)
                    restore.current()
                    beforeVisit()
                    store.visitRecentNode(item.id)
                  }}
                >
                  <span className="recent-node-text">{item.text}</span>
                  <span className="recent-node-path">
                    {item.path === null ? (
                      <span
                        className="recent-node-root location-icon"
                        role="img"
                        aria-label="Top level"
                        title="Top level"
                      >
                        <OutlineRootIcon />
                      </span>
                    ) : (
                      item.path
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="node-search-footer">
        <span>
          {pending && suggestions.length === 0 ? (
            <SearchPendingLabel previous="↑ ↓ select · Enter open · Esc close" />
          ) : suggestions.length > 0 ? (
            '↑ ↓ select · Enter/Tab apply · Esc dismiss'
          ) : (
            '↑ ↓ select · Enter open · Esc close'
          )}
        </span>
      </div>
    </div>
  )
}
