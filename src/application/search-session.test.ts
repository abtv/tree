import { expect, it, vi } from 'vitest'
import { SearchSession } from './search-session'
import { type SearchContext, type SearchExecutor, type SearchRequest, type SearchResult } from './search-executor'
import { searchHarness } from './test/search-harness'
import type { DayNumber } from '../domain/calendar-date'

const context: SearchContext = {
  document: { roots: [{ id: 'a', text: 'aa aa', children: [] }] },
  revision: 1,
  scopeKey: 'root',
  scope: { kind: 'tree', parentId: null },
}
const origin = { nodeId: 'a', offset: 0 }

it('reuses an exact draft count for confirmation and repeats across folded text', () => {
  const harness = searchHarness(64)
  const session = new SearchSession(harness.executor)
  session.replaceContext({
    ...context,
    document: {
      roots: [
        { id: 'start', text: 'meeting', children: [] },
        { id: 'a', text: 'projection twice: projection', children: [] },
        { id: 'fold', text: '', children: [{ id: 'archive', text: 'ordinary '.repeat(3000), children: [] }] },
      ],
    },
  })
  session.begin({ nodeId: 'start', offset: 0 })
  session.edit('projection')
  harness.flush()
  const initialSlices = harness.slices()
  const publish = vi.fn()

  session.confirm(publish)
  harness.flush()
  session.navigate(origin, -1, 1, publish)
  harness.flush()

  expect(publish.mock.calls.map(([result]) => result.ordinal)).toEqual([1, 2])
  expect(harness.slices() - initialSlices).toBeLessThanOrEqual(2)
})

it.each([false, true])(
  'drops retained capped match positions when an edit replaces the context (recount settled: %s)',
  (settled) => {
    const harness = searchHarness(64)
    const session = new SearchSession(harness.executor)
    const roots = Array.from({ length: 120 }, (_, i) => ({ id: `n${i}`, text: 'a', children: [] }))
    const jump = vi.fn()
    session.replaceContext({ ...context, document: { roots } })
    session.begin({ nodeId: 'n0', offset: 0 })
    session.edit('a')
    harness.flush()
    session.confirm(jump)
    harness.flush()
    const beforeRetainedRepeat = harness.slices()
    session.navigate({ nodeId: 'n1', offset: 0 }, 1, 1, jump)
    harness.flush()

    // One delivery slice shows that the repeat used retained positions, including n3 at offset 0.
    expect(harness.slices() - beforeRetainedRepeat).toBe(1)

    const edited = roots.map((node) => (node.id === 'n3' ? { ...node, text: 'xa' } : node))
    session.replaceContext({ ...context, revision: 2, document: { roots: edited } })
    if (settled) harness.flush()

    session.navigate({ nodeId: 'n3', offset: 0 }, 1, 1, jump)
    harness.flush()

    expect(jump).toHaveBeenLastCalledWith(
      expect.objectContaining({ ordinal: 4, destination: expect.objectContaining({ nodeId: 'n3', start: 1 }) }),
    )
  },
)

function controlledSession() {
  const jobs: { request: SearchRequest; publish: (result: SearchResult) => void; cancel: ReturnType<typeof vi.fn> }[] =
    []
  const session = new SearchSession({
    execute(request, publish) {
      const cancel = vi.fn()
      jobs.push({ request, publish, cancel })
      return cancel
    },
  })
  return { session, jobs }
}

it('does not start corpus work before a context is installed or after disposal', () => {
  const { session, jobs } = controlledSession()
  const jump = vi.fn()

  for (const disposed of [false, true]) {
    if (disposed) session.dispose()
    session.begin(origin)
    session.edit('aa')
    session.confirm(jump)
    session.navigate(origin, 1, 1, jump)

    expect(jobs).toHaveLength(0)
    expect(jump).not.toHaveBeenCalled()
  }
})

