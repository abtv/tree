import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'

afterEach(() => vi.useRealTimers())

it('does not write an absent Vim register to an available clipboard service', async () => {
  const writeClipboardContent = vi.fn<NonNullable<EditorServices['writeClipboardContent']>>(async () => undefined)
  const store = await setup({ writeClipboardContent })

  expect(await store.copyVimContent(undefined)).toBe(false)
  expect(writeClipboardContent).not.toHaveBeenCalled()
})

it.each(['recent', 'agenda-history'] as const)('invalidates renderer layout after %s navigation', async (command) => {
  vi.useFakeTimers()
  const store = await setup()
  if (command === 'agenda-history') {
    store.openAgenda()
    store.editText('root', 'Changed')
  }
  const before = store.getSnapshot()
  if (before.status !== 'ready') throw new Error('Expected ready editor')

  if (command === 'recent') store.visitRecentNode('other')
  else store.undo()

  const after = store.getSnapshot()
  if (after.status !== 'ready') throw new Error('Expected ready editor')
  expect(after.structuralVersion).toBeGreaterThan(before.structuralVersion)
})

it('does not save the view when hiding search has no folds to close', async () => {
  vi.useFakeTimers()
  const save = vi.fn<EditorServices['save']>(async () => undefined)
  const store = await setup({ save })
  await store.flushPersistence()
  save.mockClear()

  store.hideSearch()
  await store.flushPersistence()

  expect(save).not.toHaveBeenCalled()
})

it('keeps search ownership of descendants after a nonrecursive manual fold', async () => {
  vi.useFakeTimers()
  const store = await setup({
    load: async () => ({
      version: 1,
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [{ id: 'context', text: 'Context', children: [{ id: 'match', text: 'needle', children: [] }] }],
          },
          { id: 'other', text: 'Other', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }),
  })
  store.search.begin(store.searchOrigin(0))
  store.search.edit('needle')
  store.search.confirm()
  await vi.advanceTimersByTimeAsync(100)
  store.selectNode('other', 0)

  store.applyFold('open', 'root')
  store.hideSearch()

  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['root', 'context', 'other'])
})

