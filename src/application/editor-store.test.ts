import { describe, expect, it, vi } from 'vitest'
import { EditorStore, type ClipboardValue, type Clock, type EditorServices } from './editor-store'
import { MAX_DOCUMENT_DEPTH, type TreeNode } from '../domain/document'

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
    hasAttachment: async () => true,
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

describe('EditorStore', () => {
  it('reports maximum depth without changing editor state, history, IDs, or persistence', async () => {
    const root: TreeNode = { id: 'n0', text: 'root', children: [] }
    let current = root
    for (let index = 1; index < MAX_DOCUMENT_DEPTH; index += 1) {
      const child: TreeNode = { id: `n${index}`, text: `node-${index}`, children: [] }
      current.children.push(child)
      current = child
    }
    const services = loadedState({ roots: [root] }, { currentParentId: current.id, selectedNodeId: current.id })
    const createId = vi.fn(() => 'must-not-be-consumed')
    const store = new EditorStore(services, createId)
    await store.initialize()
    const before = store.getSnapshot()
    if (before.status !== 'ready') throw new Error('Expected a ready editor.')

    store.createSiblingOrFirstChild(0)

    const after = store.getSnapshot()
    expect(after).toMatchObject({
      status: 'ready',
      location: { currentParentId: current.id, selectedNodeId: current.id },
      operationError: 'Nodes cannot be nested deeper than 20 levels.',
    })
    if (after.status !== 'ready') throw new Error('Expected a ready editor.')
    expect(after.document).toEqual(before.document)
    expect(after.focus).toEqual(before.focus)
    expect(createId).not.toHaveBeenCalled()
    expect(services.saves).toEqual([])

    store.undo()
    expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: current.id } })
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
    store.moveNodeTo('second', 0)

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots.map((node) => node.id)).toEqual(['second', 'root'])
    expect(state.status === 'ready' && state.location.selectedNodeId).toBe('second')
  })

  it('leaves invalid persisted data untouched when an attachment is missing', async () => {
    const services = createServices()
    services.load = async () => ({
      version: 1,
      document: {
        roots: [{ id: 'root', text: '', attachment: { id: 'missing', mimeType: 'image/png' }, children: [] }],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    services.hasAttachment = async () => false
    const store = new EditorStore(services, ids('unused'))

    await store.initialize()

    expect(store.getSnapshot()).toMatchObject({ status: 'error', message: expect.stringContaining('missing') })
    expect(services.saves).toEqual([])
  })

  it('checks every attachment and reports the first missing one in traversal order', async () => {
    const services = createServices()
    services.load = async () => ({
      version: 1,
      document: {
        roots: [
          { id: 'first-node', text: '', attachment: { id: 'first', mimeType: 'image/png' }, children: [] },
          { id: 'second-node', text: '', attachment: { id: 'second', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first-node' },
    })
    const checked: string[] = []
    services.hasAttachment = async (id) => {
      checked.push(id)
      return false
    }
    const store = new EditorStore(services, ids('unused'))

    await store.initialize()

    expect(store.getSnapshot()).toMatchObject({ status: 'error', message: expect.stringContaining('second') })
    expect(checked).toEqual(['second', 'first'])
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

  it('navigates to the parent when deleting a non-root current parent', async () => {
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

    store.deleteSelected()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots[0]!.children).toEqual([])
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: 'root', selectedNodeId: 'root' })
  })

  it('selects the next root when deleting a root current parent', async () => {
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

    store.deleteSelected()

    const state = store.getSnapshot()
    expect(state.status === 'ready' && state.document.roots.map((node) => node.id)).toEqual(['r2'])
    expect(state.status === 'ready' && state.location).toEqual({ currentParentId: null, selectedNodeId: 'r2' })
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

  it('replaces the only root when it is deleted as the current parent', async () => {
    const services = loadedState(
      { roots: [{ id: 'root', text: 'Root', children: [] }] },
      { currentParentId: 'root', selectedNodeId: 'root' },
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
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', saveError: undefined })
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
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', operationError: undefined })
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

    store.editContent('root', 'xhttps://example.com', [{ start: 1, end: 20, url: 'https://example.com' }])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(services.saves).toEqual([])
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

    store.editContent('root', 'x https://example.com', [{ start: 2, end: 21, url: 'https://example.com' }])
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
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', saveError: undefined })
    expect(services.saves).toHaveLength(1)
  })
})