it('starts inactive and publishes pending draft state before count responses', () => {
  const { session } = controlledSession()

  expect(session.getSnapshot()).toEqual({ confirmed: '', visible: false, pending: false })

  session.replaceContext(context)
  session.begin(origin)

  expect(session.getSnapshot()).toEqual({ confirmed: '', draft: '', visible: true, pending: true })

  session.edit('aa')

  expect(session.getSnapshot()).toEqual({ confirmed: '', draft: 'aa', visible: true, pending: true })
})

it('ignores editing, draft cancellation and navigation when no query is active', () => {
  const { session, jobs } = controlledSession()
  session.replaceContext(context)
  const before = session.getSnapshot()

  session.edit('ignored')
  session.cancelDraft()
  session.navigate(origin, 1, 1, vi.fn())

  expect(session.getSnapshot()).toBe(before)
  expect(jobs).toHaveLength(0)
})

it('does not restart counting when confirming an empty Find without a recalled query', () => {
  const { session, jobs } = controlledSession()
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  const emptyCount = jobs.at(-1)!

  session.confirm(jump)

  expect(emptyCount.cancel).toHaveBeenCalledOnce()
  expect(jobs).toEqual([emptyCount])
  expect(session.getSnapshot()).toStrictEqual({ confirmed: '', visible: false, pending: false })
  expect(jump).not.toHaveBeenCalled()
})

it.each([
  ['begin', 'count'],
  ['context', 'count'],
  ['begin', 'navigation'],
  ['context', 'navigation'],
] as const)('cancels pending work and rejects a late jump after %s during its %s', (action, phase) => {
  const { session, jobs } = controlledSession()
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(jump)
  const count = jobs.at(-1)!
  if (phase === 'navigation') count.publish({ kind: 'count', total: 2, capped: false })
  const pending = jobs.at(-1)!

  if (action === 'begin') session.begin(origin)
  else session.replaceContext({ ...context, revision: 2 })
  count.publish({ kind: 'count', total: 2, capped: false })
  pending.publish({ kind: 'navigate', total: 2, wrapped: false, missingOrigin: false })

  expect(pending.cancel).toHaveBeenCalledOnce()
  expect(jobs.filter((job) => job.request.operation.kind === 'navigate')).toHaveLength(phase === 'navigation' ? 1 : 0)
  expect(jump).not.toHaveBeenCalled()
})

it('starts the first jump only after the running draft count completes', () => {
  const { session, jobs } = controlledSession()
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  const count = jobs.at(-1)!
  const started = jobs.length

  session.confirm(jump)

  expect(jobs).toHaveLength(started)
  expect(count.cancel).not.toHaveBeenCalled()
  expect(session.getSnapshot()).toEqual({ confirmed: 'aa', visible: true, pending: true })

  const exact = { matches: [], reference: { occurrence: { nodeId: 'a' }, row: 0 } }
  count.publish({ kind: 'count', total: 2, capped: false, exact })

  expect(session.getSnapshot()).toMatchObject({ pending: false, count: { total: 2 } })
  expect(jobs.at(-1)!.request).toMatchObject({
    query: 'aa',
    operation: { kind: 'navigate', origin, direction: 1, count: 1, exact },
  })

  jobs.at(-1)!.publish({ kind: 'navigate', total: 2, wrapped: false, missingOrigin: false })

  expect(jump).toHaveBeenCalledOnce()
})

it('keeps interrupted navigation obsolete even after another jump starts', () => {
  const { session, jobs } = controlledSession()
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(jump)
  jobs.at(-1)!.publish({ kind: 'count', total: 2, capped: false })
  const interrupted = jobs.at(-1)!

  session.interruptNavigation()
  interrupted.publish({ kind: 'navigate', total: 99, wrapped: true, missingOrigin: false })

  expect(interrupted.cancel).toHaveBeenCalledOnce()
  expect(jump).not.toHaveBeenCalled()

  session.navigate(origin, 1, 1, jump)
  interrupted.publish({ kind: 'navigate', total: 99, wrapped: true, missingOrigin: false })

  expect(interrupted.cancel).toHaveBeenCalledOnce()
  expect(jump).not.toHaveBeenCalled()

  jobs.at(-1)!.publish({ kind: 'navigate', total: 2, wrapped: false, missingOrigin: false })

  expect(jump).toHaveBeenCalledExactlyOnceWith({ kind: 'navigate', total: 2, wrapped: false, missingOrigin: false })
})

