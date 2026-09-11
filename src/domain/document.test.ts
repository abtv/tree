import { describe, expect, it } from 'vitest'
import {
  attachImage,
  createInitialDocument,
  createFirstChild,
  deleteNode,
  isValidLocation,
  moveSibling,
  nodePath,
  parsePersistedState,
  pasteMultilineText,
  serializeState,
  splitNode,
} from './document'

describe('document operations', () => {
  it('keeps an image on the first part when splitting a node', () => {
    const document = attachImage(createInitialDocument('a'), 'a', { id: 'image', mimeType: 'image/png' })
    document.roots[0]!.text = 'Current'

    const result = splitNode(document, 'a', 3, 'b')

    expect(result.roots.map((node) => [node.id, node.text, node.attachment?.id])).toEqual([
      ['a', 'Cur', 'image'],
      ['b', 'rent', undefined],
    ])
  })

  it('moves an image to the final node of multiline paste', () => {
    const document = attachImage(createInitialDocument('a'), 'a', { id: 'image', mimeType: 'image/png' })
    document.roots[0]!.text = 'abcdef'

    const result = pasteMultilineText(document, 'a', 3, ['one', 'two', 'three'], ['b', 'c'])

    expect(result.roots.map((node) => [node.id, node.text, node.attachment?.id])).toEqual([
      ['a', 'abcone', undefined],
      ['b', 'two', undefined],
      ['c', 'threedef', 'image'],
    ])
  })

  it('moves a complete subtree without changing its identity', () => {
    const document = createFirstChild(createInitialDocument('a'), 'a', 'child')
    document.roots.push({ id: 'b', text: 'B', children: [] })

    const result = moveSibling(document, 'a', 1)

    expect(result.roots.map((node) => node.id)).toEqual(['b', 'a'])
    expect(result.roots[1]!.children[0]!.id).toBe('child')
  })

  it('validates the persisted location against the displayed level', () => {
    const document = createFirstChild(createInitialDocument('parent'), 'parent', 'child')

    expect(isValidLocation(document, { currentParentId: 'parent', selectedNodeId: 'child' })).toBe(true)
    expect(isValidLocation(document, { currentParentId: 'parent', selectedNodeId: 'parent' })).toBe(true)
    expect(isValidLocation(document, { currentParentId: 'parent', selectedNodeId: 'missing' })).toBe(false)
  })

  it('derives the complete node path without storing parent IDs', () => {
    const document = createFirstChild(createInitialDocument('parent'), 'parent', 'child')
    document.roots[0]!.text = 'Parent'
    document.roots[0]!.children[0]!.text = 'Child'

    expect(nodePath(document, 'child').map((node) => node.text)).toEqual(['Parent', 'Child'])
  })

  it('round-trips a valid persisted state and rejects duplicate IDs', () => {
    const document = createInitialDocument('root')
    const state = serializeState(document, { currentParentId: null, selectedNodeId: 'root' })

    expect(parsePersistedState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(() => parsePersistedState({ ...state, document: { roots: [{ ...document.roots[0]!, children: [{ id: 'root', text: '', children: [] }] }] } })).toThrow('unique')
  })

  it('deletes a subtree as one operation', () => {
    const document = createFirstChild(createInitialDocument('a'), 'a', 'child')
    const result = deleteNode(document, 'a')
    expect(result.roots).toEqual([])
  })
})
