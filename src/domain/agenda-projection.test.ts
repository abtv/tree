import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from './calendar-date'
import * as recognition from './date-recognition'
import { projectAgenda } from './agenda-projection'
import type { TreeNode } from './document-types'

const day = (date: number) => dayNumberOf({ year: 2026, month: 10, day: date })
const node = (id: string, text: string, children: readonly TreeNode[] = []): TreeNode => ({ id, text, children })

describe('Agenda projection', () => {
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