// @requirement PRODUCT.md §20.2.26
it('cancels the previous navigation when a newer jump replaces it', () => {
  const { session, jobs } = controlledSession()
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(jump)
  jobs.at(-1)!.publish({ kind: 'count', total: 2, capped: false })
  const previous = jobs.at(-1)!

  session.navigate(origin, -1, 2, jump)
  const current = jobs.at(-1)!

  expect(previous.cancel).toHaveBeenCalledOnce()
  expect(current.cancel).not.toHaveBeenCalled()

  previous.publish({ kind: 'navigate', total: 99, wrapped: true, missingOrigin: false })

  expect(jump).not.toHaveBeenCalled()

  current.publish({ kind: 'navigate', total: 2, wrapped: false, missingOrigin: false })

  expect(jump).toHaveBeenCalledExactlyOnceWith({ kind: 'navigate', total: 2, wrapped: false, missingOrigin: false })
})

it('serves an early confirmation from the running count without another scan', () => {
  const roots = [
    ...Array.from({ length: 400 }, (_, index) => ({ id: `n${index}`, text: 'ordinary words only', children: [] })),
    { id: 'target', text: 'needle', children: [] },
  ]
  const counting = searchHarness(64)
  const reference = new SearchSession(counting.executor)
  reference.replaceContext({ ...context, document: { roots } })
  reference.begin({ nodeId: 'n0', offset: 0 })
  reference.edit('needle')
  counting.flush()
  const harness = searchHarness(64)
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext({ ...context, document: { roots } })
  session.begin({ nodeId: 'n0', offset: 0 })
  session.edit('needle')
  harness.tick()
  harness.tick()

  session.confirm(jump)
  harness.flush()

  expect(counting.slices()).toBeGreaterThan(10)
  expect(harness.slices()).toBeLessThanOrEqual(counting.slices() + 1)
  expect(jump).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ ordinal: 1, destination: expect.objectContaining({ nodeId: 'target' }) }),
  )
})

it('serves a repeat from hidden search with its recount and no occurrence walk', () => {
  const roots = [
    ...Array.from({ length: 400 }, (_, index) => ({ id: `n${index}`, text: 'ordinary words only', children: [] })),
    { id: 'target', text: 'needle', children: [] },
  ]
  const counting = searchHarness(64)
  const reference = new SearchSession(counting.executor)
  reference.replaceContext({ ...context, document: { roots } })
  reference.begin({ nodeId: 'n399', offset: 0 })
  reference.edit('needle')
  counting.flush()
  const harness = searchHarness(64)
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext({ ...context, document: { roots } })
  session.begin({ nodeId: 'n0', offset: 0 })
  session.edit('needle')
  session.confirm(vi.fn())
  harness.flush()
  session.hide()
  const before = harness.slices()

  session.navigate({ nodeId: 'n399', offset: 0 }, 1, 1, jump)
  harness.flush()

  expect(counting.slices()).toBeGreaterThan(10)
  expect(harness.slices() - before).toBeLessThanOrEqual(counting.slices() + 1)
  expect(jump).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ ordinal: 1, destination: expect.objectContaining({ nodeId: 'target' }) }),
  )
})

it('serves a repeat during the recount an edit starts without another scan', () => {
  const roots = [
    ...Array.from({ length: 400 }, (_, index) => ({ id: `n${index}`, text: 'ordinary words only', children: [] })),
    { id: 'target', text: 'needle', children: [] },
  ]
  const counting = searchHarness(64)
  const reference = new SearchSession(counting.executor)
  reference.replaceContext({ ...context, document: { roots } })
  reference.begin({ nodeId: 'n0', offset: 0 })
  reference.edit('needle')
  counting.flush()
  const harness = searchHarness(64)
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext({ ...context, document: { roots } })
  session.begin({ nodeId: 'n0', offset: 0 })
  session.edit('needle')
  session.confirm(vi.fn())
  harness.flush()
  session.replaceContext({ ...context, revision: 2, document: { roots } })
  const before = harness.slices()

  session.navigate({ nodeId: 'n0', offset: 0 }, 1, 1, jump)
  harness.flush()

  expect(counting.slices()).toBeGreaterThan(10)
  expect(harness.slices() - before).toBeLessThanOrEqual(counting.slices() + 1)
  expect(jump).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ ordinal: 1, destination: expect.objectContaining({ nodeId: 'target' }) }),
  )
})

