import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EditorStore } from '../application/editor-store'
import { requireNode, type TreeNode } from '../domain/document'
import { dayNumberOf, calendarDateOf, formatCanonicalDate } from '../domain/calendar-date'
import { DateAssist } from './date-assist'
import { expressionPosition, getCaret, getSelectionRange, readEditableContent } from './editor-dom'
import type { NodeInputBindings } from './NodeInput'
import type { DatePopupPresentation } from './DatePopup'
import type { VimMode } from './vim-editing'

export function useDateAssist(
  store: EditorStore,
  mode: VimMode,
  locked: boolean,
  scheduleCaret: (nodeId: string, cursor: number) => void,
  vimEnabled: boolean,
): {
  presentation: DatePopupPresentation | undefined
  accept: (index: number) => void
  decorate: (node: TreeNode, bindings: NodeInputBindings) => NodeInputBindings
  reconcile: () => void
} {
  const owner = useRef(new DateAssist())
  const input = useRef<HTMLElement | undefined>(undefined)
  const composing = useRef(false)
  const compositionText = useRef<string | undefined>(undefined)
  const context = useRef<{ parentId: string | null; agendaKey: string | undefined } | undefined>(undefined)
  const [presentation, setPresentation] = useState<DatePopupPresentation>()
  const project = useCallback((): void => {
    const popup = owner.current.popup
    const element = input.current
    const next =
      popup === undefined || element === undefined || !element.isConnected
        ? undefined
        : { popup, ...expressionPosition(element, popup.start) }
    setPresentation((previous) =>
      previous?.popup === next?.popup &&
      previous?.left === next?.left &&
      previous?.top === next?.top &&
      previous?.rowTop === next?.rowTop
        ? previous
        : next,
    )
  }, [])
  const close = useCallback((): void => {
    owner.current.close()
    project()
  }, [project])
  const observe = useCallback((): void => {
    const element = input.current
    const popup = owner.current.popup
    if (popup === undefined || element === undefined) return
    const selection = getSelectionRange(element)
    const text = element instanceof HTMLTextAreaElement ? element.value : readEditableContent(element).text
    owner.current.observe(
      popup.nodeId,
      text,
      selection.start,
      selection.end,
      element.isConnected &&
        element.ownerDocument.activeElement === element &&
        mode === 'insert' &&
        !locked &&
        !composing.current,
    )
    project()
  }, [mode, locked, project])
  useLayoutEffect(() => {
    if (mode !== 'insert' || locked) close()
  }, [mode, locked, close])
  useLayoutEffect(close, [vimEnabled, close])
  useEffect(() => {
    const stop = store.subscribe(() => {
      const popup = owner.current.popup
      if (popup === undefined) return
      const state = store.getSnapshot()
      if (
        state.status !== 'ready' ||
        state.focus.nodeId !== popup.nodeId ||
        state.location.currentParentId !== context.current?.parentId ||
        state.agenda?.selectedKey !== context.current?.agendaKey ||
        requireNode(state.document, popup.nodeId).node.text !== popup.text
      )
        close()
    })
    document.addEventListener('selectionchange', observe)
    globalThis.addEventListener('blur', close)
    globalThis.addEventListener('resize', observe)
    document.addEventListener('scroll', observe, true)
    return () => {
      stop()
      document.removeEventListener('selectionchange', observe)
      globalThis.removeEventListener('blur', close)
      globalThis.removeEventListener('resize', observe)
      document.removeEventListener('scroll', observe, true)
    }
  }, [store, observe, close])
  const accept = useCallback(
    (index: number): void => {
      observe()
      const popup = owner.current.popup
      if (popup === undefined) return
      const suggestion = popup.suggestions[index]
      if (suggestion === undefined) return
      const canonical = formatCanonicalDate(calendarDateOf(suggestion.day))
      close()
      scheduleCaret(popup.nodeId, popup.start + canonical.length)
      store.replaceTextRange(popup.nodeId, popup.start, popup.end, canonical)
    },
    [observe, close, scheduleCaret, store],
  )
  const edit = useCallback(
    (node: TreeNode, element: HTMLElement, native: Event | undefined): void => {
      input.current = element
      const event = native as InputEvent
      if (
        mode !== 'insert' ||
        locked ||
        composing.current ||
        event?.isComposing ||
        event?.inputType === 'insertFromPaste'
      ) {
        close()
        return
      }
      const content =
        element instanceof HTMLTextAreaElement ? { text: element.value, links: [] } : readEditableContent(element)
      const selection = getSelectionRange(element)
      if (selection.start !== selection.end) {
        close()
        return
      }
      const state = store.getSnapshot()
      const now = new Date()
      const today =
        (state.status === 'ready' ? state.agenda?.today : undefined) ??
        dayNumberOf({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() })
      owner.current.edit(node.id, content.text, getCaret(element), today, content.links)
      context.current =
        state.status === 'ready'
          ? { parentId: state.location.currentParentId, agendaKey: state.agenda?.selectedKey }
          : undefined
      project()
    },
    [mode, locked, close, project, store],
  )
  const decorate = useCallback(
    (node: TreeNode, bindings: NodeInputBindings): NodeInputBindings => ({
      ...bindings,
      onTextChange: (event) => {
        edit(node, event.currentTarget, event.nativeEvent)
        bindings.onTextChange(event)
      },
      onContentInput: (event) => {
        edit(node, event.currentTarget, event.nativeEvent)
        bindings.onContentInput(event)
      },
      onContentChange: (event) => {
        edit(node, event.currentTarget, event.nativeEvent)
        bindings.onContentChange(event)
      },
      onCompositionStart: (event) => {
        composing.current = true
        compositionText.current =
          event.currentTarget instanceof HTMLTextAreaElement
            ? event.currentTarget.value
            : readEditableContent(event.currentTarget).text
        close()
        bindings.onCompositionStart(event)
      },
      onCompositionEnd: (event) => {
        bindings.onCompositionEnd(event)
        composing.current = false
        const text =
          event.currentTarget instanceof HTMLTextAreaElement
            ? event.currentTarget.value
            : readEditableContent(event.currentTarget).text
        if (text !== compositionText.current) edit(node, event.currentTarget, event.nativeEvent)
        compositionText.current = undefined
      },
      onBlur: () => {
        close()
        bindings.onBlur()
      },
      onPaste: (event) => {
        close()
        bindings.onPaste(event)
      },
      onContextMenu: (event) => {
        close()
        bindings.onContextMenu(event)
      },
      onSelect: (event) => {
        observe()
        bindings.onSelect(event)
      },
      onKeyDown: (event) => {
        if (
          composing.current ||
          event.nativeEvent?.isComposing ||
          event.key === 'Process' ||
          event.key === 'Unidentified'
        ) {
          close()
          bindings.onKeyDown(event)
          return
        }
        observe()
        const popup = owner.current.popup
        if (popup !== undefined && !event.metaKey && !event.altKey && !event.shiftKey) {
          if (!event.ctrlKey && event.key === 'Tab') {
            event.preventDefault()
            accept(popup.selected)
            return
          }
          if (event.ctrlKey && ['n', 'p'].includes(event.key.toLowerCase())) {
            event.preventDefault()
            owner.current.move(event.key.toLowerCase() === 'n' ? 1 : -1)
            project()
            return
          }
        }
        if (event.key === 'Escape' || event.metaKey || event.key === 'Enter' || event.key === 'Tab') close()
        bindings.onKeyDown(event)
      },
    }),
    [edit, close, observe, accept, project],
  )
  return { presentation, accept, decorate, reconcile: observe }
}
