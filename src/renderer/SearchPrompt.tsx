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
}: {
  store: EditorStore
  snapshot: SearchSessionSnapshot
  restoreEditor: () => void
  shortcuts?: ShortcutProfile
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true })
    input.current?.select()
  }, [])
  useEffect(() => {
    const cancel = (): void => store.search.cancelDraft()
    window.addEventListener('blur', cancel)
    return () => window.removeEventListener('blur', cancel)
  }, [store])
  return (
    <label className="search-input-line">
      <span>/</span>
      <input
        ref={input}
        aria-label="Search"
        value={snapshot.draft ?? ''}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => store.search.edit(event.target.value)}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onBlur={() => store.search.cancelDraft()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (composing.current || event.nativeEvent.isComposing) return
          if (shortcuts.isPrimary(event) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') {
            event.preventDefault()
            store.search.cancelDraft()
            restoreEditor()
            const active = document.activeElement
            store.openAgenda(active instanceof HTMLElement ? getCaret(active) : undefined)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            store.search.cancelDraft()
            restoreEditor()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            store.search.confirm()
            restoreEditor()
          }
        }}
      />
    </label>
  )
}