it.each(
  (['confirm', 'repeat', 'recount'] as const).flatMap((entry) =>
    (['begin', 'interrupt', 'subscriber', 'hide', 'revision', 'scope'] as const).map(
      (action) => [entry, action] as const,
    ),
  ),
)('drops a %s jump waiting for its count after %s', (entry, action) => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  if (entry === 'confirm') session.confirm(jump)
  else {
    session.confirm(vi.fn())
    harness.flush()
    // A hidden repeat restores feedback with a count; an edit restarts the count of visible feedback.
    if (entry === 'repeat') session.hide()
    else session.replaceContext({ ...context, revision: 3 })
    session.navigate(origin, 1, 1, jump)
  }

  if (action === 'begin') session.begin(origin)
  else if (action === 'interrupt') session.interruptNavigation()
  else if (action === 'subscriber') session.subscribe(() => session.interruptNavigation())
  else if (action === 'hide') session.hide()
  else if (action === 'revision') session.replaceContext({ ...context, revision: 2 })
  else session.replaceContext({ ...context, scopeKey: 'another-location' })
  harness.flush()

  expect(jump).not.toHaveBeenCalled()
  expect(harness.pending()).toBe(0)
  expect(session.getSnapshot()).toMatchObject(
    action === 'begin'
      ? { draft: 'aa', visible: true, count: { total: 2 } }
      : action === 'hide' || action === 'scope'
        ? { confirmed: 'aa', visible: false }
        : { confirmed: 'aa', visible: true, pending: false, count: { total: 2 } },
  )

  if (action === 'interrupt' || action === 'subscriber' || action === 'revision') {
    session.navigate(origin, 1, 1, jump)
    harness.flush()

    expect(jump).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ordinal: 2 }))
  }
})

it('confirms an emptied draft with the recalled query instead of the empty draft’s count', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(vi.fn())
  harness.flush()
  session.begin(origin)
  session.edit('')
  harness.flush()

  expect(session.getSnapshot()).toMatchObject({ draft: '', count: { total: 0 } })

  session.confirm(jump)
  harness.flush()

  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', visible: true, count: { total: 2 } })
  expect(jump).toHaveBeenCalledOnce()
})

it('keeps a completed confirmation without a jump when a subscriber interrupts it', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  harness.flush()
  const stop = session.subscribe(() => {
    stop()
    session.interruptNavigation()
  })

  session.confirm(jump)
  harness.flush()

  expect(jump).not.toHaveBeenCalled()
  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', visible: true, count: { total: 2 } })
})

it('drops a hidden repeat that a subscriber interrupts as its feedback returns', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(vi.fn())
  harness.flush()
  session.hide()
  const stop = session.subscribe(() => {
    stop()
    session.interruptNavigation()
  })

  session.navigate(origin, 1, 1, jump)
  harness.flush()

  expect(jump).not.toHaveBeenCalled()
  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', visible: true, count: { total: 2 } })
})

it('records the draft origin in its count and no origin in a recount of visible feedback', () => {
  const { session, jobs } = controlledSession()
  session.replaceContext(context)
  session.begin(origin)

  session.edit('aa')

  expect(jobs.at(-1)!.request.operation).toStrictEqual({ kind: 'count', collect: { origin } })

  session.confirm(vi.fn())
  jobs.at(-1)!.publish({ kind: 'count', total: 2, capped: false })
  session.replaceContext({ ...context, revision: 2 })

  expect(jobs.at(-1)!.request.operation).toStrictEqual({ kind: 'count', collect: {} })
})

