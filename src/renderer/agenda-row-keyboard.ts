import type { KeyboardEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import { clearCommandAssembly, clearPending } from './vim-command-state'
import type { VimTextCommandState } from './editor-input-handlers'
import { viewportBounds, viewportScrollEdges } from './scroll-viewport'
import { contextViewport, viewportMotionTarget } from './vim-viewport-motion'

interface Dependencies {
  store: EditorStore
  vim?: VimTextCommandState | undefined
  beforeSelect?: ((preserveViewport: boolean) => void) | undefined
}

/** Navigation over occurrence keys; Tree text and structural handlers never see these keys. */
export function createAgendaKeyDownHandler({
  store,
  vim,
  beforeSelect,
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
      store.applyAgenda({ kind: 'select', key: destination.key })
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
    if (event.metaKey) {
      if (event.key.toLowerCase() === 'p' && !event.shiftKey && !event.altKey) {
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
        }
      } else if (['Backspace', 'Enter', ',', 'z', 'x', 'v', 'e'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        if (vim !== undefined) clearCommandAssembly(vim.commandState)
      }
      return
    }
    event.preventDefault()
    if (event.key === 'Escape') {
      if (vim !== undefined) {
        clearCommandAssembly(vim.commandState)
        vim.setMode('normal')
      }
      return
    }
    const pending = vim?.commandState.pending
    const count = Math.min(rows.length, Math.max(1, Number(pending?.count || '1')))
    const normal = vim?.mode === 'normal'
    if (normal && !event.ctrlKey && !event.altKey && /^[0-9]$/u.test(event.key)) {
      if (event.key !== '0' || pending?.count) {
        vim.commandState.pending = { count: `${pending?.count ?? ''}${event.key}`, motionCount: '' }
        return
      }
    }
    if (normal && !event.ctrlKey && !event.altKey && event.key === 'g' && pending?.prefix === undefined) {
      vim.commandState.pending = { count: pending?.count ?? '', motionCount: '', prefix: 'g' }
      return
    }
    if (vim !== undefined) clearPending(vim.commandState)
    if (event.altKey) return
    if (event.ctrlKey) {
      if (!normal || pending?.prefix !== undefined || !['d', 'u'].includes(event.key)) return
      viewportMotion(event.key === 'd' ? 'half-down' : 'half-up', count)
      return
    }
    if (event.key === 'ArrowDown' || (normal && event.key === 'j' && pending?.prefix === undefined))
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
