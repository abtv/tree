import { pinnedAgendaOccurrence } from './agenda-state'
import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { dayNumberOf } from '../domain/calendar-date'
import { EditorSearch } from './editor-search'
import { AgendaRowsCache } from './agenda-rows'

const first = dayNumberOf({ year: 2026, month: 10, day: 22 })
const second = dayNumberOf({ year: 2026, month: 10, day: 23 })
const key = (day: number, id: string) => `node:${day}:${id}`
afterEach(() => vi.useRealTimers())

async function setup() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 30))
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
              children: [{ id: 'b', text: 'apple apple 2026-10-22 2026-10-23', children: [] }],
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

it('captures occurrence and synthetic origins using the current renderer caret', async () => {
  const { store } = await setup()
  store.applyAgenda({ kind: 'select', key: key(first, 'b') })

  expect(store.searchOrigin(6)).toEqual({ nodeId: 'b', day: first, offset: 6 })

  store.applyAgenda({ kind: 'select', key: `day:${first}` })

  expect(store.searchOrigin(8)).toEqual({ beforeDay: first, offset: 0 })

  store.closeAgenda()
  const getAgendaRows = vi.spyOn(store, 'getAgendaRows')

  expect(store.searchOrigin(3)).toEqual({ nodeId: 'a', offset: 3 })
  expect(getAgendaRows).not.toHaveBeenCalled()
})

it('falls back to the Tree selection while the selected Agenda row is unavailable', async () => {
  const { state } = await setup()
  const rows = new AgendaRowsCache()
  vi.spyOn(rows, 'get').mockReturnValue([])
  const search = new EditorSearch(vi.fn(), rows)

  expect(search.origin(state(), 4)).toEqual({ nodeId: 'a', offset: 4 })
})

// @requirement PRODUCT.md §20.2.26
it.each([
  { nodeId: 'missing', day: first, start: 0, end: 5, caret: 0 },
  { nodeId: 'b', day: second + 1, start: 0, end: 5, caret: 0 },
  { nodeId: 'b', start: 0, end: 5, caret: 0 },
])('ignores an unavailable Agenda search destination %j without opening folds', async (destination) => {
  const { store, state } = await setup()
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${first}` })
  const before = state()
  const apply = vi.fn()
  const search = new EditorSearch(apply, new AgendaRowsCache())
  search.update(before)

  const revealed = search.revealView(before, destination)

  expect(revealed).toBeUndefined()
  expect(search.takeFoldsToClose(new Set())).toEqual([])
  expect(state()).toBe(before)
  expect(before.agenda!.collapsed).toEqual(new Set([`day:${first}`]))
  expect(apply).not.toHaveBeenCalled()
})

it('counts only folded direct matches and serializes same-node and cross-day jumps without saving', async () => {
  const { store, state, save, begin } = await setup()

  store.applyAgenda({ kind: 'toggle-fold', key: `day:${first}` })
  begin()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)
  expect(store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'a')).toBe(false)
  expect(state().agenda!.collapsed).toEqual(new Set([`day:${first}`]))

  store.search.confirm()
  store.search.navigate({ beforeDay: first, offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(first, 'b'))
  expect(state().focus?.cursor).toBe(6)

  store.search.navigate({ nodeId: 'b', day: first, offset: 6 }, 1, 1)
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

  expect(state().agenda!.selectedKey).toBe(key(first, 'b'))

  store.search.navigate({ nodeId: 'b', day: first, offset: 6 }, 1, 1)
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

  expect(store.search.session.getSnapshot().count?.total).toBe(3)

  store.closeAgenda()
  store.search.begin({ nodeId: 'a', offset: 0 })

  expect(store.search.session.getSnapshot().draft).toBe('apple')
})

it('recounts after leaving a pinned occurrence and does not publish its obsolete ordinal', async () => {
  const { store, state, begin } = await setup()

  store.applyAgenda({ kind: 'select', key: key(second, 'c') })
  store.editText('c', 'apple')

  expect(pinnedAgendaOccurrence(state().agenda!)?.nodeId).toBe('c')

  begin()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)

  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(pinnedAgendaOccurrence(state().agenda!)).toBeUndefined()
  expect(store.search.getResult()).toBeUndefined()
  expect(store.search.session.getSnapshot().count?.total).toBe(4)
})

it('transfers recursive fold ownership only within the chosen day', async () => {
  const { store, state, begin } = await setup()

  store.applyAgenda({ kind: 'fold', key: `day:${first}`, operation: 'close-recursive' })
  store.applyAgenda({ kind: 'fold', key: `day:${second}`, operation: 'close-recursive' })
  begin()
  store.search.confirm()
  store.search.navigate({ beforeDay: first, offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(first, 'b'))

  store.applyAgenda({ kind: 'fold', key: `day:${first}`, operation: 'open-recursive' })
  store.search.navigate({ nodeId: 'b', day: first, offset: 0 }, 1, 2)
  await vi.runAllTimersAsync()

  store.hideSearch()

  expect(state().agenda!.collapsed.has(`day:${first}`)).toBe(false)
  expect(state().agenda!.collapsed.has(key(first, 'a'))).toBe(false)
  expect(state().agenda!.selectedKey).toBe(key(second, 'b'))
})

it('invalidates pending jumps on synthetic selection and document edits without changing the newer selection', async () => {
  const { store, state, begin } = await setup()

  store.applyAgenda({ kind: 'select', key: key(first, 'b') })
  begin()
  store.search.confirm()
  await vi.runAllTimersAsync()

  store.search.navigate({ nodeId: 'b', day: first, offset: 0 }, 1, 1)
  store.applyAgenda({ kind: 'select', key: `day:${second}` })
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(`day:${second}`)

  store.search.navigate({ beforeDay: second, offset: 0 }, 1, 1)
  store.editText('b', 'pear 2026-10-22 2026-10-23')
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(`day:${second}`)
  expect(store.search.session.getSnapshot().count?.total).toBe(1)
})

it('replaces dated occurrences during pending search and restores them through history', async () => {
  const { store, state, begin } = await setup()

  begin()
  store.search.confirm()
  store.editText('b', 'apple apple 2026-10-23')
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(3)

  store.search.navigate({ beforeDay: first, offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(second, 'b'))

  store.undo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)

  store.redo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(3)

  store.search.navigate({ nodeId: 'b', day: second, offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().agenda!.selectedKey).toBe(key(second, 'b'))
  expect(state().focus?.cursor).toBe(6)
})
