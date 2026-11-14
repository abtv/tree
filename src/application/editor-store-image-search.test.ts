import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import { searchNodes } from './node-search'
import { parsePersistedState, serializeState } from '../domain/document'

afterEach(() => vi.useRealTimers())

async function setup(imageToText?: EditorServices['imageToText']) {
  vi.useFakeTimers()
  let id = 0
  const save = vi.fn(async () => undefined)
  const store = new EditorStore(
    {
      load: async () => ({
        version: 1,
        document: { roots: [{ id: 'source', text: 'Caption', children: [] }] },
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
