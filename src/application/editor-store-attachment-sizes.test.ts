import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { AttachmentDimensions } from '../domain/attachment-dimensions'
import type { Document, PersistedEditorState, TreeNode } from '../domain/document'

afterEach(() => vi.useRealTimers())

type ReadSizes = NonNullable<EditorServices['readAttachmentDimensions']>

function image(id: string, attachmentId: string, size?: AttachmentDimensions): TreeNode {
  return { id, text: id, attachment: { id: attachmentId, mimeType: 'image/png', ...size }, children: [] }
}

function setup(document: Document, readAttachmentDimensions?: ReadSizes) {
  const save = vi.fn<(state: PersistedEditorState) => Promise<void>>(async () => undefined)
  const services: EditorServices = {
    load: async () => ({
      version: 6,
      document,
      location: { currentParentId: null, selectedNodeId: 'a' },
      view: { expandedIds: [] },
    }),
    save,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
    ...(readAttachmentDimensions === undefined ? {} : { readAttachmentDimensions }),
  }
  let next = 0
  return { store: new EditorStore(services, () => `new-${next++}`), save }
}

function ready(store: EditorStore) {
  const state = store.getSnapshot()
  if (state.status !== 'ready') throw new Error('Not ready')
  return state
}

function attachmentOf(store: EditorStore, index: number) {
  return ready(store).document.roots[index]!.attachment
}

// @requirement PRODUCT.md §17
describe('attachment size backfill', () => {
  it('fills missing sizes from image headers without a history entry or a save of its own', async () => {
    const read = vi.fn<ReadSizes>(async (ids) =>
      ids.map((id) => (id === 'missing' ? null : { width: id.length, height: 7 })),
    )
    const { store, save } = setup(
      {
        roots: [
          image('a', 'legacy'),
          image('b', 'missing'),
          image('c', 'sized', { width: 1, height: 1 }),
          image('d', 'legacy'),
        ],
      },
      read,
    )

    await store.initialize()
    await vi.waitFor(() => expect(attachmentOf(store, 0)).toMatchObject({ width: 6, height: 7 }))

    expect(read).toHaveBeenCalledExactlyOnceWith(['legacy', 'missing'])
    expect(attachmentOf(store, 3)).toMatchObject({ width: 6, height: 7 })
    expect(attachmentOf(store, 1)).toEqual({ id: 'missing', mimeType: 'image/png' })
    expect(attachmentOf(store, 2)).toMatchObject({ width: 1, height: 1 })
    store.undo()
    expect(attachmentOf(store, 0)).toMatchObject({ width: 6, height: 7 })
    expect(save).not.toHaveBeenCalled()

    store.selectNode('b', 0)
    await store.flushPersistence()

    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0]![0].document.roots[0]!.attachment).toMatchObject({ width: 6, height: 7 })
  })

  it('does not delay startup and also enriches the undo history recorded meanwhile', async () => {
    let answer!: (sizes: Array<AttachmentDimensions | null>) => void
    const read = vi.fn<ReadSizes>(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const { store } = setup({ roots: [image('a', 'legacy')] }, read)

    await store.initialize()
    store.editText('a', 'edited')
    answer([{ width: 30, height: 40 }])
    await vi.waitFor(() => expect(attachmentOf(store, 0)).toMatchObject({ width: 30, height: 40 }))
    store.undo()

    expect(ready(store).document.roots[0]).toMatchObject({ text: 'a', attachment: { width: 30, height: 40 } })
  })

  it('reads headers in batches of at most 100 and keeps the sizes of batches that succeed', async () => {
    const roots = Array.from({ length: 250 }, (_, index) => image(index === 0 ? 'a' : `n${index}`, `image-${index}`))
    const read = vi.fn<ReadSizes>(async (ids) => {
      if (ids.includes('image-150')) throw new Error('header read failed')
      return ids.map(() => ({ width: 2, height: 3 }))
    })
    const { store } = setup({ roots }, read)

    await store.initialize()
    await vi.waitFor(() => expect(attachmentOf(store, 249)).toMatchObject({ width: 2, height: 3 }))

    expect(read.mock.calls.map(([ids]) => ids.length)).toEqual([100, 100, 50])
    expect(attachmentOf(store, 0)).toMatchObject({ width: 2, height: 3 })
    expect(attachmentOf(store, 150)).toEqual({ id: 'image-150', mimeType: 'image/png' })
  })

  it('ignores invalid header results and does nothing without the service or legacy images', async () => {
    const read = vi.fn<ReadSizes>(async () => [{ width: 0, height: 3 }])
    const invalid = setup({ roots: [image('a', 'legacy')] }, read)
    const unsupported = setup({ roots: [image('a', 'legacy')] })
    const sizedRead = vi.fn<ReadSizes>(async () => [])
    const sized = setup({ roots: [image('a', 'sized', { width: 1, height: 2 })] }, sizedRead)

    await invalid.store.initialize()
    await unsupported.store.initialize()
    await sized.store.initialize()
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    const before = ready(invalid.store).document
    await Promise.resolve()

    expect(ready(invalid.store).document).toBe(before)
    expect(attachmentOf(invalid.store, 0)).toEqual({ id: 'legacy', mimeType: 'image/png' })
    expect(attachmentOf(unsupported.store, 0)).toEqual({ id: 'legacy', mimeType: 'image/png' })
    expect(sizedRead).not.toHaveBeenCalled()
  })
})

// @requirement PRODUCT.md §17.1
describe('decoded image size correction', () => {
  it('replaces a differing stored size, gathering reports into one publication without history or save', async () => {
    vi.useFakeTimers()
    const { store, save } = setup({
      roots: [image('a', 'first', { width: 10, height: 20 }), image('b', 'second', { width: 5, height: 5 })],
    })
    await store.initialize()
    const listener = vi.fn()
    store.subscribe(listener)

    store.recordAttachmentDimensions('first', 20, 10)
    store.recordAttachmentDimensions('second', 6, 4)
    store.recordAttachmentDimensions('second', 0, 4)
    expect(listener).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)

    expect(listener).toHaveBeenCalledOnce()
    expect(attachmentOf(store, 0)).toMatchObject({ width: 20, height: 10 })
    expect(attachmentOf(store, 1)).toMatchObject({ width: 6, height: 4 })
    store.undo()
    expect(attachmentOf(store, 0)).toMatchObject({ width: 20, height: 10 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(save).not.toHaveBeenCalled()
  })

  it('publishes nothing when the decoded size equals the stored one', async () => {
    vi.useFakeTimers()
    const { store } = setup({ roots: [image('a', 'first', { width: 10, height: 20 })] })
    await store.initialize()
    const before = ready(store).document

    store.recordAttachmentDimensions('first', 10, 20)
    await vi.advanceTimersByTimeAsync(100)

    expect(ready(store).document).toBe(before)
  })
})
