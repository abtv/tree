import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { EditorSearch } from './editor-search'
import { AgendaRowsCache } from './agenda-rows'
import { dayKey, focusAgendaState, openAgendaState, overdueKey } from './agenda-state'

afterEach(() => vi.useRealTimers())

// @requirement PRODUCT.md §20.2.26
// @requirement PRODUCT.md §23.3
it('starts search before the earliest overdue item and retains node and dated-heading origins', async () => {
  const { state } = await setup()
  const search = new EditorSearch(vi.fn(), new AgendaRowsCache())
  const base = {
    ...state(),
    document: {
      roots: [
        { id: 'a', text: 'apple 1970-04-01', children: [] },
        { id: 'c', text: 'apple 1970-04-11', children: [] },
      ],
    },
  }
  const agenda = openAgendaState(base.location, 0, 100)

  expect(search.origin({ ...base, agenda: { ...agenda, selectedKey: overdueKey(agenda.weekStart) } }, 4)).toEqual({
    beforeDay: 90,
    offset: 0,
  })
  expect(search.origin({ ...base, agenda: { ...agenda, selectedKey: dayKey(100) } }, 4)).toEqual({
    beforeDay: 100,
    offset: 0,
  })
  expect(search.origin({ ...base, agenda: { ...agenda, selectedKey: 'node:90:a' } }, 4)).toEqual({
    nodeId: 'a',
    day: 90,
    offset: 4,
  })
  expect(search.origin({ ...base, agenda: { ...agenda, selectedKey: 'node:100:c' } }, 4)).toEqual({
    nodeId: 'c',
    day: 100,
    offset: 4,
  })
})

it.each(['confirm', 'navigate'])('keeps a newer jump started by a subscriber during %s', async (action) => {
  const { state } = await setup()
  const apply = vi.fn(() => true)
  const search = new EditorSearch(apply, new AgendaRowsCache())
  const origin = { nodeId: 'a', offset: 0 }
  search.update(state())
  search.begin(origin)
  search.edit('apple')
  if (action === 'navigate') {
    search.confirm()
    await vi.runAllTimersAsync()
    search.hide()
    apply.mockClear()
  }
  const stop = search.subscribe(() => {
    stop()
    search.interruptNavigation()
    search.navigate(origin, 1, 1)
  })

  if (action === 'confirm') search.confirm()
  else search.navigate(origin, -1, 1)
  await vi.runAllTimersAsync()

  expect(apply).toHaveBeenCalledOnce()
  expect(apply.mock.calls[0]).toEqual([expect.objectContaining({ nodeId: 'a', caret: 6 })])
})

it('publishes a zero-result search without applying an absent destination', async () => {
  const { state } = await setup()
  const apply = vi.fn()
  const search = new EditorSearch(apply, new AgendaRowsCache())
  search.update(state())
  search.begin({ nodeId: 'a', offset: 0 })
  search.edit('missing')

  search.confirm()
  search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(apply).not.toHaveBeenCalled()
  expect(search.getResult()).toMatchObject({ kind: 'navigate', total: 0 })
  expect(search.getResult()?.destination).toBeUndefined()
})

it('notifies a jump listener only for applied destinations until it unsubscribes', async () => {
  const { state } = await setup()
  const apply = vi.fn(() => true).mockReturnValueOnce(false)
  const search = new EditorSearch(apply, new AgendaRowsCache())
  const onJump = vi.fn()
  const stop = search.onJump(onJump)
  const origin = { nodeId: 'a', offset: 0 }
  search.update(state())
  search.begin(origin)
  search.edit('apple')

  search.confirm()
  await vi.runAllTimersAsync()

  expect(apply).toHaveBeenCalledOnce()
  expect(onJump).not.toHaveBeenCalled()

  search.navigate(origin, 1, 1)
  await vi.runAllTimersAsync()

  expect(apply).toHaveBeenCalledTimes(2)
  expect(onJump).toHaveBeenCalledOnce()

  stop()
  search.navigate(origin, 1, 1)
  await vi.runAllTimersAsync()

  expect(apply).toHaveBeenCalledTimes(3)
  expect(onJump).toHaveBeenCalledOnce()
})

