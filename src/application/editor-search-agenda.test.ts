import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { dayNumberOf } from '../domain/calendar-date'

const first = dayNumberOf({ year: 2026, month: 10, day: 22 })
const second = dayNumberOf({ year: 2026, month: 10, day: 23 })
const key = (day: number, id: string) => `node:${day}:${id}`
afterEach(() => vi.useRealTimers())

async function setup() {
  vi.useFakeTimers()
  const save = vi.fn(async () => undefined)
  const store = new EditorStore(
    {
      load: async () => ({
        version: 1,
        document: {
          roots: [
            {
              id: 'a',
              text: 'apple apple',
              children: [{ id: 'b', text: 'apple 2026-10-22 2026-10-23', children: [] }],
            },
            { id: 'c', text: 'apple 2026-10-23', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
      save,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'new',
  )
  await store.initialize()
  store.openAgenda()
  const state = () => store.getSnapshot() as ReadySnapshot
  const begin = () => {
    store.search.begin({ beforeDay: first, offset: 0 })
    store.search.edit('apple')
  }
  return { store, state, save, begin }
}

it('counts folded contextual occurrences and serializes same-node and cross-day jumps without saving', async () => {
  const { store, state, save, begin } = await setup()

  store.applyAgenda({ kind: 'toggle-fold', key: `day:${first}` })
  store.applyAgenda({ kind: 'toggle-fold', key: key(second, 'a') })
  begin()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(7)
  expect(state().agenda!.collapsed).toEqual(new Set([`day:${first}`, key(second, 'a')]))

  store.search.confirm()
  store.search.navigate({ beforeDay: first, offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(first, 'a'))
  expect(state().focus?.cursor).toBe(6)

  store.search.navigate({ nodeId: 'a', day: first, offset: 6 }, 1, 4)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(second, 'b'))

  store.hideSearch()

  expect(state().agenda!.collapsed).toEqual(new Set([`day:${first}`]))
  expect(state().expansion.expandedIds.size).toBe(0)
  expect(save).not.toHaveBeenCalled()
})

it('retains manual folds and draft origin, closes feedback on focused-day changes and shares recall', async () => {
  const { store, state, begin } = await setup()

  store.applyAgenda({ kind: 'select', key: key(first, 'b') })
  store.search.begin({ nodeId: 'b', day: first, offset: 0 })
  store.search.edit('apple')
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${first}` })

  expect(store.search.session.getSnapshot().draft).toBe('apple')

  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(second, 'a'))

  store.search.navigate({ nodeId: 'a', day: second, offset: 0 }, -1, 1)
  await vi.runAllTimersAsync()

  store.applyAgenda({ kind: 'toggle-fold', key: `day:${first}` })
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${first}` })
  store.search.navigate({ nodeId: 'b', day: first, offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  store.hideSearch()

  expect(state().agenda!.collapsed.has(`day:${first}`)).toBe(false)

  begin()
  store.applyAgenda({ kind: 'focus-day', key: `day:${second}`, scrollTop: 0 })

  expect(store.search.session.getSnapshot()).toMatchObject({ visible: false, confirmed: 'apple' })

  store.search.begin({ beforeDay: second, offset: 0 })
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(4)

  store.closeAgenda()
  store.search.begin({ nodeId: 'a', offset: 0 })

  expect(store.search.session.getSnapshot().draft).toBe('apple')
})

it('recounts after leaving a pinned occurrence and does not publish its obsolete ordinal', async () => {
  const { store, state, begin } = await setup()

  store.applyAgenda({ kind: 'select', key: key(second, 'c') })
  store.editText('c', 'apple')

  expect(state().agenda!.pinnedOccurrence?.nodeId).toBe('c')

  begin()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(7)

  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(state().agenda!.pinnedOccurrence).toBeUndefined()
  expect(store.search.getResult()).toBeUndefined()
  expect(store.search.session.getSnapshot().count?.total).toBe(6)
})

it('transfers recursive fold ownership only within the chosen day', async () => {
  const { store, state, begin } = await setup()

  store.applyAgenda({ kind: 'fold', key: `day:${first}`, operation: 'close-recursive' })
  store.applyAgenda({ kind: 'fold', key: `day:${second}`, operation: 'close-recursive' })
  begin()
  store.search.confirm()
  store.search.navigate({ beforeDay: first, offset: 0 }, 1, 2)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(first, 'b'))

  store.applyAgenda({ kind: 'fold', key: `day:${first}`, operation: 'open-recursive' })
  store.search.navigate({ nodeId: 'b', day: first, offset: 0 }, 1, 3)
  await vi.runAllTimersAsync()

  store.hideSearch()

  expect(state().agenda!.collapsed.has(`day:${first}`)).toBe(false)
  expect(state().agenda!.collapsed.has(key(first, 'a'))).toBe(false)
  expect(state().agenda!.selectedKey).toBe(key(second, 'b'))
})

it('invalidates pending jumps on synthetic selection and document edits while retaining a pending move', async () => {
  const { store, state, begin } = await setup()

  store.applyAgenda({ kind: 'select', key: key(first, 'b') })
  store.startAgendaMove(1)
  begin()
  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(state().agenda!.pendingMove).toHaveLength(1)

  store.search.navigate({ nodeId: 'a', day: first, offset: 0 }, 1, 1)
  store.applyAgenda({ kind: 'select', key: `day:${second}` })
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(`day:${second}`)

  store.search.navigate({ beforeDay: second, offset: 0 }, 1, 1)
  store.editText('a', 'pear')
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(`day:${second}`)
  expect(store.search.session.getSnapshot().count?.total).toBe(3)
})

it('replaces dated occurrences during pending search and restores them through history', async () => {
  const { store, state, begin } = await setup()

  begin()
  store.search.confirm()
  store.editText('b', 'apple 2026-10-23')
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(4)

  store.search.navigate({ beforeDay: first, offset: 0 }, 1, 3)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(second, 'b'))

  store.undo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(7)

  store.redo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(4)

  store.search.navigate({ nodeId: 'b', day: second, offset: 0 }, -1, 1)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(second, 'a'))
  expect(state().focus?.cursor).toBe(6)
})
