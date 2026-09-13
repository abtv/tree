import { describe, expect, it } from 'vitest'
import { EditorHistory } from './editor-history'

const root = (text: string) => ({ roots: [{ id: 'root', text, children: [] }] })

describe('EditorHistory', () => {
  it('stores independent snapshots for undo and redo', () => {
    const history = new EditorHistory()
    const initial = root('Before')
    const edited = root('After')
    const location = { currentParentId: null, selectedNodeId: 'root' }

    history.begin(initial)
    initial.roots[0]!.text = 'Mutated'

    expect(history.undo(edited, location)).toEqual({ document: root('Before'), location })
    expect(history.redo(root('Before'), location)).toEqual({ document: edited, location })
  })

  it('reconciles an invalid location to the nearest surviving ancestor', () => {
    const history = new EditorHistory()
    const before = {
      roots: [{ id: 'root', text: 'Root', children: [{ id: 'parent', text: 'Parent', children: [] }] }],
    }
    const after = { roots: [{ id: 'root', text: 'Root', children: [] }] }
    const location = { currentParentId: 'parent', selectedNodeId: 'parent' }

    history.begin(before)

    expect(history.undo(after, location)).toEqual({ document: before, location })
    expect(history.redo(before, location)).toEqual({
      document: after,
      location: { currentParentId: 'root', selectedNodeId: 'root' },
    })
  })
})