it('keeps a confirmation made by a subscriber waiting for its own count', () => {
  const { session, jobs } = controlledSession()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(vi.fn())
  const count = jobs.at(-1)!
  const stop = session.subscribe(() => {
    stop()
    session.begin(origin)
    session.edit('a')
    session.confirm(vi.fn())
  })

  count.publish({ kind: 'count', total: 2, capped: false })

  expect(jobs.filter((job) => job.request.operation.kind === 'navigate')).toHaveLength(0)

  jobs.at(-1)!.publish({ kind: 'count', total: 4, capped: false })

  expect(jobs.at(-1)!.request).toMatchObject({ query: 'a', operation: { kind: 'navigate' } })
})

it('lets a newer jump replace a confirmation that waits for its count', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const confirmed = vi.fn()
  const newer = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(confirmed)

  session.navigate({ nodeId: 'a', offset: 3 }, -1, 1, newer)
  harness.flush()

  expect(confirmed).not.toHaveBeenCalled()
  expect(newer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ordinal: 1 }))
  expect(session.getSnapshot()).toMatchObject({ pending: false, count: { total: 2 } })
})

it('serves a repeat requested during confirmation from the same pending count', () => {
  const { session, jobs } = controlledSession()
  const confirmed = vi.fn()
  const repeat = vi.fn()
  const repeatOrigin = { nodeId: 'a', offset: 3 }
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  const countJob = jobs.at(-1)!
  const stop = session.subscribe(() => {
    stop()
    session.navigate(repeatOrigin, -1, 2, repeat)
  })

  session.confirm(confirmed)
  expect(jobs.at(-1)).toBe(countJob)
  countJob.publish({ kind: 'count', total: 2, capped: false })

  const navigations = jobs.filter(({ request }) => request.operation.kind === 'navigate')
  expect(navigations).toHaveLength(1)
  expect(navigations[0]!.request.operation).toEqual({ kind: 'navigate', origin: repeatOrigin, direction: -1, count: 2 })
  const result = {
    kind: 'navigate',
    total: 2,
    wrapped: true,
    missingOrigin: false,
    destination: { nodeId: 'a', start: 3, end: 5, caret: 3 },
    ordinal: 2,
  } as const
  navigations[0]!.publish(result)
  expect(repeat).toHaveBeenCalledExactlyOnceWith(result)
  expect(confirmed).not.toHaveBeenCalled()
})

it('navigates beyond a capped count that completes after confirmation or a hidden repeat', () => {
  const harness = searchHarness(64)
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  const roots = Array.from({ length: 150 }, (_, index) => ({ id: `n${index}`, text: 'a', children: [] }))
  session.replaceContext({ ...context, document: { roots } })
  session.begin({ nodeId: 'n120', offset: 0 })
  session.edit('a')

  session.confirm(jump, -1)
  harness.flush()

  expect(session.getSnapshot().count).toEqual({ kind: 'count', total: 100, capped: true })
  expect(jump).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ ordinal: 120, total: 150, destination: expect.objectContaining({ nodeId: 'n119' }) }),
  )

  session.hide()
  session.navigate({ nodeId: 'n10', offset: 0 }, 1, 1, jump)
  harness.flush()
  const beforeRetainedRepeat = harness.slices()
  session.navigate({ nodeId: 'n11', offset: 0 }, 1, 1, jump)
  harness.flush()

  expect(jump).toHaveBeenNthCalledWith(2, expect.objectContaining({ ordinal: 12, total: 150 }))
  expect(jump).toHaveBeenNthCalledWith(3, expect.objectContaining({ ordinal: 13, total: 150 }))
  // The hidden repeat ran after its capped count, so Tree retained every position for the next repeat.
  expect(harness.slices() - beforeRetainedRepeat).toBe(1)
})

