import { describe, expect, it, vi } from 'vitest'
import type { RecentNode } from '../application/recent-nodes'
import { GlobalSearchSession } from './global-search-session'

const recent: readonly RecentNode[] = [
  { id: 'first', text: 'First', path: null },
  { id: 'second', text: 'Second', path: null },
]

function fixture() {
  const requests: {
    query: string
    publish: (items: readonly RecentNode[]) => void
    cancel: ReturnType<typeof vi.fn>
  }[] = []
  const source = {
    recent: vi.fn(() => recent),
    suggestions: vi.fn((): readonly string[] => []),
    search: vi.fn((query: string, publish: (items: readonly RecentNode[]) => void) => {
      const cancel = vi.fn()
      requests.push({ query, publish, cancel })
      return cancel
    }),
  }
  const session = new GlobalSearchSession(source)
  session.open()
  return { session, source, requests }
}

describe('global Search session', () => {
  it('keeps completed results during refinement and forbids stale selection until replacement', () => {
    const { session, requests } = fixture()
    session.edit('first')
    requests[0]!.publish([recent[0]!])

    session.edit('second')
    session.moveResult(1)

    expect(requests[0]!.cancel).toHaveBeenCalledOnce()
    expect(session.getSnapshot()).toMatchObject({
      query: 'second',
      completedQuery: 'first',
      items: [recent[0]],
      pending: true,
      selected: 0,
    })
    expect(session.takeResult()).toBeUndefined()

    requests[0]!.publish([])

    expect(session.getSnapshot().pending).toBe(true)
    expect(session.getSnapshot().items).toEqual([recent[0]])

    requests[1]!.publish([recent[1]!])

    expect(session.getSnapshot()).toMatchObject({ completedQuery: 'second', items: [recent[1]], pending: false })
    expect(session.takeResult()).toBe('second')
    expect(session.getSnapshot().items).toBeUndefined()
  })

  it('cancels clear, close and reopen without allowing old callbacks to revive the session', () => {
    const { session, requests } = fixture()
    session.edit('first')

    session.edit('')
    requests[0]!.publish([])

    expect(session.getSnapshot()).toMatchObject({ query: '', completedQuery: '', items: recent, pending: false })

    session.edit('second')
    expect(session.close()).toBe(true)
    expect(session.close()).toBe(false)
    requests[1]!.publish(recent)

    expect(session.getSnapshot().items).toBeUndefined()
    expect(requests[1]!.cancel).toHaveBeenCalledOnce()

    session.open()
    requests[1]!.publish([])

    expect(session.getSnapshot()).toMatchObject({ query: '', items: recent, pending: false, selected: 0 })
  })

  it.each([undefined, 1])('closes before a buffered edit can refresh the document (index=%s)', (index) => {
    const { session, source } = fixture()
    session.moveResult(-1)

    const destination = session.takeResult(index)
    session.refresh()

    expect(destination).toBe('second')
    expect(source.search).not.toHaveBeenCalled()
    expect(session.getSnapshot().items).toBeUndefined()
  })

  it('refreshes the current query and rejects results from the old document', () => {
    const { session, requests } = fixture()
    session.edit('first')

    session.refresh()
    requests[0]!.publish(recent)

    expect(requests[0]!.cancel).toHaveBeenCalledOnce()
    expect(requests[1]!.query).toBe('first')
    expect(session.getSnapshot().pending).toBe(true)

    requests[1]!.publish([])

    expect(session.getSnapshot()).toMatchObject({ items: [], completedQuery: 'first', pending: false })
  })

  it('accepts synchronous empty or short-query results without leaving pending work', () => {
    const { session, source } = fixture()
    source.search.mockImplementation((_query, publish) => {
      publish([])
      return vi.fn()
    })

    session.edit('ab')

    expect(session.getSnapshot()).toMatchObject({ query: 'ab', completedQuery: 'ab', items: [], pending: false })
    expect(session.takeResult()).toBeUndefined()

    session.edit('#unknown')

    expect(session.getSnapshot()).toMatchObject({ completedQuery: '#unknown', items: [], pending: false })
  })

  it('owns tag selection, acceptance and composition without activating a result', () => {
    const { session, source } = fixture()
    source.suggestions.mockReturnValue(['work', 'worker'])
    session.edit('#w')

    session.moveSuggestion(-1)
    session.acceptSuggestion()

    expect(session.getSnapshot()).toMatchObject({ query: '#worker', suggestions: [], pending: true })
    expect(session.takeResult()).toBeUndefined()

    session.edit('#w')
    session.dismissSuggestions()

    expect(session.getSnapshot()).toMatchObject({ query: '#w', suggestions: [] })

    session.beginComposition()
    session.edit('#作')

    expect(session.getSnapshot().suggestions).toEqual([])

    session.endComposition('#作')

    expect(session.getSnapshot().suggestions).toEqual(['work', 'worker'])
  })

  it('publishes one current snapshot and releases subscriptions', () => {
    const { session } = fixture()
    const changed = vi.fn()
    const unsubscribe = session.subscribe(changed)

    session.moveResult(1)

    expect(changed).toHaveBeenCalledOnce()
    expect(session.getSnapshot().selected).toBe(1)

    unsubscribe()
    session.close()

    expect(changed).toHaveBeenCalledOnce()
  })
})
