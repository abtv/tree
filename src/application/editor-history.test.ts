import { describe, expect, it } from 'vitest'
import { collectAttachmentIds, editNodeText, type Document, type Location } from '../domain/document'
import { EditorHistory, HISTORY_LIMIT } from './editor-history'

const root = (text: string): Document => ({ roots: [{ id: 'root', text, children: [] }] })
const attached = (id: string): Document => ({
  roots: [{ id: 'root', text: '', attachment: { id, mimeType: 'image/png' }, children: [] }],
})
const location: Location = { currentParentId: null, selectedNodeId: 'root' }

describe('EditorHistory', () => {
  it('retains snapshots by reference instead of deep-cloning them', () => {
    const history = new EditorHistory()
    const initial = root('Before')
    const edited = root('After')

    history.begin(initial)
    const undone = history.undo(edited, location)

    expect(undone).toEqual({ document: initial, location })
    expect(undone?.document).toBe(initial)
    expect(undone?.document.roots[0]).toBe(initial.roots[0])
  })

  it('returns a retained snapshot unchanged after the live document is edited', () => {
    const history = new EditorHistory()
    const initial = root('Before')

    history.begin(initial)
    const edited = editNodeText(initial, 'root', 'After')

    expect(history.undo(edited, location)?.document.roots[0]?.text).toBe('Before')
    expect(initial.roots[0]!.text).toBe('Before')
  })

  it('bounds retained entries to the history limit, discarding the oldest', () => {
    const history = new EditorHistory()
    for (let index = 0; index <= HISTORY_LIMIT; index += 1) {
      history.begin(root(`v${index}`))
    }

    const current = root('live')
    let count = 0
    while (history.undo(current, location) !== undefined) {
      count += 1
      if (count > HISTORY_LIMIT + 1) break
    }

    expect(count).toBe(HISTORY_LIMIT)
  })

  it('tracks attachment references across undo and redo', () => {
    const history = new EditorHistory()
    history.begin(attached('image'))
    expect([...history.attachmentIds()]).toEqual(['image'])

    history.undo(root('live'), location)
    expect([...history.attachmentIds()]).toEqual([])

    history.redo(root('live'), location)
    expect([...history.attachmentIds()]).toEqual([])
  })

  it('keeps an attachment referenced until every retained snapshot releases it', () => {
    const history = new EditorHistory()
    for (let index = 0; index < HISTORY_LIMIT; index += 1) {
      history.begin(root(`v${index}`))
    }
    history.begin(attached('image'))
    history.begin(attached('image'))
    expect([...history.attachmentIds()]).toEqual(['image'])

    history.undo(root('live'), location)
    expect([...history.attachmentIds()]).toEqual(['image'])

    history.undo(root('live'), location)
    expect([...history.attachmentIds()]).toEqual([])
  })

  it('reads retained attachment ids without re-traversing snapshots', () => {
    let traversals = 0
    const history = new EditorHistory((document) => {
      traversals += 1
      return collectAttachmentIds(document)
    })
    for (let index = 0; index < HISTORY_LIMIT + 25; index += 1) {
      history.begin(attached(`image-${index}`))
    }

    const before = traversals
    history.attachmentIds()
    history.attachmentIds()
    expect(traversals).toBe(before)
  })

  it('reconciles an invalid location to the nearest surviving ancestor', () => {
    const history = new EditorHistory()
    const before: Document = {
      roots: [{ id: 'root', text: 'Root', children: [{ id: 'parent', text: 'Parent', children: [] }] }],
    }
    const after: Document = { roots: [{ id: 'root', text: 'Root', children: [] }] }
    const invalid: Location = { currentParentId: 'parent', selectedNodeId: 'parent' }

    history.begin(before)

    expect(history.undo(after, invalid)).toEqual({ document: before, location: invalid })
    expect(history.redo(before, invalid)).toEqual({
      document: after,
      location: { currentParentId: 'root', selectedNodeId: 'root' },
    })
  })
})
