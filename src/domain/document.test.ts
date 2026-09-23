import { describe, expect, it } from 'vitest'
import {
  assertDocument,
  attachImage,
  attachmentSummary,
  buildNodeIndex,
  cloneDocument,
  collectAttachmentIds,
  createInitialDocument,
  createFirstChild,
  insertSiblingAfter,
  insertSiblingBefore,
  insertSubtreeSibling,
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
  releaseNodeIndex,
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
    const base = createFirstChild(createInitialDocument('root'), 'root', 'child')
    const document: Document = {
      roots: [
        ...base.roots,
        { id: 'other', text: 'Other', children: [{ id: 'other-child', text: 'Child', children: [] }] },
      ],
    }
    const result = editNodeContent(document, 'child', 'Updated', [])

    expect(result.roots[0]).not.toBe(document.roots[0])
    expect(result.roots[0]!.children[0]!.text).toBe('Updated')
    expect(result.roots[1]).toBe(document.roots[1])
    expect(result.roots[1]!.children[0]).toBe(document.roots[1]!.children[0])
  })

  it('path-copies structural commands and shares untouched roots and siblings', () => {
    const base = createFirstChild(createInitialDocument('a'), 'a', 'a-child')
    const root = base.roots[0]!
    const aChild = root.children[0]!
    const document: Document = {
      roots: [
        { ...root, children: [{ ...aChild, children: [{ id: 'a-grandchild', text: 'G', children: [] }] }] },
        { id: 'b', text: 'B', children: [{ id: 'b-child', text: 'Bc', children: [] }] },
      ],
    }

    const inserted = insertSiblingAfter(document, 'a-child', 'new-after')

    expect(inserted.roots[1]).toBe(document.roots[1])
    expect(inserted.roots[1]!.children[0]).toBe(document.roots[1]!.children[0])
    expect(inserted.roots[0]).not.toBe(document.roots[0])
    expect(inserted.roots[0]!.children[0]).toBe(document.roots[0]!.children[0])
    expect(inserted.roots[0]!.children[0]!.children[0]).toBe(document.roots[0]!.children[0]!.children[0])
    expect(inserted.roots[0]!.children.map((node) => node.id)).toEqual(['a-child', 'new-after'])
  })

  it('rebuilds only the ancestor path when deleting a deep node', () => {
    const base = createFirstChild(createInitialDocument('a'), 'a', 'a-child')
    const root = base.roots[0]!
    const aChild = root.children[0]!
    const document: Document = {
      roots: [
        { ...root, children: [{ ...aChild, children: [{ id: 'a-grandchild', text: 'G', children: [] }] }] },
        { id: 'b', text: 'B', children: [] },
      ],
    }

    const result = deleteNode(document, 'a-grandchild')

    expect(result.roots[1]).toBe(document.roots[1])
    expect(result.roots[0]).not.toBe(document.roots[0])
    expect(result.roots[0]!.children[0]).not.toBe(document.roots[0]!.children[0])
    expect(result.roots[0]!.children[0]!.children).toEqual([])
  })

  it('inserts an empty sibling before a node without changing its subtree', () => {
    const base = createFirstChild(createInitialDocument('a'), 'a', 'child')
    const document: Document = { roots: base.roots.map((node) => ({ ...node, text: 'Current' })) }

    const result = insertSiblingBefore(document, 'a', 'before')

    expect(result.roots.map((node) => [node.id, node.text, node.children.map((child) => child.id)])).toEqual([
      ['before', '', []],
      ['a', 'Current', ['child']],
    ])
  })

  it('inserts a deep subtree with fresh node IDs and preserved content', () => {
    const document: Document = {
      roots: [{ id: 'target', text: 'Target', children: [] }],
    }
    const source: TreeNode = {
      id: 'source',
      text: 'Source',
      links: [{ start: 0, end: 6, url: 'https://example.test' }],
      attachment: { id: 'image', mimeType: 'image/png' },
      children: [{ id: 'source-child', text: 'Child', children: [] }],
    }

    const ids = ['copy', 'copy-child']
    const inserted = insertSubtreeSibling(document, 'target', 'after', source, () => ids.shift()!)
    const copy = inserted.roots[1]!

    expect(copy).toEqual({
      id: 'copy',
      text: 'Source',
      links: source.links,
      attachment: source.attachment,
      children: [{ id: 'copy-child', text: 'Child', children: [] }],
    })
    expect(copy).not.toBe(source)
    expect(copy.children[0]).not.toBe(source.children[0])
    expect(collectAttachmentIds(inserted)).toEqual(new Set(['image']))
    expect(source.id).toBe('source')
  })

  it('keeps an image on the first part when splitting a node', () => {
    const base = attachImage(createInitialDocument('a'), 'a', { id: 'image', mimeType: 'image/png' })
    const document: Document = { roots: base.roots.map((node) => ({ ...node, text: 'Current' })) }

    const result = splitNode(document, 'a', 3, 'b')

    expect(result.roots.map((node) => [node.id, node.text, node.attachment?.id])).toEqual([
      ['a', 'Cur', 'image'],
      ['b', 'rent', undefined],
    ])
  })

  it('moves an image to the final node of multiline paste', () => {
    const base = attachImage(createInitialDocument('a'), 'a', { id: 'image', mimeType: 'image/png' })
    const document: Document = { roots: base.roots.map((node) => ({ ...node, text: 'abcdef' })) }

    const result = pasteMultilineText(document, 'a', 3, ['one', 'two', 'three'], ['b', 'c'])

    expect(result.roots.map((node) => [node.id, node.text, node.attachment?.id])).toEqual([
      ['a', 'abcone', undefined],
      ['b', 'two', undefined],
      ['c', 'threedef', 'image'],
    ])
  })

  it('moves a complete subtree without changing its identity', () => {
    const base = createFirstChild(createInitialDocument('a'), 'a', 'child')
    const document: Document = { roots: [...base.roots, { id: 'b', text: 'B', children: [] }] }

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
    const base = createFirstChild(createInitialDocument('parent'), 'parent', 'child')
    const root = base.roots[0]!
    const document: Document = {
      roots: [{ ...root, text: 'Parent', children: [{ ...root.children[0]!, text: 'Child' }] }],
    }

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

  it('validates persisted state with a single traversal and no derived index build', () => {
    const childSiblings: unknown[] = []
    const child: Record<string, unknown> = { id: 'b', text: '', children: childSiblings }
    const rootChildren = [child]
    let childListReads = 0
    const countingChildren = new Proxy(rootChildren, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) childListReads += 1
        return Reflect.get(target, property, receiver)
      },
    })
    const root: Record<string, unknown> = { id: 'a', text: '', children: countingChildren }
    const state = {
      version: 2,
      document: { roots: [root] },
      location: { currentParentId: 'a', selectedNodeId: 'b' },
    }

    expect(validatePersistedState(state)).toBe(state)
    expect(childListReads).toBe(1)
  })

  it('deletes a subtree as one operation', () => {
    const document = createFirstChild(createInitialDocument('a'), 'a', 'child')
    const result = deleteNode(document, 'a')
    expect(result.roots).toEqual([])
  })

  it('accepts exactly the maximum depth and rejects the next level', () => {
    const depth = MAX_DOCUMENT_DEPTH
    const rooted = (count: number): Document => {
      let node: TreeNode = { id: `n${count - 1}`, text: `t${count - 1}`, children: [] }
      for (let index = count - 2; index >= 0; index -= 1) {
        node = { id: `n${index}`, text: index === 0 ? 'root' : `t${index}`, children: [node] }
      }
      return { roots: [node] }
    }
    const document = rooted(depth)
    const overDepth = rooted(depth + 1)

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

    expect(() => assertDocument(overDepth)).toThrow(MAX_DOCUMENT_DEPTH_ERROR)
    expect(() =>
      parsePersistedState({
        version: 2,
        document: overDepth,
        location: { currentParentId: null, selectedNodeId: 'n0' },
      }),
    ).toThrow(MAX_DOCUMENT_DEPTH_ERROR)
  })

  it('rejects creating a child below the maximum depth without cloning or changing the source', () => {
    let node: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
    for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1) {
      node = { id: `n${index}`, text: '', children: [node] }
    }
    const document: Document = { roots: [node] }
    const deepest = nodePath(document, `n${MAX_DOCUMENT_DEPTH - 1}`).at(-1)!

    expect(() => createFirstChild(document, deepest.id, 'new')).toThrow(MAX_DOCUMENT_DEPTH_ERROR)
    expect(deepest.children).toEqual([])
  })

  it('does not split a surrogate pair when the cursor is inside it', () => {
    const base = createInitialDocument('a')
    const document: Document = { roots: base.roots.map((node) => ({ ...node, text: '😀b' })) }

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

  it('retains the index for each document across interleaved lookups', () => {
    const makeCountingDocument = (prefix: string) => {
      const siblings: TreeNode[] = Array.from({ length: 1000 }, (_, index) => ({
        id: `${prefix}${index}`,
        text: '',
        children: [],
      }))
      let elementReads = 0
      const roots = new Proxy(siblings, {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) elementReads += 1
          return Reflect.get(target, property, receiver)
        },
      })
      return {
        document: { roots } as Document,
        reads: () => elementReads,
        reset: () => {
          elementReads = 0
        },
      }
    }

    const first = makeCountingDocument('a')
    const second = makeCountingDocument('b')
    locateNode(first.document, 'a0')
    locateNode(second.document, 'b0')

    first.reset()
    expect(locateNode(first.document, 'a999')?.index).toBe(999)
    expect(first.reads()).toBe(1)

    second.reset()
    expect(locateNode(second.document, 'b999')?.index).toBe(999)
    expect(second.reads()).toBe(1)
  })

  it('resolves a warm lookup with a single sibling access instead of scanning the level', () => {
    const siblings: TreeNode[] = Array.from({ length: 1000 }, (_, index) => ({
      id: `n${index}`,
      text: '',
      children: [],
    }))
    let elementReads = 0
    const roots = new Proxy(siblings, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) elementReads += 1
        return Reflect.get(target, property, receiver)
      },
    })
    const document: Document = { roots }

    locateNode(document, 'n0')
    elementReads = 0

    const located = locateNode(document, 'n999')

    expect(located?.index).toBe(999)
    expect(elementReads).toBe(1)
  })

  it('rebuilds a released document index on the next lookup', () => {
    const siblings: TreeNode[] = Array.from({ length: 1000 }, (_, index) => ({
      id: `n${index}`,
      text: '',
      children: [],
    }))
    let elementReads = 0
    const roots = new Proxy(siblings, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) elementReads += 1
        return Reflect.get(target, property, receiver)
      },
    })
    const document: Document = { roots }

    locateNode(document, 'n0')
    releaseNodeIndex(document)
    elementReads = 0

    const located = locateNode(document, 'n999')

    expect(located?.index).toBe(999)
    expect(elementReads).toBe(1001)
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

  it('shares one attachment summary across path-copied text edits', () => {
    const document = attachImage(createInitialDocument('root'), 'root', { id: 'a', mimeType: 'image/png' })
    const first = attachmentSummary(document)
    const second = attachmentSummary(editNodeContent(document, 'root', 'changed', []))

    expect(second).toBe(first)
    expect([...second.keys()]).toEqual(['a'])
  })

  it('replaces the attachment summary when membership changes', () => {
    const document = attachImage(createInitialDocument('root'), 'root', { id: 'a', mimeType: 'image/png' })
    const first = attachmentSummary(document)
    const edited = editNodeContent(document, 'root', 'changed', [])

    expect(attachmentSummary(edited)).toBe(first)
    expect(
      attachmentSummary(insertSiblingAfter(edited, 'root', 'new', '', { id: 'b', mimeType: 'image/png' })),
    ).not.toBe(first)
    expect([...attachmentSummary(deleteNode(edited, 'root')).keys()]).toEqual([])
  })

  it('returns a defensive attachment id copy without exposing the cached summary', () => {
    const document = attachImage(createInitialDocument('root'), 'root', { id: 'a', mimeType: 'image/png' })
    const summary = attachmentSummary(document)
    const collected = collectAttachmentIds(document)

    collected.add('mutated')
    expect([...summary.keys()]).toEqual(['a'])
    expect([...collectAttachmentIds(document)]).toEqual(['a'])
    expect(collected).not.toBe(summary as unknown as Set<string>)
  })

  it('exposes read-only document and node collections', () => {
    const document = createInitialDocument('root')
    const mutateRoots = (): void => {
      // @ts-expect-error Document roots are read-only.
      document.roots.push({ id: 'other', text: '', children: [] })
    }
    const mutateNode = (): void => {
      const node = document.roots[0]!
      // @ts-expect-error Node children are read-only.
      node.children.push({ id: 'child', text: '', children: [] })
      // @ts-expect-error Node text is read-only.
      node.text = 'changed'
    }

    expect(mutateRoots).toBeTypeOf('function')
    expect(mutateNode).toBeTypeOf('function')
  })
})
