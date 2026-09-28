import { describe, expect, it } from 'vitest'
import type { Document, Location, TreeNode } from '../domain/document'
import { MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_DEPTH_ERROR } from '../domain/document'
import {
  isPasteIntoSourceDescendant,
  nodeVisualTransition,
  pasteNodeForestTransition,
} from './editor-node-visual-transitions'

const location: Location = { currentParentId: null, selectedNodeId: 'a' }

describe('whole-node Visual transitions', () => {
  it('yanks without mutation and rejects a put into a source descendant', () => {
    const document: Document = { roots: [{ id: 'a', text: 'A', children: [{ id: 'child', text: 'C', children: [] }] }] }
    let nextId = 0
    const createId = (): string => `new-${++nextId}`
    const yank = nodeVisualTransition(document, location, 'y', 'a', 'a', undefined, '', true, createId)
    expect(yank.kind).toBe('yank')
    expect(nextId).toBe(0)
    expect(isPasteIntoSourceDescendant(document, 'child', ['a'])).toBe(true)
    const childLocation: Location = { currentParentId: 'a', selectedNodeId: 'child' }
    expect(
      nodeVisualTransition(
        document,
        childLocation,
        'p',
        'child',
        'child',
        { nodes: document.roots, sourceIds: ['a'] },
        '',
        true,
        createId,
      ),
    ).toEqual({
      kind: 'rejected',
      message: 'Cannot paste a node into one of its descendants.',
    })
    expect(nextId).toBe(0)
  })

  it('rejects an over-depth node-forest and whole-node Visual paste before consuming IDs', () => {
    let node: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
    for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1) {
      node = { id: `n${index}`, text: '', children: [node] }
    }
    const deepDocument: Document = { roots: [node] }
    const deepestId = `n${MAX_DOCUMENT_DEPTH - 1}`
    const deepestLocation: Location = { currentParentId: deepestId, selectedNodeId: deepestId }
    const source: TreeNode = {
      id: 'source',
      text: 'Source',
      children: [{ id: 'source-child', text: 'Child', children: [] }],
    }
    const sourceForest = { nodes: [source], sourceIds: ['source'] }
    let nextId = 0
    const createId = (): string => `new-${++nextId}`

    expect(
      pasteNodeForestTransition(deepDocument, deepestLocation, deepestId, 'after', sourceForest, createId),
    ).toEqual({ kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR })
    expect(
      nodeVisualTransition(deepDocument, deepestLocation, 'p', deepestId, deepestId, sourceForest, '', true, createId),
    ).toEqual({ kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR })
    expect(nextId).toBe(0)
  })

  it('creates fresh forest IDs and preserves attachments', () => {
    const document: Document = { roots: [{ id: 'a', text: 'A', children: [] }] }
    const transition = pasteNodeForestTransition(
      document,
      location,
      'a',
      'after',
      {
        nodes: [{ id: 'source', text: 'image', attachment: { id: 'png', mimeType: 'image/png' }, children: [] }],
        sourceIds: [],
      },
      () => 'copy',
    )
    if (!('document' in transition)) throw new Error('Expected an accepted transition.')
    expect(transition.document.roots.map((node) => node.id)).toEqual(['a', 'copy'])
    expect(transition.document.roots[1]?.attachment?.id).toBe('png')
    expect(transition.location.selectedNodeId).toBe('copy')
  })

  it('repairs an empty root and leaves an unchanged case operation alone', () => {
    const document: Document = { roots: [{ id: 'a', text: 'ABC', children: [] }] }
    let id = 0
    const createId = (): string => `new-${++id}`
    expect(nodeVisualTransition(document, location, 'U', 'a', 'a', undefined, '', true, createId)).toEqual({
      kind: 'none',
    })
    const deletion = nodeVisualTransition(document, location, 'd', 'a', 'a', undefined, '', true, createId)
    expect(deletion.kind).toBe('changed')
    if (deletion.kind === 'changed')
      expect(deletion.transition.document.roots.map((node) => node.id)).toEqual(['new-1'])
  })

  it('scopes a visible descendant’s range to its own real siblings and falls back to its own real parent', () => {
    // mid's real parent is root, but the current location stays at the root level (currentParentId
    // null), several levels above mid, exactly as inline expansion leaves it when mid and its
    // children are shown through expansion rather than by entering mid (docs/PRODUCT.md §2.4).
    const document: Document = {
      roots: [
        {
          id: 'root',
          text: 'Root',
          children: [
            {
              id: 'mid',
              text: 'Mid',
              children: [
                { id: 'c1', text: 'C1', children: [] },
                { id: 'c2', text: 'C2', children: [] },
              ],
            },
          ],
        },
      ],
    }
    let id = 0
    const createId = (): string => `new-${++id}`
    const rootLevelLocation: Location = { currentParentId: null, selectedNodeId: 'root' }

    const yank = nodeVisualTransition(document, rootLevelLocation, 'y', 'c1', 'c2', undefined, '', true, createId)
    expect(yank.kind).toBe('yank')
    if (yank.kind === 'yank') expect(yank.register.sourceIds).toEqual(['c1', 'c2'])

    // Deleting both of mid's children empties its own sibling array; the fallback selection must be
    // mid itself (the real parent), not the unrelated root-level `currentParentId`.
    const deletion = nodeVisualTransition(document, rootLevelLocation, 'd', 'c1', 'c2', undefined, '', true, createId)
    expect(deletion.kind).toBe('changed')
    if (deletion.kind === 'changed') {
      expect(deletion.transition.location.selectedNodeId).toBe('mid')
      const mid = deletion.transition.document.roots[0]?.children[0]
      expect(mid?.id).toBe('mid')
      expect(mid?.children).toEqual([])
    }
  })

  it('shifts hyperlink offsets when Unicode case conversion expands text', () => {
    const text = 'İhttps://a.com'
    const document: Document = {
      roots: [{ id: 'a', text, links: [{ start: 1, end: text.length, url: 'https://a.com' }], children: [] }],
    }
    const result = nodeVisualTransition(document, location, 'u', 'a', 'a', undefined, '', true, () => 'unused')
    expect(result.kind).toBe('changed')
    if (result.kind === 'changed') {
      expect(result.transition.document.roots[0]?.text).toBe('i̇https://a.com')
      expect(result.transition.document.roots[0]?.links).toEqual([{ start: 2, end: 15, url: 'https://a.com' }])
    }
  })
})
