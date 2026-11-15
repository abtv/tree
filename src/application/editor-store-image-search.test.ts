import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import { searchNodes } from './node-search'
import { parsePersistedState, serializeState } from '../domain/document'

afterEach(() => vi.useRealTimers())

async function setup(
  imageToText?: EditorServices['imageToText'],
  document = { roots: [{ id: 'source', text: 'Caption', children: [] }] } as import('../domain/document').Document,
) {
  vi.useFakeTimers()
  let id = 0
  const save = vi.fn(async () => undefined)
  const store = new EditorStore(
    {
      load: async () => ({
        version: 1,
        document,
        location: { currentParentId: null, selectedNodeId: 'source' },
      }),
      save,
      readClipboard: async () => ({ kind: 'image', png: new Uint8Array([1]) }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
      ...(imageToText === undefined ? {} : { imageToText }),
    },
    () => `new-${id++}`,
  )
  await store.initialize()
  return { store, save }
}

function ready(store: EditorStore) {
  const state = store.getSnapshot()
  if (state.status !== 'ready') throw new Error('Not ready')
  return state
}

function results(store: EditorStore, query: string) {
  const work = searchNodes(ready(store).document, query)
  let next = work.next()
  while (!next.done) next = work.next()
  return next.value
}

it('reindexes completed images without adding children or undo steps, and deduplicates repeated commands', async () => {
  const recognize = vi.fn(async () => ['Old'])
  const { store } = await setup(recognize)
  await store.paste('source', 0)
  await vi.waitFor(() => expect(results(store, 'Old')).toHaveLength(1))
  let finish!: (text: string[]) => void
  recognize.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const before = ready(store)

  store.reindexAllImages()
  store.reindexAllImages()

  expect(recognize).toHaveBeenCalledTimes(2)
  expect(results(store, 'Old')).toHaveLength(1)

  finish(['New'])
  await vi.waitFor(() => expect(results(store, 'New')).toHaveLength(1))

  expect(results(store, 'Old')).toHaveLength(0)
  expect(ready(store).focus).toBe(before.focus)
  expect(ready(store).document.roots[0]!.children).toEqual([])
  store.undo()
  expect(ready(store).document.roots[0]!.attachment).toBeUndefined()
})

it('queues only unique identities and recognizes sequentially across a large document', async () => {
  const releases: Array<(text: string[]) => void> = []
  const recognize = vi.fn(
    () =>
      new Promise<string[]>((resolve) => {
        releases.push(resolve)
      }),
  )
  const { store } = await setup(recognize, {
    roots: Array.from({ length: 200 }, (_, index) => ({
      id: index === 0 ? 'source' : `node-${index}`,
      text: '',
      children: [],
      attachment: { id: `image-${index % 100}`, mimeType: 'image/png' as const },
    })),
  })

  store.reindexAllImages()
  for (let repeat = 0; repeat < 20; repeat++) store.reindexAllImages()

  expect(recognize).toHaveBeenCalledOnce()
  for (let index = 0; index < 100; index++) {
    releases[index]!(['Indexed'])
    await vi.advanceTimersByTimeAsync(0)
    expect(recognize).toHaveBeenCalledTimes(Math.min(index + 2, 100))
  }

  expect(ready(store).document.roots.every((node) => node.attachment?.searchText === 'Indexed')).toBe(true)
})

it('retains the existing index when reindexing fails', async () => {
  const recognize = vi.fn(async () => ['Previous'])
  const { store } = await setup(recognize)
  await store.paste('source', 0)
  await vi.waitFor(() => expect(results(store, 'Previous')).toHaveLength(1))
  recognize.mockRejectedValueOnce(new Error('unavailable'))

  store.reindexAllImages()
  await vi.advanceTimersByTimeAsync(0)

  expect(results(store, 'Previous')).toHaveLength(1)
})

it('keeps reindexing a shared image when its first owner is deleted', async () => {
  let finish!: (text: string[]) => void
  const { store } = await setup(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    {
      roots: ['source', 'other'].map((id) => ({
        id,
        text: '',
        children: [],
        attachment: { id: 'shared', mimeType: 'image/png' },
      })),
    },
  )
  store.reindexAllImages()

  store.deleteSelected()
  finish(['Surviving'])
  await vi.waitFor(() => expect(results(store, 'Surviving')).toHaveLength(1))

  expect(ready(store).document.roots[0]!.id).toBe('other')
})

// @requirement PRODUCT.md §15.1
// @requirement PRODUCT.md §20.14
it('indexes pasted images without visible text or undo steps and preserves metadata through reload and history', async () => {
  let finish!: (text: string[]) => void
  const { store } = await setup(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await store.paste('source', 0)
  store.editText('source', 'Edited caption')
  const focus = ready(store).focus

  finish(['Secret Zebra #hidden'])
  await vi.waitFor(() => expect(results(store, 'secret')).toHaveLength(1))

  expect(ready(store).focus).toBe(focus)
  expect(ready(store).document.roots[0]!.children).toEqual([])
  expect(results(store, 'secret')[0]!.text).toBe('Edited caption')
  expect(results(store, 'SECRET')).toEqual([])
  expect(results(store, '#hidden')).toEqual([])
  const persisted = serializeState(ready(store).document, ready(store).location)
  expect(parsePersistedState(JSON.parse(JSON.stringify(persisted))).document).toEqual(persisted.document)

  store.undo()
  expect(ready(store).document.roots[0]!.text).toBe('Caption')
  expect(results(store, 'secret')).toHaveLength(1)
  store.undo()
  expect(ready(store).document.roots[0]!.attachment).toBeUndefined()
  expect(results(store, 'secret')).toEqual([])
  store.redo()
  expect(results(store, 'secret')).toHaveLength(1)
  store.deleteSelected()
  expect(results(store, 'secret')).toEqual([])
  store.undo()
  expect(results(store, 'secret')).toHaveLength(1)
})

it('never revives a result canceled by removing its image, even after redo', async () => {
  let finish!: (text: string[]) => void
  const recognize = vi.fn(
    () =>
      new Promise<string[]>((resolve) => {
        finish = resolve
      }),
  )
  const { store } = await setup(recognize)
  await store.paste('source', 0)
  store.undo()
  store.redo()

  finish(['Stale'])
  await vi.advanceTimersByTimeAsync(1)

  expect(ready(store).document.roots[0]!.attachment?.searchText).toBeUndefined()
  expect(results(store, 'stale')).toEqual([])
  expect(recognize).toHaveBeenCalledOnce()
})

it('marks an empty successful result complete and does not retry errors or unsupported images', async () => {
  const empty = await setup(async () => [])
  await empty.store.paste('source', 0)
  await vi.waitFor(() => expect(ready(empty.store).document.roots[0]!.attachment?.searchText).toBe(''))

  const recognize = vi.fn(async () => {
    throw new Error('timeout')
  })
  const failed = await setup(recognize)
  await failed.store.paste('source', 0)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(ready(failed.store).document.roots[0]!.attachment?.searchText).toBeUndefined()
  expect(ready(failed.store).imageToTextStatus).toBeUndefined()
  expect(recognize).toHaveBeenCalledOnce()

  const unsupported = await setup()
  await unsupported.store.paste('source', 0)
  expect(ready(unsupported.store).document.roots[0]!.attachment?.searchText).toBeUndefined()
})

it('keeps redo when recognition completes after undoing a later text edit', async () => {
  let finish!: (text: string[]) => void
  const { store } = await setup(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await store.paste('source', 0)
  store.editText('source', 'Later')
  store.undo()

  finish(['Recognized'])
  await vi.waitFor(() => expect(results(store, 'recognized')).toHaveLength(1))
  store.redo()

  expect(ready(store).document.roots[0]!.text).toBe('Later')
  expect(results(store, 'recognized')).toHaveLength(1)
})
