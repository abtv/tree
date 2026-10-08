import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { AgendaState } from '../application/agenda-state'
import type { Document } from '../domain/document'
import { requireNode } from '../domain/document'
import type { VimTextCommandState } from './editor-input-handlers'
import { clearCommandAssembly } from './vim-command-state'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { AgendaRow } from './AgendaRow'
import { createViewportReveal } from './viewport-reveal'

export function AgendaView({
  store,
  agenda,
  document,
  vim,
}: {
  store: EditorStore
  agenda: AgendaState
  document: Document
  vim?: VimTextCommandState | undefined
}): React.JSX.Element {
  const elements = useRef(new Map<string, HTMLDivElement>())
  const reveal = useRef<'keyboard' | 'pointer' | 'none'>('keyboard')
  const viewportReveal = useMemo(() => createViewportReveal(), [])
  useEffect(() => viewportReveal.mount(), [viewportReveal])
  const rows = store.getAgendaRows()
  const rowRef = useCallback((key: string, element: HTMLDivElement | null): void => {
    if (element === null) elements.current.delete(key)
    else elements.current.set(key, element)
  }, [])
  const select = (key: string): void => {
    reveal.current = 'pointer'
    if (vim !== undefined) clearCommandAssembly(vim.commandState)
    store.applyAgenda({ kind: 'select', key })
  }
  const toggle = (key: string): void => {
    const row = rows.find((candidate) => candidate.key === key)
    if (row === undefined) return
    reveal.current = 'pointer'
    if (vim !== undefined) clearCommandAssembly(vim.commandState)
    store.applyAgenda({ kind: row.kind === 'gap' ? 'toggle-gap' : 'toggle-fold', key })
  }
  useLayoutEffect(() => {
    const element = elements.current.get(agenda.selectedKey)
    if (element === undefined) return
    element.focus({ preventScroll: true })
    if (reveal.current !== 'none')
      viewportReveal.begin(element, reveal.current === 'keyboard', () => {
        const state = store.getSnapshot()
        return state.status === 'ready' && state.agenda?.selectedKey === agenda.selectedKey
      })
    else viewportReveal.cancel()
  }, [agenda.selectedKey, store, viewportReveal])
  return (
    <div
      className="agenda-list"
      role="grid"
      aria-label="Agenda timeline"
      onKeyDown={(event) =>
        createAgendaKeyDownHandler({
          store,
          vim,
          beforeSelect: (preserve) => {
            reveal.current = preserve ? 'none' : 'keyboard'
          },
        })(event)
      }
    >
      {rows.map((row) => (
        <AgendaRow
          key={row.key}
          row={row}
          node={row.kind === 'node' ? requireNode(document, row.nodeId).node : undefined}
          today={agenda.today}
          selected={row.key === agenda.selectedKey}
          expanded={row.kind === 'gap' ? row.expanded : !agenda.collapsed.has(row.key)}
          rowRef={rowRef}
          onSelect={select}
          onToggle={toggle}
        />
      ))}
    </div>
  )
}
