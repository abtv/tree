import { describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../domain/document'
import { createVimCommandState } from './vim-command-state'
import { moveNodeVisual, restoreVisual } from './vim-node-visual-commands'
import { rememberNodeRange } from './vim-visual-memory'
import { createEditorStoreDouble } from './test/editor-store-double'
import { createRealStoreHarness } from './test/real-store-harness'

const node = (id: string, children: TreeNode[] = []): TreeNode => ({ id, text: id, children })

async function setup() {
  const real = await createRealStoreHarness({
    document: { roots: [node('a', [node('child')]), node('b'), { ...node('c'), text: 'charlie' }] },
    clock: { setTimeout: () => 0, clearTimeout: () => undefined },
  })
  return {
    ...real,
    commandState: createVimCommandState(),
    setNodeVisualSelection: vi.fn(),
    changeVimMode: vi.fn(),
    syncImageCaretToFocus: vi.fn(),
    schedulePendingVisualSelection: vi.fn(),
  }
}

describe('whole-node Visual restoration and movement', () => {
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

  it('synchronizes even when movement clamps to the same node', async () => {
    const deps = await setup()
    moveNodeVisual({ ...deps, nodeVisualSelection: { anchorId: 'c', focusId: 'a' } }, 'up')
    expect(deps.setNodeVisualSelection).toHaveBeenCalledWith({ anchorId: 'c', focusId: 'a' })
    expect(deps.syncImageCaretToFocus).toHaveBeenCalledOnce()
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
