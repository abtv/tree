import { describe, expect, it, vi } from 'vitest'
import { createSearchExecutor, searchCaret, searchScheduler, type SearchRequest } from './search-executor'
import { searchHarness } from './test/search-harness'
import type { DayNumber } from '../domain/calendar-date'

const base: SearchRequest = {
  id: 1,
  revision: 1,
  scopeKey: 'root',
  scope: { kind: 'tree', parentId: null },
  document: { roots: [{ id: 'a', text: 'aa aa aa', children: [] }] },
  query: 'aa',
  operation: { kind: 'count' },
}

describe('incremental executor', () => {
  it.each([
    [2, 1, 2, 0, false],
    [2, -1, 1, 6, false],
    [3, 1, 4, 0, false],
    [3, -1, 2, 6, false],
    [5, 1, 1, 0, true],
    [0, -1, 4, 6, true],
  ] as const)('navigates from synthetic boundary %i in direction %i', (boundary, direction, day, start, wrapped) => {
    expect(
      searchHarness().run({
        ...base,
        scope: {
          kind: 'agenda',
          projection: [1, 2, 4].map((value) => ({
            day: value as DayNumber,
            rows: [{ nodeId: 'a', depth: 0, role: 'match' }],
          })),
        },
        operation: { kind: 'navigate', origin: { beforeDay: boundary as DayNumber, offset: 0 }, direction, count: 1 },
      }),
    ).toMatchObject({ destination: { day, start }, wrapped, missingOrigin: false })
  })
  it('keeps 100 exact and never matches across node boundaries', () => {
    const harness = searchHarness()
    expect(harness.run({ ...base, document: { roots: [{ id: 'a', text: 'aa '.repeat(100), children: [] }] } })).toEqual(
      { kind: 'count', total: 100, capped: false },
    )
    expect(
      harness.run({
        ...base,
        document: {
          roots: [
            { id: 'a', text: 'a', children: [] },
            { id: 'b', text: 'a', children: [] },
          ],
        },
      }),
    ).toEqual({ kind: 'count', total: 0, capped: false })
  })

  it('caps counts at 101 but navigates beyond the cap and wraps large prefixes', () => {
    const harness = searchHarness()
    const request = { ...base, document: { roots: [{ id: 'a', text: 'aa '.repeat(150), children: [] }] } }
    expect(harness.run(request)).toEqual({ kind: 'count', total: 100, capped: true })
    expect(
      harness.run({
        ...request,
        operation: { kind: 'navigate', origin: { nodeId: 'a', offset: 0 }, direction: 1, count: 149 },
      }),
    ).toMatchObject({ destination: { start: 447 }, ordinal: 150, total: 150, wrapped: false })
    expect(
      harness.run({
        ...request,
        operation: { kind: 'navigate', origin: { nodeId: 'a', offset: 0 }, direction: 1, count: 151 },
      }),
    ).toMatchObject({ destination: { start: 3 }, ordinal: 2, wrapped: true })
  })

  it.each([
    [1, 0, 1, 3, false],
    [1, 6, 1, 0, true],
    [-1, 0, 1, 6, true],
    [-1, 6, 1, 3, false],
    [-1, 4, 2, 0, false],
    [-1, 0, 4, 6, true],
  ] as const)('selects direction %i from %i with count %i', (direction, offset, count, start, wrapped) => {
    expect(
      searchHarness().run({
        ...base,
        operation: { kind: 'navigate', origin: { nodeId: 'a', offset }, direction, count },
      }),
    ).toMatchObject({ destination: { start }, wrapped })
  })

  it('uses the forward nonoverlap corpus for reverse navigation', () => {
    expect(
      searchHarness().run({
        ...base,
        document: { roots: [{ id: 'a', text: 'aaa', children: [] }] },
        operation: { kind: 'navigate', origin: { nodeId: 'a', offset: 2 }, direction: -1, count: 1 },
      }),
    ).toMatchObject({ destination: { start: 0, end: 2 }, total: 1 })
  })

  it('counts empty/no-match queries and refuses a removed origin', () => {
    const harness = searchHarness()
    expect(harness.run({ ...base, query: '' })).toEqual({ kind: 'count', total: 0, capped: false })
    expect(harness.run({ ...base, query: 'absent' })).toEqual({ kind: 'count', total: 0, capped: false })
    expect(
      harness.run({
        ...base,
        operation: { kind: 'navigate', origin: { nodeId: 'removed', offset: 0 }, direction: 1, count: 1 },
      }),
    ).toEqual({ kind: 'navigate', total: 3, wrapped: false, missingOrigin: true })
  })

  it('counts occurrences independently and navigates across node/day boundaries', () => {
    const request: SearchRequest = {
      ...base,
      scope: {
        kind: 'agenda',
        projection: [1, 2].map((day) => ({
          day: day as DayNumber,
          rows: [{ nodeId: 'a', depth: 0, role: 'context' }],
        })),
      },
      operation: { kind: 'navigate', origin: { nodeId: 'a', day: 1 as DayNumber, offset: 6 }, direction: 1, count: 1 },
    }
    expect(searchHarness().run(request)).toMatchObject({ destination: { nodeId: 'a', day: 2, start: 0 }, total: 6 })
  })

  it('snaps only the selected destination to its containing grapheme', () => {
    const text = '👩‍💻a\u0301'
    expect(searchCaret(text, 3)).toBe(0)
    expect(searchCaret(text, 6)).toBe(5)
    expect(searchCaret(text, text.length)).toBe(text.length)
    expect(
      searchHarness().run({
        ...base,
        query: '\u0301',
        document: { roots: [{ id: 'a', text, children: [] }] },
        operation: { kind: 'navigate', origin: { nodeId: 'a', offset: 0 }, direction: 1, count: 1 },
      }),
    ).toMatchObject({ destination: { start: 6, caret: 5 } })
  })

  it('bounds long text, long query preparation, scope lookup and cancellation', () => {
    for (const request of [
      { ...base, query: 'z', document: { roots: [{ id: 'a', text: 'a'.repeat(100_000), children: [] }] } },
      { ...base, query: 'a'.repeat(100_000) },
      {
        ...base,
        scope: { kind: 'tree' as const, parentId: 'absent' },
        document: { roots: Array.from({ length: 100_000 }, (_, id) => ({ id: String(id), text: '', children: [] })) },
      },
    ]) {
      const harness = searchHarness(16)
      const publish = vi.fn()
      const cancel = harness.executor.execute(request, publish)
      expect(publish).not.toHaveBeenCalled()
      harness.tick()
      expect(publish).not.toHaveBeenCalled()
      expect(harness.pending()).toBe(1)
      cancel()
      expect(harness.pending()).toBe(0)
      harness.flush()
      expect(publish).not.toHaveBeenCalled()
    }
  })

  it('cancels before the first slice and validates slice budgets', () => {
    const harness = searchHarness()
    const publish = vi.fn()
    harness.executor.execute(base, publish)()
    harness.flush()
    expect(publish).not.toHaveBeenCalled()
    expect(() => createSearchExecutor(harness.scheduler, 0)).toThrow('Invalid search slice budget')
  })

  it('uses cancellable macrotasks in the default scheduler', () => {
    vi.useFakeTimers()
    try {
      const publish = vi.fn()
      searchScheduler.schedule(publish)()
      vi.runAllTimers()
      expect(publish).not.toHaveBeenCalled()
      createSearchExecutor().execute(base, publish)
      vi.runAllTimers()
      expect(publish).toHaveBeenCalledWith({ kind: 'count', total: 3, capped: false })
    } finally {
      vi.useRealTimers()
    }
  })
})
