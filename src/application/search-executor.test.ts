import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSearchExecutor,
  searchCaret,
  searchScheduler,
  type SearchNeighborhood,
  type SearchRequest,
} from './search-executor'
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

describe('native search scheduling', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts a cancellable user-visible task without running it synchronously', async () => {
    const callback = vi.fn()
    const postTask = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('scheduler', { postTask })

    const cancel = searchScheduler.schedule(callback)

    expect(callback).not.toHaveBeenCalled()
    expect(postTask).toHaveBeenCalledExactlyOnceWith(callback, {
      priority: 'user-visible',
      signal: expect.any(AbortSignal),
    })
    const signal = postTask.mock.calls[0]![1].signal as AbortSignal
    expect(signal.aborted).toBe(false)

    cancel()
    cancel()
    await Promise.resolve()

    expect(signal.aborted).toBe(true)
  })

  it('consumes the native cancellation rejection', async () => {
    let reject!: (error: unknown) => void
    const postTask = vi.fn().mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail
        }),
    )
    const report = vi.fn()
    vi.stubGlobal('scheduler', { postTask })
    vi.stubGlobal('queueMicrotask', report)

    const cancel = searchScheduler.schedule(() => undefined)

    expect(postTask).toHaveBeenCalledOnce()
    const signal = postTask.mock.calls[0]![1].signal as AbortSignal
    cancel()
    reject(signal.reason)
    await Promise.resolve()

    expect(report).not.toHaveBeenCalled()
  })

  it.each([false, true])('surfaces task failures even if cancellation follows: %s', async (cancelAfterFailure) => {
    const failure = new Error('Search task failed')
    const postTask = vi.fn().mockRejectedValue(failure)
    const report = vi.fn()
    vi.stubGlobal('scheduler', { postTask })
    vi.stubGlobal('queueMicrotask', report)

    const cancel = searchScheduler.schedule(() => undefined)
    if (cancelAfterFailure) cancel()
    await Promise.resolve()

    expect(report).toHaveBeenCalledOnce()
    expect(() => report.mock.calls[0]![0]()).toThrow(failure)
  })
})