it('starts Agenda jumps from day headings after their counts complete', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext({
    document: { roots: [{ id: 'a', text: 'aa', children: [] }] },
    revision: 1,
    scopeKey: 'agenda',
    scope: {
      kind: 'agenda',
      projection: [1, 2, 4].map((day) => ({
        day: day as DayNumber,
        rows: [{ nodeId: 'a', depth: 0, role: 'match' }],
      })),
    },
  })
  session.begin({ beforeDay: 2 as DayNumber, offset: 0 })
  session.edit('aa')

  session.confirm(jump)

  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', pending: true })
  expect(jump).not.toHaveBeenCalled()

  harness.flush()

  expect(jump).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ ordinal: 2, destination: expect.objectContaining({ nodeId: 'a', day: 2 }) }),
  )

  session.hide()
  session.navigate({ beforeDay: 4 as DayNumber, offset: 0 }, 1, 1, jump)

  expect(session.getSnapshot()).toMatchObject({ visible: true, pending: true })

  harness.flush()

  expect(jump).toHaveBeenCalledTimes(2)
  expect(jump).toHaveBeenLastCalledWith(
    expect.objectContaining({ ordinal: 3, destination: expect.objectContaining({ nodeId: 'a', day: 4 }) }),
  )
})

it('does not start a hidden count when canceling a draft opened from inactive search', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')

  session.cancelDraft()

  expect(session.getSnapshot()).toEqual({ confirmed: '', visible: false, pending: false })
  expect(harness.pending()).toBe(0)
})

it('recounts hidden confirmed queries on navigation but preserves a ready visible count', () => {
  const { session, jobs } = controlledSession()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(vi.fn())
  session.hide()
  jobs.length = 0

  session.navigate(origin, 1, 1, vi.fn())

  expect(session.getSnapshot()).toEqual({ confirmed: 'aa', visible: true, pending: true })
  expect(jobs.map((job) => job.request.operation)).toEqual([{ kind: 'count', collect: { origin } }])

  jobs[0]!.publish({ kind: 'count', total: 2, capped: false })

  expect(jobs.map((job) => job.request.operation.kind)).toEqual(['count', 'navigate'])

  const ready = session.getSnapshot()
  jobs.length = 0
  session.navigate(origin, 1, 1, vi.fn())

  expect(session.getSnapshot()).toBe(ready)
  expect(jobs.map((job) => job.request.operation.kind)).toEqual(['navigate'])
})

it('publishes confirmed pending state before either result and hides empty confirmations', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')

  session.confirm(vi.fn())

  expect(session.getSnapshot()).toEqual({ confirmed: 'aa', visible: true, pending: true })

  harness.flush()

  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', visible: true, pending: false })

  session.dispose()
  session.replaceContext(context)
  session.begin(origin)
  session.confirm(vi.fn())

  expect(session.getSnapshot()).toEqual({ confirmed: '', visible: false, pending: false })
  expect(harness.pending()).toBe(0)
})

it('recounts recalled confirmation without inventing a destination after its origin was cleared', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(jump)
  harness.flush()
  session.hide()
  jump.mockClear()

  session.confirm(jump, -1)
  harness.flush()

  expect(jump).not.toHaveBeenCalled()
  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', visible: true, pending: false, count: { total: 2 } })
})

it.each(['hide', 'cancelDraft', 'dispose'] as const)('rejects late counts after %s', (action) => {
  const jobs: ((result: SearchResult) => void)[] = []
  const session = new SearchSession({
    execute(_request, publish) {
      jobs.push(publish)
      return () => undefined
    },
  })
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  const publish = jobs.at(-1)!

  session[action]()
  publish({ kind: 'count', total: 99, capped: false })

  expect(session.getSnapshot()).toEqual({ confirmed: '', visible: false, pending: false })
})

it('never navigates an active draft even when a confirmed query exists', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(jump)
  harness.flush()
  jump.mockClear()
  session.begin(origin)
  session.edit('a')

  session.navigate(origin, 1, 1, jump)
  harness.flush()

  expect(jump).not.toHaveBeenCalled()
  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', draft: 'a', count: { total: 4 } })
})

