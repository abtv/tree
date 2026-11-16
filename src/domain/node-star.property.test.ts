import { expect, it } from 'vitest'
import fc from 'fast-check'
import { propertyRuns } from '../test/property-runs'
import {
  cloneNodeWithNewIds,
  editNodeText,
  parsePersistedState,
  serializeState,
  toggleStarNode,
  validatePersistedState,
  type Document,
} from './document'

it('toggles only the target and preserves identity, content, descendants and unrelated branches', () => {
  fc.assert(
    fc.property(fc.string(), fc.boolean(), (text, starred) => {
      const child = { id: 'child', text: 'Child', children: [] }
      const other = { id: 'other', text: 'Other', children: [] }
      const document: Document = {
        roots: [{ id: 'root', text, ...(starred ? { starred: true as const } : {}), children: [child] }, other],
      }

      const changed = toggleStarNode(document, 'root')

      expect(changed.roots[0]!.starred === true).toBe(!starred)
      expect(changed.roots[0]!.children[0]).toBe(child)
      expect(changed.roots[1]).toBe(other)
      expect(toggleStarNode(changed, 'root')).toEqual(document)
      expect(
        parsePersistedState(serializeState(changed, { currentParentId: null, selectedNodeId: 'root' })).document,
      ).toEqual(changed)
    }),
    { numRuns: propertyRuns(100) },
  )
})

it('keeps stars through content edits and copies with fresh identities', () => {
  const document: Document = {
    roots: [
      { id: 'root', text: 'A', starred: true, children: [{ id: 'child', text: 'B', starred: true, children: [] }] },
    ],
  }

  const edited = editNodeText(document, 'root', 'Changed')
  let id = 0
  const copy = cloneNodeWithNewIds(edited.roots[0]!, () => `copy-${id++}`)

  expect(copy).toMatchObject({
    id: 'copy-0',
    text: 'Changed',
    starred: true,
    children: [{ id: 'copy-1', starred: true }],
  })
})

it.each([false, 'yes', 1, null])('rejects malformed star data: %s', (starred) => {
  const state = {
    version: 5,
    document: { roots: [{ id: 'root', text: '', children: [], starred }] },
    location: { currentParentId: null, selectedNodeId: 'root' },
    view: { expandedIds: [] },
  }

  expect(() => parsePersistedState(state)).toThrow()
  expect(() => validatePersistedState(state)).toThrow()
})