// @requirement PRODUCT.md §20.2.26
it.each(['toggle', 'close', 'open', 'close-recursive', 'open-recursive'] as const)(
  'transfers only the manually chosen Agenda day for %s',
  (operation) => {
    const search = new EditorSearch(vi.fn(), new AgendaRowsCache())
    search.recordOpenedFold('day:100')
    search.recordOpenedFold('day:101')

    search.manualAgendaFold(
      operation === 'toggle' ? { kind: 'toggle-fold', key: 'day:100' } : { kind: 'fold', key: 'day:100', operation },
    )

    expect(search.takeFoldsToClose(new Set())).toEqual(['day:101'])
    expect(search.takeFoldsToClose(new Set())).toEqual([])
  },
)

it.each(['close-all', 'open-all'] as const)('transfers every Agenda day on a manual %s', (operation) => {
  const search = new EditorSearch(vi.fn(), new AgendaRowsCache())
  search.recordOpenedFold('day:100')
  search.recordOpenedFold('day:101')

  search.manualAgendaFold({ kind: 'fold', key: 'node:100:a', operation })

  expect(search.takeFoldsToClose(new Set())).toEqual([])
})

it('transfers a nonrecursive Tree fold without transferring its children and releases all on a global fold', async () => {
  const { state } = await setup(1, true)
  const search = new EditorSearch(vi.fn(), new AgendaRowsCache())
  search.update(state())
  for (const id of ['a', 'b', 'c']) search.recordOpenedFold(id)

  search.manualFold('a')

  expect(search.takeFoldsToClose(new Set(['c']))).toEqual(['b'])

  for (const id of ['a', 'b', 'd']) search.recordOpenedFold(id)
  search.manualFold('a', true)

  expect(search.takeFoldsToClose(new Set())).toEqual(['d'])

  for (const id of ['a', 'b', 'c']) search.recordOpenedFold(id)
  search.manualFold()

  expect(search.takeFoldsToClose(new Set())).toEqual([])
})

it('tolerates previously opened folds removed by a document edit during a manual recursive fold', async () => {
  const { state } = await setup()
  const search = new EditorSearch(vi.fn(), new AgendaRowsCache())
  const base = state()
  search.update(base)
  search.recordOpenedFold('b')
  search.recordOpenedFold('c')
  search.update({
    ...base,
    document: { roots: [base.document.roots[1]!] },
    location: { currentParentId: null, selectedNodeId: 'c' },
    focus: { ...base.focus, nodeId: 'c', token: base.focus.token + 1 },
  })

  expect(() => search.manualFold('c', true)).not.toThrow()
  expect(search.takeFoldsToClose(new Set())).toEqual(['b'])
})

it('hides confirmed feedback and recounts when moving between two focused Agenda days', async () => {
  const { state } = await setup()
  const search = new EditorSearch(vi.fn(), new AgendaRowsCache())
  const base = {
    ...state(),
    document: {
      roots: [
        { id: 'a', text: 'apple 1970-04-11', children: [] },
        { id: 'b', text: 'apple apple 1970-04-12', children: [] },
      ],
    },
  }
  const agenda = openAgendaState(base.location, 0, 100)
  search.update({ ...base, agenda: focusAgendaState(agenda, 100, 0) })
  search.begin({ beforeDay: 100, offset: 0 })
  search.edit('apple')
  search.confirm()
  await vi.runAllTimersAsync()

  expect(search.session.getSnapshot().count?.total).toBe(1)

  search.update({ ...base, agenda: focusAgendaState(agenda, 101, 0) })

  expect(search.session.getSnapshot()).toMatchObject({ visible: false, confirmed: 'apple' })

  search.begin({ beforeDay: 101, offset: 0 })
  await vi.runAllTimersAsync()

  expect(search.session.getSnapshot().count?.total).toBe(2)
})