it('recounts when the scope object changes without changing its key', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  harness.flush()

  session.replaceContext({ ...context, scope: { kind: 'tree', parentId: 'a' } })

  expect(session.getSnapshot()).toMatchObject({ draft: 'aa', pending: true })
  expect(session.getSnapshot().count).toBeUndefined()

  harness.flush()

  expect(session.getSnapshot().count?.total).toBe(2)
})

it('notifies subscribers for completed counts and removes only the unsubscribed listener', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const removed = vi.fn()
  const retained = vi.fn()
  const unsubscribe = session.subscribe(removed)
  session.subscribe(retained)
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  unsubscribe()
  removed.mockClear()
  retained.mockClear()

  harness.flush()

  expect(removed).not.toHaveBeenCalled()
  expect(retained).toHaveBeenCalledOnce()
  expect(session.getSnapshot().count?.total).toBe(2)

  session.dispose()
  retained.mockClear()
  session.replaceContext(context)

  expect(retained).not.toHaveBeenCalled()
})

it('cancels outstanding executor work when hiding and disposing', () => {
  const { session, jobs } = controlledSession()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(vi.fn())
  const count = jobs.at(-1)!

  session.hide()

  expect(count.cancel).toHaveBeenCalledOnce()

  session.begin(origin)
  session.edit('aa')
  session.confirm(vi.fn())
  jobs.at(-1)!.publish({ kind: 'count', total: 2, capped: false })
  const navigation = jobs.at(-1)!

  session.hide()

  expect(navigation.cancel).toHaveBeenCalledOnce()

  session.begin(origin)
  const pending = jobs.at(-1)!
  session.dispose()

  expect(pending.cancel).toHaveBeenCalledOnce()
})

it.each(['confirm', 'repeat'] as const)('keeps Find hidden when a subscriber closes it during %s', (action) => {
  const { session, jobs } = controlledSession()
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  if (action === 'repeat') {
    session.confirm(jump)
    session.hide()
  }
  const previousJobs = jobs.length
  const stop = session.subscribe(() => {
    stop()
    session.hide()
  })

  if (action === 'confirm') session.confirm(jump)
  else session.navigate(origin, 1, 1, jump)

  expect(session.getSnapshot()).toEqual({ confirmed: 'aa', visible: false, pending: false })
  expect(jobs).toHaveLength(previousJobs)
})

it('confirms a draft backward from its captured origin', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const jump = vi.fn()
  session.replaceContext(context)
  session.begin({ nodeId: 'a', offset: 3 })
  session.edit('aa')

  session.confirm(jump, -1)
  harness.flush()

  expect(jump).toHaveBeenCalledWith(expect.objectContaining({ destination: expect.objectContaining({ start: 0 }) }))
  expect(session.getSnapshot().confirmed).toBe('aa')
})

it('owns draft/confirmed recall, empty confirmation, hide, cancellation and disposal', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)
  const listener = vi.fn()
  const unsubscribe = session.subscribe(listener)

  session.replaceContext(context)
  session.edit('ignored')
  session.cancelDraft()
  session.begin(origin)
  session.confirm(vi.fn())

  expect(session.getSnapshot()).toEqual({ confirmed: '', visible: false, pending: false })

  session.begin(origin)
  session.edit('aa')
  harness.flush()

  expect(session.getSnapshot()).toMatchObject({ draft: 'aa', pending: false, count: { total: 2 } })

  const jump = vi.fn()

  session.confirm(jump)
  harness.flush()

  expect(jump).toHaveBeenCalledWith(expect.objectContaining({ destination: expect.objectContaining({ start: 3 }) }))
  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', count: { total: 2 } })

  session.begin(origin)

  expect(session.getSnapshot().draft).toBe('aa')

  session.edit('discard')
  session.cancelDraft()
  harness.flush()

  expect(session.getSnapshot()).toMatchObject({ confirmed: 'aa', visible: true, count: { total: 2 } })

  session.hide()
  session.begin(origin)
  session.edit('discard too')
  session.cancelDraft()

  expect(session.getSnapshot()).toEqual({ confirmed: 'aa', visible: false, pending: false })

  session.begin(origin)
  session.edit('')
  session.confirm(jump)
  harness.flush()

  expect(session.getSnapshot().confirmed).toBe('aa')

  session.hide()
  session.navigate(origin, -1, 1, jump)
  harness.flush()

  expect(session.getSnapshot().visible).toBe(true)
  expect(listener).toHaveBeenCalled()

  unsubscribe()
  listener.mockClear()

  session.dispose()

  expect(session.getSnapshot()).toEqual({ confirmed: '', visible: false, pending: false })
  expect(harness.pending()).toBe(0)
  expect(listener).not.toHaveBeenCalled()
})

