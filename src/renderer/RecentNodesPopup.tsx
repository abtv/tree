import { useEffect, useRef, useState } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { RecentNode } from '../application/recent-nodes'
import type { ShortcutProfile } from './shortcut-profile'
import { getSelectionEndpoints, setSelectionRange } from './editor-dom'
import { moveSuggestionIndex } from './completion-controller'

export function RecentNodesPopup({
  store,
  shortcuts,
  blocked,
  beforeOpen,
  beforeVisit,
}: {
  store: EditorStore
  shortcuts: ShortcutProfile
  blocked: boolean
  beforeOpen(): void
  beforeVisit(): void
}): React.JSX.Element | null {
  const [items, setItems] = useState<readonly RecentNode[]>()
  const [selected, setSelected] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const restore = useRef<() => void>(() => undefined)

  useEffect(() => {
    const close = (): void => {
      if (items === undefined) return
      setItems(undefined)
      restore.current()
    }
    const visit = (id: string): void => {
      close()
      beforeVisit()
      store.visitRecentNode(id)
    }
    const keydown = (event: KeyboardEvent): void => {
      if (event.isComposing) return
      if (items !== undefined) {
        if (event.key === 'Escape') close()
        else if (event.key === 'Enter') {
          const item = items[selected]
          if (item !== undefined) visit(item.id)
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          setSelected((index) => moveSuggestionIndex(index, event.key === 'ArrowDown' ? 1 : -1, items.length))
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
      beforeOpen()
      const active = document.activeElement
      const selection =
        active instanceof HTMLElement && active.matches('.node-input') ? getSelectionEndpoints(active) : undefined
      restore.current = () => {
        if (!(active instanceof HTMLElement) || !active.isConnected) return
        active.focus({ preventScroll: true })
        if (selection !== undefined) setSelectionRange(active, selection.anchor, selection.focus)
      }
      setItems(store.recentNodes.getResults())
      setSelected(0)
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
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('blur', close)
    }
  }, [items, selected, blocked, shortcuts, store, beforeOpen, beforeVisit])

  useEffect(() => {
    if (items !== undefined) panel.current?.focus({ preventScroll: true })
  }, [items])

  useEffect(() => {
    panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [items, selected])

  if (items === undefined) return null
  return (
    <div className="recent-nodes-popup" role="dialog" aria-modal="true" aria-label="Recent nodes">
      <div className="recent-nodes-title">Recent nodes</div>
      <div
        ref={panel}
        role="listbox"
        aria-label="Recent nodes"
        tabIndex={0}
        data-editor-focus-borrow=""
        aria-activedescendant={items[selected] === undefined ? undefined : `recent-node-${selected}`}
      >
        {items.length === 0 ? (
          <div className="recent-node-empty">No recent nodes</div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              id={`recent-node-${index}`}
              role="option"
              aria-selected={index === selected}
              className={`recent-node-row${index === selected ? ' command-row-selected' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setItems(undefined)
                restore.current()
                beforeVisit()
                store.visitRecentNode(item.id)
              }}
            >
              <span className="recent-node-text">{item.text}</span>
              <span className="recent-node-path">{item.path}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
