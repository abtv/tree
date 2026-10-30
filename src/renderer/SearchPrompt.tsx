import { useEffect, useLayoutEffect, useRef } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { SearchSessionSnapshot } from '../application/search-session'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'
import { getCaret } from './editor-dom'

export function SearchPrompt({
  store,
  snapshot,
  restoreEditor,
  shortcuts = APPLE_SHORTCUTS,
  navigate,
  beginEditing,
}: {
  store: EditorStore
  snapshot: SearchSessionSnapshot
  restoreEditor: () => void
  shortcuts?: ShortcutProfile
  navigate?: (direction: -1 | 1) => void
  beginEditing?: () => void
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const editing = snapshot.draft !== undefined
  const composing = useRef(false)
  const editingInPlace = useRef(false)
  useLayoutEffect(() => {
    if (!editing) return
    if (editingInPlace.current) {
      editingInPlace.current = false
      return
    }
    input.current?.focus({ preventScroll: true })
    input.current?.select()
  }, [editing])
  useEffect(() => {
    const cancel = (): void => store.search.cancelDraft()
    window.addEventListener('blur', cancel)
    return () => window.removeEventListener('blur', cancel)
  }, [store])
  return (
    <label className="search-input-line" data-editor-focus-borrow>
      <input
        ref={input}
        aria-label="Search"
        placeholder="Find"
        value={snapshot.draft ?? snapshot.confirmed}
        onFocus={snapshot.draft === undefined ? beginEditing : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          const value = event.target.value
          if (snapshot.draft === undefined) {
            editingInPlace.current = true
            beginEditing?.()
          }
          store.search.edit(value)
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.search-controls')) return
          store.search.cancelDraft()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (composing.current || event.nativeEvent.isComposing) return
          if (shortcuts.isPrimary(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
            event.preventDefault()
            store.search.cancelDraft()
            restoreEditor()
            const active = document.activeElement
            const state = store.getSnapshot()
            if (state.status === 'ready' && state.agenda !== undefined) store.closeAgenda()
            else store.openAgenda(active instanceof HTMLElement ? getCaret(active) : undefined)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            store.cancelAgendaMove()
            store.hideSearch()
            restoreEditor()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (navigate !== undefined) navigate(event.shiftKey ? -1 : 1)
            else store.search.confirm(event.shiftKey ? -1 : 1)
          }
        }}
      />
    </label>
  )
}
