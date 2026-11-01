import { expect, it } from 'vitest'
import { EditorStore } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import type { TreeNode } from '../domain/document'

const dated = (id: string): TreeNode => ({ id, text: '1970-04-11', children: [] })

async function setup(roots: TreeNode[], cursor = 0) {
  const store = new EditorStore(
    {
      today: () => 100,
      load: async () => ({
        version: 4,
        document: { roots },
        location: { currentParentId: null, selectedNodeId: roots[0]!.id },
        view: { expandedIds: [] },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'created',
    { setTimeout: () => 0, clearTimeout: () => undefined },
  )
  await store.initialize()
  store.openAgenda(cursor)
  const ready = () => store.getSnapshot() as ReadySnapshot
  return { store, ready }
}

it.each(['sibling', 'context', 'day'] as const)(
  'selects the %s fallback after deleting an empty pinned Agenda item',
  async (kind) => {
    const roots: TreeNode[] =
      kind === 'day'
        ? [dated('target'), dated('after')]
        : [
            {
              id: 'parent',
              text: 'Context',
              children: [...(kind === 'sibling' ? [dated('before')] : []), dated('target'), dated('after')],
            },
          ]
    const { store, ready } = await setup(roots)
    store.applyAgenda({ kind: 'select', key: 'node:100:target' })
    store.editText('target', '')
    const before = ready().document

    expect(ready().agenda?.pinnedOccurrence?.nodeId).toBe('target')

    store.deleteEmptySelected()

    const expected = kind === 'sibling' ? 'node:100:before' : kind === 'context' ? 'node:100:parent' : 'day:100'
    expect(ready().agenda?.selectedKey).toBe(expected)
    expect(store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'target')).toBe(false)
    expect(ready().document).not.toBe(before)
    if (kind !== 'day')
      expect(ready().focus).toMatchObject({ nodeId: kind === 'sibling' ? 'before' : 'parent', cursor: 0 })

    store.undo()

    expect(ready().document).toEqual(before)
  },
)

it('does not delete the last real selection when an Agenda day is selected', async () => {
  const { store, ready } = await setup([dated('target'), dated('after')])
  store.applyAgenda({ kind: 'select', key: 'node:100:target' })
  store.editText('target', '')
  store.applyAgenda({ kind: 'select', key: 'day:100' })
  const before = ready().document

  store.deleteEmptySelected()
  const backspace = store.backspaceAtStart(0)

  expect(backspace).toBe(false)
  expect(ready().document).toBe(before)
  expect(ready().agenda?.selectedKey).toBe('day:100')
})

it('does not remove a pinned empty Agenda parent with real descendants', async () => {
  const { store, ready } = await setup([{ ...dated('target'), children: [dated('child')] }, dated('after')])
  store.applyAgenda({ kind: 'select', key: 'node:100:target' })
  store.editText('target', '')
  const before = ready().document

  store.deleteEmptySelected()

  expect(ready().document).toBe(before)
  expect(ready().agenda?.selectedKey).toBe('node:100:target')
})

it('rejects Agenda Backspace even when Tree has an empty preceding sibling', async () => {
  const { store, ready } = await setup([{ id: 'before', text: '', children: [] }, dated('target')])
  store.applyAgenda({ kind: 'select', key: 'node:100:target' })
  const before = ready().document

  expect(store.backspaceAtStart(0)).toBe(false)
  expect(ready().document).toBe(before)
})

it('selects the immediate context rather than its outer ancestor after deleting a pinned item', async () => {
  const { store, ready } = await setup([
    {
      id: 'outer',
      text: 'Outer',
      children: [{ id: 'parent', text: 'Parent', children: [dated('target'), dated('after')] }],
    },
  ])
  store.applyAgenda({ kind: 'select', key: 'node:100:target' })
  store.editText('target', '')

  store.deleteEmptySelected()

  expect(ready().agenda?.selectedKey).toBe('node:100:parent')
  expect(ready().focus).toMatchObject({ nodeId: 'parent', cursor: 0 })
})

it('resets the cursor when closing Agenda after the origin node was deleted', async () => {
  const { store, ready } = await setup([dated('target'), dated('after')], 7)
  store.applyAgenda({ kind: 'select', key: 'node:100:target' })
  store.editText('target', '')
  store.deleteEmptySelected()

  store.closeAgenda()

  expect(ready().location).toEqual({ currentParentId: null, selectedNodeId: 'after' })
  expect(ready().focus).toMatchObject({ nodeId: 'after', cursor: 0 })
})
