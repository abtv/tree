import { describe, expect, it, vi } from 'vitest'
import { RecentNodes, normalizeRecentNodes, label } from './recent-nodes'
import { RecentNodePersistence } from './recent-node-persistence'
import { editNodeContent, moveSubtree, deleteNode } from '../domain/document'
import type { TreeNode } from '../domain/document'

const document = {
  roots: [
    { id: 'a', text: 'Alpha', children: [{ id: 'child', text: 'Child', children: [] }] },
    { id: 'b', text: 'Beta', children: [] },
  ],
}

describe('recent nodes', () => {
  it('starts empty and normalizes malformed history before retaining valid distinct IDs', () => {
    const recent = new RecentNodes()

    expect(recent.getIds()).toEqual([])
    expect(recent.getResults()).toEqual([])
    expect(normalizeRecentNodes(null)).toEqual([])
    expect(normalizeRecentNodes(['', 1, null, 'a', 'a', 'b'])).toEqual(['a', 'b'])
  })

  it.each<Partial<TreeNode>>([
    { text: 'Edited' },
    { attachment: { id: 'image', mimeType: 'image/png' } },
    { struckThrough: true },
    { links: [{ start: 0, end: 1, url: 'https://example.com' }] },
  ])('records a content change independently of its other fields: %j', (change) => {
    const recent = new RecentNodes()
    recent.load(['b', 'a'], document)
    const after = { roots: [{ ...document.roots[0]!, ...change }, document.roots[1]!] }

    recent.recordChange(document, after, 'a')

    expect(recent.getIds()).toEqual(['a', 'b'])
  })

  it('refreshes unchanged content without recording a visit and removes a deleted change site', () => {
    const changed = vi.fn()
    const recent = new RecentNodes(changed)
    recent.load(['b', 'child'], document)
    changed.mockClear()
    const renamed = editNodeContent(document, 'a', 'Renamed', [])

    recent.recordChange(document, renamed, 'child')

    expect(recent.getIds()).toEqual(['b', 'child'])
    expect(recent.getResults()[1]?.path).toBe('Renamed')
    expect(changed).not.toHaveBeenCalled()

    recent.recordChange(renamed, deleteNode(renamed, 'child'), 'child')

    expect(recent.getIds()).toEqual(['b'])
    expect(changed).toHaveBeenCalledOnce()
  })

  it('does not treat an unchanged root as a newly created node', () => {
    const changed = vi.fn()
    const recent = new RecentNodes(changed)
    recent.load(['b', 'a'], document)
    changed.mockClear()

    recent.recordChange(document, { roots: [...document.roots] }, 'a')

    expect(recent.getIds()).toEqual(['b', 'a'])
    expect(changed).not.toHaveBeenCalled()
  })

  it('retains only ancestor-depth path data after searching many unrelated branches', () => {
    const branches = {
      roots: Array.from({ length: 200 }, (_, index) => ({
        id: `p${index}`,
        text: 'Parent',
        children: [{ id: `c${index}`, text: 'Child', children: [] }],
      })),
    }
    const recent = new RecentNodes()

    recent.load(['c199'], branches)

    expect(recent.getResults()).toEqual([{ id: 'c199', text: 'Child', path: 'Parent' }])
    // Retained path memory must scale with ancestor depth, not previously visited branches.
    const paths = Reflect.get(recent, 'paths') as Map<string, readonly unknown[]>
    expect([...paths.values()].reduce((total, path) => total + path.length, 0)).toBeLessThanOrEqual(2)
  })

  it('rebuilds deep paths after traversing an unrelated branch', () => {
    const deep = {
      roots: [
        document.roots[0]!,
        {
          id: 'p',
          text: 'Parent',
          children: [{ id: 'q', text: 'Branch', children: [{ id: 'leaf', text: 'Leaf', children: [] }] }],
        },
      ],
    }
    const recent = new RecentNodes()
    recent.load(['leaf', 'a'], deep)

    expect(recent.getResults()).toEqual([
      { id: 'leaf', text: 'Leaf', path: 'Parent › Branch' },
      { id: 'a', text: 'Alpha', path: null },
    ])

    const edited = editNodeContent(deep, 'leaf', 'Edited', [])
    recent.recordChange(deep, edited, 'leaf')

    expect(recent.getResults()[0]).toEqual({ id: 'leaf', text: 'Edited', path: 'Parent › Branch' })
  })

  it('bounds remembered IDs and cached paths across repeated new visits', () => {
    const many = { roots: Array.from({ length: 150 }, (_, index) => ({ id: `n${index}`, text: 'Node', children: [] })) }
    const recent = new RecentNodes()

    for (const node of many.roots) recent.remember(node.id, many)

    expect(recent.getIds()).toEqual(
      many.roots
        .slice(-100)
        .reverse()
        .map((node) => node.id),
    )
    expect(recent.getResults()).toHaveLength(8)
    // Inspect only retained allocation size: the product requires bounded history memory.
    expect((Reflect.get(recent, 'paths') as Map<string, unknown>).size).toBeLessThanOrEqual(100)
  })

  it('prepares bounded single-line labels for text, empty and image-only nodes', () => {
    const node: TreeNode = { id: 'n', text: '  One\n\t two  ', children: [] }

    expect(label(node)).toBe('One two')
    expect(label({ ...node, text: 'x'.repeat(161) })).toBe('x'.repeat(160))
    expect(label({ ...node, text: '\n ' })).toBe('Empty node')
    expect(label({ ...node, text: '', attachment: { id: 'image', mimeType: 'image/png' } })).toBe('Image')
  })

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
