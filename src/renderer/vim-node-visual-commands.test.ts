import { describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../domain/document'
import { createVimCommandState } from './vim-command-state'
import {
  commandNodeVisual,
  joinNodeVisual,
  moveNodeVisual,
  restoreVisual,
  shiftCurrentNode,
  shiftNodeVisual,
  verticalOperator,
} from './vim-node-visual-commands'
import { createVimEditSessionState } from './vim-edit-session'
import type { NodeVisualSelection } from './node-input-types'
import { rememberNodeRange } from './vim-visual-memory'
import { createEditorStoreDouble } from './test/editor-store-double'
import { createRealStoreHarness } from './test/real-store-harness'

const node = (id: string, children: TreeNode[] = []): TreeNode => ({ id, text: id, children })

async function setup(roots: TreeNode[] = [node('a', [node('child')]), node('b'), { ...node('c'), text: 'charlie' }]) {
  const real = await createRealStoreHarness({
    document: { roots },
    clock: { setTimeout: () => 0, clearTimeout: () => undefined },
  })
  return {
    ...real,
    commandState: createVimCommandState(),
    session: createVimEditSessionState(),
    nodeVisualSelection: { anchorId: 'b', focusId: 'c' } as NodeVisualSelection | undefined,
    setNodeVisualSelection: vi.fn(),
    changeVimMode: vi.fn(),
    syncImageCaretToFocus: vi.fn(),
    schedulePendingVisualSelection: vi.fn(),
  }
}

describe('whole-node Visual restoration and movement', () => {
  // @requirement PRODUCT.md §23.14
  it('routes Agenda selection motions and d through pending moves and blocks other range commands', async () => {
    const deps = await setup([
      node('a'),
      { ...node('b'), text: '2026-10-14 B' },
      { ...node('c'), text: '2026-10-14 C' },
    ])
    deps.store.openAgenda()
    moveNodeVisual(deps, 'down')
    commandNodeVisual(deps, 'd')
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    const key = deps.store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'c')!.key
    deps.store.applyAgenda({ kind: 'select', key })
    moveNodeVisual(deps, 'up')
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith({ anchorId: 'b', focusId: 'b' })
    expect(deps.snapshot().focus).toMatchObject({ nodeId: 'b', cursor: 0 })
    deps.setNodeVisualSelection.mockClear()
    moveNodeVisual({ ...deps, nodeVisualSelection: { anchorId: 'b', focusId: 'b' } }, 'up')
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    moveNodeVisual({ ...deps, nodeVisualSelection: { anchorId: 'missing', focusId: 'b' } }, 'down')
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    const before = deps.snapshot().document
    commandNodeVisual(deps, 'c')
    shiftNodeVisual(deps, 'in', 1)
    joinNodeVisual(deps, true)
    rememberNodeRange(deps.commandState, deps.snapshot().document, 'b', 'c')
    restoreVisual(deps)
    expect(deps.snapshot().document).toBe(before)
    expect(deps.changeVimMode).not.toHaveBeenCalled()
    commandNodeVisual({ ...deps, nodeVisualSelection: { anchorId: 'missing', focusId: 'b' } }, 'd')
    expect(deps.changeVimMode).not.toHaveBeenCalled()
    commandNodeVisual(deps, 'd')
    expect(deps.snapshot().agenda!.pendingMove!.map((source) => source.nodeId)).toEqual(['b', 'c'])
    expect(deps.changeVimMode).toHaveBeenCalledWith('normal')
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith(undefined)
    expect(deps.snapshot().document).toBe(before)
  })
  it('ignores restoration without saved Visual memory', async () => {
    const deps = await setup()
    restoreVisual(deps)
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    expect(deps.changeVimMode).not.toHaveBeenCalled()
  })

  it('restores a reverse node range and synchronizes the image caret after switching mode', async () => {
    const deps = await setup()
    rememberNodeRange(deps.commandState, deps.snapshot().document, 'c', 'a')
    restoreVisual(deps)
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith({ anchorId: 'c', focusId: 'a' })
    expect(deps.snapshot().location.selectedNodeId).toBe('a')
    expect(deps.changeVimMode).toHaveBeenCalledWith('visual-node')
    expect(deps.syncImageCaretToFocus).toHaveBeenCalledOnce()
    expect(deps.changeVimMode.mock.invocationCallOrder[0]).toBeLessThan(
      deps.syncImageCaretToFocus.mock.invocationCallOrder[0]!,
    )
    expect(deps.schedulePendingVisualSelection).not.toHaveBeenCalled()
  })

  it('restores reversed character endpoints after selecting their lower offset', async () => {
    const deps = await setup()
    deps.commandState.lastVisual = { kind: 'text', nodeId: 'c', anchor: 4, focus: 1, hadText: true }
    const events: string[] = []
    const selectNode = deps.store.selectNode.bind(deps.store)
    deps.store.selectNode = (id, cursor) => {
      events.push('focus')
      return selectNode(id, cursor)
    }
    deps.schedulePendingVisualSelection.mockImplementation(() => events.push('pending'))
    deps.changeVimMode.mockImplementation(() => events.push('mode'))
    restoreVisual(deps)
    expect(events).toEqual(['focus', 'pending', 'mode'])
    expect(deps.snapshot().location.selectedNodeId).toBe('c')
    expect(deps.schedulePendingVisualSelection).toHaveBeenCalledWith({
      nodeId: 'c',
      start: 1,
      end: 5,
      endpoints: { anchor: 4, focus: 1, hadText: true },
    })
    expect(deps.changeVimMode).toHaveBeenCalledWith('visual')
    expect(deps.syncImageCaretToFocus).not.toHaveBeenCalled()
  })

  it('ignores saved memory whose node no longer exists', async () => {
    const deps = await setup()
    deps.commandState.lastVisual = { kind: 'text', nodeId: 'missing', anchor: 0, focus: 0, hadText: true }
    restoreVisual(deps)
    expect(deps.changeVimMode).not.toHaveBeenCalled()
    expect(deps.schedulePendingVisualSelection).not.toHaveBeenCalled()
  })

  it.each([
    ['up', 99, 'a'],
    ['down', 99, 'c'],
    ['first', 1, 'a'],
    ['last', 1, 'c'],
  ] as const)('extends %s within actual siblings and preserves the anchor', async (direction, count, focusId) => {
    const deps = await setup()
    moveNodeVisual({ ...deps, nodeVisualSelection: { anchorId: 'c', focusId: 'b' } }, direction, count)
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith({ anchorId: 'c', focusId })
    expect(deps.snapshot().location.selectedNodeId).toBe(focusId)
    expect(deps.syncImageCaretToFocus).toHaveBeenCalledOnce()
    expect(deps.commandState.lastVisual).toMatchObject({ kind: 'nodes', anchorId: 'c', focusId })
  })

  it('uses the default one-node count', async () => {
    const deps = await setup()
    moveNodeVisual({ ...deps, nodeVisualSelection: { anchorId: 'a', focusId: 'a' } }, 'down')
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith({ anchorId: 'a', focusId: 'b' })
  })

  it('ignores a movement count that cannot resolve a sibling', async () => {
    const deps = await setup()
    moveNodeVisual({ ...deps, nodeVisualSelection: { anchorId: 'a', focusId: 'b' } }, 'down', Number.NaN)
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    expect(deps.syncImageCaretToFocus).not.toHaveBeenCalled()
  })

  // @requirement PRODUCT.md §20.2.23
  it.each([
    ['up', 1, 'a', 'c'],
    ['up', 99, 'a', 'c'],
    ['first', 1, 'a', 'c'],
    ['down', 1, 'c', 'a'],
    ['down', 99, 'c', 'a'],
    ['last', 1, 'c', 'a'],
  ] as const)('preserves the range and focus when %s/%s clamps at %s', async (direction, count, focusId, anchorId) => {
    const deps = await setup()
    deps.store.selectNode(focusId, 2)
    rememberNodeRange(deps.commandState, deps.snapshot().document, anchorId, focusId)
    const before = deps.snapshot()
    const memory = deps.commandState.lastVisual
    const publish = vi.fn()
    const unsubscribe = deps.store.subscribe(publish)
    moveNodeVisual({ ...deps, nodeVisualSelection: { anchorId, focusId } }, direction, count)
    expect(deps.snapshot()).toBe(before)
    expect(deps.commandState.lastVisual).toBe(memory)
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    expect(deps.syncImageCaretToFocus).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    unsubscribe()
  })

  it.each([undefined, { anchorId: 'a', focusId: 'missing' }])(
    'ignores absent or invalid node selection',
    async (nodeVisualSelection) => {
      const deps = await setup()
      moveNodeVisual({ ...deps, nodeVisualSelection }, 'down')
      expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
      expect(deps.syncImageCaretToFocus).not.toHaveBeenCalled()
    },
  )

  it('ignores both commands while the store is loading', async () => {
    const deps = await setup()
    const store = createEditorStoreDouble({ snapshot: { status: 'loading' } })
    restoreVisual({ ...deps, store })
    moveNodeVisual({ ...deps, store, nodeVisualSelection: { anchorId: 'a', focusId: 'b' } }, 'down')
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    expect(deps.changeVimMode).not.toHaveBeenCalled()
  })
})

