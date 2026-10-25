import { describe, expect, it, vi } from 'vitest'
import { RecentNodes, normalizeRecentNodes } from './recent-nodes'
import { RecentNodePersistence } from './recent-node-persistence'
import { editNodeContent, moveSubtree, deleteNode } from '../domain/document'

const document = {
  roots: [
    { id: 'a', text: 'Alpha', children: [{ id: 'child', text: 'Child', children: [] }] },
    { id: 'b', text: 'Beta', children: [] },
  ],
}

describe('recent nodes', () => {
  // @requirement PRODUCT.md §20.14
  it('keeps a unique bounded MRU and reuses ready results for repeated access', () => {
    const changed = vi.fn()
    const recent = new RecentNodes(changed)
    recent.load(['child', 'a', 'child', 'missing'], document)
    recent.remember('b', document)
    const results = recent.getResults()

    expect(results.map((node) => node.id)).toEqual(['b', 'child', 'a'])
    expect(recent.getIds()).toEqual(['b', 'child', 'a'])
    expect(recent.getResults()).toBe(results)
    changed.mockClear()

    recent.remember('b', document)

    expect(recent.getResults()).toBe(results)
    expect(changed).not.toHaveBeenCalled()
    expect(normalizeRecentNodes([...Array.from({ length: 120 }, (_, i) => `n${i}`), 1, null])).toHaveLength(100)
  })

  it('updates parent labels, follows moves and removes deleted subtrees', () => {
    const recent = new RecentNodes()
    recent.load(['child', 'a', 'b'], document)
    const edited = editNodeContent(document, 'a', 'Renamed', [])
    recent.update(edited)

    expect(recent.getResults()[0]?.path).toBe('Renamed')

    const move = moveSubtree(edited, 'child', 'b', 0)
    if (move.kind !== 'moved') throw new Error('Expected a valid move')
    const moved = move.document
    recent.update(moved)

    expect(recent.getResults()[0]?.path).toBe('Beta')

    recent.update(deleteNode(moved, 'b'))

    expect(recent.getResults().map((node) => node.id)).toEqual(['a'])
  })
})

describe('recent node persistence', () => {
  it('coalesces writes and saves a change arriving during an in-flight flush', async () => {
    let timer: (() => void) | undefined
    let ids: readonly string[] = ['a']
    let release: (() => void) | undefined
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          }),
      )
      .mockResolvedValue(undefined)
    const clock = {
      setTimeout: vi.fn((callback: () => void) => {
        timer = callback
        return 1
      }),
      clearTimeout: vi.fn(),
    }
    const persistence = new RecentNodePersistence(clock, () => ids, write, vi.fn())
    persistence.changed()
    persistence.changed()

    expect(clock.setTimeout).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()

    timer!()
    await Promise.resolve()
    await Promise.resolve()
    ids = ['b', 'a']
    persistence.changed()
    release!()
    await persistence.flush()

    expect(write.mock.calls.map(([value]) => value)).toEqual([['a'], ['b', 'a']])
    await persistence.flush()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('retains dirty state after failure and retries on flush', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined)
    const persistence = new RecentNodePersistence(
      { setTimeout: () => 1, clearTimeout: () => undefined },
      () => ['a'],
      write,
      vi.fn(),
    )
    persistence.changed()

    await expect(persistence.flush()).rejects.toThrow('disk')
    await persistence.flush()

    expect(write).toHaveBeenCalledTimes(2)
  })
})
