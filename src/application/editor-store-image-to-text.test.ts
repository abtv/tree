import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'

afterEach(() => vi.useRealTimers())

async function setup(recognize: EditorServices['imageToText'], extra: Partial<EditorServices> = {}) {
  vi.useFakeTimers()
  let id = 0
  const store = new EditorStore(
    {
      ...(recognize === undefined ? {} : { imageToText: recognize }),
      load: async () => ({
        version: 1,
        document: {
          roots: [
            {
              id: 'image',
              text: 'Screenshot',
              attachment: { id: 'png', mimeType: 'image/png' },
              children: [{ id: 'existing', text: 'Existing child', children: [] }],
            },
            { id: 'other', text: 'Other image', attachment: { id: 'other-png', mimeType: 'image/png' }, children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'image' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
      ...extra,
    },
    () => `new-${id++}`,
  )
  await store.initialize()
  return store
}

function ready(store: EditorStore) {
  const state = store.getSnapshot()
  if (state.status !== 'ready') throw new Error('Expected ready')
  return state
}

function searchText(store: EditorStore, rootIndex: number): string | undefined {
  return ready(store).document.roots[rootIndex]!.attachment?.searchText
}

// @requirement PRODUCT.md §15.1
it('retires pending recognition before a shutdown flush and allows a later reindex', async () => {
  let finish!: (text: string[]) => void
  const recognize = vi
    .fn<NonNullable<EditorServices['imageToText']>>()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done
        }),
    )
    .mockResolvedValue(['Retry'])
  const store = await setup(recognize)
  await store.flushPersistence()
  const before = ready(store).document
  store.reindexAllImages()

  const flushing = store.flushPersistence({ cancelImageRecognition: true })
  store.reindexAllImages()
  finish(['Late result'])
  await flushing
  await vi.advanceTimersByTimeAsync(0)

  expect(ready(store).document).toBe(before)
  expect(recognize).toHaveBeenCalledOnce()

  store.reindexAllImages()
  await vi.waitFor(() => expect(searchText(store, 1)).toBe('Retry'))

  expect(searchText(store, 0)).toBe('Retry')
})

// @requirement PRODUCT.md §15.1
it('does not retire recognition for an ordinary archive snapshot flush', async () => {
  let finish!: (text: string[]) => void
  const store = await setup(
    () =>
      new Promise((done) => {
        finish = done
      }),
  )
  store.reindexAllImages()

  await store.flushPersistence()
  finish(['Still recognized'])

  await vi.waitFor(() => expect(searchText(store, 0)).toBe('Still recognized'))
})

// @requirement PRODUCT.md §15.1
it('keeps recognition suspended across overlapping shutdown flushes and releases it after a failure', async () => {
  let finishRecognition!: (text: string[]) => void
  let finishFirst!: () => void
  let failSecond!: (error: Error) => void
  const recognize = vi
    .fn<NonNullable<EditorServices['imageToText']>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRecognition = resolve
        }),
    )
    .mockResolvedValue(['Retry'])
  const store = await setup(recognize)
  const flushHistory = vi
    .spyOn(store.emojiHistory, 'flush')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failSecond = reject
        }),
    )
  store.reindexAllImages()

  const first = store.flushPersistence({ cancelImageRecognition: true })
  const second = store.flushPersistence({ cancelImageRecognition: true })
  await vi.waitFor(() => expect(flushHistory).toHaveBeenCalledTimes(2))
  finishFirst()
  await first
  store.reindexAllImages()

  expect(recognize).toHaveBeenCalledOnce()

  failSecond(new Error('history unavailable'))
  await expect(second).rejects.toThrow('history unavailable')
  store.reindexAllImages()
  finishRecognition(['Discarded'])
  await vi.waitFor(() => expect(searchText(store, 1)).toBe('Retry'))

  expect(searchText(store, 0)).toBe('Retry')
  expect(recognize).toHaveBeenCalledTimes(3)
})

// @requirement PRODUCT.md §15.1
it('ignores recognition after initialization failed without replacing the document error', async () => {
  const recognize = vi.fn(async () => ['Unexpected'])
  const store = await setup(recognize, {
    load: async () => {
      throw new Error('Cannot open notes')
    },
  })
  const before = store.getSnapshot()

  store.reindexAllImages()

  expect(before).toMatchObject({ status: 'error', message: 'Cannot open notes' })
  expect(store.getSnapshot()).toBe(before)
  expect(recognize).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §15.1
it('discards pending results and refuses new recognition when saving becomes locked', async () => {
  let finish!: (text: string[]) => void
  const recognize = vi.fn<NonNullable<EditorServices['imageToText']>>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const save = vi.fn(async () => {
    throw new Error('disk full')
  })
  const store = await setup(recognize, { save })
  store.reindexAllImages()
  store.editText('other', 'Changed')

  for (let attempt = 0; attempt < 3; attempt++) await expect(store.flushPersistence()).rejects.toThrow('disk full')
  expect(ready(store).persistenceLocked).toBe(true)
  const before = ready(store).document
  finish(['Must not be stored'])
  await vi.waitFor(() => expect(recognize).toHaveBeenCalledTimes(2))
  store.reindexAllImages()

  expect(ready(store).document).toBe(before)
  expect(searchText(store, 0)).toBeUndefined()
  expect(recognize).toHaveBeenCalledTimes(2)
})
