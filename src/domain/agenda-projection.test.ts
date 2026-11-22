import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from './calendar-date'
import * as recognition from './date-recognition'
import { agendaDaysOf, projectAgenda } from './agenda-projection'
import type { TreeNode } from './document-types'

const day = (date: number) => dayNumberOf({ year: 2026, month: 10, day: date })
const node = (id: string, text: string, children: readonly TreeNode[] = []): TreeNode => ({ id, text, children })
const markedNode = (id: string, text: string): TreeNode => ({ id, text, marked: true, children: [] })

describe('Agenda projection', () => {
  // @requirement PRODUCT.md §23.2
  it.each(['remove-child', 'replace-root'] as const)('refreshes cached rows after %s', (change) => {
    const child = node('child', '2026-10-14')
    const document = { roots: [node('parent', '2026-10-14', [child])] }
    const projection = projectAgenda(document, null)
    const updated = {
      roots: [change === 'remove-child' ? node('parent', '2026-10-14') : node('replacement', '2026-10-14', [child])],
    }

    const result = projectAgenda(updated, null, { document, projection })

    expect(result[0]!.rows.map((row) => row.nodeId)).toEqual(
      change === 'remove-child' ? ['parent'] : ['replacement', 'child'],
    )
  })

  it('avoids comparing an unchanged root again for each retained day', () => {
    const dates = Array.from({ length: 20 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`).join(' ')
    const unaffected = node('unaffected', '2026-10-01 Other task')
    const document = { roots: [node('edited', dates), unaffected] }
    const projection = projectAgenda(document, null)
    const roots = [node('edited', `${dates} Edited title`), unaffected]
    let rootReads = 0
    Object.defineProperty(roots, 1, {
      get() {
        rootReads += 1
        return unaffected
      },
    })

    const result = projectAgenda({ roots }, null, { document, projection })

    expect(result).toHaveLength(20)
    expect(result).toEqual(projection)
    expect(rootReads).toBeLessThanOrEqual(3)
  })

  // @requirement PRODUCT.md §23.6
  it('does not revisit unchanged subtrees belonging only to reused days', () => {
    let childrenReads = 0
    const empty: TreeNode[] = []
    const children = Array.from({ length: 1000 }, (_, index): TreeNode => ({
      id: `unrelated-${index}`,
      text: '',
      get children() {
        childrenReads += 1
        return empty
      },
    }))
    const unrelated = node('unrelated', '2026-10-20', children)
    const document = { roots: [node('scope', '', [node('target', '2026-10-14'), unrelated])] }
    const projection = projectAgenda(document, null)
    childrenReads = 0
    const updated = { roots: [node('scope', '', [node('target', '2026-10-15'), unrelated])] }

    const result = projectAgenda(updated, null, { document, projection })

    expect(result[0]).toEqual({
      day: day(15),
      rows: [
        { nodeId: 'scope', depth: 0, role: 'context' },
        { nodeId: 'target', depth: 1, role: 'match' },
      ],
    })
    expect(result[1]).toBe(projection[1])
    expect(childrenReads).toBe(0)
  })

  it('reuses unchanged dated rows inside a nested scope after editing outside it', () => {
    const scope = node('scope', '', [node('dated', '2026-10-14')])
    const document = { roots: [scope, node('outside', '')] }
    const projection = projectAgenda(document, 'scope')
    const changed = { roots: [scope, node('outside', 'updated')] }

    const result = projectAgenda(changed, 'scope', { document, projection })

    expect(result).toEqual(projection)
    expect(result[0]).toBe(projection[0])
  })

  it('keeps hierarchy from Root and excludes ancestors at and above a nested scope', () => {
    const document = {
      roots: [
        node('work', 'Work', [
          node('team', 'Team A', [node('release', 'Release', [node('prepare', '2026-10-14 Prepare rollout')])]),
        ]),
      ],
    }

    expect(projectAgenda(document, null)).toEqual([
      {
        day: day(14),
        rows: [
          { nodeId: 'work', depth: 0, role: 'context' },
          { nodeId: 'team', depth: 1, role: 'context' },
          { nodeId: 'release', depth: 2, role: 'context' },
          { nodeId: 'prepare', depth: 3, role: 'match' },
        ],
      },
    ])
    expect(projectAgenda(document, 'team')).toEqual([
      {
        day: day(14),
        rows: [
          { nodeId: 'release', depth: 0, role: 'context' },
          { nodeId: 'prepare', depth: 1, role: 'match' },
        ],
      },
    ])
  })

  it('can match a parent on one day and use it as context on another', () => {
    const document = { roots: [node('release', '2026-10-15 Release', [node('prepare', '2026-10-14 Prepare')])] }

    expect(projectAgenda(document, null)).toEqual([
      {
        day: day(14),
        rows: [
          { nodeId: 'release', depth: 0, role: 'context' },
          { nodeId: 'prepare', depth: 1, role: 'match' },
        ],
      },
      { day: day(15), rows: [{ nodeId: 'release', depth: 0, role: 'match' }] },
    ])
  })

  it('orders days and siblings, prunes unrelated branches, and deduplicates repeated dates', () => {
    const document = {
      roots: [
        node('a', '2026-10-20 2026-10-14 2026-10-14', [node('hidden', 'no date')]),
        node('irrelevant', 'no date'),
        node('b', '2026-10-14', [node('c', '2026-10-14')]),
      ],
    }

    expect(projectAgenda(document, null)).toEqual([
      {
        day: day(14),
        rows: [
          { nodeId: 'a', depth: 0, role: 'match' },
          { nodeId: 'b', depth: 0, role: 'match' },
          { nodeId: 'c', depth: 1, role: 'match' },
        ],
      },
      { day: day(20), rows: [{ nodeId: 'a', depth: 0, role: 'match' }] },
    ])
  })

  it('excludes linked, incomplete, impossible and natural-language dates', () => {
    const url = 'https://example.test/2026-10-14'
    const document = {
      roots: [
        { ...node('link', `${url} 2026-10-15`), links: [{ start: 0, end: url.length, url }] },
        node('invalid', '2026-02-31 2026-10-1 tomorrow'),
      ],
    }

    expect(projectAgenda(document, null)).toEqual([
      { day: day(15), rows: [{ nodeId: 'link', depth: 0, role: 'match' }] },
    ])
  })

  it('does not scan the scope parent or other branches; empty scopes have no days', () => {
    const document = { roots: [node('scope', '2026-10-14', [node('empty', '')]), node('outside', '2026-10-20')] }

    expect(projectAgenda(document, 'scope')).toEqual([])
    expect(projectAgenda(document, 'empty')).toEqual([])
    expect(projectAgenda({ roots: [] }, null)).toEqual([])
    expect(() => projectAgenda(document, 'missing')).toThrow('Node missing does not exist.')
  })

  // @requirement PRODUCT.md §23.2
  it('lists a marked node under Today once, with its ancestors as context, beside its own dates', () => {
    const document = {
      roots: [
        node('project', 'Project', [markedNode('task', 'Task')]),
        markedNode('dated', '2026-10-14 2026-10-20 Dated'),
        node('plain', '2026-10-14 Plain'),
      ],
    }

    expect(projectAgenda(document, null, undefined, day(14))).toEqual([
      {
        day: day(14),
        rows: [
          { nodeId: 'project', depth: 0, role: 'context' },
          { nodeId: 'task', depth: 1, role: 'match' },
          { nodeId: 'dated', depth: 0, role: 'match' },
          { nodeId: 'plain', depth: 0, role: 'match' },
        ],
      },
      { day: day(20), rows: [{ nodeId: 'dated', depth: 0, role: 'match' }] },
    ])
    expect(agendaDaysOf(document.roots[1]!, day(14))).toEqual([day(14), day(20), day(14)])
    expect(agendaDaysOf(document.roots[2]!, day(14))).toEqual([day(14)])
  })

  // @requirement PRODUCT.md §23.2
  it('adds Today for a mark when the day has no dated node, and ignores marks without a Today', () => {
    const document = { roots: [markedNode('task', 'Task'), node('later', '2026-10-20')] }

    expect(projectAgenda(document, null, undefined, day(16)).map((entry) => entry.day)).toEqual([day(16), day(20)])
    expect(projectAgenda(document, null).map((entry) => entry.day)).toEqual([day(20)])
  })

  // @requirement PRODUCT.md §23.2
  it.each(['mark', 'unmark'] as const)('refreshes only Today when a node is %sed', (change) => {
    const marked = change === 'unmark'
    const other = node('other', '2026-10-20 Other')
    const peer = node('peer', '2026-10-14 Peer')
    const document = { roots: [marked ? markedNode('task', 'Task') : node('task', 'Task'), other, peer] }
    const projection = projectAgenda(document, null, undefined, day(14))
    const changed = { roots: [marked ? node('task', 'Task') : markedNode('task', 'Task'), other, peer] }

    const result = projectAgenda(changed, null, { document, projection }, day(14))

    expect(result).toEqual(projectAgenda(changed, null, undefined, day(14)))
    expect(result[0]!.rows.map((row) => row.nodeId)).toEqual(marked ? ['peer'] : ['task', 'peer'])
    expect(result[1]).toBe(projection[1])
  })

  it('reuses summaries without mutating the input and invalidates changed link ranges', () => {
    const scan = vi.spyOn(recognition, 'findCanonicalDates')
    try {
      const url = 'https://example.test/2026-10-14'
      const leaf = Object.freeze(node('leaf', url))
      const document = { roots: [leaf] }

      expect(projectAgenda(document, null)).toHaveLength(1)

      scan.mockClear()

      expect(projectAgenda(document, null)).toHaveLength(1)
      expect(scan).not.toHaveBeenCalled()
      expect(projectAgenda({ roots: [{ ...leaf, links: [{ start: 0, end: url.length, url }] }] }, null)).toEqual([])
      expect(scan).toHaveBeenCalledOnce()
      expect(projectAgenda(document, null)).toHaveLength(1)
    } finally {
      scan.mockRestore()
    }
  })
})
