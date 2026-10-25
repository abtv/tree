import { expect, it } from 'vitest'
import { EditorStore } from './editor-store'
import { createServices, freshIds } from './test/editor-store-arbitraries'
import { serializeState } from '../domain/document'

// @requirement PRODUCT.md §20.13
it('publishes whole-document tags for edits, paste, deletion and history in Tree and Agenda', async () => {
  const document = {
    roots: [
      { id: 'a', text: '2026-10-08 #Work', children: [{ id: 'child', text: '#hidden', children: [] }] },
      { id: 'b', text: '2026-10-08 #work', children: [] },
    ],
  }
  const services = createServices(serializeState(document, { currentParentId: null, selectedNodeId: 'a' }), () => ({
    kind: 'text',
    text: '',
  }))
  const store = new EditorStore(services, freshIds('tag-'))
  await store.initialize()
  const names = () => store.suggestTags('draft', '#', 1)?.suggestions ?? []
  const seen: string[][] = []
  const stop = store.subscribe(() => seen.push([...names()]))

  expect(names()).toEqual(['Work', 'hidden', 'work'])

  store.editText('child', '#new')

  expect(names()).toEqual(['Work', 'new', 'work'])
  expect(seen.at(-1)).toEqual(['Work', 'new', 'work'])

  store.undo()

  expect(names()).toEqual(['Work', 'hidden', 'work'])

  store.redo()
  store.openAgenda()

  expect(names()).toEqual(['Work', 'new', 'work'])

  store.closeAgenda()
  store.leave()
  store.selectNode('b', 0)
  await store.paste('b', '2026-10-08 #work'.length, async () => ({ kind: 'text', text: ' #pasted' }))

  expect(names()).toEqual(['Work', 'new', 'pasted', 'work'])

  store.deleteSelected()

  expect(names()).toEqual(['Work', 'new'])

  store.undo()

  expect(names()).toEqual(['Work', 'new', 'pasted', 'work'])
  stop()
})
