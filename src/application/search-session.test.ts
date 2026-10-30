import { expect, it, vi } from 'vitest'
import { SearchSession } from './search-session'
import { type SearchContext, type SearchExecutor, type SearchRequest, type SearchResult } from './search-executor'
import { searchHarness } from './test/search-harness'

const context: SearchContext = {
  document: { roots: [{ id: 'a', text: 'aa aa', children: [] }] },
  revision: 1,
  scopeKey: 'root',
  scope: { kind: 'tree', parentId: null },
}
const origin = { nodeId: 'a', offset: 0 }

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
  const cancels: ReturnType<typeof vi.fn>[] = []
  const session = new SearchSession({
    execute() {
      const cancel = vi.fn()
      cancels.push(cancel)
      return cancel
    },
  })
  session.replaceContext(context)
  session.begin(origin)
  session.edit('aa')
  session.confirm(vi.fn())
  const count = cancels.at(-2)!
  const navigation = cancels.at(-1)!

  session.hide()

  expect(count).toHaveBeenCalledOnce()
  expect(navigation).toHaveBeenCalledOnce()

  session.begin(origin)
  const pending = cancels.at(-1)!
  session.dispose()

  expect(pending).toHaveBeenCalledOnce()
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
