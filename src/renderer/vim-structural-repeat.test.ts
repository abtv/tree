import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import { createVimEditSessionState } from './vim-edit-session'
import { repeatStructural } from './vim-structural-repeat'
import { createRealStoreHarness } from './test/real-store-harness'
import { createEditorStoreDouble } from './test/editor-store-double'

const node = (id: string, text = id, children: TreeNode[] = []): TreeNode => ({ id, text, children })

async function setup(roots: TreeNode[] = [node('a'), node('b'), node('c')]) {
  const real = await createRealStoreHarness({
    document: { roots },
    clock: { setTimeout: () => 0, clearTimeout: () => undefined },
  })
  return { ...real, session: createVimEditSessionState() }
}

describe('structural repeat replay', () => {
  it.each(['loading', 'locked'] as const)('rejects a %s store', (status) => {
    const store = createEditorStoreDouble({
      snapshot:
        status === 'loading'
          ? { status: 'loading' }
          : {
              status: 'ready',
              document: { roots: [node('a')] },
              location: { currentParentId: null, selectedNodeId: 'a' },
              persistenceLocked: true,
            },
    })
    expect(
      repeatStructural({ store, session: createVimEditSessionState() }, { kind: 'structural-delete', span: 1 }, 0),
    ).toBe(false)
  })

  it.each(['structural-delete', 'structural-join'] as const)('rejects %s with a missing selected node', (kind) => {
    const store = createEditorStoreDouble({
      snapshot: {
        status: 'ready',
        document: { roots: [node('a')] },
        location: { currentParentId: null, selectedNodeId: 'missing' },
      },
    })
    const change = kind === 'structural-delete' ? { kind, span: 1 } : { kind, span: 1, spaced: true }
    expect(repeatStructural({ store, session: createVimEditSessionState() }, change, 0)).toBe(false)
  })

  it('rejects deletion when the store refuses the mutation and preserves the register', () => {
    const store = createEditorStoreDouble({
      snapshot: {
        status: 'ready',
        document: { roots: [node('a')] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      },
      deleteSiblingRange: () => undefined,
    })
    const session = createVimEditSessionState()
    const register = session.register
    expect(repeatStructural({ store, session }, { kind: 'structural-delete', span: 1 }, 0)).toBe(false)
    expect(session.register).toBe(register)
  })

  it('rejects Visual replay on the current parent', async () => {
    const real = await createRealStoreHarness({
      document: { roots: [node('parent', 'parent', [node('child')])] },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
      clock: { setTimeout: () => 0, clearTimeout: () => undefined },
    })
    expect(
      repeatStructural(
        { store: real.store, session: createVimEditSessionState() },
        { kind: 'structural-join', span: 1, spaced: true },
        0,
      ),
    ).toBe(false)
  })

  it('rejects opening a child beyond the depth limit', async () => {
    const root = Array.from({ length: 20 }, (_, index) => node(`depth-${index}`)).reduceRight<TreeNode | undefined>(
      (child, parent) => ({ ...parent, children: child === undefined ? [] : [child] }),
      undefined,
    )!
    const real = await createRealStoreHarness({
      document: { roots: [root] },
      location: { currentParentId: 'depth-18', selectedNodeId: 'depth-19' },
      clock: { setTimeout: () => 0, clearTimeout: () => undefined },
    })
    const before = real.snapshot().document
    expect(
      repeatStructural(
        { store: real.store, session: createVimEditSessionState() },
        { kind: 'structural-child-open', text: 'too deep' },
        0,
      ),
    ).toBe(false)
    expect(real.snapshot().document).toBe(before)
  })

  it('shifts the current sibling under its preceding sibling', async () => {
    const deps = await setup()
    deps.store.selectNode('b', 0)
    expect(repeatStructural(deps, { kind: 'structural-shift', direction: 'in', span: 1, count: 1 }, 2)).toBe(true)
    expect(deps.snapshot().document.roots[0]?.children.map((child) => child.id)).toEqual(['b'])
  })

  it('rejects a deletion whose span exceeds the remaining siblings', async () => {
    const deps = await setup()
    const before = deps.snapshot()
    const register = deps.session.register
    expect(repeatStructural(deps, { kind: 'structural-delete', span: 4 }, 0)).toBe(false)
    expect(deps.snapshot().document).toBe(before.document)
    expect(deps.session.register).toBe(register)
  })

  it.each([1, 2])('records the deleted sibling span of %s in the register', async (span) => {
    const deps = await setup()
    expect(repeatStructural(deps, { kind: 'structural-delete', span }, 0)).toBe(true)
    expect(deps.snapshot().document.roots.map((root) => root.id)).toEqual(span === 1 ? ['b', 'c'] : ['c'])
    expect(deps.session.register.kind).toBe(span === 1 ? 'node' : 'nodes')
  })

  it.each(['before', 'after'] as const)('opens a sibling %s with captured text', async (position) => {
    const deps = await setup()
    expect(repeatStructural(deps, { kind: 'structural-open', position, text: 'captured' }, 0)).toBe(true)
    expect(deps.snapshot().document.roots.map((root) => root.text)).toEqual(
      position === 'before' ? ['captured', 'a', 'b', 'c'] : ['a', 'captured', 'b', 'c'],
    )
  })

  it('opens a child with captured text', async () => {
    const deps = await setup()
    expect(repeatStructural(deps, { kind: 'structural-child-open', text: 'child' }, 0)).toBe(true)
    expect(deps.snapshot().document.roots[0]?.children.map((child) => child.text)).toEqual(['child'])
  })

  it.each(['structural-put', 'structural-forest-put'] as const)(
    'replays %s with captured subtrees and fresh identities',
    async (kind) => {
      const deps = await setup()
      const source = node('source', 'incoming', [node('nested')])
      const change =
        kind === 'structural-put'
          ? { kind, position: 'after' as const, source, sourceIds: ['source', 'nested'] }
          : { kind, position: 'after' as const, source: { nodes: [source], sourceIds: ['source', 'nested'] } }
      expect(repeatStructural(deps, change, 0)).toBe(true)
      const roots = deps.snapshot().document.roots
      expect(roots.map((root) => root.text)).toEqual(['a', 'incoming', 'b', 'c'])
      expect(roots[1]?.id).not.toBe('source')
      expect(roots[1]?.children[0]?.id).not.toBe('nested')
    },
  )

  it.each(['structural-put', 'structural-forest-put'] as const)(
    'replays counted %s past the captured destination',
    async (kind) => {
      const deps = await setup()
      const source = node('source', 'incoming')
      const change =
        kind === 'structural-put'
          ? { kind, position: 'before' as const, source, sourceIds: ['source'], repeat: 2, past: true }
          : {
              kind,
              position: 'before' as const,
              source: { nodes: [source], sourceIds: ['source'] },
              repeat: 2,
              past: true,
            }
      expect(repeatStructural(deps, change, 0)).toBe(true)
      expect(deps.snapshot().document.roots.map((root) => root.text)).toEqual(['incoming', 'incoming', 'a', 'b', 'c'])
    },
  )

  it('rejects a Visual span without an ending sibling', async () => {
    const deps = await setup()
    expect(repeatStructural(deps, { kind: 'structural-join', span: 4, spaced: true }, 0)).toBe(false)
  })

  it('joins the exact sibling span', async () => {
    const deps = await setup()
    expect(repeatStructural(deps, { kind: 'structural-join', span: 2, spaced: true }, 0)).toBe(true)
    expect(deps.snapshot().document.roots.map((root) => root.text)).toEqual(['a b', 'c'])
  })

  it('keeps the register when a shift is unavailable', async () => {
    const deps = await setup()
    const register = deps.session.register
    expect(repeatStructural(deps, { kind: 'structural-shift', direction: 'out', span: 1, count: 1 }, 2)).toBe(false)
    expect(deps.session.register).toBe(register)
  })

  it('updates the register after a successful Visual deletion', async () => {
    const deps = await setup()
    expect(repeatStructural(deps, { kind: 'structural-visual', command: 'd', span: 2 }, 0)).toBe(true)
    expect(deps.snapshot().document.roots.map((root) => root.id)).toEqual(['c'])
    expect(deps.session.register.kind).toBe('nodes')
  })

  it('preserves the register when a Visual put lacks a source', async () => {
    const deps = await setup()
    const register = deps.session.register
    expect(repeatStructural(deps, { kind: 'structural-visual', command: 'p', span: 1 }, 0)).toBe(false)
    expect(deps.session.register).toBe(register)
  })

  it('preserves the register after a successful Visual case change', async () => {
    const deps = await setup()
    const register = deps.session.register
    expect(repeatStructural(deps, { kind: 'structural-visual', command: 'U', span: 2 }, 0)).toBe(true)
    expect(deps.snapshot().document.roots.map((root) => root.text)).toEqual(['A', 'B', 'c'])
    expect(deps.session.register).toBe(register)
  })
})
