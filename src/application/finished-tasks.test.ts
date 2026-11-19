import { expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import type { Location, TreeNode } from '../domain/document'
import { EditorStore, type EditorServices } from './editor-store'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
const date = '2026-10-08'
const task = (id: string, finished = false): TreeNode => ({
  id,
  text: `${date} task #${id}`,
  ...(finished ? { struckThrough: true, starred: true } : {}),
  children: [],
})

async function harness(roots: TreeNode[], location: Location) {
  let preference = false
  const save = vi.fn<EditorServices['save']>(async () => undefined)
  const load = vi.fn<EditorServices['load']>(async () => ({
    version: 5,
    document: { roots },
    location,
    view: { expandedIds: [] },
  }))
  const loadHideFinishedTasks = vi.fn(async () => preference)
  const saveHideFinishedTasks = vi.fn(async (value: boolean) => {
    preference = value
  })
  const services: EditorServices = {
    load,
    loadHideFinishedTasks,
    saveHideFinishedTasks,
    loadRecentNodes: async () => ['done', 'next'],
    save,
    today: () => today,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const start = async () => {
    const store = new EditorStore(services, () => 'new-root')
    await store.initialize()
    return store
  }
  return { store: await start(), save, load, loadHideFinishedTasks, saveHideFinishedTasks, start }
}

// @requirement PRODUCT.md §2.5
it('ascends from a completed branch, preserves notes, and restarts with the same visibility', async () => {
  const { store, save, saveHideFinishedTasks, start } = await harness(
    [task('before'), { ...task('branch', true), children: [task('done', true)] }, task('next')],
    { currentParentId: 'branch', selectedNodeId: 'done' },
  )

  await store.setHideFinishedTasks(true)
  await store.flushPersistence()

  expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'next' } })
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['before', 'next'])
  expect(saveHideFinishedTasks).toHaveBeenCalledExactlyOnceWith(true)
  expect(save).not.toHaveBeenCalled()
  expect((await start()).getVisibleRows().map((row) => row.node.id)).toEqual(['before', 'next'])
})

it('keeps Agenda occurrence navigation, focused-day rows, and search on the same unfinished tasks', async () => {
  const { store } = await harness([task('before', true), task('done', true), task('next')], {
    currentParentId: null,
    selectedNodeId: 'before',
  })
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:done`, cursor: 4 })

  await store.setHideFinishedTasks(true)

  expect(store.getSnapshot()).toMatchObject({ agenda: { selectedKey: `node:${today}:next` }, focus: { cursor: 4 } })
  expect(
    store
      .getAgendaRows()
      .filter((row) => row.kind === 'node')
      .map((row) => row.nodeId),
  ).toEqual(['next'])
  store.applyAgenda({ kind: 'focus-day', key: `day:${today}`, scrollTop: 0 })
  expect(
    store
      .getAgendaRows()
      .filter((row) => row.kind === 'node')
      .map((row) => row.nodeId),
  ).toEqual(['next'])
  store.search.begin(store.searchOrigin(0))
  store.search.edit('task')
  await vi.waitFor(() => expect(store.search.session.getSnapshot()).toMatchObject({ count: { total: 1 } }))
  expect(store.initialSearchResults().map((node) => node.id)).toEqual(['next'])
  expect(store.searchNodeSuggestions('#d')).toEqual([])
  const results = await new Promise<readonly { id: string }[]>((resolve) => store.searchNodes('task', resolve))
  expect(results.map((node) => node.id)).toEqual(['next'])
})

it('keeps the nearest unfinished parent and the preceding visible row of a completed branch', async () => {
  const branch = { ...task('branch', true), children: [task('done', true)] }
  const container = { ...task('container', true), children: [branch] }
  const { store } = await harness([{ ...task('parent'), children: [task('before'), container] }], {
    currentParentId: 'branch',
    selectedNodeId: 'done',
  })

  await store.setHideFinishedTasks(true)

  expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: 'parent', selectedNodeId: 'before' } })
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['before'])
})

it('normalizes the Tree origin when returning from Agenda after changing the filter there', async () => {
  const branch = { ...task('branch', true), children: [task('done', true)] }
  const { store } = await harness([branch, task('next')], { currentParentId: 'branch', selectedNodeId: 'done' })
  store.openAgenda()

  await store.setHideFinishedTasks(true)
  store.closeAgenda()

  expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'next' } })
})

it('reconciles an entered location and clamps the caret when completion hides the current Tree row', async () => {
  const { store } = await harness(
    [{ ...task('parent'), children: [task('done', true), task('active'), { ...task('next'), text: 'N' }] }],
    { currentParentId: null, selectedNodeId: 'parent' },
  )
  await store.setHideFinishedTasks(true)

  store.enter()
  expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: 'parent', selectedNodeId: 'active' } })
  store.toggleStrikethrough('active', 'active', 8)

  expect(store.getSnapshot()).toMatchObject({
    location: { currentParentId: 'parent', selectedNodeId: 'next' },
    focus: { nodeId: 'next', cursor: 1 },
  })
  await store.flushPersistence()
})

it('keeps the focus request unchanged when a selected Tree row remains visible', async () => {
  const { store } = await harness([task('done', true), task('next')], {
    currentParentId: null,
    selectedNodeId: 'next',
  })
  store.selectNode('next', 4)
  const before = store.getSnapshot()
  if (before.status !== 'ready') throw new Error('Expected ready editor')

  await store.setHideFinishedTasks(true)

  const after = store.getSnapshot()
  if (after.status !== 'ready') throw new Error('Expected ready editor')
  expect(after.focus).toBe(before.focus)
  await store.flushPersistence()
})

it('keeps the active occurrence and its focus request when that Agenda task remains visible', async () => {
  const { store } = await harness([task('done', true), task('next')], { currentParentId: null, selectedNodeId: 'next' })
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:next`, cursor: 4 })
  const before = store.getSnapshot()
  if (before.status !== 'ready') throw new Error('Expected ready editor')

  await store.setHideFinishedTasks(true)

  expect(store.getSnapshot()).toMatchObject({ agenda: { selectedKey: `node:${today}:next` }, focus: before.focus })
})

