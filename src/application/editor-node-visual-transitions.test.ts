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

  it('rejects a counted over-depth forest put before consuming any ID', () => {
    let node: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
    for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1)
      node = { id: `n${index}`, text: '', children: [node] }
    const deepestId = `n${MAX_DOCUMENT_DEPTH - 1}`
    let nextId = 0
    expect(
      pasteNodeForestTransition(
        { roots: [node] },
        { currentParentId: deepestId, selectedNodeId: deepestId },
        deepestId,
        'after',
        { nodes: [{ id: 's', text: '', children: [{ id: 's1', text: '', children: [] }] }], sourceIds: ['s'] },
        () => `new-${++nextId}`,
        3,
      ),
    ).toEqual({ kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR })
    expect(nextId).toBe(0)
  })

  it('inserts every counted copy with a distinct fresh ID in forest order', () => {
    const document: Document = { roots: [{ id: 'a', text: 'A', children: [] }] }
    let nextId = 0
    const transition = pasteNodeForestTransition(
      document,
      location,
      'a',
      'before',
      {
        nodes: [
          { id: 'x', text: 'X', children: [] },
          { id: 'y', text: 'Y', children: [] },
        ],
        sourceIds: [],
      },
      () => `new-${++nextId}`,
      2,
    )
    if (!('document' in transition)) throw new Error('Expected an accepted transition.')
    expect(transition.document.roots.map((node) => `${node.id}:${node.text}`)).toEqual([
      'new-1:X',
      'new-2:Y',
      'new-3:X',
      'new-4:Y',
      'a:A',
    ])
    expect(transition.location.selectedNodeId).toBe('new-1')
  })

  it('selects the node after the inserted forest, or the last copy when none follows', () => {
    const document: Document = {
      roots: [
        { id: 'a', text: 'A', children: [] },
        { id: 'b', text: 'B', children: [] },
      ],
    }
    const forest = {
      nodes: [
        { id: 'x', text: 'X', children: [] },
        { id: 'y', text: 'Y', children: [] },
      ],
      sourceIds: [],
    }
    const run = (nodeId: string, position: 'before' | 'after', repeat: number) => {
      let nextId = 0
      const transition = pasteNodeForestTransition(
        document,
        location,
        nodeId,
        position,
        forest,
        () => `new-${++nextId}`,
        repeat,
        true,
      )
      if (!('document' in transition)) throw new Error('Expected an accepted transition.')
      return transition
    }
    // After `a`, `b` follows the forest; after `b`, nothing does, so the last copy is selected.
    expect(run('a', 'after', 1).location.selectedNodeId).toBe('b')
    expect(run('b', 'after', 2).location.selectedNodeId).toBe('new-4')
    expect(run('b', 'after', 2).focus).toEqual({ nodeId: 'new-4', cursor: 0 })
    // Before `b`, the target itself follows the forest.
    expect(run('b', 'before', 3).location.selectedNodeId).toBe('b')
    expect(run('a', 'before', 1).document.roots.map((node) => node.id)).toEqual(['new-1', 'new-2', 'a', 'b'])
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

  describe('outcomes over a four-sibling list', () => {
    const siblings = (): Document => ({
      roots: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id.toUpperCase(), children: [] })),
    })
    const idsOf = (document: Document): string[] => document.roots.map((node) => node.id)
    const counter = (): (() => string) => {
      let next = 0
      return () => `new-${++next}`
    }
    const forest = { nodes: [{ id: 's1', text: 'S1', children: [] }], sourceIds: ['s1'] }
    const changed = (
      command: Parameters<typeof nodeVisualTransition>[2],
      anchor: string,
      focus: string,
      source: Parameters<typeof nodeVisualTransition>[5] = undefined,
      text = 'typed',
    ) => {
      const result = nodeVisualTransition(siblings(), location, command, anchor, focus, source, text, true, counter())
      if (result.kind !== 'changed') throw new Error(`Expected a change, received ${result.kind}.`)
      return result
    }

    it('places a forest before or after the target and selects its first copy', () => {
      const document = siblings()
      const before = pasteNodeForestTransition(document, location, 'b', 'before', forest, () => 'copy')
      const after = pasteNodeForestTransition(document, location, 'b', 'after', forest, () => 'copy')
      if (!('document' in before) || !('document' in after)) throw new Error('Expected accepted transitions.')
      expect(idsOf(before.document)).toEqual(['a', 'copy', 'b', 'c', 'd'])
      expect(idsOf(after.document)).toEqual(['a', 'b', 'copy', 'c', 'd'])
      expect(before.location).toEqual({ currentParentId: null, selectedNodeId: 'copy' })
      expect(before.focus).toEqual({ nodeId: 'copy', cursor: 0 })
      expect(after.focus).toEqual({ nodeId: 'copy', cursor: 0 })
    })

    it('does nothing for an unknown anchor, an unknown focus, or when mutation is not allowed', () => {
      const createId = counter()
      const run = (anchor: string, focus: string, canMutate: boolean) =>
        nodeVisualTransition(siblings(), location, 'd', anchor, focus, undefined, '', canMutate, createId)
      expect(run('missing', 'a', true)).toEqual({ kind: 'none' })
      expect(run('a', 'missing', true)).toEqual({ kind: 'none' })
      // With the last sibling as anchor, an unchecked -1 focus would still slice a non-empty range.
      expect(run('d', 'missing', true)).toEqual({ kind: 'none' })
      expect(run('a', 'b', false)).toEqual({ kind: 'none' })
      expect(run('a', 'b', true).kind).toBe('changed')
    })

    it.each(['p', 'P'] as const)('does nothing for %s without a register or with an empty one', (command) => {
      const run = (source: Parameters<typeof nodeVisualTransition>[5]) =>
        nodeVisualTransition(siblings(), location, command, 'b', 'b', source, '', true, counter())
      expect(run(undefined)).toEqual({ kind: 'none' })
      expect(run({ nodes: [], sourceIds: [] })).toEqual({ kind: 'none' })
      expect(run(forest).kind).toBe('changed')
    })

    it.each(['p', 'P'] as const)('rejects %s into a source descendant and over the depth limit', (command) => {
      const nested: Document = { roots: [{ id: 'a', text: 'A', children: [{ id: 'child', text: 'C', children: [] }] }] }
      const childLocation: Location = { currentParentId: 'a', selectedNodeId: 'child' }
      expect(
        nodeVisualTransition(
          nested,
          childLocation,
          command,
          'child',
          'child',
          {
            nodes: nested.roots,
            sourceIds: ['a'],
          },
          '',
          true,
          counter(),
        ),
      ).toEqual({ kind: 'rejected', message: 'Cannot paste a node into one of its descendants.' })

      let deep: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
      for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1)
        deep = { id: `n${index}`, text: '', children: [deep] }
      const deepId = `n${MAX_DOCUMENT_DEPTH - 1}`
      expect(
        nodeVisualTransition(
          { roots: [deep] },
          { currentParentId: deepId, selectedNodeId: deepId },
          command,
          deepId,
          deepId,
          { nodes: [{ id: 'x', text: 'X', children: [{ id: 'y', text: 'Y', children: [] }] }], sourceIds: ['x'] },
          '',
          true,
          counter(),
        ),
      ).toEqual({ kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR })
    })

    it('does not apply the paste-only rejections to other commands', () => {
      const nested: Document = { roots: [{ id: 'a', text: 'A', children: [{ id: 'child', text: 'C', children: [] }] }] }
      const childLocation: Location = { currentParentId: 'a', selectedNodeId: 'child' }
      for (const command of ['d', 'x', 'c', 's'] as const) {
        const result = nodeVisualTransition(
          nested,
          childLocation,
          command,
          'child',
          'child',
          { nodes: nested.roots, sourceIds: ['a'] },
          'T',
          true,
          counter(),
        )
        expect(result.kind).toBe('changed')
      }
      let deep: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
      for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1)
        deep = { id: `n${index}`, text: '', children: [deep] }
      const deepId = `n${MAX_DOCUMENT_DEPTH - 1}`
      const tooDeep = {
        nodes: [{ id: 'x', text: 'X', children: [{ id: 'y', text: 'Y', children: [] }] }],
        sourceIds: [],
      }
      expect(
        nodeVisualTransition(
          { roots: [deep] },
          { currentParentId: deepId, selectedNodeId: deepId },
          'd',
          deepId,
          deepId,
          tooDeep,
          '',
          true,
          counter(),
        ).kind,
      ).toBe('changed')
    })

    it.each([
      ['d', true],
      ['x', true],
      ['c', true],
      ['s', true],
      ['p', true],
      ['P', true],
      ['u', false],
    ] as const)('reports cleanup for %s as %s and registers the selected range', (command, cleanup) => {
      const result = changed(command, 'b', 'c', forest, 'typed')
      expect(result.cleanup).toBe(cleanup)
      expect(result.register.sourceIds).toEqual(['b', 'c'])
      expect(result.register.nodes.map((node) => node.text)).toEqual(['B', 'C'])
    })

    it('deletes with d and x, selecting the node that takes the deleted range’s place', () => {
      for (const command of ['d', 'x'] as const) {
        const middle = changed(command, 'b', 'c')
        expect(idsOf(middle.transition.document)).toEqual(['a', 'd'])
        expect(middle.transition.location.selectedNodeId).toBe('d')
        expect(middle.transition.focus).toEqual({ nodeId: 'd', cursor: 0 })
        const tail = changed(command, 'c', 'd')
        expect(idsOf(tail.transition.document)).toEqual(['a', 'b'])
        expect(tail.transition.location.selectedNodeId).toBe('b')
      }
    })

    it('replaces the range with one typed node for c and s and selects it', () => {
      for (const command of ['c', 's'] as const) {
        const result = changed(command, 'b', 'c', undefined, 'typed')
        expect(result.transition.document.roots.map((node) => node.text)).toEqual(['A', 'typed', 'D'])
        expect(result.transition.location.selectedNodeId).toBe('new-1')
        expect(result.transition.document.roots[1]).toEqual({ id: 'new-1', text: 'typed', children: [] })
      }
    })

    it('puts the register over the range for p and P with fresh IDs and selects the first copy', () => {
      for (const command of ['p', 'P'] as const) {
        const result = changed(command, 'b', 'c', forest)
        expect(idsOf(result.transition.document)).toEqual(['a', 'new-1', 'd'])
        expect(result.transition.location.selectedNodeId).toBe('new-1')
        expect(result.transition.document.roots[1]?.text).toBe('S1')
      }
    })

    it('replaces the range with every counted copy of the forest and returns the removed range', () => {
      const two = {
        nodes: [
          { id: 's1', text: 'S1', children: [{ id: 's1c', text: 'C', children: [] }] },
          { id: 's2', text: 'S2', children: [] },
        ],
        sourceIds: ['s1', 's2'],
      }
      for (const command of ['p', 'P'] as const) {
        const result = nodeVisualTransition(siblings(), location, command, 'c', 'b', two, '', true, counter(), 2)
        if (result.kind !== 'changed') throw new Error(`Expected a change, received ${result.kind}.`)
        // Fresh IDs for every copy and descendant, in whole-forest order, with the range gone.
        expect(result.transition.document.roots.map((node) => `${node.id}:${node.text}`)).toEqual([
          'a:A',
          'new-1:S1',
          'new-3:S2',
          'new-4:S1',
          'new-6:S2',
          'd:D',
        ])
        expect(result.transition.document.roots[1]?.children[0]?.id).toBe('new-2')
        expect(result.transition.location.selectedNodeId).toBe('new-1')
        expect(result.register.sourceIds).toEqual(['b', 'c'])
        expect(result.register.nodes.map((node) => node.text)).toEqual(['B', 'C'])
      }
    })

    it('rejects a counted put into a source descendant or past the depth limit without consuming IDs', () => {
      let nextId = 0
      const createId = (): string => `new-${++nextId}`
      const document: Document = {
        roots: [{ id: 'a', text: 'A', children: [{ id: 'child', text: 'C', children: [] }] }],
      }
      expect(
        nodeVisualTransition(
          document,
          { currentParentId: 'a', selectedNodeId: 'child' },
          'p',
          'child',
          'child',
          { nodes: document.roots, sourceIds: ['a'] },
          '',
          true,
          createId,
          3,
        ),
      ).toEqual({ kind: 'rejected', message: 'Cannot paste a node into one of its descendants.' })
      let deep: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
      for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1)
        deep = { id: `n${index}`, text: '', children: [deep] }
      const deepestId = `n${MAX_DOCUMENT_DEPTH - 1}`
      expect(
        nodeVisualTransition(
          { roots: [deep] },
          { currentParentId: deepestId, selectedNodeId: deepestId },
          'P',
          deepestId,
          deepestId,
          { nodes: [{ id: 's', text: '', children: [{ id: 's1', text: '', children: [] }] }], sourceIds: ['s'] },
          '',
          true,
          createId,
          3,
        ),
      ).toEqual({ kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR })
      expect(nextId).toBe(0)
    })

    it('changes case of a subtree, keeping IDs, attachments and children, and omits empty links', () => {
      const document: Document = {
        roots: [
          {
            id: 'a',
            text: 'Ab',
            attachment: { id: 'png', mimeType: 'image/png' },
            children: [{ id: 'kid', text: 'cd', children: [] }],
          },
        ],
      }
      const upper = nodeVisualTransition(document, location, 'U', 'a', 'a', undefined, '', true, counter())
      expect(upper.kind).toBe('changed')
      if (upper.kind !== 'changed') return
      expect(upper.transition.document.roots[0]).toEqual({
        id: 'a',
        text: 'AB',
        attachment: { id: 'png', mimeType: 'image/png' },
        children: [{ id: 'kid', text: 'CD', children: [] }],
      })
      expect(upper.transition.document.roots[0]).not.toHaveProperty('links')
      expect(upper.cleanup).toBe(false)
      const lower = nodeVisualTransition(document, location, 'u', 'a', 'a', undefined, '', true, counter())
      if (lower.kind !== 'changed') throw new Error('Expected a change.')
      expect(lower.transition.document.roots[0]?.text).toBe('ab')
      expect(lower.transition.document.roots[0]).toHaveProperty('attachment')
    })

    it('keeps a node without an attachment free of an attachment property', () => {
      const result = changed('u', 'a', 'a')
      expect(result.transition.document.roots[0]).toEqual({ id: 'a', text: 'a', children: [] })
      expect(result.transition.document.roots[0]).not.toHaveProperty('attachment')
    })
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