async function setup(childCount = 1, nested = false) {
  vi.useFakeTimers()
  const services: EditorServices = {
    load: async () => ({
      version: 1,
      document: {
        roots: [
          {
            id: 'a',
            text: 'apple apple',
            children: Array.from({ length: childCount }, (_, index) => ({
              id: index === 0 ? 'b' : `b-${index}`,
              text: 'apple',
              children: nested ? [{ id: 'nested', text: 'apple', children: [] }] : [],
            })),
          },
          { id: 'c', text: 'apple', children: [{ id: 'd', text: 'apple', children: [] }] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    }),
    save: vi.fn(async () => undefined),
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'new')
  await store.initialize()
  return { store, services, state: () => store.getSnapshot() as ReadySnapshot }
}

it.each(['update', 'ordinary flush', 'expired request'] as const)(
  'handles pending navigation when a save fails for %s',
  async (reason) => {
    const { store, services, state } = await setup()
    store.editText('a', 'Origin!')
    store.search.begin(store.searchOrigin(7))
    store.search.edit('apple')
    store.search.confirm()
    const attempt = new AbortController()
    if (reason === 'expired request') attempt.abort()
    vi.mocked(services.save).mockRejectedValueOnce(new Error('Save failed'))

    await expect(
      store.flushPersistence(reason === 'ordinary flush' ? {} : { sealEditsUntil: attempt.signal }),
    ).rejects.toThrow('Save failed')
    attempt.abort()
    await vi.advanceTimersByTimeAsync(100)

    expect(state().document.roots[0]?.text).toBe('Origin!')
    expect(state().location.selectedNodeId).toBe(reason === 'update' ? 'a' : 'b')
    expect(store.search.session.getSnapshot().confirmed).toBe('apple')
  },
)

it.each([false, true])(
  'saves only completed Find navigation at the final quit seal (completed: %s)',
  async (completed) => {
    const { store, services, state } = await setup()
    store.search.begin(store.searchOrigin(0))
    store.search.edit('apple')
    store.search.confirm()
    await vi.advanceTimersByTimeAsync(20)
    store.selectNode('c', 0)
    store.editText('c', 'Last edit')
    let finishSave!: () => void
    vi.mocked(services.save).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        }),
    )

    const quit = store.flushPersistence({ sealEditsUntil: new AbortController().signal })
    await vi.advanceTimersByTimeAsync(0)
    expect(finishSave).toBeTypeOf('function')
    store.search.navigate(store.searchOrigin(0), 1, 1)
    if (completed) await vi.advanceTimersByTimeAsync(20)
    finishSave()
    await quit
    await vi.advanceTimersByTimeAsync(20)

    const saved = vi.mocked(services.save).mock.lastCall![0]
    expect(state().location.selectedNodeId).toBe(completed ? 'd' : 'c')
    expect(saved.location).toEqual(state().location)
    expect(saved.view?.expandedIds).toEqual([...state().expansion.expandedIds])
    expect(saved.document.roots[1]?.text).toBe('Last edit')
  },
)

it('publishes draft counts and navigation results and stops notifying unsubscribed listeners', async () => {
  const { store } = await setup()
  const listener = vi.fn(() => store.search.getResult())
  const unsubscribe = store.search.subscribe(listener)

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  listener.mockClear()
  await vi.runAllTimersAsync()

  expect(listener).toHaveBeenCalled()
  expect(store.search.getResult()).toBeUndefined()

  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(store.search.getResult()).toMatchObject({ destination: { nodeId: 'a', start: 6 } })
  expect(listener.mock.results.some((result) => result.value?.destination?.start === 6)).toBe(true)

  unsubscribe()
  listener.mockClear()
  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('pear')
  await vi.runAllTimersAsync()

  expect(listener).not.toHaveBeenCalled()
})

it.each(['tree', 'agenda'] as const)(
  'replaces one non-root %s scope with another and releases previous folds',
  async (kind) => {
    const { state } = await setup(3)
    const search = new EditorSearch(vi.fn(), new AgendaRowsCache())
    const scoped = (currentParentId: string, selectedNodeId: string): ReadySnapshot => {
      const location = { currentParentId, selectedNodeId }
      const agenda =
        kind === 'agenda' ? { ...openAgendaState(location, 0, 100), scopeParentId: currentParentId } : undefined
      return { ...state(), location, ...(agenda === undefined ? {} : { agenda }) }
    }
    search.update(scoped('a', 'b'))
    search.begin({ nodeId: 'b', offset: 0 })
    search.edit('apple')
    search.confirm()
    await vi.runAllTimersAsync()

    expect(search.session.getSnapshot().count?.total).toBe(kind === 'tree' ? 5 : 0)

    search.recordOpenedFold('old-fold')
    search.update(scoped('c', 'd'))

    expect(search.session.getSnapshot()).toMatchObject({ visible: false, confirmed: 'apple' })
    expect(search.takeFoldsToClose(new Set())).toEqual([])

    search.begin({ nodeId: 'd', offset: 0 })
    await vi.runAllTimersAsync()

    expect(search.session.getSnapshot().count?.total).toBe(kind === 'tree' ? 2 : 0)
  },
)

