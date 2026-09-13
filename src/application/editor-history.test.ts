import { describe, expect, it } from 'vitest'
import {
  attachmentSummary,
  editNodeText,
  type AttachmentSummary,
  type Document,
  type Location,
} from '../domain/document'
import { EditorHistory, HISTORY_LIMIT } from './editor-history'

function countingSummary(ids: string[]): { summary: AttachmentSummary; reads: () => number } {
  let reads = 0
  const inner = new Map(ids.map((id) => [id, 1]))
  const summary = {
    get size() {
      return inner.size
    },
    get: (id: string) => inner.get(id),
    has: (id: string) => inner.has(id),
    keys: () => {
      reads += 1
      return inner.keys()
    },
    values: () => inner.values(),
    entries: () => inner.entries(),
    forEach: (callback: (value: number, key: string) => void) => inner.forEach(callback),
    [Symbol.iterator]: () => inner.entries(),
  } as unknown as AttachmentSummary
  return { summary, reads: () => reads }
}

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

  it('reports a reachability change when a new edit discards the redo branch', () => {
    const history = new EditorHistory()
    history.begin(root('v1'))
    history.undo(root('v2'), location)

    expect(history.begin(root('v3'))).toBe(true)
  })

  it('reports no reachability change when there is no eviction or redo branch', () => {
    const history = new EditorHistory()

    expect(history.begin(root('v1'))).toBe(false)
    expect(history.begin(root('v2'))).toBe(false)
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
    let collections = 0
    const history = new EditorHistory((document) => {
      collections += 1
      return attachmentSummary(document)
    })
    for (let index = 0; index < HISTORY_LIMIT + 25; index += 1) {
      history.begin(attached(`image-${index}`))
    }

    const before = collections
    history.attachmentIds()
    history.attachmentIds()
    expect(collections).toBe(before)
  })

  it('enumerates a shared summary once on retention and once on final release', () => {
    const shared = countingSummary(['a', 'b'])
    const other = countingSummary(['c'])
    const history = new EditorHistory((document) =>
      document.roots[0]!.text === 'shared' ? shared.summary : other.summary,
    )

    for (let index = 0; index < HISTORY_LIMIT; index += 1) history.begin(root('shared'))
    expect(shared.reads()).toBe(1)
    expect([...history.attachmentIds()].sort()).toEqual(['a', 'b'])

    for (let index = 0; index < HISTORY_LIMIT; index += 1) history.begin(root('other'))

    expect(shared.reads()).toBe(2)
    expect(other.reads()).toBe(1)
    expect([...history.attachmentIds()]).toEqual(['c'])
  })

  it('enumerates a path-copied shared summary once across many retained entries', () => {
    const wrappers = new Map<AttachmentSummary, { summary: AttachmentSummary; reads: () => number }>()
    const history = new EditorHistory((document) => {
      const real = attachmentSummary(document)
      let wrapper = wrappers.get(real)
      if (wrapper === undefined) {
        wrapper = countingSummary([...real.keys()])
        wrappers.set(real, wrapper)
      }
      return wrapper.summary
    })

    let document = attached('a')
    for (let index = 0; index < HISTORY_LIMIT + 25; index += 1) {
      history.begin(document)
      document = editNodeText(document, 'root', `edit-${index}`)
    }

    expect(wrappers.size).toBe(1)
    expect([...wrappers.values()][0]!.reads()).toBe(1)
    expect([...history.attachmentIds()]).toEqual(['a'])
  })

  it('does not enumerate a 10,000-id summary per retained entry', () => {
    const roots = Array.from({ length: 10_000 }, (_, index) => ({
      id: `r${index}`,
      text: '',
      attachment: { id: `image-${index}`, mimeType: 'image/png' as const },
      children: [],
    }))
    const wrappers = new Map<AttachmentSummary, { summary: AttachmentSummary; reads: () => number }>()
    const history = new EditorHistory((document) => {
      const real = attachmentSummary(document)
      let wrapper = wrappers.get(real)
      if (wrapper === undefined) {
        wrapper = countingSummary([...real.keys()])
        wrappers.set(real, wrapper)
      }
      return wrapper.summary
    })

    let document: Document = { roots }
    for (let index = 0; index < HISTORY_LIMIT; index += 1) {
      history.begin(document)
      document = editNodeText(document, `r${index}`, `edit-${index}`)
    }

    expect(wrappers.size).toBe(1)
    expect([...wrappers.values()][0]!.reads()).toBe(1)
    expect([...history.attachmentIds()]).toHaveLength(10_000)
  })

  it('keeps an id while any distinct summary still references it', () => {
    const first = countingSummary(['shared'])
    const second = countingSummary(['shared', 'extra'])
    const third = countingSummary(['extra'])
    let current = first.summary
    const history = new EditorHistory(() => current)

    for (let index = 0; index < HISTORY_LIMIT; index += 1) history.begin(root('one'))
    current = second.summary
    for (let index = 0; index < HISTORY_LIMIT; index += 1) history.begin(root('two'))
    expect([...history.attachmentIds()].sort()).toEqual(['extra', 'shared'])

    current = third.summary
    for (let index = 0; index < HISTORY_LIMIT; index += 1) history.begin(root('three'))
    expect([...history.attachmentIds()]).toEqual(['extra'])
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
