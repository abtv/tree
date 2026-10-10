import type { KeyboardEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import { clearCommandAssembly, clearPending } from './vim-command-state'
import type { VimTextCommandState } from './editor-input-handlers'
import { viewportBounds, viewportScrollEdges, viewportScroller } from './scroll-viewport'
import { contextViewport, viewportMotionTarget } from './vim-viewport-motion'
import { getCaret } from './editor-dom'
import { agendaAllows } from './agenda-key-policy'
import type { AgendaRow } from '../application/agenda-rows'
import { handleRowTextKey } from './agenda-row-text-keys'
import { arrivalCaret, type RowCaret } from './agenda-row-caret'

/** The text and caret of the selected row when it has no editor, owned by the Agenda view. */
export interface AgendaRowText {
  textOf: (row: AgendaRow) => string
  /** A row with an editor keeps its text commands in the editor; focus on its padding stays inert. */
  hasEditor: (row: AgendaRow) => boolean
  caret: () => RowCaret
  setCaret: (caret: RowCaret) => void
  copy: (text: string) => void
}

interface Dependencies {
  store: EditorStore
  vim?: VimTextCommandState | undefined
  beforeSelect?: ((preserveViewport: boolean) => void) | undefined
  rowText?: AgendaRowText | undefined
}

/** Navigation over occurrence keys; Tree text and structural handlers never see these keys. */
export function createAgendaKeyDownHandler({
  store,
  vim,
  beforeSelect,
  rowText,
}: Dependencies): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.nativeEvent?.isComposing || ['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) return
    const state = store.getSnapshot()
    if (state.status !== 'ready' || state.agenda === undefined) return
    const rows = store.getAgendaRows()
    const index = rows.findIndex((row) => row.key === state.agenda!.selectedKey)
    const row = rows[index]
    if (row === undefined) return
    const select = (target: number, preserveViewport = false): void => {
      const destination = rows[Math.max(0, Math.min(rows.length - 1, target))]!
      beforeSelect?.(preserveViewport)
      store.applyAgenda({
        kind: 'select',
        key: destination.key,
        cursor: event.currentTarget?.classList.contains('node-input') ? getCaret(event.currentTarget) : 0,
      })
    }
    const viewportMotion = (motion: 'top' | 'middle' | 'bottom' | 'half-down' | 'half-up', count: number): void => {
      const bounds = viewportBounds()
      const mounted = [...document.querySelectorAll<HTMLElement>('.agenda-row')]
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { nodeId: element.dataset.agendaKey, top: rect.top, bottom: rect.bottom }
        })
        .sort((left, right) => left.top - right.top)
      const lineMotion = motion === 'top' || motion === 'middle' || motion === 'bottom'
      const inner = lineMotion ? contextViewport(bounds, viewportScrollEdges()) : bounds
      const choice = mounted.some((candidate) => candidate.top >= inner.top && candidate.bottom <= inner.bottom)
        ? inner
        : bounds
      const key = viewportMotionTarget(mounted, choice, row.key, motion, count)
      if (key !== undefined)
        select(
          rows.findIndex((candidate) => candidate.key === key),
          lineMotion,
        )
    }
    const rowTextKey = (): boolean =>
      rowText !== undefined &&
      !rowText.hasEditor(row) &&
      handleRowTextKey({
        event,
        vim,
        text: rowText.textOf(row),
        caret: rowText.caret(),
        setCaret: rowText.setCaret,
        copy: rowText.copy,
      })
    if (event.metaKey) {
      if (rowTextKey()) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
      } else if (event.key.toLowerCase() === 'p' && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        store.closeAgenda()
      } else if (event.key === '.') {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        if (row.kind === 'node') {
          store.closeAgenda()
          store.selectNode(row.nodeId, 0)
          store.enter()
        } else if (row.kind === 'day') {
          beforeSelect?.(false)
          // The row key survives the change of presentation, but its text does not.
          rowText?.setCaret(arrivalCaret(row.key))
          store.applyAgenda({ kind: 'focus-day', key: row.key, scrollTop: viewportScroller()?.scrollTop ?? 0 })
        }
      } else if (event.key === ',') {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        beforeSelect?.(true)
        rowText?.setCaret(arrivalCaret(row.key))
        store.applyAgenda({ kind: 'return-timeline', key: row.key })
      } else if (event.key.toLowerCase() === 'e' && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        beforeSelect?.(false)
        store.applyAgenda({ kind: row.kind === 'gap' ? 'toggle-gap' : 'toggle-fold', key: row.key })
      } else if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
        if (event.shiftKey) store.redo()
        else store.undo()
      } else if (['backspace', 'enter', ',', 'x', 'v', 'e'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
      }
      return
    }
    event.preventDefault()
    if (event.key === 'Escape') {
      store.cancelAgendaMove()
      if (rowText !== undefined && vim?.mode === 'visual') {
        // Leaving Visual puts the caret at the start of the selection, as in Tree.
        const caret = rowText.caret()
        const start = Math.min(caret.anchor, caret.focus)
        rowText.setCaret({ ...caret, anchor: start, focus: start })
      }
      if (vim !== undefined) {
        clearCommandAssembly(vim.commandState)
        vim.setMode('normal')
      }
      return
    }
    const pending = vim?.commandState.pending
    const count = Math.min(rows.length, Math.max(1, Number(pending?.count || '1')))
    const normal = vim?.mode === 'normal'
    // Counts and the `g` prefix also serve the text motions of a Visual selection over a row's text.
    const textMode = normal || vim?.mode === 'visual'
    // The character after `f`, `F`, `t`, `T` or `r` is data, never a count or a prefix.
    if (pending?.awaiting !== undefined && rowTextKey()) return
    if (textMode && !event.ctrlKey && !event.altKey && /^[0-9]$/u.test(event.key)) {
      if (event.key !== '0' || pending?.count) {
        vim.commandState.pending =
          pending?.operator === undefined
            ? { count: `${pending?.count ?? ''}${event.key}`, motionCount: '' }
            : { ...pending, motionCount: `${pending.motionCount}${event.key}` }
        return
      }
    }
    if (textMode && !event.ctrlKey && !event.altKey && event.key === 'g' && pending?.prefix === undefined) {
      vim.commandState.pending = { count: pending?.count ?? '', motionCount: '', prefix: 'g' }
      return
    }
    if (normal && !event.ctrlKey && !event.altKey && event.key === 'z' && pending?.prefix === undefined) {
      vim.commandState.pending = { count: '', motionCount: '', prefix: 'z' }
      return
    }
    if (normal && !event.ctrlKey && !event.altKey && pending?.prefix === undefined) {
      const element = row.kind === 'node' ? row.role : row.kind
      if (event.key === 'd') {
        if (pending?.operator === 'd') {
          clearPending(vim.commandState)
          if (agendaAllows(element, 'start-move')) store.startAgendaMove(count)
        } else vim.commandState.pending = { count: pending?.count ?? '', motionCount: '', operator: 'd' }
        return
      }
      // Consume unsupported operator sequences as one command; their j/k suffix is not navigation.
      if (pending?.operator !== undefined) {
        clearPending(vim.commandState)
        return
      }
      if (event.key === 'c' || event.key === 'y') {
        vim.commandState.pending = { count: pending?.count ?? '', motionCount: '', operator: event.key }
        return
      }
      // A gap has no day, so `p` there is not allowed and the move stays pending (D4).
      if ((event.key === 'p' || event.key === 'P') && pending?.operator === undefined) {
        clearPending(vim.commandState)
        if (agendaAllows(element, 'put-move')) store.putAgendaMove()
        return
      }
    }
    // Creation is a command key, so a count or pending prefix never reaches it.
    const vimCreate =
      normal && (event.key === 'o' || event.key === 'O') && !event.ctrlKey && !event.altKey && !pending?.count
    if (
      row.kind === 'day' &&
      agendaAllows('day', 'create') &&
      pending?.prefix === undefined &&
      ((vim === undefined && event.key === 'Enter' && !event.ctrlKey && !event.altKey) || vimCreate)
    ) {
      if (vim !== undefined) clearPending(vim.commandState)
      beforeSelect?.(false)
      if (store.createAgendaDayNode(event.key === 'O' ? 'preceding' : 'selected') && vim !== undefined)
        vim.setMode('insert')
      return
    }
    if (rowTextKey()) return
    if (vim !== undefined) clearPending(vim.commandState)
    if (event.altKey) return
    if (normal && !event.ctrlKey && pending?.prefix === 'z') {
      beforeSelect?.(false)
      const operations = {
        c: 'close',
        o: 'open',
        a: 'toggle',
        C: 'close-recursive',
        O: 'open-recursive',
        M: 'close-all',
        R: 'open-all',
      } as const
      const operation = operations[event.key as keyof typeof operations]
      if (operation !== undefined) {
        if (row.kind === 'gap' && operation !== 'close-all' && operation !== 'open-all') {
          if (
            operation === 'toggle' ||
            (operation === 'open' && !row.expanded) ||
            (operation === 'close' && row.expanded)
          )
            store.applyAgenda({ kind: 'toggle-gap', key: row.key })
        } else store.applyAgenda({ kind: 'fold', key: row.key, operation })
      }
      return
    }
    if (event.ctrlKey) {
      if (!normal || pending?.prefix !== undefined) return
      if (event.key === 'o') {
        beforeSelect?.(true)
        rowText?.setCaret(arrivalCaret(row.key))
        store.applyAgenda({ kind: 'return-timeline', key: row.key })
        return
      }
      if (event.key === 'r') {
        store.redo()
        return
      }
      if (!['d', 'u'].includes(event.key)) return
      viewportMotion(event.key === 'd' ? 'half-down' : 'half-up', count)
      return
    }
    if (normal && event.key === 'd' && pending?.prefix === 'g') {
      if (row.kind === 'day') {
        beforeSelect?.(false)
        rowText?.setCaret(arrivalCaret(row.key))
        store.applyAgenda({ kind: 'focus-day', key: row.key, scrollTop: viewportScroller()?.scrollTop ?? 0 })
      } else if (row.kind === 'node') {
        store.closeAgenda()
        store.selectNode(row.nodeId, 0)
        store.enter()
      }
    } else if (normal && event.key === 'u' && pending?.prefix === undefined) store.undo()
    else if (event.key === 'ArrowDown' || (normal && event.key === 'j' && pending?.prefix === undefined))
      select(index + count)
    else if (event.key === 'ArrowUp' || (normal && event.key === 'k' && pending?.prefix === undefined))
      select(index - count)
    else if (normal && event.key === 'g' && pending?.prefix === 'g') select(count - 1)
    else if (normal && event.key === 'G' && pending?.prefix === undefined)
      select(pending?.count ? count - 1 : rows.length - 1)
    else if (normal && ['H', 'M', 'L'].includes(event.key) && pending?.prefix === undefined) {
      viewportMotion(event.key === 'H' ? 'top' : event.key === 'M' ? 'middle' : 'bottom', count)
    }
  }
}