describe('incremental executor', () => {
  it.each([8192, 8193])('preserves wrapped jumps in both directions at the retention limit (%i matches)', (total) => {
    const harness = searchHarness(128)
    const neighborhood: SearchNeighborhood = {}
    const document = { roots: [{ id: 'a', text: 'a '.repeat(total), children: [] }] }
    const jump = (index: number, direction: 1 | -1, count: number) =>
      harness.run({
        ...base,
        document,
        query: 'a',
        operation: { kind: 'navigate', origin: { nodeId: 'a', offset: index * 2 }, direction, count, neighborhood },
      })
    expect(jump(total - 2, 1, 1)).toMatchObject({ ordinal: total, total })
    const before = harness.slices()

    const forward = jump(total - 1, 1, 34)
    const reverse = jump(33, -1, 34)

    expect(forward).toMatchObject({ ordinal: 34, destination: { start: 66 }, total, wrapped: true })
    expect(reverse).toMatchObject({ ordinal: total, destination: { start: (total - 1) * 2 }, total, wrapped: true })
    if (total === 8192) expect(harness.slices() - before).toBe(2)
    else expect(neighborhood.complete).toBeNull()
  })

  it('defers cached caret calculation and skips it when a repeat is canceled', async () => {
    const neighborhood: SearchNeighborhood = {}
    const request: SearchRequest = {
      ...base,
      operation: { kind: 'navigate', origin: { nodeId: 'a', offset: 0 }, direction: 1, count: 1, neighborhood },
    }
    searchHarness().run(request)
    const executor = createSearchExecutor()
    const publish = vi.fn()
    const segment = vi.spyOn(Intl.Segmenter.prototype, 'segment')

    try {
      executor.execute(request, publish)()
      executor.execute(request, publish)

      expect(segment).not.toHaveBeenCalled()
      await Promise.resolve()

      expect(segment).toHaveBeenCalledOnce()
      expect(publish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ordinal: 2 }))
    } finally {
      segment.mockRestore()
    }
  })

  it('yields to a task before a cached repeat started while publishing a cached result', () => {
    const neighborhood: SearchNeighborhood = {}
    const request: SearchRequest = {
      ...base,
      operation: { kind: 'navigate', origin: { nodeId: 'a', offset: 0 }, direction: 1, count: 1, neighborhood },
    }
    searchHarness().run(request)
    const tasks: (() => void)[] = []
    const microtasks: (() => void)[] = []
    const executor = createSearchExecutor({
      schedule(callback) {
        tasks.push(callback)
        return () => undefined
      },
      scheduleCached(callback) {
        microtasks.push(callback)
        return () => undefined
      },
    })
    const repeat = vi.fn()
    executor.execute(request, () => executor.execute(request, repeat))

    microtasks.shift()!()

    expect(microtasks).toHaveLength(0)
    expect(tasks).toHaveLength(1)

    tasks.shift()!()
    executor.execute(request, vi.fn())

    expect(repeat).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ordinal: 2 }))
    expect(microtasks).toHaveLength(1)
  })

  it('publishes a small completed search within its scheduled work budget', () => {
    const callbacks: (() => void)[] = []
    const publish = vi.fn()
    const executor = createSearchExecutor(
      {
        schedule(callback) {
          callbacks.push(callback)
          return () => undefined
        },
      },
      256,
    )

    executor.execute(base, publish)
    callbacks.shift()!()

    expect(publish).toHaveBeenCalledExactlyOnceWith({ kind: 'count', total: 3, capped: false })
    expect(callbacks).toHaveLength(0)
  })

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

  // @requirement PRODUCT.md §20.2.26
  it('refuses a removed node origin in Agenda without choosing another occurrence', () => {
    const result = searchHarness().run({
      ...base,
      scope: {
        kind: 'agenda',
        projection: [{ day: 1 as DayNumber, rows: [{ nodeId: 'a', depth: 0, role: 'match' }] }],
      },
      operation: {
        kind: 'navigate',
        origin: { nodeId: 'removed', day: 1 as DayNumber, offset: 0 },
        direction: 1,
        count: 1,
      },
    })

    expect(result).toEqual({ kind: 'navigate', total: 3, wrapped: false, missingOrigin: true })
  })

  it.each(['', 'absent'])('finishes navigation without a destination for query %j', (query) => {
    expect(
      searchHarness().run({
        ...base,
        query,
        operation: { kind: 'navigate', origin: { nodeId: 'a', offset: 0 }, direction: 1, count: 1 },
      }),
    ).toEqual({ kind: 'navigate', total: 0, wrapped: false, missingOrigin: false })
  })

  it('allows cancellation after completion and repeated cancellation without retaining jobs', () => {
    const harness = searchHarness()
    const publish = vi.fn()
    const cancel = harness.executor.execute(base, publish)
    harness.flush()

    expect(publish).toHaveBeenCalledOnce()
    expect(() => {
      cancel()
      cancel()
    }).not.toThrow()
    expect(harness.pending()).toBe(0)

    harness.flush()

    expect(publish).toHaveBeenCalledOnce()
  })

  it('returns an empty count without enumerating the document', () => {
    const roots = vi.fn(() => base.document.roots)

    expect(
      searchHarness().run({
        ...base,
        query: '',
        document: {
          get roots() {
            return roots()
          },
        },
      }),
    ).toEqual({
      kind: 'count',
      total: 0,
      capped: false,
    })
    expect(roots).not.toHaveBeenCalled()
  })

  it('refuses a synthetic day origin in a Tree scope', () => {
    expect(
      searchHarness().run({
        ...base,
        operation: { kind: 'navigate', origin: { beforeDay: 1 as DayNumber, offset: 0 }, direction: 1, count: 1 },
      }),
    ).toEqual({ kind: 'navigate', total: 3, wrapped: false, missingOrigin: true })
  })

  it('ignores an already queued callback when a scheduler cannot retract it', () => {
    const callbacks: (() => void)[] = []
    const publish = vi.fn()
    const executor = createSearchExecutor({
      schedule(callback) {
        callbacks.push(callback)
        return () => undefined
      },
    })

    executor.execute(base, publish)()

    expect(callbacks).toHaveLength(1)
    expect(() => callbacks[0]!()).not.toThrow()
    expect(callbacks).toHaveLength(1)
    expect(publish).not.toHaveBeenCalled()
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
    expect(searchHarness(1).run(base)).toEqual({ kind: 'count', total: 3, capped: false })
  })

  it.each([undefined, {}])('uses cancellable timer tasks without postTask: %j', (scheduler) => {
    vi.useFakeTimers()
    vi.stubGlobal('scheduler', scheduler)
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
      vi.unstubAllGlobals()
    }
  })
})