it('advances from the actual match when its caret snaps to the start of a combining grapheme', async () => {
  const { store, state } = await setup()
  store.editText('a', 'a\u0301b\u0301')
  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('\u0301')
  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(store.search.getResult()?.destination).toMatchObject({ nodeId: 'a', start: 1, caret: 0 })

  store.search.navigate({ nodeId: 'a', offset: state().focus.cursor }, 1, 1)
  await vi.runAllTimersAsync()

  expect(store.search.getResult()?.destination).toMatchObject({ nodeId: 'a', start: 3, caret: 2 })
  expect(state().focus.cursor).toBe(2)

  // A manual caret selection starts before the accent again.
  store.selectNode('a', 2)
  store.search.navigate({ nodeId: 'a', offset: state().focus.cursor }, 1, 1)
  await vi.runAllTimersAsync()

  expect(store.search.getResult()?.destination).toMatchObject({ nodeId: 'a', start: 3, caret: 2 })
})

it('applies every identical queued repeat and then accepts another jump', async () => {
  const { store, state } = await setup()
  const origin = { nodeId: 'a', offset: 0 }

  store.search.begin(origin)
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate(origin, 1, 1)
  store.search.navigate(origin, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('c')

  store.search.navigate({ nodeId: 'c', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('d')
})

it('serializes rapid jumps started after confirmation has already finished', async () => {
  const { store, state } = await setup()
  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  await vi.runAllTimersAsync()
  const origin = { nodeId: 'a', offset: state().focus.cursor }

  store.search.navigate(origin, 1, 1)
  store.search.navigate(origin, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('c')
  expect(store.search.getResult()?.destination?.nodeId).toBe('c')
})

it('drops queued jumps when their origin is missing before a new valid jump', async () => {
  const { store, state } = await setup()
  const origin = { nodeId: 'a', offset: 0 }
  store.search.begin({ nodeId: 'missing', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate(origin, 1, 1)
  store.search.navigate(origin, 1, 1)
  await vi.runAllTimersAsync()
  expect(store.search.getResult()?.missingOrigin).toBe(true)

  store.search.navigate(origin, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().focus).toMatchObject({ nodeId: 'a', cursor: 6 })
})

it.each(['begin', 'hide'] as const)('clears the old navigation result on %s', async (action) => {
  const { store } = await setup()
  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(store.search.getResult()?.destination).toBeDefined()

  if (action === 'begin') store.search.begin({ nodeId: 'a', offset: 6 })
  else store.disposeSearch()

  expect(store.search.getResult()).toBeUndefined()
})

it('preserves pending navigation on an unchanged publication and fold ownership on an in-scope edit', async () => {
  const { state } = await setup()
  const apply = vi.fn()
  const search = new EditorSearch(apply, new AgendaRowsCache())
  const base = state()
  search.update(base)
  search.begin({ nodeId: 'a', offset: 0 })
  search.edit('apple')
  search.confirm()
  await vi.runAllTimersAsync()
  apply.mockClear()

  search.navigate({ nodeId: 'a', offset: 6 }, 1, 1)
  search.update(base)
  await vi.runAllTimersAsync()

  expect(apply).toHaveBeenCalledOnce()
  expect(apply.mock.calls[0]?.[0]).toMatchObject({ nodeId: 'b' })

  search.recordOpenedFold('a')
  search.update({
    ...base,
    document: { roots: base.document.roots.map((node) => ({ ...node, text: `${node.text}!` })) },
  })

  expect(search.takeFoldsToClose(new Set())).toEqual(['a'])
})

it('keeps different repeat counts distinct while navigation is pending', async () => {
  const { store, state } = await setup()
  const origin = { nodeId: 'a', offset: 0 }

  store.search.begin(origin)
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate(origin, 1, 1)
  store.search.navigate(origin, 1, 2)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('d')
})

it('preserves every destination in a mixed queue of rapid jumps', async () => {
  const { store, state } = await setup()
  const origin = { nodeId: 'a', offset: 0 }
  let previous = state().focus
  const destinations: [string, number][] = []
  const unsubscribe = store.subscribe(() => {
    const focus = state().focus
    if (focus !== previous) destinations.push([focus.nodeId, focus.cursor])
    previous = focus
  })

  store.search.begin(origin)
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate(origin, 1, 1)
  store.search.navigate(origin, -1, 1)
  store.search.navigate(origin, 1, 2)
  store.search.navigate(origin, -1, 1)
  await vi.runAllTimersAsync()
  unsubscribe()

  expect(destinations).toEqual([
    ['a', 6],
    ['b', 0],
    ['a', 6],
    ['c', 0],
    ['b', 0],
  ])
})

it('releases scheduled corpus work when manual input interrupts navigation', async () => {
  const { state } = await setup(2000)
  const apply = vi.fn()
  const search = new EditorSearch(apply, new AgendaRowsCache())
  search.update(state())
  search.begin({ nodeId: 'a', offset: 0 })
  search.edit('apple')
  search.confirm()
  await vi.runAllTimersAsync()
  apply.mockClear()

  search.navigate({ nodeId: 'a', offset: 6 }, 1, 1500)

  expect(vi.getTimerCount()).toBe(1)

  search.interruptNavigation()

  expect(vi.getTimerCount()).toBe(0)

  await vi.runAllTimersAsync()

  expect(apply).not.toHaveBeenCalled()
})

it('confirms backward through the editor from the captured caret', async () => {
  const { store, state } = await setup()
  store.search.begin({ nodeId: 'a', offset: 6 })
  store.search.edit('apple')

  store.search.confirm(-1)
  await vi.runAllTimersAsync()

  expect(state().focus).toMatchObject({ nodeId: 'a', cursor: 0 })
  expect(store.search.getResult()).toMatchObject({ destination: { nodeId: 'a', start: 0 } })
})

it('transfers recursive Tree fold ownership only for descendants', async () => {
  const { store, state } = await setup(1, true)
  const origin = { nodeId: 'a', offset: 0 }
  store.search.begin(origin)
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate(origin, 1, 2)
  await vi.runAllTimersAsync()
  store.search.navigate({ nodeId: 'nested', offset: 0 }, 1, 2)
  await vi.runAllTimersAsync()

  expect(state().expansion.expandedIds).toEqual(new Set(['a', 'b', 'c']))

  store.applyFold('open-recursive', 'a')
  store.search.navigate({ nodeId: 'd', offset: 0 }, -1, 1)
  await vi.runAllTimersAsync()
  store.hideSearch()

  expect(state().expansion.expandedIds).toEqual(new Set(['a', 'b']))
  store.hideSearch()

  expect(state().expansion.expandedIds).toEqual(new Set(['a', 'b']))
})

it('serializes navigation, reveals only ancestors and cleans search-owned folds', async () => {
  const { store, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)
  expect(state().expansion.expandedIds.size).toBe(0)

  store.search.confirm()
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('b')
  expect(state().expansion.expandedIds).toEqual(new Set(['a']))

  store.search.navigate({ nodeId: 'b', offset: 0 }, 1, 2)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('d')

  store.hideSearch()

  expect(state().expansion.expandedIds).toEqual(new Set(['c']))
  expect(store.search.session.getSnapshot()).toMatchObject({ confirmed: 'apple', visible: false })
})

it('resolves a reveal without publishing or mutating the supplied view', async () => {
  const { state } = await setup()
  const before = state()
  const apply = vi.fn()
  const search = new EditorSearch(apply, new AgendaRowsCache())
  const destination = { nodeId: 'b', start: 0, end: 5, caret: 0 }

  const view = search.revealView(before, destination)

  expect(view).toMatchObject({
    kind: 'tree',
    location: { currentParentId: null, selectedNodeId: 'b' },
    focus: { nodeId: 'b', cursor: 0 },
    expansion: { expandedIds: new Set(['a']) },
  })
  expect(view?.focus).not.toHaveProperty('token')
  expect(state()).toBe(before)
  expect(before.expansion.expandedIds.size).toBe(0)
  expect(apply).not.toHaveBeenCalled()

  expect(search.revealView(before, { ...destination, nodeId: 'missing' })).toBeUndefined()
  expect(search.takeFoldsToClose(new Set())).toEqual(['a'])
})

it('disposes search without closing its revealed folds or publishing a new editor view', async () => {
  const { store, state } = await setup()
  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()
  const before = state()
  const publish = vi.fn()
  const unsubscribe = store.subscribe(publish)

  store.disposeSearch()
  await vi.runAllTimersAsync()

  expect(state()).toBe(before)
  expect(state().expansion.expandedIds).toEqual(new Set(['a']))
  expect(store.search.session.getSnapshot().visible).toBe(false)
  expect(publish).not.toHaveBeenCalled()
  unsubscribe()
})

it('does not save query entry and preserves only confirmed recall across presentation changes', async () => {
  const { store, services, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  await vi.runAllTimersAsync()

  expect(services.save).not.toHaveBeenCalled()

  store.search.confirm()
  await vi.runAllTimersAsync()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('draft')
  store.openAgenda()

  expect(store.search.session.getSnapshot()).toMatchObject({ confirmed: 'apple', visible: false })

  store.closeAgenda()
  store.search.begin({ nodeId: state().location.selectedNodeId, offset: 0 })

  expect(store.search.session.getSnapshot().draft).toBe('apple')
})

it('invalidates pending destinations after editing and keeps manual fold choices', async () => {
  const { store, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  store.editText('a', 'changed')
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('a')
  expect(store.search.session.getSnapshot().count?.total).toBe(3)

  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  store.toggleExpansion('a')
  store.toggleExpansion('a')
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 3)
  await vi.runAllTimersAsync()

  store.hideSearch()

  expect(state().expansion.expandedIds.has('a')).toBe(true)
})

it('keeps a newer manual selection authoritative over a pending search jump', async () => {
  const { store, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  store.selectNode('c', 0)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('c')
  expect(state().focus?.cursor).toBe(0)
  expect(store.search.session.getSnapshot()).toMatchObject({ confirmed: 'apple', visible: true })

  store.search.navigate({ nodeId: 'c', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('d')
})

it('recounts structural deletion, split, join and history before navigating current text', async () => {
  const { store, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  store.deleteSelected() // Removes a and its folded child while confirmation is pending.
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('c')
  expect(store.search.session.getSnapshot().count?.total).toBe(2)

  store.undo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)

  store.redo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(2)

  store.undo()
  store.selectNode('a', 2)
  store.createSiblingOrFirstChild(2)
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(4)

  store.selectNode('a', 0)

  expect(store.joinNodes({ count: 2 }, false)).toBe(true)

  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)

  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().focus).toMatchObject({ nodeId: 'a', cursor: 6 })
})

it('replaces scope after subtree moves and retains recall through Undo and Redo', async () => {
  const { store, state } = await setup()

  store.enter()
  store.search.begin({ nodeId: 'b', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(3)
  expect(store.moveNodeToParent('c', 'a', 1)).toBe(true)

  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)
  expect(store.moveNodeToParent('c', null, 1)).toBe(true)
  expect(store.search.session.getSnapshot()).toMatchObject({ confirmed: 'apple', visible: false })
  expect(state().location.currentParentId).toBeNull()

  store.undo()
  store.redo()
  store.search.begin({ nodeId: 'c', offset: 0 })
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot()).toMatchObject({ draft: 'apple', count: { total: 5 } })
})

it('serializes alternating rapid jumps and discards the remaining queue on mutation', async () => {
  const { store, state } = await setup()
  const origin = { nodeId: 'a', offset: 0 }

  store.search.begin(origin)
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate(origin, 1, 3)
  store.search.navigate(origin, -1, 2)
  await vi.runAllTimersAsync()

  expect(state().focus).toMatchObject({ nodeId: 'b', cursor: 0 })

  store.search.navigate({ nodeId: 'b', offset: 0 }, 1, 1)
  store.search.navigate({ nodeId: 'b', offset: 0 }, -1, 1)
  store.editText('b', 'pear')
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('b')
  expect(store.search.session.getSnapshot().count?.total).toBe(4)
})

it('refines pending scans and rejects destinations in a removed large folded branch', async () => {
  const { store, state } = await setup(2000)

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('absent phrase')
  await vi.advanceTimersToNextTimerAsync()

  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1500)
  store.deleteSelected()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count).toEqual({ kind: 'count', total: 2, capped: false })
  expect(state().location.selectedNodeId).toBe('c')

  store.undo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count).toEqual({ kind: 'count', total: 100, capped: true })

  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1500)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('b-1498')
})