it('keeps search ownership of other branches when manually opening one branch', async () => {
  vi.useFakeTimers()
  const store = await setup({
    load: async () => ({
      version: 1,
      document: {
        roots: [
          { id: 'root', text: 'Root', children: [{ id: 'match', text: 'needle', children: [] }] },
          { id: 'other', text: 'Other', children: [{ id: 'child', text: 'Child', children: [] }] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }),
  })
  store.search.begin(store.searchOrigin(0))
  store.search.edit('needle')
  store.search.confirm()
  await vi.advanceTimersByTimeAsync(100)
  store.selectNode('other', 0)

  store.applyFold('open', 'other')
  store.hideSearch()

  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['root', 'other', 'child'])
})

it.each(['backspace', 'empty-selection'] as const)('uses the visible preceding descendant for %s', async (command) => {
  vi.useFakeTimers()
  const store = await setup({
    load: async () => ({
      version: 4,
      document: {
        roots: [
          {
            id: 'before',
            text: 'Before',
            children: [{ id: 'child', text: command === 'backspace' ? '' : 'Child', children: [] }],
          },
          { id: 'root', text: command === 'backspace' ? 'Root' : '', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
      view: { expandedIds: ['before'] },
    }),
  })

  if (command === 'backspace') expect(store.backspaceAtStart(0)).toBe(true)
  else store.deleteEmptySelected()

  expect(store.getSnapshot()).toMatchObject({
    document: {
      roots:
        command === 'backspace'
          ? [
              { id: 'before', children: [] },
              { id: 'root', text: 'Root' },
            ]
          : [{ id: 'before', children: [{ id: 'child', text: 'Child' }] }],
    },
    focus: { nodeId: command === 'backspace' ? 'root' : 'child', cursor: command === 'backspace' ? 0 : 5 },
  })
})

it('puts a subtree before an expanded node as its sibling', async () => {
  vi.useFakeTimers()
  const store = await setup({
    load: async () => ({
      version: 4,
      document: { roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
      view: { expandedIds: ['root'] },
    }),
  })

  expect(store.pasteSubtree('root', 'before', { id: 'source', text: 'Pasted', children: [] })).toBe(true)

  expect(store.getSnapshot()).toMatchObject({
    document: {
      roots: [
        { id: 'created', text: 'Pasted', children: [] },
        { id: 'root', children: [{ id: 'child', text: 'Child', children: [] }] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'created' },
  })
})

it.each(['copy', 'vim'] as const)('clears a failed %s write before a later paste', async (kind) => {
  vi.useFakeTimers()
  const fail = async () => {
    throw new Error('Clipboard unavailable')
  }
  const store = await setup({
    writeClipboard: fail,
    writeClipboardContent: fail,
    readClipboard: async () => ({ kind: 'text', text: ' pasted' }),
  })

  await expect(
    kind === 'copy' ? store.copy('root', 0, 4) : store.copyVimContent({ kind: 'text', text: 'root' }),
  ).rejects.toThrow('Clipboard unavailable')
  await store.paste('root', 4)

  expect(store.getSnapshot()).toMatchObject({
    document: { roots: [{ id: 'root', text: 'root pasted' }, { id: 'other' }] },
  })
})

it.each([false, true])(
  'retains a finite saved row position when measurement is invalid (Agenda: %s)',
  async (agenda) => {
    vi.useFakeTimers()
    const save = vi.fn<EditorServices['save']>(async () => undefined)
    const store = await setup({
      save,
      load: async () => ({
        version: 4,
        document: { roots: [{ id: 'root', text: 'root', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'root' },
        view: { expandedIds: [], selectedRowTop: 40 },
      }),
    })
    store.registerSelectedRowTopReader(() => NaN)
    if (agenda) store.openAgenda()

    store.editText('root', 'changed')
    await store.flushPersistence()

    expect(save).toHaveBeenCalled()
    expect(save.mock.calls.at(-1)?.[0].view?.selectedRowTop).toBe(40)
  },
)

it('restores an expanded descendant and its cursor when closing Agenda', async () => {
  vi.useFakeTimers()
  const store = await setup({
    load: async () => ({
      version: 4,
      document: { roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      location: { currentParentId: null, selectedNodeId: 'child' },
      view: { expandedIds: ['root'] },
    }),
  })
  store.openAgenda(3)

  store.closeAgenda()

  expect(store.getSnapshot()).toMatchObject({
    location: { currentParentId: null, selectedNodeId: 'child' },
    focus: { nodeId: 'child', cursor: 3 },
  })
})

async function setup(overrides: Partial<EditorServices> = {}) {
  const store = new EditorStore(
    {
      load: async () => ({
        version: 1,
        document: { roots: ['root', 'other'].map((id) => ({ id, text: id, children: [] })) },
        location: { currentParentId: null, selectedNodeId: 'root' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
      ...overrides,
    },
    () => 'created',
  )
  await store.initialize()
  return store
}

it('persists the location of a recent-node visit without requiring an edit', async () => {
  vi.useFakeTimers()
  const save = vi.fn<EditorServices['save']>(async () => undefined)
  const store = await setup({ save })

  store.visitRecentNode('other')
  await store.flushPersistence()

  expect(save).toHaveBeenCalledOnce()
  expect(save.mock.calls[0]?.[0].location).toEqual({ currentParentId: null, selectedNodeId: 'other' })
})

it('starts a new typing undo entry after visiting the same recent node', async () => {
  vi.useFakeTimers()
  const store = await setup()
  store.editText('root', 'Typed')

  store.visitRecentNode('root')
  store.editText('root', 'Later')
  store.undo()

  expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ id: 'root', text: 'Typed' }, { id: 'other' }] } })
})

it('reveals a search match inside a nested scope without expanding ancestors outside that scope', async () => {
  vi.useFakeTimers()
  const store = await setup({
    load: async () => ({
      version: 1,
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              {
                id: 'scope',
                text: 'Scope',
                children: [
                  { id: 'context', text: 'Context', children: [{ id: 'leaf', text: 'needle', children: [] }] },
                ],
              },
            ],
          },
        ],
      },
      location: { currentParentId: 'scope', selectedNodeId: 'context' },
    }),
  })

  store.search.begin({ nodeId: 'context', offset: 0 })
  store.search.edit('needle')
  store.search.confirm()
  await vi.runAllTimersAsync()

  const state = store.getSnapshot()
  if (state.status !== 'ready') throw new Error('Expected ready editor')
  expect(state.location).toEqual({ currentParentId: 'scope', selectedNodeId: 'leaf' })
  expect([...state.expansion.expandedIds]).toEqual(['context'])
  expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['context', 'leaf'])
})

it.each(['open-all', 'open-recursive'] as const)('retains manual %s folds when hiding search', async (command) => {
  vi.useFakeTimers()
  const store = await setup({
    load: async () => ({
      version: 1,
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [{ id: 'child', text: 'Child', children: [{ id: 'leaf', text: 'needle', children: [] }] }],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }),
  })
  store.search.begin({ nodeId: 'root', offset: 0 })
  store.search.edit('needle')
  store.search.confirm()
  await vi.runAllTimersAsync()
  store.selectNode('root', 0)

  store.applyFold(command, 'root')
  store.hideSearch()

  const state = store.getSnapshot()
  if (state.status !== 'ready') throw new Error('Expected ready editor')
  expect([...state.expansion.expandedIds]).toEqual(['root', 'child'])
})

it('persists search navigation and closing search-owned folds independently', async () => {
  vi.useFakeTimers()
  const save = vi.fn<EditorServices['save']>(async () => undefined)
  const store = await setup({
    save,
    load: async () => ({
      version: 1,
      document: {
        roots: ['root', 'other'].map((id) => ({
          id,
          text: id,
          children: [{ id: `${id}-child`, text: 'needle', children: [] }],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }),
  })
  store.search.begin({ nodeId: 'root', offset: 0 })
  store.search.edit('needle')
  store.search.confirm()
  await vi.runAllTimersAsync()
  store.search.navigate({ nodeId: 'root-child', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()
  await store.flushPersistence()

  expect(save.mock.calls.at(-1)?.[0].location.selectedNodeId).toBe('other-child')
  expect(save.mock.calls.at(-1)?.[0].view?.expandedIds).toEqual(['root', 'other'])

  save.mockClear()
  store.hideSearch()
  await store.flushPersistence()

  expect(save).toHaveBeenCalledOnce()
  expect(save.mock.calls[0]?.[0].view?.expandedIds).toEqual(['other'])
})

it('reports failed emoji preference writes through the editor snapshot', async () => {
  const store = await setup({
    saveEmojiHistory: async () => {
      throw new Error('Emoji write failed')
    },
  })

  store.emojiHistory.remember('rocket')
  await expect(store.emojiHistory.flush()).rejects.toThrow('Emoji write failed')

  expect(store.getSnapshot()).toMatchObject({ status: 'ready', operationError: 'Emoji write failed' })
})

it('reports failed scheduled recent-node writes through the editor snapshot', async () => {
  vi.useFakeTimers()
  const store = await setup({
    saveRecentNodes: async () => {
      throw new Error('Recent write failed')
    },
  })

  store.visitRecentNode('other')
  await vi.advanceTimersByTimeAsync(30_000)

  expect(store.getSnapshot()).toMatchObject({ status: 'ready', operationError: 'Recent write failed' })
})

it('keeps initialization available when optional preference reads fail', async () => {
  const store = await setup({
    loadEmojiHistory: async () => {
      throw new Error('Emoji read failed')
    },
    loadRecentNodes: async () => {
      throw new Error('Recent read failed')
    },
  })

  expect(store.getSnapshot()).toMatchObject({ status: 'ready', location: { selectedNodeId: 'root' } })
  expect(store.recentNodes.getIds()).toEqual([])
  expect(store.emojiHistory.suggestions.length).toBeGreaterThan(0)
})

it('waits for the newer Vim clipboard write when an older write completes first', async () => {
  vi.useFakeTimers()
  let finishFirst!: () => void
  let finishSecond!: () => void
  const first = new Promise<void>((resolve) => {
    finishFirst = resolve
  })
  const second = new Promise<void>((resolve) => {
    finishSecond = resolve
  })
  const writeClipboardContent = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
  const readClipboard = vi.fn<EditorServices['readClipboard']>(async () => ({ kind: 'text', text: 'new' }))
  const store = await setup({ writeClipboardContent, readClipboard })
  const copyFirst = store.copyVimContent({ kind: 'text', text: 'old' })
  const copySecond = store.copyVimContent({ kind: 'text', text: 'new' })
  finishFirst()
  await copyFirst

  const paste = store.paste('root', 4)
  await Promise.resolve()
  await Promise.resolve()

  expect(readClipboard).not.toHaveBeenCalled()

  finishSecond()
  await copySecond
  await paste

  expect(readClipboard).toHaveBeenCalledOnce()
  expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ id: 'root', text: 'rootnew' }, { id: 'other' }] } })
})