it('does no corpus work without active search and clears old totals before recount', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)

  session.replaceContext(context)
  session.replaceContext({ ...context, revision: 2 })

  expect(harness.pending()).toBe(0)

  session.begin(origin)
  session.edit('aa')
  harness.flush()

  session.replaceContext({ ...context, revision: 3, document: { roots: [{ id: 'a', text: 'aa', children: [] }] } })

  expect(session.getSnapshot().count).toBeUndefined()
  expect(session.getSnapshot().pending).toBe(true)

  harness.flush()

  expect(session.getSnapshot().count?.total).toBe(1)

  session.replaceContext({ ...context, revision: 4 }) // Undo may restore an older object, never its revision.
  harness.flush()

  expect(session.getSnapshot().count?.total).toBe(2)

  session.confirm(vi.fn())
  harness.flush()

  session.replaceContext({ ...context, revision: 4, scopeKey: 'another-location' })

  expect(session.getSnapshot()).toEqual({ confirmed: 'aa', visible: false, pending: false })
  expect(harness.pending()).toBe(0)
})

it('rejects late responses even from an executor that ignores cancellation', () => {
  const jobs: { request: SearchRequest; publish: (result: SearchResult) => void }[] = []
  const cancel = vi.fn()
  const executor: SearchExecutor = {
    execute(request, publish) {
      jobs.push({ request, publish })
      return cancel
    },
  }
  const session = new SearchSession(executor)

  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  const oldQuery = jobs.at(-1)!

  session.edit('a')
  oldQuery.publish({ kind: 'count', total: 99, capped: false })

  expect(session.getSnapshot().count).toBeUndefined()

  const oldRevision = jobs.at(-1)!

  session.replaceContext({ ...context, revision: 2 })
  oldRevision.publish({ kind: 'count', total: 98, capped: false })

  expect(session.getSnapshot().count).toBeUndefined()

  const jump = vi.fn()

  session.confirm(jump)
  jobs.at(-1)!.publish({ kind: 'count', total: 2, capped: false })
  const firstJump = jobs.at(-1)!

  session.navigate(origin, 1, 2, jump)
  const secondJump = jobs.at(-1)!
  const result = { kind: 'navigate' as const, total: 2, wrapped: false, missingOrigin: false }

  firstJump.publish(result)

  expect(jump).not.toHaveBeenCalled()

  // A count result cannot supersede an independent navigation request.
  jobs.findLast((job) => job.request.operation.kind === 'count')!.publish({ kind: 'count', total: 2, capped: false })
  secondJump.publish(result)

  expect(jump).toHaveBeenCalledOnce()

  session.navigate(origin, 1, 1, jump)
  const obsolete = jobs.at(-1)!

  session.replaceContext({ ...context, scopeKey: 'other' })
  obsolete.publish(result)

  expect(jump).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenCalled()
})

it('does not replace context or restart jobs for the same immutable inputs', () => {
  const harness = searchHarness()
  const session = new SearchSession(harness.executor)

  session.replaceContext(context)
  session.begin(origin)
  const before = session.getSnapshot()

  session.replaceContext({ ...context })

  expect(session.getSnapshot()).toBe(before)
  expect(harness.pending()).toBe(1)

  session.navigate(origin, 1, 1, vi.fn()) // No confirmed query; never navigate drafts.

  expect(harness.pending()).toBe(1)

  session.dispose()
})
