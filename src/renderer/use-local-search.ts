import { useCallback, useEffect } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { ShortcutProfile } from './shortcut-profile'
import { getCaret } from './editor-dom'

/** Shared keyboard and pointer entry points; search state remains application-owned. */
export function useLocalSearch({
  store,
  shortcuts,
  blocked,
  readAgendaCaret,
  readEditorCaret,
  restoreEditor,
  beforeOpen,
  beforeJump,
  vimEnabled,
}: {
  store: EditorStore
  shortcuts: ShortcutProfile
  blocked: boolean
  readAgendaCaret(): number
  readEditorCaret(): number
  restoreEditor(): void
  beforeOpen(): void
  beforeJump(): void
  vimEnabled: boolean
}) {
  const origin = useCallback(() => {
    const active = document.activeElement
    const state = store.getSnapshot()
    const offset =
      active instanceof HTMLElement && active.matches('.node-input')
        ? getCaret(active)
        : state.status === 'ready' && state.agenda !== undefined
          ? readAgendaCaret()
          : readEditorCaret()
    return store.searchOrigin(offset)
  }, [store, readAgendaCaret, readEditorCaret])

  const open = useCallback(
    (selectQuery = true) => {
      if (blocked || store.getSnapshot().status !== 'ready') return
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return
      const input = document.querySelector<HTMLInputElement>('.search-input-line input')
      if (input && store.search.session.getSnapshot().draft !== undefined) {
        input.focus({ preventScroll: true })
        if (selectQuery) input.select()
        return
      }
      const position = origin()
      beforeOpen()
      store.search.begin(position)
      input?.focus({ preventScroll: true })
      if (selectQuery) input?.select()
    },
    [blocked, store, origin, beforeOpen],
  )

  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (blocked || store.getSnapshot().status !== 'ready') return
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return
      const snapshot = store.search.session.getSnapshot()
      if (snapshot.draft !== undefined) {
        if (!snapshot.draft && !snapshot.confirmed) return
        beforeJump()
        store.search.confirm(direction)
      } else if (snapshot.confirmed) {
        const position = origin()
        beforeJump()
        store.search.navigate(position, direction, 1)
      }
    },
    [blocked, store, beforeJump, origin],
  )

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (event.isComposing || blocked || event.altKey || shortcuts.hasNonPrimaryCtrl(event)) return
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return
      if (
        event.key === 'Escape' &&
        !vimEnabled &&
        store.search.session.getSnapshot().draft === undefined &&
        store.search.session.getSnapshot().visible
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        store.hideSearch()
        restoreEditor()
        return
      }
      if (!shortcuts.isPrimary(event)) return
      const key = event.key.toLowerCase()
      if ((key !== 'f' || event.shiftKey) && key !== 'g') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (key === 'f') open()
      else navigate(event.shiftKey ? -1 : 1)
    }
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.removeEventListener('keydown', keydown, true)
    }
  }, [blocked, shortcuts, open, navigate, vimEnabled, store, restoreEditor])

  return { open, navigate }
}