it('clears the selection when the last root is completed and restores it on undo', async () => {
  const { store } = await harness([task('only')], { currentParentId: null, selectedNodeId: 'only' })
  await store.setHideFinishedTasks(true)

  store.toggleStrikethrough('only', 'only')
  expect(store.treeSelectionHidden).toBe(true)
  expect(store.getVisibleRows()).toEqual([])
  expect(store.toggleStarNode()).toBe(false)
  store.undo()

  expect(store.treeSelectionHidden).toBe(false)
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['only'])
  await store.flushPersistence()
})

it('still finds unfinished descendants in folded branches and rejects hidden destinations', async () => {
  const { store } = await harness([{ id: 'parent', text: 'Folder', children: [task('done', true), task('next')] }], {
    currentParentId: null,
    selectedNodeId: 'parent',
  })
  await store.setHideFinishedTasks(true)
  const before = store.getSnapshot()

  store.selectNode('missing', 0)
  store.selectNode('done', 0)
  store.visitRecentNode('done')

  expect(store.getSnapshot()).toBe(before)
  expect(store.isTaskHidden('missing')).toBe(false)
  expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'parent' } })
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['parent'])
  store.search.begin(store.searchOrigin(0))
  store.search.edit('task')
  await vi.waitFor(() => expect(store.search.session.getSnapshot()).toMatchObject({ count: { total: 1 } }))
  store.search.confirm()

  await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'next' } }))
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['parent', 'next'])
  await store.flushPersistence()
})

it('moves to the preceding Agenda occurrence after completing the last item in a focused day', async () => {
  const { store } = await harness([task('before'), task('next')], {
    currentParentId: null,
    selectedNodeId: 'before',
  })
  await store.setHideFinishedTasks(true)
  store.openAgenda()
  store.applyAgenda({ kind: 'focus-day', key: `day:${today}`, scrollTop: 0 })
  store.applyAgenda({ kind: 'select', key: `node:${today}:next`, cursor: 2 })

  store.toggleStrikethrough('next', 'next', 5)

  expect(store.getSnapshot()).toMatchObject({
    agenda: { selectedKey: `node:${today}:before` },
    focus: { nodeId: 'before', cursor: 5 },
  })
  store.toggleStrikethrough('before', 'before')
  expect(store.getSnapshot()).toMatchObject({ agenda: { selectedKey: `day:${today}` } })
  expect(store.getAgendaRows()).toEqual([expect.objectContaining({ kind: 'day', content: false })])
  await store.flushPersistence()
})

