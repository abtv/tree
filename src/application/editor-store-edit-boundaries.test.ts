import { expect, it } from 'vitest'
import { EditorStore } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'

it.each(['indent', 'join', 'strikethrough', 'move', 'backspace'] as const)(
  'keeps typing after %s in a separate undo entry when the edited node ID stays the same',
  async (command) => {
    const store = new EditorStore(
      {
        load: async () => ({
          version: 1,
          document: {
            roots: [
              { id: 'before', text: command === 'backspace' ? '' : 'Before', children: [] },
              { id: 'root', text: 'Root', children: [] },
              { id: 'after', text: 'After', children: [] },
            ],
          },
          location: { currentParentId: null, selectedNodeId: 'root' },
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
    const document = () => (store.getSnapshot() as ReadySnapshot).document
    const original = document()
    store.editText('root', 'Typed')
    const typed = document()

    if (command === 'indent') store.shiftNodeVisual('in', 'root', 'root')
    else if (command === 'join') store.joinNodes({ count: 2 }, true)
    else if (command === 'strikethrough') store.toggleStrikethrough('root', 'root')
    else if (command === 'move') store.moveNodeToParent('root', 'before', 0)
    else store.backspaceAtStart(0)
    const changed = document()

    expect(changed).not.toBe(typed)

    store.editText('root', 'Later')
    store.undo()

    expect(document()).toEqual(changed)

    store.undo()

    expect(document()).toEqual(typed)

    store.undo()

    expect(document()).toEqual(original)
  },
)
