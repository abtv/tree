import { describe, expect, it } from 'vitest'
import {
  assertDocument,
  attachImage,
  buildNodeIndex,
  cloneDocument,
  collectAttachmentIds,
  createInitialDocument,
  createFirstChild,
  insertSiblingAfter,
  insertSiblingBefore,
  deleteLink,
  deleteNode,
  editNodeContent,
  isValidLocation,
  locateNode,
  moveSibling,
  nodePath,
  parsePersistedState,
  pasteMultilineText,
  pasteText,
  removeTextRange,
  serializeState,
  splitNode,
  isHttpUrl,
  normalizeLinks,
  validatePersistedState,
  MAX_DOCUMENT_DEPTH,
  MAX_DOCUMENT_DEPTH_ERROR,
  type Document,
  type TreeNode,
} from './document'

describe('document operations', () => {
  it('updates text by cloning only the path to the edited node', () => {
    const document = createFirstChild(createInitialDocument('root'), 'root', 'child')
    document.roots.push({ id: 'other', text: 'Other', children: [{ id: 'other-child', text: 'Child', children: [] }] })
    const result = editNodeContent(document, 'child', 'Updated', [])

    expect(result.roots[0]).not.toBe(document.roots[0])
    expect(result.roots[0]!.children[0]!.text).toBe('Updated')
    expect(result.roots[1]).toBe(document.roots[1])
    expect(result.roots[1]!.children[0]).toBe(document.roots[1]!.children[0])
  })

  it('path-copies structural commands and shares untouched roots and siblings', () => {
    const document = createFirstChild(createInitialDocument('a'), 'a', 'a-child')
    document.roots[0]!.children[0]!.children.push({ id: 'a-grandchild', text: 'G', children: [] })
    document.roots.push({ id: 'b', text: 'B', children: [{ id: 'b-child', text: 'Bc', children: [] }] })

    const inserted = insertSiblingAfter(document, 'a-child', 'new-after')

    expect(inserted.roots[1]).toBe(document.roots[1])
    expect(inserted.roots[1]!.children[0]).toBe(document.roots[1]!.children[0])
    expect(inserted.roots[0]).not.toBe(document.roots[0])
    expect(inserted.roots[0]!.children[0]).toBe(document.roots[0]!.children[0])
    expect(inserted.roots[0]!.children[0]!.children[0]).toBe(document.roots[0]!.children[0]!.children[0])
    expect(inserted.roots[0]!.children.map((node) => node.id)).toEqual(['a-child', 'new-after'])
  })

  it('rebuilds only the ancestor path when deleting a deep node', () => {
    const document = createFirstChild(createInitialDocument('a'), 'a', 'a-child')
    document.roots[0]!.children[0]!.children.push({ id: 'a-grandchild', text: 'G', children: [] })
    document.roots.push({ id: 'b', text: 'B', children: [] })

    const result = deleteNode(document, 'a-grandchild')

    expect(result.roots[1]).toBe(document.roots[1])
    expect(result.roots[0]).not.toBe(document.roots[0])
    expect(result.roots[0]!.children[0]).not.toBe(document.roots[0]!.children[0])
    expect(result.roots[0]!.children[0]!.children).toEqual([])
  })

  it('inserts an empty sibling before a node without changing its subtree', () => {
    const document = createFirstChild(createInitialDocument('a'), 'a', 'child')
    document.roots[0]!.text = 'Current'

    const result = insertSiblingBefore(document, 'a', 'before')

    expect(result.roots.map((node) => [node.id, node.text, node.children.map((child) => child.id)])).toEqual([
      ['before', '', []],
      ['a', 'Current', ['child']],
    ])
  })

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

    expect(state.document).toBe(document)
    expect(parsePersistedState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(() =>
      parsePersistedState({
        ...state,
        document: { roots: [{ ...document.roots[0]!, children: [{ id: 'root', text: '', children: [] }] }] },
      }),
    ).toThrow('unique')
  })

  it('validates persisted state without rebuilding the document', () => {
    const document = createInitialDocument('root')
    const state = serializeState(document, { currentParentId: null, selectedNodeId: 'root' })

    expect(validatePersistedState(state)).toBe(state)
    expect(validatePersistedState({ ...state, version: 1 })).toEqual({ ...state, version: 1 })
    expect(() => validatePersistedState({ ...state, version: 3 })).toThrow('unsupported format')
    expect(() => validatePersistedState({ ...state, document: { roots: [] } })).toThrow('at least one root node')
    expect(() =>
      validatePersistedState({ ...state, location: { currentParentId: 'missing', selectedNodeId: 'root' } }),
    ).toThrow('does not match its tree')
  })

  it('deletes a subtree as one operation', () => {
    const document = createFirstChild(createInitialDocument('a'), 'a', 'child')
    const result = deleteNode(document, 'a')
    expect(result.roots).toEqual([])
  })

  it('accepts exactly the maximum depth and rejects the next level', () => {
    const depth = MAX_DOCUMENT_DEPTH
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
    expect(() => createFirstChild(document, 'n18', 'another-level-20')).not.toThrow()
    expect(() =>
      parsePersistedState({ version: 1, document, location: { currentParentId: null, selectedNodeId: 'n0' } }),
    ).not.toThrow()

    current.children.push({ id: 'too-deep', text: '', children: [] })
    expect(() => assertDocument(document)).toThrow(MAX_DOCUMENT_DEPTH_ERROR)
    expect(() =>
      parsePersistedState({ version: 2, document, location: { currentParentId: null, selectedNodeId: 'n0' } }),
    ).toThrow(MAX_DOCUMENT_DEPTH_ERROR)
  })

  it('rejects creating a child below the maximum depth without cloning or changing the source', () => {
    const root: TreeNode = { id: 'n0', text: '', children: [] }
    let current = root
    for (let index = 1; index < MAX_DOCUMENT_DEPTH; index += 1) {
      const child: TreeNode = { id: `n${index}`, text: '', children: [] }
      current.children.push(child)
      current = child
    }
    const document = { roots: [root] }

    expect(() => createFirstChild(document, current.id, 'new')).toThrow(MAX_DOCUMENT_DEPTH_ERROR)
    expect(current.children).toEqual([])
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

  it('normalizes malformed, overlapping, and non-HTTP link ranges', () => {
    expect(
      normalizeLinks(
        [
          { start: -1, end: 2, url: 'https://example.com' },
          { start: 0, end: 4, url: 'https://example.com' },
          { start: 3, end: 8, url: 'https://example.com' },
          { start: 0, end: 3, url: 'javascript:bad' },
          { start: 0, end: 2, url: 'https://example.com' },
        ],
        'https://example.com',
      ),
    ).toEqual([])
    expect(
      normalizeLinks(
        [
          { start: 0, end: 19, url: 'https://example.com' },
          { start: 20, end: 39, url: 'https://example.com' },
        ],
        'https://example.com https://example.com',
      ),
    ).toEqual([
      { start: 0, end: 19, url: 'https://example.com' },
      { start: 20, end: 39, url: 'https://example.com' },
    ])
  })

  it('rejects malformed persisted nodes and links', () => {
    const base = {
      version: 1,
      document: { roots: [{ id: 'a', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'a' },
    }
    expect(() => parsePersistedState({ ...base, document: { roots: 'not an array' } })).toThrow('children')
    expect(() =>
      parsePersistedState({ ...base, document: { roots: [{ id: 'a', text: '', links: {}, children: [] }] } }),
    ).toThrow('links')
    expect(() => parsePersistedState({ ...base, document: { roots: [{ id: '', text: '', children: [] }] } })).toThrow(
      'node is invalid',
    )
    expect(() => parsePersistedState({ ...base, document: { roots: [{ id: 'a', text: '', children: {} }] } })).toThrow(
      'children',
    )
    expect(() =>
      parsePersistedState({ ...base, document: { roots: [{ id: 'a', text: '', attachment: {}, children: [] }] } }),
    ).toThrow('attachment')
    expect(() =>
      parsePersistedState({
        ...base,
        document: {
          roots: [
            {
              id: 'a',
              text: 'hello',
              links: [{ start: '0', end: 2, url: 'https://example.com' }],
              children: [],
            },
          ],
        },
      }),
    ).toThrow('links')
  })

  it('rejects malformed persisted nodes and links when validating', () => {
    const base = {
      version: 1,
      document: { roots: [{ id: 'a', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'a' },
    }
    expect(() => validatePersistedState({ ...base, document: { roots: 'not an array' } })).toThrow('children')
    expect(() =>
      validatePersistedState({ ...base, document: { roots: [{ id: 'a', text: '', links: {}, children: [] }] } }),
    ).toThrow('links')
    expect(() =>
      validatePersistedState({ ...base, document: { roots: [{ id: '', text: '', children: [] }] } }),
    ).toThrow('node is invalid')
    expect(() =>
      validatePersistedState({ ...base, document: { roots: [{ id: 'a', text: '', children: {} }] } }),
    ).toThrow('children')
    expect(() =>
      validatePersistedState({ ...base, document: { roots: [{ id: 'a', text: '', attachment: {}, children: [] }] } }),
    ).toThrow('attachment')
    expect(() =>
      validatePersistedState({
        ...base,
        document: {
          roots: [
            {
              id: 'a',
              text: 'hello',
              links: [{ start: '0', end: 2, url: 'https://example.com' }],
              children: [],
            },
          ],
        },
      }),
    ).toThrow('links')
    expect(() =>
      validatePersistedState({
        ...base,
        document: { roots: [{ id: 'a', text: '', children: [{ id: 'a', text: '', children: [] }] }] },
      }),
    ).toThrow('unique')
  })

  it('handles link removal, insertion, and range edge cases', () => {
    const linked = pasteText(createInitialDocument('a'), 'a', 0, 'https://example.com')
    expect(deleteLink(linked, 'a', 0)).toBeUndefined()
    expect(deleteLink(linked, 'a', 19)).toBeDefined()
    expect(removeTextRange(linked, 'a', 4, 4).roots[0]!.text).toBe('https://example.com')
    expect(removeTextRange(linked, 'a', 0, 4).roots[0]!.links).toBeUndefined()
    expect(
      pasteMultilineText(
        linked,
        'a',
        0,
        ['https://example.com', 'next'],
        ['b'],
        [{ start: 0, end: 19, url: 'https://example.com' }],
      ).roots[1]!.links,
    ).toEqual([{ start: 4, end: 23, url: 'https://example.com' }])
    expect(() => pasteMultilineText(linked, 'a', 0, ['one'], [])).toThrow('one new node ID')
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

  it('builds a parent index that maps every node to its parent or the root collection', () => {
    const document = createFirstChild(createInitialDocument('root'), 'root', 'child')
    const index = buildNodeIndex(document)

    expect(index.get('root')).toBeNull()
    expect(index.get('child')).toBe('root')
    expect(index.has('missing')).toBe(false)
  })

  it('locates a node created by a topology-changing operation', () => {
    const document = createInitialDocument('a')
    const result = insertSiblingAfter(document, 'a', 'b')

    const located = locateNode(result, 'b')
    expect(located?.node.id).toBe('b')
    expect(located?.parent).toBeNull()
    expect(located?.siblings.map((node) => node.id)).toEqual(['a', 'b'])
    expect(located?.index).toBe(1)
  })

  it('does not reuse an index across different documents', () => {
    const first = createInitialDocument('a')
    const second = createFirstChild(createInitialDocument('b'), 'b', 'b-child')

    expect(locateNode(first, 'b-child')).toBeUndefined()
    expect(locateNode(second, 'b-child')?.node.id).toBe('b-child')
    expect(locateNode(first, 'a')?.node.id).toBe('a')
  })

  it('resolves a warm lookup without traversing unrelated subtrees', () => {
    const unrelatedChildren: TreeNode[] = [{ id: 'unrelated-child', text: '', children: [] }]
    const unrelated: TreeNode = { id: 'unrelated', text: '', children: unrelatedChildren }
    let unrelatedReads = 0
    Object.defineProperty(unrelated, 'children', {
      configurable: true,
      enumerable: true,
      get() {
        unrelatedReads += 1
        return unrelatedChildren
      },
    })
    const document: Document = {
      roots: [{ id: 'target', text: '', children: [{ id: 'target-child', text: '', children: [] }] }, unrelated],
    }

    locateNode(document, 'target-child')
    unrelatedReads = 0

    expect(locateNode(document, 'target-child')?.node.id).toBe('target-child')
    expect(unrelatedReads).toBe(0)
  })

  it('inherits the derived attachment ids for a path-copied result without rescanning', () => {
    const related: TreeNode = {
      id: 'target',
      text: '',
      children: [
        { id: 'target-child', text: '', attachment: { id: 'target-image', mimeType: 'image/png' }, children: [] },
      ],
    }
    const unrelatedChildren: TreeNode[] = [{ id: 'unrelated-child', text: '', children: [] }]
    const unrelated: TreeNode = { id: 'unrelated', text: '', children: unrelatedChildren }
    let unrelatedReads = 0
    Object.defineProperty(unrelated, 'children', {
      configurable: true,
      enumerable: true,
      get() {
        unrelatedReads += 1
        return unrelatedChildren
      },
    })
    const document: Document = { roots: [related, unrelated] }

    expect([...collectAttachmentIds(document)]).toEqual(['target-image'])
    locateNode(document, 'target-child')
    unrelatedReads = 0

    const inserted = insertSiblingAfter(document, 'target-child', 'new-after')
    const added = insertSiblingAfter(document, 'target-child', 'new-image', '', {
      id: 'added-image',
      mimeType: 'image/png',
    })

    expect([...collectAttachmentIds(inserted)].sort()).toEqual(['target-image'])
    expect([...collectAttachmentIds(added)].sort()).toEqual(['added-image', 'target-image'])
    expect(unrelatedReads).toBe(0)
  })

  it('tracks attachment id changes when attaching an image', () => {
    const empty = createInitialDocument('a')
    const attached = attachImage(empty, 'a', { id: 'one', mimeType: 'image/png' })
    expect([...collectAttachmentIds(attached)]).toEqual(['one'])

    const same = attachImage(attached, 'a', { id: 'one', mimeType: 'image/png' })
    expect([...collectAttachmentIds(same)]).toEqual(['one'])

    const replaced = attachImage(attached, 'a', { id: 'two', mimeType: 'image/png' })
    expect([...collectAttachmentIds(replaced)]).toEqual(['two'])
  })

  it('removes an attachment id only when the last referencing node is deleted', () => {
    const document: Document = {
      roots: [
        { id: 'a', text: '', attachment: { id: 'shared', mimeType: 'image/png' }, children: [] },
        { id: 'b', text: '', attachment: { id: 'shared', mimeType: 'image/png' }, children: [] },
      ],
    }
    collectAttachmentIds(document)

    const withoutA = deleteNode(document, 'a')
    expect([...collectAttachmentIds(withoutA)]).toEqual(['shared'])

    const withoutB = deleteNode(withoutA, 'b')
    expect([...collectAttachmentIds(withoutB)]).toEqual([])
  })
})
