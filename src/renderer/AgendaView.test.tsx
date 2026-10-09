// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it } from 'vitest'
import './test/setup'
import { createRealStoreHarness } from './test/real-store-harness'
import { AgendaView } from './AgendaView'
import type { EditorStore } from '../application/editor-store'
import { dayNumberOf } from '../domain/calendar-date'

afterEach(cleanup)

// @requirement PRODUCT.md §23.9
it('renders attachments on inactive direct matches and excludes contextual ancestors', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: [
        {
          id: 'parent',
          text: '2026-10-20 Parent',
          children: [
            {
              id: 'child',
              text: '2026-10-14 Child 2026-10-20',
              children: [],
            },
          ],
        },
      ],
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const state = harness.snapshot()
  const { container } = render(
    <AgendaView
      store={harness.store}
      agenda={state.agenda!}
      document={state.document}
      renderInput={() => <span className="test-editor" />}
      renderText={(node) => <a href="https://example.com">{node.text}</a>}
      renderAttachment={(node, editable) => <span data-attachment={node.id} data-editable={editable} />}
    />,
  )
  expect(container.querySelectorAll('[data-attachment="child"]')).toHaveLength(2)
  expect(container.querySelectorAll('[data-attachment="child"][data-editable="false"]')).toHaveLength(2)
  expect(container.querySelectorAll('.agenda-role-context [data-attachment]')).toHaveLength(0)
  expect(container.querySelectorAll('[data-attachment="parent"]')).toHaveLength(1)
  expect(container.querySelectorAll('.agenda-role-match a')).toHaveLength(2)
  expect(container.querySelectorAll('.agenda-role-context a')).toHaveLength(0)
})

function View({ store }: { store: EditorStore }): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  if (state.status !== 'ready' || state.agenda === undefined) return <div />
  return <AgendaView store={store} agenda={state.agenda} document={state.document} />
}

// @requirement PRODUCT.md §23.6
it('bounds mounted rows, pins distant selection and preserves its DOM across a fold threshold', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: Array.from({ length: 600 }, (_, index) => ({
        id: `n${index}`,
        text: `2026-10-08 Node ${index}`,
        children: [],
      })),
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const { container } = render(<View store={harness.store} />)
  expect(container.querySelectorAll('.agenda-row').length).toBeLessThan(100)
  expect(container.querySelectorAll('.agenda-list-spacer').length).toBe(2)
  const rows = harness.store.getAgendaRows()
  const distant = rows.find((row) => row.kind === 'node' && row.nodeId === 'n599')!
  act(() => harness.store.applyAgenda({ kind: 'select', key: distant.key }))
  const element = container.querySelector(`[data-agenda-key="${distant.key}"]`)!
  expect(element).toBe(document.activeElement)
  expect(element.classList.contains('agenda-row-pinned')).toBe(true)
  const day = rows.find((row) => row.kind === 'day' && row.content)!
  act(() => harness.store.applyAgenda({ kind: 'toggle-fold', key: day.key }))
  expect(container.querySelectorAll('.agenda-list-spacer').length).toBe(0)
  expect(container.querySelector(`[data-agenda-key="${day.key}"]`)).toBe(document.activeElement)
  act(() => harness.store.applyAgenda({ kind: 'toggle-fold', key: day.key }))
  expect(container.querySelectorAll('.agenda-row').length).toBeLessThan(100)
  expect(container.querySelector(`[data-agenda-key="${day.key}"]`)).toBe(document.activeElement)
  expect(harness.saves).toHaveLength(0)
})
