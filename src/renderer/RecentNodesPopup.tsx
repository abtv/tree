import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import type { EditorStore } from '../application/editor-store'
import type { ShortcutProfile } from './shortcut-profile'
import { captureFocusRestoration } from './editor-dom'
import { GlobalSearchSession } from './global-search-session'
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
  const [{ start: windowStart, top: windowTop }, setResultWindow] = useState({ start: 0, top: 0 })
  const input = useRef<HTMLInputElement>(null)
  const open = items !== undefined
  const popup = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const restore = useRef<() => void>(() => undefined)

  const updateResultWindow = (top: number, count: number): void => {
    const start = Math.max(0, Math.min(Math.floor(top / 52) - 2, count - 40))
    setResultWindow((previous) => (previous.start === start && previous.top === top ? previous : { start, top }))
  }
  const resetScroll = (): void => {
    updateResultWindow(0, 0)
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
      updateResultWindow(0, 0)
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
          const next = session.getSnapshot().selected
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
              updateResultWindow(panel.current.scrollTop, items.length)
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
          <div className="node-search-section-title">Tags</div>
          <div className="node-search-tags" role="listbox" aria-label="Tags">
            {suggestions.map((name, index) => (
              <div
                key={name}
                role="option"
                aria-selected={index === suggestionIndex}
                className={`node-search-tag${index === suggestionIndex ? ' command-row-selected' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => acceptSuggestion(index)}
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
          // Retained paint and replacement rows must move together in this external scroll event.
          flushSync(() => updateResultWindow(event.currentTarget.scrollTop, items.length))
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
          <div style={{ height: items.length * 52, position: 'relative', overflow: 'clip' }}>
            <div style={{ position: 'sticky', top: 0, height: 0 }}>
              {items.slice(windowStart, windowStart + 40).map((item, offset) => {
                const index = windowStart + offset
                return (
                  <div
                    key={item.id}
                    id={`recent-node-${index}`}
                    role="option"
                    aria-selected={suggestions.length === 0 && index === selected}
                    className={`recent-node-row${suggestions.length === 0 && index === selected ? ' command-row-selected' : ''}`}
                    style={{
                      position: 'absolute',
                      top: index * 52 - windowTop,
                      height: 52,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => visit(index)}
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