it('keeps completion navigation within Overdue before falling back to a day heading', async () => {
  const overdue = (id: string) => ({ ...task(id), text: `2026-10-01 Task ${id}` })
  const { store } = await harness([overdue('old'), overdue('next'), task('today')], {
    currentParentId: null,
    selectedNodeId: 'old',
  })
  await store.setHideFinishedTasks(true)
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today - 7}:old`, cursor: 4 })

  store.toggleStrikethrough('old', 'old')
  expect(store.getSnapshot()).toMatchObject({
    agenda: { selectedKey: `node:${today - 7}:next` },
    focus: { nodeId: 'next', cursor: 4 },
  })
  store.toggleStrikethrough('next', 'next')

  expect(store.getSnapshot()).toMatchObject({ agenda: { selectedKey: `day:${today - 3}` } })
  await store.flushPersistence()
})

it('handles preference write and read failure without hiding tasks', async () => {
  const { store, loadHideFinishedTasks, saveHideFinishedTasks, start } = await harness([task('done', true)], {
    currentParentId: null,
    selectedNodeId: 'done',
  })
  saveHideFinishedTasks.mockRejectedValueOnce(new Error('Disk full'))

  await expect(store.setHideFinishedTasks(true)).rejects.toThrow('Disk full')
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['done'])

  const hide = store.setHideFinishedTasks(true)
  const show = store.setHideFinishedTasks(false)
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['done'])
  await Promise.all([hide, show])

  expect(saveHideFinishedTasks.mock.calls).toEqual([[true], [true], [false]])
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['done'])

  await store.setHideFinishedTasks(true)
  loadHideFinishedTasks.mockRejectedValueOnce(new Error('Unreadable preference'))
  expect((await start()).getVisibleRows().map((row) => row.node.id)).toEqual(['done'])
})

it('writes a changed preference once and finishes pending editing before hiding its target', async () => {
  const { store, saveHideFinishedTasks } = await harness([task('done', true)], {
    currentParentId: null,
    selectedNodeId: 'done',
  })
  const finish = vi.fn(() => {
    store.editText('done', 'Final text')
    return true
  })
  const unregister = store.registerPendingEditFinisher(finish)

  await store.setHideFinishedTasks(false)
  await Promise.all([store.setHideFinishedTasks(true), store.setHideFinishedTasks(true)])
  unregister()
  const hidden = store.getSnapshot()

  store.enter()

  expect(store.getSnapshot()).toBe(hidden)
  expect(saveHideFinishedTasks).toHaveBeenCalledExactlyOnceWith(true)
  expect(finish).toHaveBeenCalledOnce()
  expect(store.getSnapshot()).toMatchObject({
    location: { currentParentId: null },
    document: { roots: [{ id: 'done', text: 'Final text', struckThrough: true }] },
  })
  expect(store.getVisibleRows()).toEqual([])
  await store.flushPersistence()
})

it('updates cached rows when visibility changes and opens search results from the current filter', async () => {
  const { store } = await harness([task('done', true), task('next'), task('start')], {
    currentParentId: null,
    selectedNodeId: 'start',
  })
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['done', 'next', 'start'])

  await store.setHideFinishedTasks(true)

  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['next', 'start'])
  store.visitRecentNode('next')
  expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'next' } })

  await store.setHideFinishedTasks(false)

  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['done', 'next', 'start'])
  expect(store.isTaskHidden('done')).toBe(false)
  store.visitRecentNode('done')
  expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'done' } })
  await store.flushPersistence()
})

it.each([false, true])(
  'uses the profile visibility setting %s when starting an empty document',
  async (hideFinishedTasks) => {
    const { store, load, start } = await harness([task('old')], { currentParentId: null, selectedNodeId: 'old' })
    await store.setHideFinishedTasks(hideFinishedTasks)
    load.mockResolvedValueOnce(null)
    const restarted = await start()

    restarted.toggleStrikethrough('new-root', 'new-root')

    expect(restarted.getVisibleRows().map(({ node }) => node.id)).toEqual(hideFinishedTasks ? [] : ['new-root'])
    await restarted.flushPersistence()
  },
)

it('closes unused search reveals when changing the finished-task filter', async () => {
  const { store } = await harness(
    [
      { id: 'a', text: 'First branch', children: [{ id: 'first', text: 'needle', children: [] }] },
      { id: 'b', text: 'Second branch', children: [{ id: 'second', text: 'needle', children: [] }] },
    ],
    { currentParentId: null, selectedNodeId: 'a' },
  )
  store.search.begin(store.searchOrigin(0))
  store.search.edit('needle')
  store.search.confirm()
  await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'first' } }))
  store.search.navigate(store.searchOrigin(0), 1, 1)
  await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'second' } }))
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['a', 'first', 'b', 'second'])

  await store.setHideFinishedTasks(true)

  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['a', 'b', 'second'])
  expect(store.search.session.getSnapshot()).toMatchObject({ visible: false, confirmed: 'needle' })
  await store.flushPersistence()
})

it('discards a pending paste when its target becomes the hidden Tree anchor', async () => {
  const { store, save } = await harness([task('done', true)], { currentParentId: null, selectedNodeId: 'done' })
  type Clipboard = Awaited<ReturnType<EditorServices['readClipboard']>>
  let completeRead!: (value: Clipboard) => void
  const clipboard = new Promise<Clipboard>((resolve) => {
    completeRead = resolve
  })
  const readClipboard = vi.fn(() => clipboard)
  const paste = store.paste('done', 0, readClipboard)
  await vi.waitFor(() => expect(readClipboard).toHaveBeenCalledOnce())

  await store.setHideFinishedTasks(true)
  completeRead({ kind: 'text', text: 'Unexpected edit' })
  await paste
  await store.flushPersistence()

  expect(store.getSnapshot()).toMatchObject({ document: { roots: [task('done', true)] } })
  expect(save).not.toHaveBeenCalled()
})
