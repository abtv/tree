import { useCallback, useEffect, useState } from 'react'
import type { EditorStore } from '../application/editor-store'

/** One presentation preference shared by the keyboard and command panel. */
export function useLineNumbers(initialValue: boolean, store: EditorStore) {
  const [lineNumbers, setLineNumbers] = useState(initialValue)
  const applyLineNumbers = useCallback(async (value: boolean) => {
    setLineNumbers(value)
    await window.treeApi.setLineNumbers(value)
  }, [])

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== 'l' ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing ||
        event.getModifierState('AltGraph') ||
        store.getSnapshot().status !== 'ready' ||
        !(event.target instanceof Element) ||
        !event.target.closest('.tree-app') ||
        event.target.closest('.command-input-line, .search-controls, [role="dialog"]') ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      )
        return

      event.preventDefault()
      event.stopImmediatePropagation()
      if (!event.repeat) void applyLineNumbers(!lineNumbers).catch((error: unknown) => store.reportError(error))
    }
    document.addEventListener('keydown', keydown, true)
    return () => document.removeEventListener('keydown', keydown, true)
  }, [lineNumbers, applyLineNumbers, store])

  return { lineNumbers, applyLineNumbers }
}