describe('whole-node Visual mutations', () => {
  it('copies a successful yank through the real store without changing the document', async () => {
    const deps = await setup()
    const document = deps.snapshot().document
    const copy = vi.spyOn(deps.store, 'copyVimForest')
    commandNodeVisual(deps, 'y')
    await Promise.resolve()
    expect(copy).toHaveBeenCalledWith(document.roots.slice(1))
    await expect(copy.mock.results[0]?.value).resolves.toBe(true)
    expect(deps.snapshot().document).toBe(document)
    expect(deps.changeVimMode).toHaveBeenCalledWith('normal')
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith(undefined)
  })

  it('preserves owner state when a located vertical range is refused by the store', async () => {
    const deps = await setup()
    const failure = createEditorStoreDouble({
      snapshot: deps.snapshot(),
      applyNodeVisual: () => undefined,
    })
    verticalOperator({ ...deps, store: failure }, 'b', 'd', 'down', 1)
    expect(deps.session.register).toEqual({ kind: 'empty' })
    expect(deps.commandState.lastChange).toBeUndefined()
    expect(deps.changeVimMode).not.toHaveBeenCalled()
  })

  it.each(['c', 's'] as const)('starts structural %s before entering Insert and clears endpoints', async (command) => {
    const deps = await setup()
    commandNodeVisual(deps, command)
    expect(deps.commandState.structuralInsert).toEqual({ kind: 'visual', originNodeId: 'c', command, span: 2 })
    expect(deps.changeVimMode).toHaveBeenCalledWith('insert')
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith(undefined)
    expect(deps.session.register.kind).toBe('nodes')
    expect(deps.syncImageCaretToFocus).not.toHaveBeenCalled()
  })

  it.each(['d', 'x', 'u', 'U'] as const)('records %s and returns to Normal after success', async (command) => {
    const deps = await setup()
    if (command === 'u') commandNodeVisual(deps, 'U')
    deps.changeVimMode.mockClear()
    deps.syncImageCaretToFocus.mockClear()
    deps.setNodeVisualSelection.mockClear()
    const register = deps.session.register
    commandNodeVisual(deps, command)
    expect(deps.commandState.lastChange).toEqual({ kind: 'structural-visual', command, span: 2 })
    expect(deps.changeVimMode).toHaveBeenCalledWith('normal')
    expect(deps.syncImageCaretToFocus).toHaveBeenCalledOnce()
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith(undefined)
    if (command === 'u' || command === 'U') expect(deps.session.register).toBe(register)
    else expect(deps.session.register.kind).toBe('nodes')
  })

  it.each(['p', 'P'] as const)('puts a counted forest with %s and remembers incoming nodes', async (command) => {
    const deps = await setup()
    const source = { nodes: [node('incoming')], sourceIds: ['incoming'] }
    const register = { kind: 'nodes' as const, value: source }
    deps.session.register = register
    commandNodeVisual(deps, command, 2)
    const roots = deps.snapshot().document.roots
    expect(roots.map((root) => root.text)).toEqual(['a', 'incoming', 'incoming'])
    expect(new Set(roots.map((root) => root.id)).size).toBe(3)
    expect(roots[1]?.id).not.toBe('incoming')
    expect(deps.commandState.lastVisual).toMatchObject({ kind: 'nodes', ids: roots.slice(1).map((root) => root.id) })
    expect(deps.commandState.lastChange).toEqual({ kind: 'structural-visual', command, span: 2, source, repeat: 2 })
    if (command === 'P') expect(deps.session.register).toBe(register)
    else expect(deps.session.register).toMatchObject({ kind: 'nodes', value: { sourceIds: ['b', 'c'] } })
  })

  it('yanks without recording a new repeat and reports asynchronous clipboard failure', async () => {
    const deps = await setup()
    const error = new Error('clipboard failure')
    const copy = vi.spyOn(deps.store, 'copyVimForest').mockRejectedValue(error)
    const report = vi.spyOn(deps.store, 'reportError')
    commandNodeVisual(deps, 'y')
    await Promise.resolve()
    expect(copy).toHaveBeenCalledWith([node('b'), { ...node('c'), text: 'charlie' }])
    expect(report).toHaveBeenCalledWith(error)
    expect(deps.commandState.lastChange).toBeUndefined()
    expect(deps.session.register).toMatchObject({ kind: 'nodes', value: { sourceIds: ['b', 'c'] } })
    expect(deps.changeVimMode).toHaveBeenCalledWith('normal')
  })

  it('preserves mode and selection when a put has an empty register', async () => {
    const deps = await setup()
    commandNodeVisual(deps, 'p')
    expect(deps.changeVimMode).not.toHaveBeenCalled()
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    expect(deps.commandState.lastChange).toBeUndefined()
  })

  it.each([
    undefined,
    { anchorId: 'missing', focusId: 'c' },
    { anchorId: 'a', focusId: 'missing' },
    { anchorId: 'a', focusId: 'child' },
  ])('rejects invalid ranges in command, shift and join', async (nodeVisualSelection) => {
    const deps = { ...(await setup()), nodeVisualSelection }
    const document = deps.snapshot().document
    commandNodeVisual(deps, 'd')
    shiftNodeVisual(deps, 'in', 1)
    joinNodeVisual(deps, true)
    expect(deps.snapshot().document).toBe(document)
    expect(deps.changeVimMode).not.toHaveBeenCalled()
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    expect(deps.commandState.lastChange).toBeUndefined()
  })

  it('ignores all guarded mutation commands while loading', async () => {
    const deps = { ...(await setup()), store: createEditorStoreDouble({ snapshot: { status: 'loading' } }) }
    commandNodeVisual(deps, 'd')
    verticalOperator(deps, 'a', 'd', 'down', 1)
    shiftNodeVisual(deps, 'in', 1)
    joinNodeVisual(deps, true)
    expect(deps.changeVimMode).not.toHaveBeenCalled()
    expect(deps.commandState.lastChange).toBeUndefined()
  })

  it('retains reversed endpoints and mode during a successful shift', async () => {
    const deps = await setup()
    deps.nodeVisualSelection = { anchorId: 'c', focusId: 'b' }
    shiftNodeVisual(deps, 'in', 1)
    expect(deps.snapshot().document.roots.map((root) => root.id)).toEqual(['a'])
    expect(deps.snapshot().document.roots[0]?.children.map((child) => child.id)).toEqual(['child', 'b', 'c'])
    expect(deps.commandState.lastChange).toEqual({ kind: 'structural-shift', direction: 'in', span: 2, count: 1 })
    expect(deps.nodeVisualSelection).toEqual({ anchorId: 'c', focusId: 'b' })
    expect(deps.changeVimMode).not.toHaveBeenCalled()
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
  })

  it('preserves repeat and selection after a rejected shift', async () => {
    const deps = await setup()
    shiftNodeVisual(deps, 'out', 1)
    expect(deps.commandState.lastChange).toBeUndefined()
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
  })

  it.each([true, false])('joins a reversed span with spaced=%s and ends Visual', async (spaced) => {
    const deps = await setup()
    deps.nodeVisualSelection = { anchorId: 'c', focusId: 'b' }
    joinNodeVisual(deps, spaced)
    expect(deps.snapshot().document.roots.map((root) => root.text)).toEqual(['a', spaced ? 'b charlie' : 'bcharlie'])
    expect(deps.commandState.lastChange).toEqual({ kind: 'structural-join', span: 2, spaced })
    expect(deps.changeVimMode).toHaveBeenCalledWith('normal')
    expect(deps.syncImageCaretToFocus).toHaveBeenCalledOnce()
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith(undefined)
  })

  it('keeps Visual and endpoints when a join is impossible', async () => {
    const deps = await setup()
    deps.nodeVisualSelection = { anchorId: 'c', focusId: 'c' }
    joinNodeVisual(deps, true)
    expect(deps.changeVimMode).not.toHaveBeenCalled()
    expect(deps.setNodeVisualSelection).not.toHaveBeenCalled()
    expect(deps.commandState.lastChange).toBeUndefined()
  })

  it.each(['d', 'y', 'c'] as const)(
    'clamps upward %s to actual siblings and records its owner state',
    async (operator) => {
      const deps = await setup()
      verticalOperator(deps, 'b', operator, 'up', 99)
      expect(deps.session.register).toMatchObject({ kind: 'nodes', value: { sourceIds: ['a', 'b'] } })
      if (operator === 'c') {
        expect(deps.commandState.structuralInsert).toEqual({ kind: 'visual', originNodeId: 'b', command: 'c', span: 2 })
        expect(deps.changeVimMode).toHaveBeenCalledWith('insert')
      } else {
        expect(deps.changeVimMode).not.toHaveBeenCalled()
        expect(deps.commandState.lastChange).toEqual(
          operator === 'd' ? { kind: 'structural-visual', command: 'd', span: 2 } : undefined,
        )
      }
    },
  )

  it('clamps downward deletion to the final actual sibling', async () => {
    const deps = await setup()
    verticalOperator(deps, 'b', 'd', 'down', 99)
    expect(deps.snapshot().document.roots.map((root) => root.id)).toEqual(['a'])
    expect(deps.commandState.lastChange).toMatchObject({ span: 2 })
  })

  it('ignores missing nodes, heading and invalid vertical counts', async () => {
    const deps = await setup()
    verticalOperator(deps, 'missing', 'd', 'down', 1)
    verticalOperator(deps, 'a', 'd', 'down', Number.NaN)
    const real = await createRealStoreHarness({
      document: { roots: [node('parent', [node('child')])] },
      location: { currentParentId: 'parent', selectedNodeId: 'parent' },
      clock: { setTimeout: () => 0, clearTimeout: () => undefined },
    })
    verticalOperator({ ...deps, store: real.store }, 'parent', 'd', 'down', 1)
    expect(deps.commandState.lastChange).toBeUndefined()
    expect(deps.changeVimMode).not.toHaveBeenCalled()
  })

  it('restores character selection only after a successful current-node shift', async () => {
    const deps = await setup()
    shiftCurrentNode(deps, 'b', 'out', 1, { start: 1, end: 3 })
    expect(deps.schedulePendingVisualSelection).not.toHaveBeenCalled()
    deps.schedulePendingVisualSelection.mockImplementation(() => {
      expect(deps.commandState.lastChange).toEqual({ kind: 'structural-shift', direction: 'in', span: 1, count: 1 })
      expect(deps.snapshot().document.roots[0]?.children.map((child) => child.id)).toContain('b')
    })
    shiftCurrentNode(deps, 'b', 'in', 1, { start: 1, end: 3 })
    expect(deps.schedulePendingVisualSelection).toHaveBeenCalledWith({ nodeId: 'b', start: 1, end: 3 })
  })
})
