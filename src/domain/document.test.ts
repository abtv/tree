import { describe, expect, it } from 'vitest'
import {
  assertDocument,
  attachImage,
  cloneDocument,
  collectAttachmentIds,
  createInitialDocument,
  createFirstChild,
  deleteLink,
  deleteNode,
  isValidLocation,
  locateNode,
  moveSibling,
  nodePath,
  parsePersistedState,
  pasteMultilineText,
  pasteText,
  serializeState,
  splitNode,
  isHttpUrl,
  type TreeNode,
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
    expect(() =>
      parsePersistedState({
        ...state,
        document: { roots: [{ ...document.roots[0]!, children: [{ id: 'root', text: '', children: [] }] }] },
      }),
    ).toThrow('unique')
  })

  it('deletes a subtree as one operation', () => {
    const document = createFirstChild(createInitialDocument('a'), 'a', 'child')
    const result = deleteNode(document, 'a')
    expect(result.roots).toEqual([])
  })

  it('supports deeply nested documents without recursive traversal failures', () => {
    const depth = 5_000
    const root: TreeNode = { id: 'n0', text: 'root', children: [] }
    let current = root
    for (let index = 1; index < depth; index += 1) {
      const child: TreeNode = { id: `n${index}`, text: `t${index}`, children: [] }
      current.children.push(child)
      current = child
    }
    const document = { roots: [root] }

    expect(() => assertDocument(document)).not.toThrow()
    expect(() => cloneDocument(document)).not.toThrow()
    expect(() => serializeState(document, { currentParentId: null, selectedNodeId: 'n0' })).not.toThrow()
    expect(locateNode(document, `n${depth - 1}`)?.ancestors).toHaveLength(depth - 1)
    expect(nodePath(document, `n${depth - 1}`)).toHaveLength(depth)
    expect(collectAttachmentIds(document).size).toBe(0)
    expect(() =>
      parsePersistedState({ version: 1, document, location: { currentParentId: null, selectedNodeId: 'n0' } }),
    ).not.toThrow()
  })

  it('does not split a surrogate pair when the cursor is inside it', () => {
    const document = createInitialDocument('a')
    document.roots[0]!.text = '😀b'

    expect(splitNode(document, 'a', 1, 'b').roots.map((node) => node.text)).toEqual(['', '😀b'])
    expect(pasteText(document, 'a', 1, 'X').roots[0]!.text).toBe('X😀b')
  })

  it('recognizes only valid HTTP and HTTPS URLs', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
    expect(isHttpUrl('http://localhost:8080/path')).toBe(true)
    expect(isHttpUrl('example.com')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
  })

  it('creates a link when a valid URL is pasted and leaves invalid text unlinked', () => {
    const document = createInitialDocument('a')
    const linked = pasteText(document, 'a', 0, 'https://example.com')
    expect(linked.roots[0]!.links).toEqual([{ start: 0, end: 19, url: 'https://example.com' }])

    const plain = pasteText(document, 'a', 0, 'example.com')
    expect(plain.roots[0]!.links).toBeUndefined()
  })

  it('preserves link ranges supplied by rich clipboard paste', () => {
    const document = createInitialDocument('a')
    const result = pasteText(document, 'a', 0, 'See https://example.com', [
      { start: 4, end: 23, url: 'https://example.com' },
    ])
    expect(result.roots[0]!.links).toEqual([{ start: 4, end: 23, url: 'https://example.com' }])

    const partial = pasteText(document, 'a', 0, 'example.com', [{ start: 0, end: 11, url: 'https://example.com' }])
    expect(partial.roots[0]!.links).toBeUndefined()
  })

  it('removes the complete link when Backspace is at its end', () => {
    const document = pasteText(createInitialDocument('a'), 'a', 0, 'https://example.com')
    const result = deleteLink(document, 'a', 19)
    expect(result?.roots[0]).toMatchObject({ text: '' })
    expect(result?.roots[0]!.links).toBeUndefined()
  })

  it('migrates version one documents and persists links as version two', () => {
    const parsed = parsePersistedState({
      version: 1,
      document: { roots: [{ id: 'a', text: 'https://example.com', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    expect(parsed.version).toBe(2)
    const document = pasteText(parsed.document, 'a', 0, 'https://example.com')
    expect(serializeState(document, parsed.location).version).toBe(2)
  })
})
