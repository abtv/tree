import { expect, it } from 'vitest'
import fc from 'fast-check'
import { propertyRuns } from '../test/property-runs'
import {
  cloneNodeWithNewIds,
  editNodeText,
  parsePersistedState,
  serializeState,
  toggleMarkNode,
  toggleStarNode,
  validatePersistedState,
  type Document,
} from './document'

// @requirement PRODUCT.md §2.7
it('toggles only the target mark and preserves identity, content, star, descendants and unrelated branches', () => {
  fc.assert(
    fc.property(fc.string(), fc.boolean(), fc.boolean(), (text, marked, starred) => {
      const child = { id: 'child', text: 'Child', children: [] }
      const other = { id: 'other', text: 'Other', children: [] }
      const document: Document = {
        roots: [
          {
            id: 'root',
            text,
            ...(starred ? { starred: true as const } : {}),
            ...(marked ? { marked: true as const } : {}),
            children: [child],
          },
          other,
        ],
      }

      const changed = toggleMarkNode(document, 'root')

      expect(changed.roots[0]!.marked === true).toBe(!marked)
      expect(changed.roots[0]!.starred === true).toBe(starred)
      expect(changed.roots[0]!.children[0]).toBe(child)
      expect(changed.roots[1]).toBe(other)
      expect(toggleMarkNode(changed, 'root')).toEqual(document)
      expect(
        parsePersistedState(serializeState(changed, { currentParentId: null, selectedNodeId: 'root' })).document,
      ).toEqual(changed)
    }),
    { numRuns: propertyRuns(100) },
  )
})

// @requirement PRODUCT.md §2.7
it('keeps marks through content edits, star changes and copies with fresh identities', () => {
  const document: Document = {
    roots: [
      { id: 'root', text: 'A', marked: true, children: [{ id: 'child', text: 'B', marked: true, children: [] }] },
    ],
  }

  const edited = toggleStarNode(editNodeText(document, 'root', 'Changed'), 'root')
  let id = 0
  const copy = cloneNodeWithNewIds(edited.roots[0]!, () => `copy-${id++}`)

  expect(copy).toMatchObject({
    id: 'copy-0',
    text: 'Changed',
    starred: true,
    marked: true,
    children: [{ id: 'copy-1', marked: true }],
  })
})

// @requirement PRODUCT.md §2.7
it('saves marks as schema version 6 and loads older documents without marks', () => {
  const location = { currentParentId: null, selectedNodeId: 'root' }
  const marked: Document = { roots: [{ id: 'root', text: '', marked: true, children: [] }] }

  const saved = serializeState(marked, location)
  const older = parsePersistedState({
    version: 5,
    document: { roots: [{ id: 'root', text: '', starred: true, children: [] }] },
    location,
    view: { expandedIds: [] },
  })

  expect(saved.version).toBe(6)
  expect(JSON.parse(JSON.stringify(saved)).document.roots[0].marked).toBe(true)
  expect(older.document.roots[0]).toEqual({ id: 'root', text: '', starred: true, children: [] })
})

// @requirement PRODUCT.md §2.7
it.each([false, 'yes', 1, null])('rejects malformed mark data: %s', (marked) => {
  const state = {
    version: 6,
    document: { roots: [{ id: 'root', text: '', children: [], marked }] },
    location: { currentParentId: null, selectedNodeId: 'root' },
    view: { expandedIds: [] },
  }

  expect(() => parsePersistedState(state)).toThrow()
  expect(() => validatePersistedState(state)).toThrow()
})
