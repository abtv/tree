import { describe, expect, it, vi } from 'vitest'
import { EditorStore, type ClipboardValue, type EditorServices } from './editor-store'

function createServices(clipboard: ClipboardValue = { kind: 'text', text: '' }): EditorServices & { saves: unknown[] } {
  const saves: unknown[] = []
  return {
    saves,
    load: async () => null,
    save: async (state) => { saves.push(state) },
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

describe('EditorStore', () => {
  it('creates an initial root and a sibling split', async () => {
    const store = new EditorStore(createServices(), ids('root', 'next'))
    await store.initialize()
    store.editText('root', 'Current')
    store.createSiblingOrFirstChild(3)

    const state = store.getSnapshot()
    expect(state.status).toBe('ready')
    if (state.status === 'ready') {
      expect(state.document.roots.map((node) => [node.id, node.text])).toEqual([['root', 'Cur'], ['next', 'rent']])
      expect(state.location.selectedNodeId).toBe('next')
    }
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

  it('creates a following sibling when image paste targets a node with an image', async () => {
    const store = new EditorStore(createServices({ kind: 'image', png: new Uint8Array([1]) }), ids('root', 'first-image', 'second-image', 'image-node'))
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
      document: { roots: [{ id: 'root', text: '', attachment: { id: 'missing', mimeType: 'image/png' }, children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    services.hasAttachment = async () => false
    const store = new EditorStore(services, ids('unused'))

    await store.initialize()

    expect(store.getSnapshot()).toMatchObject({ status: 'error', message: expect.stringContaining('missing') })
    expect(services.saves).toEqual([])
  })
})
