import { describe, expect, it, vi } from 'vitest'
import { EditorStore, type ClipboardValue, type Clock, type EditorServices } from './editor-store'
import {
  displayedNodes,
  MAX_DOCUMENT_DEPTH,
  MAX_DOCUMENT_DEPTH_ERROR,
  reconcileLinkTextEdit,
  type TreeNode,
} from '../domain/document'

class FakeClock implements Clock {
  private readonly timers = new Map<number, () => void>()
  private nextId = 1

  public setTimeout(callback: () => void): number {
    const id = this.nextId
    this.nextId += 1
    this.timers.set(id, callback)
    return id
  }

  public clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number)
  }

  public runAll(): void {
    const callbacks = [...this.timers.values()]
    this.timers.clear()
    for (const callback of callbacks) callback()
  }
}

function createServices(clipboard: ClipboardValue = { kind: 'text', text: '' }): EditorServices & { saves: unknown[] } {
  const saves: unknown[] = []
  return {
    saves,
    load: async () => null,
    save: async (state) => {
      saves.push(state)
    },
    readClipboard: async () => clipboard,
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
}

function ids(...values: string[]): () => string {
  let index = 0
  return () => values[index++] ?? `id-${index}`
}

function loadedState(document: unknown, location: unknown): EditorServices & { saves: unknown[] } {
  const services = createServices()
  services.load = async () => ({ version: 1, document, location })
  return services
}

function deferredSaveServices(): {
  services: EditorServices & { saves: unknown[] }
  pending: Array<{ resolve: () => void; reject: (error: Error) => void }>
} {
  const services = loadedState(
    { roots: [{ id: 'root', text: '', children: [] }] },
    { currentParentId: null, selectedNodeId: 'root' },
  )
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = []
  services.save = (state) => {
    services.saves.push(state)
    return new Promise<void>((resolve, reject) => {
      pending.push({ resolve, reject })
    })
  }
  return { services, pending }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function lockEditor(
  clock: FakeClock,
): Promise<{ store: EditorStore; services: EditorServices & { saves: unknown[] }; attempts: () => number }> {
  const services = createServices()
  let attempts = 0
  const store = new EditorStore(services, ids('root'), clock)
  await store.initialize()
  await store.flushPersistence()
  services.saves.length = 0
  services.save = async () => {
    attempts += 1
    throw new Error('disk full')
  }
  store.editText('root', 'one two three four five six seven eight nine ten')
  await tick()
  clock.runAll()
  await tick()
  clock.runAll()
  await tick()
  return { store, services, attempts: () => attempts }
}

describe('EditorStore', () => {
  it('owns expansion and memoizes visible rows until document, location, or expansion changes', async () => {
    const store = new EditorStore(
      loadedState(
        {
          roots: [
            {
              id: 'root',
              text: 'Root',
              children: [
                { id: 'child', text: 'Child', children: [{ id: 'grandchild', text: 'Grandchild', children: [] }] },
              ],
            },
          ],
        },
        { currentParentId: null, selectedNodeId: 'root' },
      ),
      ids('unused'),
      new FakeClock(),
    )
    await store.initialize()
    const collapsedRows = store.getVisibleRows()
    expect(collapsedRows.map((row) => row.node.id)).toEqual(['root'])
    expect(store.getVisibleRows()).toBe(collapsedRows)
    store.toggleExpansion('root')
    const expandedRows = store.getVisibleRows()
    expect(expandedRows.map((row) => row.node.id)).toEqual(['root', 'child'])
    expect(expandedRows).not.toBe(collapsedRows)
    store.selectNode('child', 1)
    expect(store.getVisibleRows()).toBe(expandedRows)
    store.editText('child', 'Updated child')
    const editedRows = store.getVisibleRows()
    expect(editedRows).not.toBe(expandedRows)
    store.toggleExpansion('root')
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      location: { selectedNodeId: 'root' },
      focus: { nodeId: 'root', cursor: 0 },
    })
  })

  describe('remembered expansion', () => {
    // root ─ child ─ grandchild ─ leaf, plus a second root 'other' with one child.
    const nestedDocument = {
      roots: [
        {
          id: 'root',
          text: 'Root',
          children: [
            {
              id: 'child',
              text: 'Child',
              children: [
                { id: 'grandchild', text: 'Grandchild', children: [{ id: 'leaf', text: 'Leaf', children: [] }] },
              ],
            },
          ],
        },
        { id: 'other', text: 'Other', children: [{ id: 'other-child', text: 'Other child', children: [] }] },
      ],
    }

    function viewState(document: unknown, location: unknown, view: unknown): EditorServices & { saves: unknown[] } {
      const services = createServices()
      services.load = async () => ({ version: 3, document, location, view })
      return services
    }

    function rowIds(store: EditorStore): string[] {
      return store.getVisibleRows().map((row) => row.node.id)
    }

    it('keeps each node’s expansion across entering, leaving, and breadcrumb navigation', async () => {
      const store = new EditorStore(
        loadedState(nestedDocument, { currentParentId: null, selectedNodeId: 'root' }),
        ids('unused'),
        new FakeClock(),
      )
      await store.initialize()
      store.toggleExpansion('root')
      store.toggleExpansion('child')
      expect(rowIds(store)).toEqual(['root', 'child', 'grandchild', 'other'])

      store.enter()
      expect(rowIds(store)).toEqual(['child', 'grandchild'])
      store.selectNode('child', 0)
      store.enter()
      expect(rowIds(store)).toEqual(['grandchild'])
      store.navigateToAncestor(null)
      expect(rowIds(store)).toEqual(['root', 'child', 'grandchild', 'other'])
      store.selectNode('child', 0)
      store.enter()
      store.leave()
      expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: 'root', selectedNodeId: 'child' } })
      expect(rowIds(store)).toEqual(['child', 'grandchild'])
    })

    it('saves an expansion change by the idle and quit triggers without an undo entry', async () => {
      const clock = new FakeClock()
      const services = loadedState(nestedDocument, { currentParentId: null, selectedNodeId: 'root' })
      const store = new EditorStore(services, ids('unused'), clock)
      await store.initialize()

      store.toggleExpansion('root')
      expect(services.saves).toHaveLength(0)
      clock.runAll()
      await store.flushPersistence()
      expect(services.saves.at(-1)).toMatchObject({ version: 3, view: { expandedIds: ['root'] } })

      store.applyFold('open', 'child')
      await store.flushPersistence()
      expect(services.saves.at(-1)).toMatchObject({ view: { expandedIds: ['root', 'child'] } })

      store.undo()
      expect(rowIds(store)).toEqual(['root', 'child', 'grandchild', 'other'])
    })

    it('restores expansion and a descendant selection it displays after a restart', async () => {
      const store = new EditorStore(
        viewState(
          nestedDocument,
          { currentParentId: null, selectedNodeId: 'grandchild' },
          { expandedIds: ['root', 'child'] },
        ),
        ids('unused'),
        new FakeClock(),
      )
      await store.initialize()

      expect(rowIds(store)).toEqual(['root', 'child', 'grandchild', 'other'])
      expect(store.getSnapshot()).toMatchObject({
        location: { currentParentId: null, selectedNodeId: 'grandchild' },
        focus: { nodeId: 'grandchild', cursor: 0 },
      })
    })

    it('moves a restored selection hidden by a collapsed ancestor to the nearest displayed row', async () => {
      const store = new EditorStore(
        viewState(nestedDocument, { currentParentId: null, selectedNodeId: 'leaf' }, { expandedIds: ['root'] }),
        ids('unused'),
        new FakeClock(),
      )
      await store.initialize()

      expect(store.getSnapshot()).toMatchObject({
        location: { currentParentId: null, selectedNodeId: 'child' },
        focus: { nodeId: 'child', cursor: 0 },
      })
    })

    it('closes only the folds inside the current location with zM', async () => {
      const store = new EditorStore(
        viewState(
          nestedDocument,
          { currentParentId: 'root', selectedNodeId: 'grandchild' },
          { expandedIds: ['root', 'child', 'grandchild', 'other'] },
        ),
        ids('unused'),
        new FakeClock(),
      )
      await store.initialize()
      expect(rowIds(store)).toEqual(['child', 'grandchild', 'leaf'])

      store.applyFold('close-all')
      expect(rowIds(store)).toEqual(['child'])
      expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'child' }, focus: { cursor: 0 } })

      store.navigateToAncestor(null)
      expect(rowIds(store)).toEqual(['root', 'child', 'other', 'other-child'])
      store.applyFold('close-all')
      expect(rowIds(store)).toEqual(['root', 'other'])
    })

    it('restores the selected row position and saves the live measurement on a viewport change', async () => {
      const clock = new FakeClock()
      const services = viewState(
        nestedDocument,
        { currentParentId: null, selectedNodeId: 'root' },
        { expandedIds: [], selectedRowTop: 240 },
      )
      const store = new EditorStore(services, ids('unused'), clock)
      expect(store.getRestoredSelectedRowTop()).toBeUndefined()
      store.noteViewportChange()
      await store.initialize()
      expect(store.getRestoredSelectedRowTop()).toBe(240)
      await store.flushPersistence()
      expect(services.saves).toHaveLength(0)

      let measured: number | undefined = 512.6
      const unregister = store.registerSelectedRowTopReader(() => measured)
      store.noteViewportChange()
      expect(services.saves).toHaveLength(0)
      clock.runAll()
      await store.flushPersistence()
      expect(services.saves.at(-1)).toMatchObject({ view: { expandedIds: [], selectedRowTop: 513 } })

      // A reading with no rendered row, or a non-finite one, keeps the last known value.
      measured = undefined
      store.toggleExpansion('root')
      await store.flushPersistence()
      expect(services.saves.at(-1)).toMatchObject({ view: { selectedRowTop: 513 } })
      measured = Number.NaN
      store.toggleExpansion('root')
      await store.flushPersistence()
      expect(services.saves.at(-1)).toMatchObject({ view: { selectedRowTop: 513 } })

      unregister()
      measured = 7
      store.toggleExpansion('root')
      await store.flushPersistence()
      expect(services.saves.at(-1)).toMatchObject({ view: { selectedRowTop: 513 } })
      expect(store.getRestoredSelectedRowTop()).toBe(240)
    })

    it('never postpones an idle save already armed when the user scrolls', async () => {
      const clock = new FakeClock()
      const services = loadedState(nestedDocument, { currentParentId: null, selectedNodeId: 'root' })
      const store = new EditorStore(services, ids('unused'), clock)
      await store.initialize()
      store.editText('root', 'Root edited')
      const clearTimeout = vi.spyOn(clock, 'clearTimeout')
      const setTimeout = vi.spyOn(clock, 'setTimeout')

      store.noteViewportChange()
      store.noteViewportChange()
      expect(clearTimeout).not.toHaveBeenCalled()
      expect(setTimeout).not.toHaveBeenCalled()

      clock.runAll()
      await store.flushPersistence()
      expect(services.saves).toHaveLength(1)

      // With nothing armed, a scroll arms the idle save itself.
      store.noteViewportChange()
      expect(setTimeout).toHaveBeenCalledOnce()
    })

    it('omits the selected row position while nothing has measured it', async () => {
      const services = loadedState(nestedDocument, { currentParentId: null, selectedNodeId: 'root' })
      const store = new EditorStore(services, ids('unused'), new FakeClock())
      await store.initialize()
      expect(store.getRestoredSelectedRowTop()).toBeUndefined()

      store.toggleExpansion('root')
      await store.flushPersistence()
      expect(services.saves.at(-1)).toMatchObject({ view: { expandedIds: ['root'] } })
      expect((services.saves.at(-1) as { view: object }).view).not.toHaveProperty('selectedRowTop')
    })

    it('keeps an undo site displayed after navigation left its branch expanded', async () => {
      const store = new EditorStore(
        loadedState(nestedDocument, { currentParentId: null, selectedNodeId: 'root' }),
        ids('unused'),
        new FakeClock(),
      )
      await store.initialize()
      store.toggleExpansion('root')
      store.toggleExpansion('child')
      store.editText('grandchild', 'Edited')
      store.selectNode('other', 0)
      store.enter()

      store.undo()
      expect(store.getSnapshot()).toMatchObject({
        location: { currentParentId: 'child', selectedNodeId: 'grandchild' },
      })
      expect(rowIds(store)).toContain('grandchild')
    })

    it('keeps the location when undoing the deletion of a visible descendant', async () => {
      const store = new EditorStore(
        loadedState(nestedDocument, { currentParentId: null, selectedNodeId: 'root' }),
        ids('unused'),
        new FakeClock(),
      )
      await store.initialize()
      store.toggleExpansion('root')
      store.toggleExpansion('child')
      store.selectNode('grandchild', 0)

      store.deleteSelected()
      expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'child' } })

      store.undo()
      expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'grandchild' } })
      expect(rowIds(store)).toContain('grandchild')

      store.redo()
      expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'child' } })
      expect(rowIds(store)).not.toContain('grandchild')
    })

    it('keeps the location for Backspace on an empty visible descendant and for undoing a visible text edit', async () => {
      const store = new EditorStore(
        loadedState(nestedDocument, { currentParentId: null, selectedNodeId: 'root' }),
        ids('unused'),
        new FakeClock(),
      )
      await store.initialize()
      for (const id of ['root', 'child', 'grandchild']) store.toggleExpansion(id)
      store.editText('leaf', 'Edited')
      store.selectNode('other', 0)
      store.undo()
      expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'leaf' } })

      store.editText('leaf', '')
      store.deleteEmptySelected()
      expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'grandchild' } })
      store.undo()
      expect(store.getSnapshot()).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'leaf' } })
    })
  })
  it('edits a whole-node Visual sibling range in one undo step and rejects paste into a source descendant', async () => {
    const services = loadedState(
      {
        roots: [
          { id: 'a', text: 'A', children: [{ id: 'a-child', text: 'child', children: [] }] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('new-node', 'copy-a', 'copy-child', 'copy-b'))
    await store.initialize()
    const forest = store.applyNodeVisual('y', 'a', 'b')!
    expect(forest.nodes.map((node) => node.id)).toEqual(['a', 'b'])
    expect(forest.nodes[0]?.children[0]?.id).toBe('a-child')
    store.enter()
    const before = store.getSnapshot()
    expect(store.pasteNodeForest('a-child', 'after', forest)).toBe(false)
    expect(store.applyNodeVisual('p', 'a-child', 'a-child', forest)).toBeUndefined()
    const rejected = store.getSnapshot()
    expect(rejected.status).toBe('ready')
    if (rejected.status !== 'ready') throw new Error('Editor did not load')
    expect(rejected.document).toBe(before.status === 'ready' ? before.document : undefined)
    expect(rejected.operationError).toMatch(/descendant/u)
    store.leave()
    store.applyNodeVisual('d', 'a', 'b')
    const deleted = store.getSnapshot()
    expect(deleted.status).toBe('ready')
    if (deleted.status !== 'ready') throw new Error('Editor did not load')
    expect(deleted.document.roots.map((node) => node.id)).toEqual(['c'])
    store.undo()
    const restored = store.getSnapshot()
    expect(restored.status).toBe('ready')
    if (restored.status !== 'ready') throw new Error('Editor did not load')
    expect(restored.document.roots.map((node) => node.id)).toEqual(['a', 'b', 'c'])
  })

  it('pastes a node forest with fresh IDs and changes case through selected descendants', async () => {
    const services = loadedState(
      {
        roots: [
          { id: 'a', text: 'Ab', children: [{ id: 'a-child', text: 'Cd', children: [] }] },
          { id: 'b', text: 'Ef', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('copy-a', 'copy-child'))
    await store.initialize()
    const forest = store.applyNodeVisual('y', 'a', 'a')!
    expect(store.pasteNodeForest('b', 'after', forest)).toBe(true)
    const pasted = store.getSnapshot()
    expect(pasted.status).toBe('ready')
    if (pasted.status !== 'ready') throw new Error('Editor did not load')
    expect(pasted.document.roots[2]?.id).toBe('copy-a')
    expect(pasted.document.roots[2]?.children[0]?.id).toBe('copy-child')
    store.applyNodeVisual('U', 'a', 'b')
    const upper = store.getSnapshot()
    expect(upper.status).toBe('ready')
    if (upper.status !== 'ready') throw new Error('Editor did not load')
    expect(upper.document.roots[0]?.text).toBe('AB')
    expect(upper.document.roots[0]?.children[0]?.text).toBe('CD')
    expect(upper.document.roots[1]?.text).toBe('EF')
  })

  it('replaces selected node ranges with an empty node or a captured forest and undoes each command', async () => {
    const services = loadedState(
      {
        roots: [
          { id: 'a', text: 'A', children: [] },
          { id: 'b', text: 'B', children: [] },
          { id: 'c', text: 'C', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('empty', 'copy-a', 'copy-b', 'open'))
    await store.initialize()
    const forest = store.applyNodeVisual('y', 'a', 'b')!
    store.applyNodeVisual('c', 'a', 'b')
    let snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready') throw new Error('Editor did not load')
    expect(snapshot.document.roots.map((node) => node.text)).toEqual(['', 'C'])
    expect(snapshot.location.selectedNodeId).toBe('empty')
    store.undo()
    snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready') throw new Error('Editor did not load')
    expect(snapshot.document.roots.map((node) => node.text)).toEqual(['A', 'B', 'C'])
    store.applyNodeVisual('P', 'a', 'b', forest)
    snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready') throw new Error('Editor did not load')
    expect(snapshot.document.roots.map((node) => node.id)).toEqual(['copy-a', 'copy-b', 'c'])
    store.undo()
    store.createSiblingWithText('after', 'opened')
    snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready') throw new Error('Editor did not load')
    expect(snapshot.document.roots.map((node) => node.text)).toEqual(['A', 'opened', 'B', 'C'])
    store.undo()
    snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready') throw new Error('Editor did not load')
    expect(snapshot.document.roots.map((node) => node.text)).toEqual(['A', 'B', 'C'])
  })

  it('keeps invalid or unchanged whole-node Visual operations out of history', async () => {
    const services = loadedState(
      {
        roots: [
          { id: 'a', text: 'lower', children: [] },
          { id: 'b', text: 'also lower', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('replacement'))
    await store.initialize()
    const initial = store.getSnapshot()
    expect(store.applyNodeVisual('d', 'missing', 'b')).toBeUndefined()
    expect(store.applyNodeVisual('p', 'a', 'b')).toBeUndefined()
    expect(store.applyNodeVisual('u', 'a', 'b')).toBeUndefined()
    expect(store.pasteNodeForest('a', 'before', { nodes: [], sourceIds: [] })).toBe(false)
    expect(store.getSnapshot()).toBe(initial)
    store.applyNodeVisual('x', 'a', 'b')
    const deleted = store.getSnapshot()
    if (deleted.status !== 'ready') throw new Error('Editor did not load')
    expect(deleted.document.roots).toEqual([{ id: 'replacement', text: '', children: [] }])
    store.undo()
    const restored = store.getSnapshot()
    if (restored.status !== 'ready') throw new Error('Editor did not load')
    expect(restored.document.roots.map((node) => node.id)).toEqual(['a', 'b'])
  })

  it('keeps hyperlink offsets valid when subtree case conversion expands Unicode text', async () => {
    const url = 'https://example.com'
    const services = loadedState(
      { roots: [{ id: 'a', text: `ß ${url}`, links: [{ start: 2, end: 2 + url.length, url }], children: [] }] },
      { currentParentId: null, selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    store.applyNodeVisual('U', 'a', 'a')
    const snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready') throw new Error('Editor did not load')
    expect(snapshot.document.roots[0]?.text).toBe('SS HTTPS://EXAMPLE.COM')
    expect(snapshot.document.roots[0]?.links).toEqual([{ start: 3, end: 3 + url.length, url: 'HTTPS://EXAMPLE.COM' }])
  })

  it('reports maximum depth without changing editor state, history, IDs, or persistence', async () => {
    const deepest: TreeNode = {
      id: `n${MAX_DOCUMENT_DEPTH - 1}`,
      text: `node-${MAX_DOCUMENT_DEPTH - 1}`,
      children: [],
    }
    let root: TreeNode = deepest
    for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1) {
      root = { id: `n${index}`, text: index === 0 ? 'root' : `node-${index}`, children: [root] }
    }
    const services = loadedState({ roots: [root] }, { currentParentId: deepest.id, selectedNodeId: deepest.id })
    const createId = vi.fn(() => 'must-not-be-consumed')
    const store = new EditorStore(services, createId)
    await store.initialize()
    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('Expected a ready editor.')

    store.createSiblingOrFirstChild(0)
    expect(store.createChild()).toBe(false)

    const after = store.getSnapshot()
    expect(after).toMatchObject({
      status: 'ready',
      location: { currentParentId: deepest.id, selectedNodeId: deepest.id },
      operationError: 'Nodes cannot be nested deeper than 20 levels.',
    })
    if (after.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(after.document).toEqual(before.document)
    expect(after.focus).toEqual(before.focus)
    expect(createId).not.toHaveBeenCalled()
    expect(services.saves).toEqual([])

    store.undo()
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: deepest.id } })
  })

  it('rejects an over-depth subtree or forest paste without changing state, history, or persistence', async () => {
    const deepest: TreeNode = {
      id: `n${MAX_DOCUMENT_DEPTH - 1}`,
      text: `node-${MAX_DOCUMENT_DEPTH - 1}`,
      children: [],
    }
    let root: TreeNode = deepest
    for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1) {
      root = { id: `n${index}`, text: index === 0 ? 'root' : `node-${index}`, children: [root] }
    }
    const services = loadedState(
      { roots: [root] },
      { currentParentId: `n${MAX_DOCUMENT_DEPTH - 2}`, selectedNodeId: deepest.id },
    )
    const createId = vi.fn(() => 'must-not-be-consumed')
    const store = new EditorStore(services, createId)
    await store.initialize()
    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('Expected a ready editor.')
    const source: TreeNode = {
      id: 'source',
      text: 'Source',
      children: [{ id: 'source-child', text: 'Child', children: [] }],
    }
    const forest = { nodes: [source], sourceIds: ['source'] }

    expect(store.pasteSubtree(deepest.id, 'after', source, ['source'])).toBe(false)
    expect(store.pasteNodeForest(deepest.id, 'after', forest)).toBe(false)
    expect(store.applyNodeVisual('p', deepest.id, deepest.id, forest)).toBeUndefined()

    const after = store.getSnapshot()
    expect(after).toMatchObject({
      status: 'ready',
      location: { currentParentId: `n${MAX_DOCUMENT_DEPTH - 2}`, selectedNodeId: deepest.id },
      operationError: MAX_DOCUMENT_DEPTH_ERROR,
    })
    if (after.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(after.document).toEqual(before.document)
    expect(after.focus).toEqual(before.focus)
    expect(createId).not.toHaveBeenCalled()
    expect(services.saves).toEqual([])

    store.undo()
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: deepest.id } })

    // The document is still valid, so a later change saves normally instead of failing on the
    // over-depth document the rejected paste must never create.
    expect(store.createSibling('after')).toBe(true)
    await store.flushPersistence()
    expect(services.saves).toHaveLength(1)
  })

  it('advances the structural version for displayed-list changes but not for text edits or selection', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('next'))
    await store.initialize()
    const initial = store.getSnapshot()
    if (initial.status !== 'ready') throw new Error('Expected a ready editor.')

    store.editText('root', 'Changed')
    store.selectNode('child', 0)
    const afterEdits = store.getSnapshot()
    if (afterEdits.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(afterEdits.structuralVersion).toBe(initial.structuralVersion)

    store.enter()
    const afterEnter = store.getSnapshot()
    if (afterEnter.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(afterEnter.structuralVersion).toBeGreaterThan(initial.structuralVersion)

    store.createSiblingOrFirstChild(0)
    const afterStructural = store.getSnapshot()
    if (afterStructural.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(afterStructural.structuralVersion).toBeGreaterThan(afterEnter.structuralVersion)

    store.undo()
    const afterUndo = store.getSnapshot()
    if (afterUndo.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(afterUndo.structuralVersion).toBeGreaterThan(afterStructural.structuralVersion)
  })

  it('creates an initial root and a sibling split', async () => {
    const store = new EditorStore(createServices(), ids('root', 'next'))
    await store.initialize()
    store.editText('root', 'Current')
    store.createSiblingOrFirstChild(3)

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots.map((node) => [node.id, node.text])).toEqual([
        ['root', 'Cur'],
        ['next', 'rent'],
      ])
      expect(state.location.selectedNodeId).toBe('next')
    }
  })

  it('creates an empty sibling before a node when Enter is pressed at the beginning', async () => {
    const services = loadedState(
      {
        roots: [{ id: 'root', text: 'Current', children: [{ id: 'child', text: 'Child', children: [] }] }],
      },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('before'))
    await store.initialize()

    store.createSiblingOrFirstChild(0)

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots.map((node) => [node.id, node.text, node.children.map((child) => child.id)])).toEqual([
        ['before', '', []],
        ['root', 'Current', ['child']],
      ])
      expect(state.location.selectedNodeId).toBe('before')
    }
  })

  it('creates the next sibling after an empty node when Enter is pressed', async () => {
    const services = loadedState(
      {
        roots: [
          { id: 'root', text: 'Current', children: [] },
          { id: 'empty', text: '', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'empty' },
    )
    const store = new EditorStore(services, ids('next'))
    await store.initialize()

    store.createSiblingOrFirstChild(0)

    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ id: 'root' }, { id: 'empty' }, { id: 'next' }] },
      location: { selectedNodeId: 'next' },
      focus: { nodeId: 'next', cursor: 0 },
    })
  })

  it('creates a first child from the focused current parent', async () => {
    const store = new EditorStore(createServices(), ids('root', 'child'))
    await store.initialize()
    store.enter()
    store.createSiblingOrFirstChild(0)

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots[0]!.children[0]!.id).toBe('child')
      expect(state.location).toEqual({ currentParentId: 'root', selectedNodeId: 'child' })
    }
  })

  it('creates and focuses a child with Vim structural insertion', async () => {
    const store = new EditorStore(createServices(), ids('root', 'child', 'empty-grandchild', 'grandchild'))
    await store.initialize()

    expect(store.createChild()).toBe(true)
    expect(store.getSnapshot()).toMatchObject({
      document: { roots: [{ id: 'root', children: [{ id: 'child', text: '' }] }] },
      location: { currentParentId: 'root', selectedNodeId: 'child' },
    })

    store.createChildWithText('')
    store.createChildWithText('Grandchild')
    expect(store.getSnapshot()).toMatchObject({
      document: {
        roots: [
          {
            children: [
              { children: [{ id: 'empty-grandchild', children: [{ id: 'grandchild', text: 'Grandchild' }] }] },
            ],
          },
        ],
      },
      location: { currentParentId: 'empty-grandchild', selectedNodeId: 'grandchild' },
    })
  })

  it('creates an empty sibling before or after the selected node and focuses the new node', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'a', text: 'A', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'b' },
    )
    const store = new EditorStore(services, ids('before', 'after'))
    await store.initialize()

    expect(store.createSibling('before')).toBe(true)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ id: 'root', children: [{ id: 'a' }, { id: 'before', text: '' }, { id: 'b' }] }] },
      location: { currentParentId: 'root', selectedNodeId: 'before' },
      focus: { nodeId: 'before', cursor: 0 },
    })

    expect(store.createSibling('after')).toBe(true)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: {
        roots: [
          { id: 'root', children: [{ id: 'a' }, { id: 'before', text: '' }, { id: 'after', text: '' }, { id: 'b' }] },
        ],
      },
      location: { currentParentId: 'root', selectedNodeId: 'after' },
      focus: { nodeId: 'after', cursor: 0 },
    })
  })

  it('returns to the current parent after deleting its only child', async () => {
    const store = new EditorStore(createServices(), ids('root', 'child'))
    await store.initialize()
    store.enter()
    store.createSiblingOrFirstChild(0)
    store.deleteSelected()

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.location).toEqual({ currentParentId: 'root', selectedNodeId: 'root' })
    }
  })

  it('deletes an empty node on Backspace and selects the previous sibling at the end', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'a', text: 'Alpha', children: [] },
              { id: 'b', text: '', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'b' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.deleteEmptySelected()

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots[0]!.children.map((node) => node.id)).toEqual(['a'])
      expect(state.location).toEqual({ currentParentId: 'root', selectedNodeId: 'a' })
      expect(state.focus).toMatchObject({ nodeId: 'a', cursor: 5 })
    }
  })

  it('focuses the current parent when Backspace deletes the first child with no previous sibling', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: '', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.deleteEmptySelected()

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots[0]!.children.map((node) => node.id)).toEqual(['b'])
      expect(state.location).toEqual({ currentParentId: 'root', selectedNodeId: 'root' })
      expect(state.focus).toMatchObject({ nodeId: 'root', cursor: 6 })
    }
  })

  it('focuses the current parent when Backspace deletes the only child', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Parent', children: [{ id: 'a', text: '', children: [] }] }] },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.deleteEmptySelected()

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots[0]!.children).toEqual([])
      expect(state.location).toEqual({ currentParentId: 'root', selectedNodeId: 'root' })
    }
  })

  it('deletes an empty subtree on Backspace', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [{ id: 'a', text: '', children: [{ id: 'a1', text: 'A1', children: [] }] }],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.deleteEmptySelected()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.children).toEqual([])
  })

  it('keeps the only empty root when Backspace is pressed', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.deleteEmptySelected()

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots.map((node) => node.id)).toEqual(['root'])
      expect(state.location).toEqual({ currentParentId: null, selectedNodeId: 'root' })
    }
  })

  it('selects the next root at the beginning when Backspace deletes an empty first root', async () => {
    const services = loadedState(
      {
        roots: [
          { id: 'r1', text: '', children: [] },
          { id: 'r2', text: 'Second', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'r1' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.deleteEmptySelected()

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots.map((node) => node.id)).toEqual(['r2'])
      expect(state.location).toEqual({ currentParentId: null, selectedNodeId: 'r2' })
      expect(state.focus).toMatchObject({ nodeId: 'r2', cursor: 0 })
    }
  })

  it('does nothing when Backspace is pressed on a non-empty node or the current parent', async () => {
    const nonEmpty = loadedState(
      { roots: [{ id: 'root', text: 'Root', children: [{ id: 'a', text: 'A', children: [] }] }] },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(nonEmpty, ids('unused'))
    await store.initialize()
    store.deleteEmptySelected()
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', document: { roots: [{ children: [{ id: 'a' }] }] } })

    const emptyParent = loadedState(
      { roots: [{ id: 'root', text: '', children: [] }] },
      { currentParentId: 'root', selectedNodeId: 'root' },
    )
    const parentStore = new EditorStore(emptyParent, ids('unused'))
    await parentStore.initialize()
    parentStore.deleteEmptySelected()
    expect(parentStore.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ id: 'root' }] },
      location: { currentParentId: 'root' },
    })
  })

  it('preserves the caret position when ArrowUp moves from the first child to the current parent', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: 'A', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.moveSelection('up', 1)

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.location).toEqual({ currentParentId: 'root', selectedNodeId: 'root' })
      expect(state.focus).toMatchObject({ nodeId: 'root', cursor: 1 })
    }
  })

  it('moves the caret to the beginning on ArrowUp from the first root', async () => {
    const services = loadedState(
      {
        roots: [
          { id: 'r1', text: 'A', children: [] },
          { id: 'r2', text: 'B', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'r1' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.moveSelection('up', 1)

    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      location: { currentParentId: null, selectedNodeId: 'r1' },
      focus: { nodeId: 'r1', cursor: 0 },
    })
  })

  it('does not publish a new focus intent for a vertical boundary with no caret change', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'A', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('Expected a ready editor.')

    store.moveSelection('up', 0)
    store.moveSelection('down', 1)

    const after = store.getSnapshot()
    expect(after.status).toBe('ready')
    if (after.status === 'ready') expect(after.focus).toBe(before.focus)
  })

  it('moves the current parent caret to the beginning on ArrowUp', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      { currentParentId: 'root', selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.moveSelection('up', 3)

    expect(store.getSnapshot()).toMatchObject({ focus: { nodeId: 'root', cursor: 0 } })
  })

  it('moves the last displayed node caret to the end on ArrowDown', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: 'First', children: [] },
              { id: 'b', text: 'Last', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'b' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.moveSelection('down', 0)

    expect(store.getSnapshot()).toMatchObject({ focus: { nodeId: 'b', cursor: 4 } })
  })

  it('moves a childless current parent caret to the end on ArrowDown', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Parent', children: [] }] },
      { currentParentId: 'root', selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.moveSelection('down', 0)

    expect(store.getSnapshot()).toMatchObject({ focus: { nodeId: 'root', cursor: 6 } })
  })

  it('groups direct text edits until a structural boundary', async () => {
    vi.useFakeTimers()
    const store = new EditorStore(createServices(), ids('root', 'sibling'))
    await store.initialize()
    store.editText('root', 'a')
    store.editText('root', 'ab')
    vi.advanceTimersByTime(5_000)
    store.undo()
    let state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.text).toBe('')
    store.redo()
    state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.text).toBe('ab')
    vi.useRealTimers()
  })

  it('uses image clipboard data in preference to text and keeps it undoable', async () => {
    const services = createServices({ kind: 'image', png: new Uint8Array([1, 2]) })
    const store = new EditorStore(services, ids('root', 'image'))
    await store.initialize()
    await store.paste('root', 0)
    let state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.attachment?.id).toBe('image')
    store.undo()
    state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.attachment).toBeUndefined()
  })

  it('rejects empty copy and cut selections and propagates clipboard failures', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'copy me', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    expect(await store.copy('root', 2, 2)).toBe(false)
    expect(await store.cut('root', 2, 2)).toBe(false)
    expect(await store.copy('root', 0, 4)).toBe(false)

    services.writeClipboard = async () => {
      throw new Error('clipboard unavailable')
    }
    await expect(store.cut('root', 0, 4)).rejects.toThrow('clipboard unavailable')
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'copy me' }] } })
  })

  it('does not cut after the asynchronous selection changes', async () => {
    let release: (() => void) | undefined
    const services = loadedState(
      {
        roots: [
          { id: 'root', text: 'copy me', children: [] },
          { id: 'other', text: 'other', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.writeClipboard = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const pending = store.cut('root', 0, 4)
    store.selectNode('other', 0)
    release!()
    await expect(pending).resolves.toBe(true)
    const state = store.getSnapshot()
    if (state.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(state.document.roots[0]!.text).toBe('copy me')
  })

  it('does not remove text when the target content changes during the clipboard write', async () => {
    let release: (() => void) | undefined
    const services = loadedState(
      { roots: [{ id: 'root', text: 'abc', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.writeClipboard = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const pending = store.cut('root', 1, 2)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    store.editText('root', 'Xabc')
    release!()
    await expect(pending).resolves.toBe(true)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ text: 'Xabc' }] },
      operationError: 'The cut could not finish because the text changed.',
    })
  })

  it('applies a delayed cut with the original payload when the target is unchanged', async () => {
    let release: (() => void) | undefined
    const payloads: Array<{ text: string; html: string }> = []
    const services = loadedState(
      { roots: [{ id: 'root', text: 'abc', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.writeClipboard = (payload) => {
      payloads.push(payload)
      return new Promise<void>((resolve) => {
        release = resolve
      })
    }
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const pending = store.cut('root', 1, 2)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    release!()
    await expect(pending).resolves.toBe(true)
    expect(payloads).toEqual([{ text: 'b', html: 'b' }])
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ text: 'ac' }] },
      focus: { nodeId: 'root', cursor: 1 },
    })
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'abc' }] } })
    store.redo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'ac' }] } })
  })

  it('still cuts when only an unrelated node changes during the clipboard write', async () => {
    let release: (() => void) | undefined
    const services = loadedState(
      {
        roots: [
          { id: 'root', text: 'abc', children: [] },
          { id: 'other', text: '', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.writeClipboard = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const pending = store.cut('root', 1, 2)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    store.editText('other', 'changed')
    release!()
    await expect(pending).resolves.toBe(true)
    const state = store.getSnapshot()
    expect(state).toMatchObject({
      status: 'ready',
      document: {
        roots: [{ text: 'ac' }, { text: 'changed' }],
      },
    })
    if (state.status === 'ready') expect(state.operationError).toBeUndefined()
  })

  it('does not cut after the target node is deleted during the clipboard write', async () => {
    let release: (() => void) | undefined
    const services = loadedState(
      {
        roots: [
          { id: 'root', text: 'abc', children: [] },
          { id: 'other', text: 'other', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.writeClipboard = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const pending = store.cut('root', 1, 2)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    store.deleteSelected()
    release!()
    await expect(pending).resolves.toBe(true)
    const state = store.getSnapshot()
    expect(state).toMatchObject({ status: 'ready', document: { roots: [{ id: 'other', text: 'other' }] } })
    if (state.status === 'ready') expect(state.operationError).toBeUndefined()
  })

  it('applies the cut when an intervening edit is undone back to the original content', async () => {
    let release: (() => void) | undefined
    const services = loadedState(
      { roots: [{ id: 'root', text: 'abc', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.writeClipboard = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const pending = store.cut('root', 1, 2)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    store.editText('root', 'abcX')
    store.undo()
    release!()
    await expect(pending).resolves.toBe(true)
    const state = store.getSnapshot()
    expect(state).toMatchObject({ status: 'ready', document: { roots: [{ text: 'ac' }] } })
    if (state.status === 'ready') expect(state.operationError).toBeUndefined()
  })

  it('records a cut separately from surrounding text edits', async () => {
    const services = createServices()
    services.writeClipboard = async () => undefined
    const store = new EditorStore(services, ids('root'))
    await store.initialize()

    store.editText('root', 'hello')
    await expect(store.cut('root', 0, 2)).resolves.toBe(true)
    store.editText('root', 'lloX')

    store.undo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'llo' }] } })
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'hello' }] } })
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: '' }] } })
  })

  it('does not apply a paste after the asynchronous clipboard read changes selection', async () => {
    let release: ((value: ClipboardValue) => void) | undefined
    const services = loadedState(
      {
        roots: [
          { id: 'root', text: '', children: [] },
          { id: 'other', text: '', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = () =>
      new Promise<ClipboardValue>((resolve) => {
        release = resolve
      })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const pending = store.paste('root', 0)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    store.selectNode('other', 0)
    release!({ kind: 'text', text: 'ignored' })
    await pending
    const state = store.getSnapshot()
    if (state.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(state.document.roots[0]!.text).toBe('')
  })

  it('does not apply an image paste after attachment writing changes selection', async () => {
    let release: (() => void) | undefined
    const services = loadedState(
      {
        roots: [
          { id: 'root', text: '', children: [] },
          { id: 'other', text: '', children: [] },
        ],
      },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = async () => ({ kind: 'image', png: new Uint8Array([1]) })
    services.writeAttachment = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const store = new EditorStore(services, ids('attachment'))
    await store.initialize()
    const pending = store.paste('root', 0)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    store.selectNode('other', 0)
    release!()
    await pending
    const state = store.getSnapshot()
    if (state.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(state.document.roots[0]!.attachment).toBeUndefined()
  })

  it('creates a following sibling when image paste targets a node with an image', async () => {
    const store = new EditorStore(
      createServices({ kind: 'image', png: new Uint8Array([1]) }),
      ids('root', 'first-image', 'second-image', 'image-node'),
    )
    await store.initialize()
    await store.paste('root', 0)
    await store.paste('root', 0)

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots.map((node) => node.attachment?.id)).toEqual(['first-image', 'second-image'])
      expect(state.location.selectedNodeId).toBe('image-node')
    }
  })

  it('moves a dragged displayed sibling and keeps it selected', async () => {
    const store = new EditorStore(createServices(), ids('root', 'second'))
    await store.initialize()
    store.createSiblingOrFirstChild(0)
    store.editText('second', 'second')
    store.selectNode('second', 4)
    store.moveNodeTo('second', 0)

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots.map((node) => node.id)).toEqual(['second', 'root'])
    expect(state.status === 'ready' && state.location.selectedNodeId).toBe('second')
    expect(state.status === 'ready' && state.focus.cursor).toBe(4)
  })

  it('opens a document whose referenced attachment file is missing', async () => {
    const services = createServices()
    services.load = async () => ({
      version: 1,
      document: {
        roots: [{ id: 'root', text: '', attachment: { id: 'missing', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const store = new EditorStore(services, ids('unused'))

    await store.initialize()

    const snapshot = store.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.status === 'ready' && snapshot.document.roots[0]?.attachment?.id).toBe('missing')
    expect(services.saves).toEqual([])
  })

  it('returns to the parent level when a second image is pasted into the current parent', async () => {
    const services = createServices({ kind: 'image', png: new Uint8Array([1]) })
    services.load = async () => ({
      version: 1,
      document: {
        roots: [{ id: 'parent', text: '', attachment: { id: 'existing', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
    })
    const store = new EditorStore(services, ids('new-image', 'sibling'))
    await store.initialize()

    await store.paste('parent', 0)

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: null, selectedNodeId: 'sibling' })
  })

  it('navigates to an ancestor and selects the direct child on the previous path', async () => {
    const services = createServices()
    services.load = async () => ({
      version: 1,
      document: {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [{ id: 'parent', text: 'Parent', children: [{ id: 'current', text: 'Current', children: [] }] }],
          },
        ],
      },
      location: { currentParentId: 'current', selectedNodeId: 'current' },
    })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.navigateToAncestor('parent')
    let state = store.getSnapshot()
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: 'parent', selectedNodeId: 'current' })
    expect(state.status === 'ready' && state.focus).toMatchObject({ nodeId: 'current', cursor: 0 })

    store.navigateToAncestor(null)
    state = store.getSnapshot()
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: null, selectedNodeId: 'root' })
  })

  it('pastes plain text at the cursor', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'abcdef', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = async () => ({ kind: 'text', text: 'XYZ' })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    await store.paste('root', 3)

    expect(store.getSnapshot()).toMatchObject({ status: 'ready', document: { roots: [{ text: 'abcXYZdef' }] } })
  })

  it('stores a valid pasted URL as a link and leaves an invalid URL as text', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = async () => ({ kind: 'text', text: 'https://example.com' })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    await store.paste('root', 0)
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ links: [{ url: 'https://example.com' }] }] } })

    services.readClipboard = async () => ({ kind: 'text', text: 'example.com' })
    await store.paste('root', 19)
    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.text).toBe('https://example.comexample.com')
  })

  it('removes a complete pasted link with Backspace at its end', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = async () => ({ kind: 'text', text: 'https://example.com' })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    await store.paste('root', 0)
    expect(store.deleteLink('root', 19)).toBe(true)
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: '' }] } })
  })

  it('places the caret where a removed link was when text follows it', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Ahttps://example.comB',
            links: [{ start: 1, end: 20, url: 'https://example.com' }],
            children: [],
          },
        ],
      },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    expect(store.deleteLink('root', 20)).toBe(true)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ text: 'AB' }] },
      focus: { nodeId: 'root', cursor: 1 },
    })
  })

  it('undoes and redoes link removal', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = async () => ({ kind: 'text', text: 'https://example.com' })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    await store.paste('root', 0)
    store.deleteLink('root', 19)
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ links: [{ url: 'https://example.com' }] }] } })
    store.redo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: '' }] } })
  })

  it('pastes multiline text as separate nodes', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'abcdef', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = async () => ({ kind: 'text', text: 'one\ntwo\nthree' })
    const store = new EditorStore(services, ids('two', 'three'))
    await store.initialize()

    await store.paste('root', 3)

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots.map((node) => node.text)).toEqual([
      'abcone',
      'two',
      'threedef',
    ])
    expect(state.status === 'ready' && state.location.selectedNodeId).toBe('three')
  })

  it('does not delete the current parent when it is focused', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [{ id: 'parent', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }],
          },
        ],
      },
      { currentParentId: 'parent', selectedNodeId: 'parent' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    expect(store.deleteSelected()).toBe(false)

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.children[0]!.id).toBe('parent')
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: 'parent', selectedNodeId: 'parent' })
  })

  it('does not delete a top-level root when it is the current parent', async () => {
    const services = loadedState(
      {
        roots: [
          { id: 'r1', text: 'First', children: [] },
          { id: 'r2', text: 'Second', children: [] },
        ],
      },
      { currentParentId: 'r1', selectedNodeId: 'r1' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    expect(store.deleteSelected()).toBe(false)

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots.map((node) => node.id)).toEqual(['r1', 'r2'])
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: 'r1', selectedNodeId: 'r1' })
  })

  it('selects the next sibling when deleting a middle sibling', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'a', text: 'A', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.deleteSelected()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.children.map((node) => node.id)).toEqual(['b'])
    expect(state.status === 'ready' && state.location.selectedNodeId).toBe('b')
  })

  it('selects the previous sibling when deleting the last sibling', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'a', text: 'A', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'b' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.deleteSelected()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.children.map((node) => node.id)).toEqual(['a'])
    expect(state.status === 'ready' && state.location.selectedNodeId).toBe('a')
  })

  it('replaces the only top-level root when it is deleted', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Root', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('replacement'))
    await store.initialize()

    store.deleteSelected()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots.map((node) => node.id)).toEqual(['replacement'])
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: null, selectedNodeId: 'replacement' })
  })

  it('reconciles the location on undo when the current location no longer exists', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Root', children: [{ id: 'parent', text: 'Parent', children: [] }] }] },
      { currentParentId: 'parent', selectedNodeId: 'parent' },
    )
    const store = new EditorStore(services, ids('child'))
    await store.initialize()
    store.createSiblingOrFirstChild(0)

    store.undo()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.children[0]!.children).toEqual([])
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: 'parent', selectedNodeId: 'parent' })
  })

  it('surfaces a persistence error in the snapshot', async () => {
    const services = createServices()
    services.save = async () => {
      throw new Error('disk full')
    }
    const store = new EditorStore(services, ids('root'))
    await store.initialize()

    await vi.waitFor(() => {
      const state = store.getSnapshot()
      expect(state.status === 'ready' && state.saveError).toContain('disk full')
    })

    services.save = async (state) => {
      services.saves.push(state)
    }
    store.editText('root', 'recovered')
    await store.flushPersistence()
    const recovered = store.getSnapshot()
    expect(recovered).toMatchObject({ status: 'ready' })
    if (recovered.status === 'ready') expect(recovered.saveError).toBeUndefined()
  })

  it('surfaces attachment cleanup failures and waits for cleanup during flush', async () => {
    const services = createServices()
    services.cleanupAttachments = async () => {
      throw new Error('cleanup failed')
    }
    const store = new EditorStore(services, ids('root'))
    await store.initialize()

    await expect(store.flushPersistence()).rejects.toThrow('cleanup failed')
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', saveError: 'cleanup failed' })
  })

  it('waits for queued persistence when flushing', async () => {
    let release: (() => void) | undefined
    const services = createServices()
    services.save = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const store = new EditorStore(services, ids('root'))
    await store.initialize()

    let flushed = false
    const pending = store.flushPersistence().then(() => {
      flushed = true
    })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    expect(flushed).toBe(false)
    release!()
    await pending
    expect(flushed).toBe(true)
  })

  it('flushes text typed while a quit save is in flight', async () => {
    const { services, pending } = deferredSaveServices()
    const store = new EditorStore(services, ids('root'))
    await store.initialize()

    store.editText('root', 'before quit')
    let flushed = false
    const flush = store.flushPersistence().then(() => {
      flushed = true
    })
    await vi.waitFor(() => expect(pending).toHaveLength(1))

    store.editText('root', 'before quit typed while quit save pending')
    pending[0]!.resolve()
    await tick()

    expect(flushed).toBe(false)
    expect(pending).toHaveLength(2)
    pending[1]!.resolve()
    await flush
    expect(flushed).toBe(true)
    expect(services.saves.at(-1)).toMatchObject({
      document: { roots: [{ text: 'before quit typed while quit save pending' }] },
    })
  })

  it('commits a registered pending edit before the flush captures a save', async () => {
    const services = createServices()
    const store = new EditorStore(services, ids('root'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0
    const order: string[] = []
    let committed = false
    store.registerPendingEditFinisher(() => {
      order.push('finish')
      if (committed) return false
      committed = true
      store.editText('root', 'typed')
      return true
    })
    services.save = async (state) => {
      order.push('save')
      services.saves.push(state)
    }

    await store.flushPersistence()

    expect(order).toEqual(['finish', 'save', 'finish'])
    expect(services.saves).toHaveLength(1)
    expect(services.saves[0]).toMatchObject({ document: { roots: [{ text: 'typed' }] } })
  })

  it('retains a pending-edit commit after a failed flush and saves it on retry', async () => {
    const services = createServices()
    const store = new EditorStore(services, ids('root'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0
    let commits = 0
    store.registerPendingEditFinisher(() => {
      if (commits > 0) return false
      commits += 1
      store.editText('root', 'typed')
      return true
    })
    services.save = async () => {
      throw new Error('disk full')
    }

    await expect(store.flushPersistence()).rejects.toThrow('disk full')

    expect(commits).toBe(1)
    const failed = store.getSnapshot()
    expect(failed.status === 'ready' && failed.document.roots[0]!.text).toBe('typed')

    services.save = async (state) => {
      services.saves.push(state)
    }
    await store.flushPersistence()

    expect(commits).toBe(1)
    expect(services.saves.at(-1)).toMatchObject({ document: { roots: [{ text: 'typed' }] } })
  })

  it('defers a pending-edit finisher while locked and commits it after a successful flush unlocks the store', async () => {
    const clock = new FakeClock()
    const { store, services } = await lockEditor(clock)
    let commits = 0
    store.registerPendingEditFinisher(() => {
      if (commits > 0) return false
      commits += 1
      store.editText('root', 'replace commit')
      return true
    })

    await expect(store.flushPersistence()).rejects.toThrow('disk full')
    expect(commits).toBe(0)

    services.save = async (state) => {
      services.saves.push(state)
    }
    await store.flushPersistence()

    expect(commits).toBe(1)
    expect(services.saves.at(-1)).toMatchObject({ document: { roots: [{ text: 'replace commit' }] } })
    const recovered = store.getSnapshot()
    expect(recovered.status === 'ready' && recovered.persistenceLocked).toBeUndefined()
  })

  it('captures a pending edit completed while the flush save is in flight', async () => {
    const { services, pending } = deferredSaveServices()
    const store = new EditorStore(services, ids('root'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0
    pending.length = 0
    store.editText('root', 'before quit')
    let armed = false
    let committed = false
    store.registerPendingEditFinisher(() => {
      if (!armed || committed) return false
      committed = true
      store.editText('root', 'completed while pending')
      return true
    })

    const flush = store.flushPersistence()
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    armed = true
    pending[0]!.resolve()
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1]!.resolve()
    await flush

    expect(committed).toBe(true)
    expect(services.saves.at(-1)).toMatchObject({ document: { roots: [{ text: 'completed while pending' }] } })
  })

  it('waits for the immediate save a post-save pending-edit commit requests', async () => {
    const { services, pending } = deferredSaveServices()
    const store = new EditorStore(services, ids('root'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0
    pending.length = 0
    store.editText('root', 'before')
    let armed = false
    let committed = false
    store.registerPendingEditFinisher(() => {
      if (!armed || committed) return false
      committed = true
      store.editText('root', 'one two three four five six seven eight nine ten')
      return true
    })

    const flush = store.flushPersistence()
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    armed = true
    pending[0]!.resolve()
    await vi.waitFor(() => expect(pending).toHaveLength(2))

    let flushed = false
    void flush.then(() => {
      flushed = true
    })
    await tick()
    expect(flushed).toBe(false)

    pending[1]!.resolve()
    await flush
    expect(services.saves.at(-1)).toMatchObject({
      document: { roots: [{ text: 'one two three four five six seven eight nine ten' }] },
    })
  })

  it('stops invoking a pending-edit finisher after it unregisters', async () => {
    const services = createServices()
    const store = new EditorStore(services, ids('root'))
    await store.initialize()
    await store.flushPersistence()
    const finish = vi.fn(() => false)
    const unregister = store.registerPendingEditFinisher(finish)

    unregister()
    await store.flushPersistence()

    expect(finish).not.toHaveBeenCalled()
  })

  it.each(['clipboard read', 'attachment write', 'cut'] as const)(
    'waits for a pending %s and its resulting save during flush',
    async (stage) => {
      const services = createServices({ kind: 'image', png: new Uint8Array([1]) })
      const store = new EditorStore(services, ids('root', 'image'))
      await store.initialize()
      store.editText('root', 'text')
      store.endTextSession()
      await store.flushPersistence()
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const blocked = vi.fn(async () => gate)
      if (stage === 'clipboard read') {
        services.readClipboard = async () => {
          await blocked()
          return { kind: 'text', text: 'pasted' }
        }
      } else if (stage === 'attachment write') services.writeAttachment = blocked
      else services.writeClipboard = blocked

      const operation = stage === 'cut' ? store.cut('root', 0, 4) : store.paste('root', 0)
      await vi.waitFor(() => expect(blocked).toHaveBeenCalledOnce())
      let flushed = false
      const flush = store.flushPersistence().then(() => {
        flushed = true
      })
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        expect(flushed).toBe(false)
      } finally {
        release()
        await operation
        await flush
      }
      const expected =
        stage === 'attachment write'
          ? { text: 'text', attachment: { id: 'image', mimeType: 'image/png' } }
          : { text: stage === 'cut' ? '' : 'pastedtext' }
      expect(services.saves.at(-1)).toMatchObject({ document: { roots: [expected] } })
    },
  )

  it('rejects a flush when a pending attachment write fails and permits a later retry', async () => {
    const services = createServices({ kind: 'image', png: new Uint8Array([1]) })
    const store = new EditorStore(services, ids('root', 'image'))
    await store.initialize()
    await store.flushPersistence()
    let reject!: (error: Error) => void
    services.writeAttachment = vi.fn(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail
        }),
    )
    const paste = store.paste('root', 0)
    const pasteFailure = expect(paste).rejects.toThrow('attachment failed')
    await vi.waitFor(() => expect(services.writeAttachment).toHaveBeenCalledOnce())
    const flushFailure = expect(store.flushPersistence()).rejects.toThrow('attachment failed')
    reject(new Error('attachment failed'))
    await pasteFailure
    await flushFailure
    await expect(store.flushPersistence()).resolves.toBeUndefined()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: '' }] } })
  })

  it('surfaces operation errors until the next successful command', async () => {
    const store = new EditorStore(createServices(), ids('root'))
    await store.initialize()

    store.reportError(new Error('clipboard unavailable'))
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', operationError: 'clipboard unavailable' })

    store.editText('root', 'ok')
    const recovered = store.getSnapshot()
    expect(recovered).toMatchObject({ status: 'ready' })
    if (recovered.status === 'ready') expect(recovered.operationError).toBeUndefined()
  })

  it('places the caret on the restored character when a mid-text deletion is undone', async () => {
    const store = new EditorStore(
      loadedState(
        { roots: [{ id: 'root', text: 'abcde', children: [] }] },
        { currentParentId: null, selectedNodeId: 'root' },
      ),
      ids('unused'),
    )
    await store.initialize()

    store.replaceTextRange('root', 2, 3, '')
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'abde' }] } })

    store.undo()

    expect(store.getSnapshot()).toMatchObject({
      document: { roots: [{ text: 'abcde' }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
      focus: { nodeId: 'root', cursor: 2 },
    })

    store.redo()

    expect(store.getSnapshot()).toMatchObject({
      document: { roots: [{ text: 'abde' }] },
      focus: { nodeId: 'root', cursor: 2 },
    })
  })

  it('redoes an empty-node Backspace onto the node that takes its place', async () => {
    // The forward command selects the previous sibling so typing can continue there, but a redo
    // restores nothing to that sibling: the change is the removal itself, so the caret lands on the
    // node now occupying the vacated position, as it does for any other removal.
    const store = new EditorStore(
      loadedState(
        {
          roots: [
            {
              id: 'root',
              text: 'Root',
              children: [
                { id: 'a', text: 'Alpha', children: [] },
                { id: 'b', text: '', children: [] },
                { id: 'c', text: 'Gamma', children: [] },
              ],
            },
          ],
        },
        { currentParentId: 'root', selectedNodeId: 'b' },
      ),
      ids('unused'),
    )
    await store.initialize()

    store.deleteEmptySelected()
    expect(store.getSnapshot()).toMatchObject({ focus: { nodeId: 'a', cursor: 5 } })

    store.undo()
    expect(store.getSnapshot()).toMatchObject({
      document: { roots: [{ children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }] },
      focus: { nodeId: 'b', cursor: 0 },
    })

    store.redo()
    expect(store.getSnapshot()).toMatchObject({
      document: { roots: [{ children: [{ id: 'a' }, { id: 'c' }] }] },
      location: { currentParentId: 'root', selectedNodeId: 'c' },
      focus: { nodeId: 'c', cursor: 0 },
    })
  })

  it('ignores repeated text and empty undo or redo', async () => {
    const store = new EditorStore(createServices(), ids('root'))
    await store.initialize()

    store.editText('root', '')
    store.undo()
    store.redo()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.text).toBe('')
  })

  it('distinguishes unavailable transitions from same-node focus requests', async () => {
    const store = new EditorStore(
      loadedState(
        { roots: [{ id: 'root', text: 'abc', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }] },
        { currentParentId: null, selectedNodeId: 'root' },
      ),
      ids('unused'),
    )
    await store.initialize()
    const initial = store.getSnapshot()
    expect(initial.status).toBe('ready')
    if (initial.status !== 'ready') return

    store.undo()
    store.redo()
    store.leave()
    expect(store.getSnapshot()).toBe(initial)

    store.selectNode('root', 2)
    const reselection = store.getSnapshot()
    expect(reselection).toMatchObject({ location: { selectedNodeId: 'root' }, focus: { nodeId: 'root', cursor: 2 } })
    if (reselection.status !== 'ready') return
    expect(reselection.focus.token).not.toBe(initial.focus.token)

    store.moveSelection('up', 2)
    const clamped = store.getSnapshot()
    expect(clamped).toMatchObject({ location: { selectedNodeId: 'root' }, focus: { nodeId: 'root', cursor: 0 } })
    if (clamped.status !== 'ready') return
    expect(clamped.focus.token).not.toBe(reselection.focus.token)
  })

  it('ends the editing session after a standalone text edit', async () => {
    const store = new EditorStore(createServices(), ids('root'))
    await store.initialize()

    store.editText('root', 'a')
    store.markNextTextEditStandalone()
    store.editText('root', 'ab')
    store.undo()

    expect(store.getSnapshot()).toMatchObject({ status: 'ready', document: { roots: [{ text: 'a' }] } })
  })

  it('moves the selected node by index', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'a', text: 'A', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.moveSelectedTo(2)

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.children.map((node) => node.id)).toEqual(['b', 'a'])
    expect(state.status === 'ready' && state.location.selectedNodeId).toBe('a')
  })

  it('moves from the current parent down to the first child and clamps the cursor', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: 'Alpha', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.moveSelection('down', 10)
    let state = store.getSnapshot()
    expect(state.status === 'ready' && state.location.selectedNodeId).toBe('a')
    expect(state.status === 'ready' && state.focus).toMatchObject({ nodeId: 'a', cursor: 5 })

    store.selectNode('b', 10)
    store.moveSelection('up', 10)
    state = store.getSnapshot()
    expect(state.status === 'ready' && state.focus).toMatchObject({ nodeId: 'a', cursor: 5 })
  })

  it('moves to the first displayed or current parent boundary and clamps the cursor', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: 'Alpha', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
          { id: 'other', text: 'Other', children: [] },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'b' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('Expected a ready editor.')

    store.moveSelectionBoundary('first', 99)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      location: { currentParentId: 'root', selectedNodeId: 'a' },
      focus: { nodeId: 'a', cursor: 5 },
    })

    store.moveSelectionBoundary('parent', 99)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      location: { currentParentId: 'root', selectedNodeId: 'root' },
      focus: { nodeId: 'root', cursor: 6 },
    })

    const after = store.getSnapshot()
    if (after.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(after.document).toBe(before.document)
  })

  it('clamps a counted last boundary to the available siblings and cursor', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: 'Alpha', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
          { id: 'other', text: 'Other', children: [] },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'b' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('Expected a ready editor.')

    store.moveSelectionBoundary('last', 99, 1)
    expect(store.getSnapshot()).toMatchObject({
      location: { currentParentId: 'root', selectedNodeId: 'a' },
      focus: { nodeId: 'a', cursor: 5 },
    })

    store.moveSelectionBoundary('last', 99, 10)
    expect(store.getSnapshot()).toMatchObject({
      location: { currentParentId: 'root', selectedNodeId: 'b' },
      focus: { nodeId: 'b', cursor: 1 },
    })

    store.moveSelectionBoundary('last', 99)
    expect(store.getSnapshot()).toMatchObject({
      location: { currentParentId: 'root', selectedNodeId: 'b' },
      focus: { nodeId: 'b', cursor: 1 },
    })

    const after = store.getSnapshot()
    if (after.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(after.document).toBe(before.document)
  })

  it('reaches the location’s last visible row with G and crosses an expanded branch boundary with moveHorizontal', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: 'Alpha', children: [{ id: 'a1', text: 'Grandchild', children: [] }] },
              { id: 'b', text: 'Beta', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    store.toggleExpansion('a')
    expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['a', 'a1', 'b'])

    // G reaches the location's last visible row (Beta), walking past the expanded branch, not
    // Alpha's own last real sibling.
    store.moveSelectionBoundary('last', 99)
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'b' }, focus: { nodeId: 'b', cursor: 4 } })

    // A count of 2 reaches the second visible row (the grandchild), not Alpha's own second sibling.
    store.moveSelectionBoundary('last', 99, 2)
    expect(store.getSnapshot()).toMatchObject({
      location: { selectedNodeId: 'a1' },
      focus: { nodeId: 'a1', cursor: 10 },
    })

    // Leaving the branch rightward from its last visible descendant reaches Beta, and entering it
    // leftward from Beta returns to that same descendant.
    store.selectNode('a1', 'Grandchild'.length)
    expect(store.moveHorizontal('right', 'Grandchild'.length)).toBe(true)
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'b' }, focus: { cursor: 0 } })

    expect(store.moveHorizontal('left', 0)).toBe(true)
    expect(store.getSnapshot()).toMatchObject({
      location: { selectedNodeId: 'a1' },
      focus: { cursor: 'Grandchild'.length },
    })
  })

  it('reaches the location’s last visible row with G when the current-parent heading is selected', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: 'Alpha', children: [{ id: 'a1', text: 'Grandchild', children: [] }] },
              { id: 'b', text: 'Beta', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    store.toggleExpansion('a')

    // G from the editable current-parent heading unifies with the general visible-rows path: it
    // reaches the location's last visible row (Beta), exactly as it did through the old
    // heading-specific `displayedNodes` branch this task removed.
    store.moveSelectionBoundary('last', 99)
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'b' }, focus: { nodeId: 'b', cursor: 4 } })
  })

  it('moves horizontally between siblings and from child boundaries to the parent', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Parent',
            children: [
              { id: 'a', text: 'Alpha', children: [] },
              { id: 'b', text: 'Beta', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'a' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    expect(store.moveHorizontal('left', 0)).toBe(true)
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'root' }, focus: { cursor: 6 } })

    store.selectNode('a', 0)
    expect(store.moveHorizontal('right', 5)).toBe(true)
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'b' }, focus: { cursor: 0 } })

    expect(store.moveHorizontal('right', 4)).toBe(false)
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'b' }, focus: { cursor: 0 } })

    store.selectNode('root', 6)
    store.moveSelection('up', 6)
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'root' }, focus: { cursor: 0 } })

    store.selectNode('root', 6)
    expect(store.moveHorizontal('right', 6)).toBe(true)
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'a' }, focus: { cursor: 0 } })
  })

  it('does not move horizontally away from a root boundary or from the current parent', async () => {
    const store = new EditorStore(createServices(), ids('root'))
    await store.initialize()

    expect(store.moveHorizontal('left', 0)).toBe(false)
    expect(store.moveHorizontal('right', 0)).toBe(false)

    store.enter()
    expect(store.moveHorizontal('left', 0)).toBe(false)
    expect(store.moveHorizontal('right', 0)).toBe(false)
  })

  it('ignores invalid selection and commands before initialization', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Root', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.selectNode('missing', 0)
    store.enter()
    store.leave()
    store.navigateToAncestor('missing')

    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      location: { currentParentId: null, selectedNodeId: 'root' },
    })

    const blank = new EditorStore(createServices(), ids('root'))
    expect(() => blank.deleteSelected()).toThrow('not ready')
  })

  it('enters a node and selects its first child at the beginning', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [{ id: 'parent', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'parent' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.enter()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: 'parent', selectedNodeId: 'child' })
    expect(state.status === 'ready' && state.focus).toMatchObject({ nodeId: 'child', cursor: 0 })
  })

  it('does nothing when entering the already-selected current parent', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Root', children: [] }] },
      { currentParentId: 'root', selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.enter()

    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      location: { currentParentId: 'root', selectedNodeId: 'root' },
    })
  })

  it('undoes a sibling reorder', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              { id: 'a', text: 'A', children: [] },
              { id: 'b', text: 'B', children: [] },
            ],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'b' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    store.moveNodeTo('b', 0)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ children: [{ id: 'b' }, { id: 'a' }] }] },
    })

    store.undo()

    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ children: [{ id: 'a' }, { id: 'b' }] }] },
    })
  })

  it('undoes a multiline paste', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'abcdef', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = async () => ({ kind: 'text', text: 'one\ntwo' })
    const store = new EditorStore(services, ids('two'))
    await store.initialize()
    await store.paste('root', 3)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: { roots: [{ text: 'abcone' }, { text: 'twodef' }] },
    })

    store.undo()

    expect(store.getSnapshot()).toMatchObject({ status: 'ready', document: { roots: [{ text: 'abcdef' }] } })
  })

  it('undoes a subtree deletion', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [{ id: 'parent', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }],
          },
        ],
      },
      { currentParentId: 'root', selectedNodeId: 'parent' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    store.deleteSelected()
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', document: { roots: [{ children: [] }] } })

    store.undo()

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots[0]!.children[0]!.id).toBe('parent')
      expect(state.document.roots[0]!.children[0]!.children[0]!.id).toBe('child')
    }
  })

  it('undoes deletion of a node with an image', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('replacement'))
    await store.initialize()
    store.deleteSelected()
    const deleted = store.getSnapshot()
    expect(deleted.status === 'ready' && deleted.document.roots[0]!.attachment).toBeUndefined()

    store.undo()

    const restored = store.getSnapshot()
    expect(restored.status === 'ready' && restored.document.roots[0]!.attachment?.id).toBe('image')
  })

  it('retains attachments reachable only through undo history during cleanup', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const cleanups: string[][] = []
    services.cleanupAttachments = async (referencedIds) => {
      cleanups.push(referencedIds)
    }
    const store = new EditorStore(services, ids('replacement'))
    await store.initialize()

    store.deleteSelected()
    await store.flushPersistence()

    expect(cleanups.at(-1)).toContain('image')
  })

  it('cleans up attachments discarded only through the redo branch', async () => {
    const services = createServices({ kind: 'image', png: new Uint8Array([1]) })
    const cleanups: string[][] = []
    services.cleanupAttachments = async (referencedIds) => {
      cleanups.push([...referencedIds])
    }
    const store = new EditorStore(services, ids('root', 'image'))
    await store.initialize()
    await store.paste('root', 0)
    await store.flushPersistence()
    expect(cleanups.at(-1)).toContain('image')

    store.undo()
    await store.flushPersistence()
    expect(cleanups.at(-1)).toContain('image')

    cleanups.length = 0
    store.editText('root', 'changed')
    await store.flushPersistence()

    expect(cleanups).toHaveLength(1)
    expect(cleanups.at(-1)).not.toContain('image')
  })

  it('does not save on every keystroke and saves when ten words have been inserted', async () => {
    const services = createServices()
    const store = new EditorStore(services, ids('root'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    let text = ''
    for (let index = 0; index < 9; index += 1) {
      text = text === '' ? `w${index}` : `${text} w${index}`
      store.editText('root', text)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(services.saves).toEqual([])

    store.editText('root', `${text} w9`)
    await store.flushPersistence()
    expect(services.saves).toHaveLength(1)
  })

  it('counts inserted words since the last successful save across a failed save', async () => {
    const services = createServices()
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    let fail = true
    services.save = async (state) => {
      if (fail) throw new Error('disk full')
      services.saves.push(state)
    }

    store.editText('root', 'a b c')
    clock.runAll()
    await expect(store.flushPersistence()).rejects.toThrow('disk full')

    fail = false
    store.editText('root', 'a b c d e f g h i j')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(services.saves).toHaveLength(1)
  })

  it('requests a save for words inserted after an earlier successful snapshot when a later save fails', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const clock = new FakeClock()
    const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = []
    services.save = (state) => {
      services.saves.push(state)
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject })
      })
    }
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()

    const tenWords = 'one two three four five six seven eight nine ten '
    store.editText('root', tenWords)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(services.saves).toHaveLength(1)

    store.editText('root', tenWords + tenWords)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(services.saves).toHaveLength(1)

    pending[0]!.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(services.saves).toHaveLength(2)

    pending[1]!.reject(new Error('second save failed'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    store.editText('root', `${tenWords}${tenWords}eleven `)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(services.saves).toHaveLength(3)
  })

  it('continues with the coalesced save after the first save fails', async () => {
    const { services, pending } = deferredSaveServices()
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()

    const tenWords = 'one two three four five six seven eight nine ten '
    store.editText('root', tenWords)
    await tick()
    store.editText('root', tenWords + tenWords)
    await tick()
    expect(services.saves).toHaveLength(1)

    pending[0]!.reject(new Error('first save failed'))
    await tick()
    expect(services.saves).toHaveLength(2)

    pending[1]!.resolve()
    await tick()

    store.editText('root', `${tenWords}${tenWords}eleven `)
    await tick()
    expect(services.saves).toHaveLength(2)
  })

  it('retains all inserted words after consecutive failed saves until one succeeds', async () => {
    const { services, pending } = deferredSaveServices()
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()

    const tenWords = 'one two three four five six seven eight nine ten '
    store.editText('root', tenWords)
    await tick()
    store.editText('root', tenWords + tenWords)
    await tick()

    pending[0]!.reject(new Error('first save failed'))
    await tick()
    pending[1]!.reject(new Error('second save failed'))
    await tick()

    store.editText('root', `${tenWords}${tenWords}eleven `)
    await tick()
    expect(services.saves).toHaveLength(3)

    pending[2]!.resolve()
    await tick()

    store.editText('root', `${tenWords}${tenWords}eleven twelve `)
    await tick()
    expect(services.saves).toHaveLength(3)
  })

  it('acknowledges each successful snapshot without re-saving already-saved words', async () => {
    const { services, pending } = deferredSaveServices()
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()

    const tenWords = 'one two three four five six seven eight nine ten '
    store.editText('root', tenWords)
    await tick()
    store.editText('root', tenWords + tenWords)
    await tick()

    pending[0]!.resolve()
    await tick()
    pending[1]!.resolve()
    await tick()
    expect(services.saves).toHaveLength(2)

    store.editText('root', `${tenWords}${tenWords}eleven `)
    await tick()
    expect(services.saves).toHaveLength(2)
  })

  it('does not request another save for edits below the threshold while a save is pending', async () => {
    const { services, pending } = deferredSaveServices()
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()

    store.editText('root', 'a b c')
    clock.runAll()
    await tick()
    expect(services.saves).toHaveLength(1)

    store.editText('root', 'a b c d e f g h i')
    await tick()
    expect(services.saves).toHaveLength(1)

    pending[0]!.resolve()
    await tick()
    store.editText('root', 'a b c d e f g h i j')
    await tick()
    expect(services.saves).toHaveLength(1)

    store.editText('root', 'a b c d e f g h i j k l m n')
    await tick()
    expect(services.saves).toHaveLength(2)
  })

  it('keeps the words saved by a successful save when the following cleanup fails', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [{ id: 'child', text: '', children: [] }] }] },
      { currentParentId: 'root', selectedNodeId: 'child' },
    )
    const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = []
    services.save = (state) => {
      services.saves.push(state)
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject })
      })
    }
    const store = new EditorStore(services, ids('unused'), new FakeClock())
    await store.initialize()
    await store.flushPersistence()
    services.cleanupAttachments = async () => {
      throw new Error('cleanup failed')
    }

    store.deleteSelected()
    const tenWords = 'one two three four five six seven eight nine ten '
    store.editText('root', tenWords)
    await tick()
    expect(services.saves).toHaveLength(1)

    pending[0]!.resolve()
    await tick()
    expect(services.saves).toHaveLength(1)
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', saveError: 'cleanup failed' })

    store.editText('root', `${tenWords}eleven `)
    await tick()
    expect(services.saves).toHaveLength(1)
  })

  it('saves pending changes after the idle interval', async () => {
    const services = createServices()
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    store.editText('root', 'hello')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(services.saves).toEqual([])

    clock.runAll()
    await store.flushPersistence()
    expect(services.saves).toHaveLength(1)
  })

  it('saves immediately when an image is pasted', async () => {
    const services = createServices({ kind: 'image', png: new Uint8Array([1]) })
    const store = new EditorStore(services, ids('root', 'image'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    await store.paste('root', 0)
    await store.flushPersistence()
    expect(services.saves.at(-1)).toMatchObject({
      document: { roots: [{ attachment: { id: 'image', mimeType: 'image/png' } }] },
    })
  })

  it('saves immediately when a hyperlink is pasted', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.readClipboard = async () => ({ kind: 'text', text: 'https://example.com' })
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    await store.paste('root', 0)
    await store.flushPersistence()
    expect(services.saves).toHaveLength(1)
  })

  it('does not save when typing before an existing hyperlink shifts its range', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'https://example.com',
            links: [{ start: 0, end: 19, url: 'https://example.com' }],
            children: [],
          },
        ],
      },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    store.editContent('root', 'xhttps://example.com', [{ start: 1, end: 20, url: 'https://example.com' }], false)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(services.saves).toEqual([])
  })

  it('does not issue an immediate disk save for each character of an edited hyperlink', async () => {
    const url = 'https://example.com'
    const services = loadedState(
      { roots: [{ id: 'root', text: url, links: [{ start: 0, end: url.length, url }], children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    for (let count = 1; count <= 100; count += 1) {
      const edited = `${url}/${'a'.repeat(count)}`
      store.editContent('root', edited, [{ start: 0, end: edited.length, url: edited }], false)
    }
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(services.saves).toEqual([])
    await store.flushPersistence()
    expect(services.saves).toHaveLength(1)
  })

  it('does not issue an immediate disk save when a link is restored after a brief invalid edit', async () => {
    const url = 'https://example.com'
    const services = loadedState(
      { roots: [{ id: 'root', text: url, links: [{ start: 0, end: url.length, url }], children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    let text = url
    let links = [{ start: 0, end: url.length, url }]
    let draft: { start: number; end: number; url: string } | undefined
    const type = (nextText: string): void => {
      const edit = reconcileLinkTextEdit(text, links, nextText, draft)
      draft = edit.draft
      links = edit.links
      text = nextText
      store.editContent('root', text, links, edit.createsNewLink)
    }

    type('htps://example.com')
    type(url)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(services.saves).toEqual([])
    await store.flushPersistence()
    expect(services.saves).toHaveLength(1)
  })

  it('replaces one linked character while keeping the link destination aligned', async () => {
    const url = 'https://example.com'
    const services = loadedState(
      { roots: [{ id: 'root', text: url, links: [{ start: 0, end: url.length, url }], children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.replaceTextRange('root', 9, 10, 'A')

    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: {
        roots: [{ text: 'https://eAample.com', links: [{ url: 'https://eAample.com' }] }],
      },
    })
  })

  it('wraps linked text with disjoint edits as one undoable change', async () => {
    const url = 'https://example.com'
    const text = `see ${url} now`
    const start = text.indexOf(url)
    const services = loadedState(
      { roots: [{ id: 'root', text, links: [{ start, end: start + url.length, url }], children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.replaceTextRanges('root', [
      { start, end: start, inserted: '(' },
      { start: start + url.length, end: start + url.length, inserted: ')' },
    ])

    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      document: {
        roots: [{ text: `see (${url}) now`, links: [{ start: start + 1, end: start + url.length + 1, url }] }],
      },
    })

    store.undo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text }] } })
  })

  it('retains one undo step per standalone text replacement near the history limit', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    for (let length = 0; length < 120; length += 1) store.replaceTextRange('root', length, length, 'x')
    for (let length = 119; length >= 0; length -= 1) {
      store.undo()
      expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'x'.repeat(length) }] } })
    }
  })

  it('ignores a multi-edit text change that leaves the text unchanged', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'plain', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    store.replaceTextRanges('root', [{ start: 2, end: 2, inserted: '' }])

    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'plain' }] } })
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'plain' }] } })
  })

  it('saves immediately when an edit inserts a new hyperlink', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'x', children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    store.editContent('root', 'x https://example.com', [{ start: 2, end: 21, url: 'https://example.com' }], true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(services.saves).toHaveLength(1)
  })

  it('runs attachment cleanup only after a reference-changing save', async () => {
    const order: string[] = []
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Root', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }] },
      { currentParentId: null, selectedNodeId: 'root' },
    )
    services.cleanupAttachments = async () => {
      order.push('cleanup')
    }
    services.save = async () => {
      order.push('save')
    }
    const store = new EditorStore(services, ids('replacement'))
    await store.initialize()
    await store.flushPersistence()
    expect(order).toEqual(['cleanup'])

    order.length = 0
    store.editText('root', 'Changed')
    await store.flushPersistence()
    expect(order).toEqual(['save'])

    order.length = 0
    store.deleteSelected()
    await store.flushPersistence()
    expect(order).toEqual(['save', 'cleanup'])
  })

  it('keeps changes pending after a failed save and retries on the next idle interval', async () => {
    const services = createServices()
    let fail = true
    services.save = async (state) => {
      if (fail) throw new Error('disk full')
      services.saves.push(state)
    }
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await expect(store.flushPersistence()).rejects.toThrow('disk full')
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', saveError: 'disk full' })

    fail = false
    clock.runAll()
    await store.flushPersistence()
    const recovered = store.getSnapshot()
    expect(recovered).toMatchObject({ status: 'ready' })
    if (recovered.status === 'ready') expect(recovered.saveError).toBeUndefined()
    expect(services.saves).toHaveLength(1)
  })

  it('locks the editor after three consecutive failed save attempts and stops retrying', async () => {
    const clock = new FakeClock()
    const { store, attempts } = await lockEditor(clock)

    expect(attempts()).toBe(3)
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      saveError: 'disk full',
      persistenceLocked: true,
    })

    store.selectNode('root', 0)
    clock.runAll()
    await tick()
    expect(attempts()).toBe(3)

    store.editText('root', 'one two three four five six seven eight nine ten eleven')
    clock.runAll()
    await tick()
    expect(attempts()).toBe(3)
    const locked = store.getSnapshot()
    expect(locked.status === 'ready' && locked.document.roots[0]!.text).toBe(
      'one two three four five six seven eight nine ten',
    )
  })

  it('rejects document mutations while locked but keeps navigation, selection, and copy available', async () => {
    const clock = new FakeClock()
    const { store, services } = await lockEditor(clock)
    const writes: unknown[] = []
    services.writeClipboard = async (payload) => {
      writes.push(payload)
    }
    const readClipboard = vi.fn(async (): Promise<ClipboardValue> => ({ kind: 'text', text: 'clipboard' }))
    services.readClipboard = readClipboard

    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('Expected a ready editor.')

    store.editText('root', 'changed')
    store.createSiblingOrFirstChild(0)
    store.deleteSelected()
    store.undo()
    store.redo()
    await store.paste('root', 0)
    await store.cut('root', 0, 1)

    expect(readClipboard).not.toHaveBeenCalled()
    const after = store.getSnapshot()
    if (after.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(after.document).toBe(before.document)
    expect(after.document.roots).toHaveLength(1)

    store.selectNode('root', 1)
    const selected = store.getSnapshot()
    expect(selected.status === 'ready' && selected.location.selectedNodeId).toBe('root')
    await expect(store.copy('root', 0, 1)).resolves.toBe(true)
    expect(writes).toHaveLength(1)
  })

  it('rejects createSibling while locked without changing document, location, or focus', async () => {
    const clock = new FakeClock()
    const { store } = await lockEditor(clock)
    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('Expected a ready editor.')

    expect(store.createSibling('after')).toBe(false)

    const after = store.getSnapshot()
    if (after.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(after.document).toBe(before.document)
    expect(after.location).toEqual(before.location)
    expect(after.focus).toEqual(before.focus)
  })

  it('retries failed cleanup without saving the document, never locks, and recovers on cleanup success', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: '', children: [{ id: 'child', text: '', children: [] }] }] },
      { currentParentId: 'root', selectedNodeId: 'child' },
    )
    const clock = new FakeClock()
    let cleanupAttempts = 0
    let cleanupFails = true
    services.cleanupAttachments = async () => {
      cleanupAttempts += 1
      if (cleanupFails) throw new Error('cleanup failed')
    }
    const store = new EditorStore(services, ids('unused'), clock)
    await store.initialize()
    await tick()
    expect(cleanupAttempts).toBe(1)

    clock.runAll()
    await tick()
    clock.runAll()
    await tick()

    expect(cleanupAttempts).toBe(3)
    expect(services.saves).toEqual([])
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', saveError: 'cleanup failed' })
    const locked = store.getSnapshot()
    expect(locked.status === 'ready' && locked.persistenceLocked).toBeUndefined()

    cleanupFails = false
    store.deleteSelected()
    await store.flushPersistence()
    await tick()

    expect(cleanupAttempts).toBeGreaterThanOrEqual(4)
    const recovered = store.getSnapshot()
    expect(recovered.status === 'ready' && recovered.saveError).toBeUndefined()
  })

  it('attempts a save on flush while locked and unlocks after success', async () => {
    const clock = new FakeClock()
    const { store, services } = await lockEditor(clock)
    services.save = async (state) => {
      services.saves.push(state)
    }

    await expect(store.flushPersistence()).resolves.toBeUndefined()

    expect(services.saves).toHaveLength(1)
    const recovered = store.getSnapshot()
    expect(recovered).toMatchObject({ status: 'ready' })
    if (recovered.status === 'ready') {
      expect(recovered.persistenceLocked).toBeUndefined()
      expect(recovered.saveError).toBeUndefined()
    }
  })

  it('resets the failure count after a successful save', async () => {
    const services = createServices()
    const clock = new FakeClock()
    let fail = false
    services.save = async (state) => {
      if (fail) throw new Error('disk full')
      services.saves.push(state)
    }
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    const tenWords = 'one two three four five six seven eight nine ten '
    store.editText('root', tenWords)
    fail = true
    await tick()
    clock.runAll()
    await tick()
    expect(services.saves).toEqual([])

    fail = false
    clock.runAll()
    await tick()
    expect(services.saves).toHaveLength(1)

    fail = true
    store.editText('root', `${tenWords}eleven twelve `)
    await tick()
    clock.runAll()
    await tick()
    clock.runAll()
    await tick()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.persistenceLocked).toBeUndefined()
  })

  it('does not start a save queued before the third failure after locking', async () => {
    const { services, pending } = deferredSaveServices()
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    const tenWords = 'one two three four five six seven eight nine ten '
    store.editText('root', tenWords)
    await tick()
    store.editText('root', `${tenWords}eleven `)
    await tick()
    pending[0]!.reject(new Error('first save failed'))
    await tick()
    await tick()

    store.editText('root', `${tenWords}eleven twelve `)
    await tick()
    pending[1]!.reject(new Error('second save failed'))
    await tick()
    await tick()

    store.editText('root', `${tenWords}eleven twelve thirteen `)
    await tick()
    pending[2]!.reject(new Error('third save failed'))
    await tick()
    await tick()
    await tick()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.persistenceLocked).toBe(true)
    expect(services.saves).toHaveLength(3)
    expect(pending).toHaveLength(3)
  })

  it('cancels a pending idle save when the third consecutive failure locks the editor', async () => {
    const { services, pending } = deferredSaveServices()
    const clock = new FakeClock()
    const store = new EditorStore(services, ids('root'), clock)
    await store.initialize()
    await store.flushPersistence()
    services.saves.length = 0

    const tenWords = 'one two three four five six seven eight nine ten '
    store.editText('root', tenWords)
    await tick()
    pending[0]!.reject(new Error('first save failed'))
    await tick()
    await tick()

    clock.runAll()
    await tick()
    pending[1]!.reject(new Error('second save failed'))
    await tick()
    await tick()

    clock.runAll()
    await tick()
    expect(pending).toHaveLength(3)

    store.selectNode('root', 0)

    pending[2]!.reject(new Error('third save failed'))
    await tick()
    await tick()

    const locked = store.getSnapshot()
    expect(locked.status === 'ready' && locked.persistenceLocked).toBe(true)
    expect(services.saves).toHaveLength(3)
    expect(pending).toHaveLength(3)

    clock.runAll()
    await tick()
    expect(services.saves).toHaveLength(3)
    expect(pending).toHaveLength(3)
  })

  it('prompts for quit without saving only while locked and dismisses it', async () => {
    const unlockedServices = createServices()
    const unlocked = new EditorStore(unlockedServices, ids('root'), new FakeClock())
    await unlocked.initialize()
    unlocked.requestQuitWithoutSavingPrompt()
    const before = unlocked.getSnapshot()
    expect(before.status === 'ready' && before.quitWithoutSavingPrompt).toBeUndefined()

    const clock = new FakeClock()
    const { store } = await lockEditor(clock)

    store.requestQuitWithoutSavingPrompt()
    const locked = store.getSnapshot()
    expect(locked.status === 'ready' && locked.quitWithoutSavingPrompt).toBe(true)

    store.dismissQuitWithoutSavingPrompt()
    const dismissed = store.getSnapshot()
    expect(dismissed.status === 'ready' && dismissed.quitWithoutSavingPrompt).toBeUndefined()
  })

  it('normalizes a restored descendant selection below a non-null current parent to its direct child', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            children: [
              {
                id: 'child',
                text: 'Child',
                children: [{ id: 'grandchild', text: 'Grandchild', children: [] }],
              },
            ],
          },
        ],
      },
      { currentParentId: 'parent', selectedNodeId: 'grandchild' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    const snapshot = store.getSnapshot()
    expect(snapshot.status).toBe('ready')
    if (snapshot.status !== 'ready') throw new Error('Editor did not load')
    expect(snapshot.location).toEqual({ currentParentId: 'parent', selectedNodeId: 'child' })
    expect(displayedNodes(snapshot.document, snapshot.location.currentParentId).map((node) => node.id)).toContain(
      snapshot.location.selectedNodeId,
    )
    expect(snapshot.focus.nodeId).toBe('child')
  })

  it('normalizes a restored descendant selection below a null current parent to its top-level root', async () => {
    const services = loadedState(
      {
        roots: [
          {
            id: 'root',
            text: 'Root',
            children: [
              {
                id: 'child',
                text: 'Child',
                children: [{ id: 'grandchild', text: 'Grandchild', children: [] }],
              },
            ],
          },
        ],
      },
      { currentParentId: null, selectedNodeId: 'grandchild' },
    )
    const store = new EditorStore(services, ids('unused'))
    await store.initialize()

    const snapshot = store.getSnapshot()
    expect(snapshot.status).toBe('ready')
    if (snapshot.status !== 'ready') throw new Error('Editor did not load')
    expect(snapshot.location).toEqual({ currentParentId: null, selectedNodeId: 'root' })
    expect(displayedNodes(snapshot.document, snapshot.location.currentParentId).map((node) => node.id)).toContain(
      snapshot.location.selectedNodeId,
    )
    expect(snapshot.focus.nodeId).toBe('root')
  })
})
