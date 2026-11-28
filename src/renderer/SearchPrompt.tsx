import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { SearchSessionSnapshot } from '../application/search-session'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'
import { getCaret } from './editor-dom'
import { findPromptComposition, isCommittedCompositionInput } from './editor-composition'

export function SearchPrompt({
  store,
  snapshot,
  restoreEditor,
  shortcuts = APPLE_SHORTCUTS,
  navigate,
  beginEditing,
  vim = false,
  allowAgenda = true,
  beforeViewChange,
}: {
  store: EditorStore
  snapshot: SearchSessionSnapshot
  restoreEditor: () => void
  shortcuts?: ShortcutProfile
  navigate?: (direction: -1 | 1) => void
  beginEditing?: () => void
  vim?: boolean
  allowAgenda?: boolean
  /** Resolves the editor's sessions and modes before `Cmd+P` switches between Tree and Agenda. */
  beforeViewChange?: () => void
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const editing = snapshot.draft !== undefined
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
  // Deactivating the window cancels the draft. When that removes the prompt that held focus, the
  // editor takes the page focus back, as Escape does, so returning to the window does not find focus
  // on a removed element. Page focus set while the window is inactive does not activate the window.
  const cancelOnDeactivation = useCallback((): void => {
    const active = document.activeElement
    const line = input.current?.closest('.local-search-panel, .vim-search-line') ?? input.current
    const focusInSearch = active === null || active === document.body || (line?.contains(active) ?? false)
    store.search.cancelDraft()
    if (focusInSearch && (vim || !store.search.session.getSnapshot().visible)) restoreEditor()
  }, [store, vim, restoreEditor])
  useEffect(() => {
    window.addEventListener('blur', cancelOnDeactivation)
    return () => window.removeEventListener('blur', cancelOnDeactivation)
  }, [cancelOnDeactivation])
  return (
    <label className="search-input-line" data-editor-focus-borrow>
      {vim ? <span aria-hidden="true">/</span> : null}
      <input
        ref={input}
        aria-label="Search"
        placeholder="Find"
        value={snapshot.draft ?? snapshot.confirmed}
        onFocus={snapshot.draft === undefined ? beginEditing : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          if (isCommittedCompositionInput(event.nativeEvent)) findPromptComposition.end(event.currentTarget)
          const value = event.target.value
          if (snapshot.draft === undefined) {
            editingInPlace.current = true
            beginEditing?.()
          }
          store.search.edit(value)
        }}
        onCompositionStart={(event) => {
          findPromptComposition.start(event.currentTarget)
        }}
        onCompositionEnd={(event) => {
          findPromptComposition.end(event.currentTarget)
        }}
        onBlur={(event) => {
          findPromptComposition.end(event.currentTarget)
          if (
            event.relatedTarget instanceof Element &&
            event.relatedTarget.closest('.search-controls, dialog[role="alertdialog"]')
          )
            return
          // The prompt blurs before the window does when the window is deactivated.
          if (!document.hasFocus()) cancelOnDeactivation()
          else store.search.cancelDraft()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (findPromptComposition.owns(event.currentTarget) || event.nativeEvent.isComposing) return
          if (shortcuts.isPrimary(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
            event.preventDefault()
            if (!allowAgenda) return
            store.search.cancelDraft()
            restoreEditor()
            const active = document.activeElement
            // The switch reaches another view, as the other `Cmd+P` paths do (PRODUCT §20.2.6).
            beforeViewChange?.()
            const state = store.getSnapshot()
            if (state.status === 'ready' && state.agenda !== undefined) store.closeAgenda()
            else store.openAgenda(active instanceof HTMLElement ? getCaret(active) : undefined)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            store.hideSearch()
            restoreEditor()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (navigate !== undefined) navigate(event.shiftKey ? -1 : 1)
            else {
              store.search.confirm(event.shiftKey ? -1 : 1)
              if (vim) restoreEditor()
            }
          }
        }}
      />
    </label>
  )
}
