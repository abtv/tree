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
  it('uses parent identity for adjacent headings with identical displayed paths', () => {
    const { session, requests } = fixture()
    session.edit('note')
    requests[0]!.publish([
      { id: 'a', text: 'First note', path: 'Project', parentId: 'first' },
      { id: 'b', text: 'Second note', path: 'Project', parentId: 'second' },
    ])

    session.moveResult(1)

    expect(session.getSnapshot()).toMatchObject({ selected: 1, selectedPart: 'heading' })
    expect(session.takeResult()).toBe('second')
  })

  it('keeps accepted completion dismissed through document refresh until editing or moving the caret', () => {
    const { session, source } = fixture()
    source.suggestions.mockReturnValue(['work', 'worker'])
    session.edit('task #w next', false, 7)
    session.acceptSuggestion()

    session.refresh()

    expect(session.getSnapshot()).toMatchObject({ query: 'task #work next', suggestions: [] })

    session.updateSelection(8)

    expect(session.getSnapshot().suggestions).toEqual(['work', 'worker'])
    session.acceptSuggestion()
    session.edit('task #work next', false, 8)

    expect(session.getSnapshot().suggestions).toEqual(['work', 'worker'])
  })

  it.each(['#', '@', '&'])('completes a %s term anywhere while preserving surrounding terms and spacing', (prefix) => {
    const { session, source } = fixture()
    source.suggestions.mockReturnValue(['alex', 'alexander'])
    const query = `task  ${prefix}al\tother`
    session.edit(query)
    const calls = source.search.mock.calls.length

    session.updateSelection(8)

    expect(source.suggestions).toHaveBeenLastCalledWith(`${prefix}al`)
    expect(session.getSnapshot().completionQuery).toBe(`${prefix}al`)
    expect(source.search).toHaveBeenCalledTimes(calls)

    session.refresh()
    session.acceptSuggestion(1)

    expect(session.getSnapshot()).toMatchObject({ query: `task  ${prefix}alexander\tother`, suggestions: [] })
    session.updateSelection(16)
    expect(session.getSnapshot().suggestions).toEqual([])

    session.edit(`${prefix}al task`, false, 1)
    expect(session.acceptSuggestion()).toBe(5)
    expect(session.getSnapshot().query).toBe(`${prefix}alex task`)
  })

  it('suppresses completion during text selection and composition, then uses the committed caret', () => {
    const { session, source } = fixture()
    source.suggestions.mockReturnValue(['alex'])
    session.edit('task @al next', false, 6)

    session.updateSelection(6, 8)

    expect(session.getSnapshot().suggestions).toEqual([])

    session.beginComposition()
    session.updateSelection(7)

    expect(session.getSnapshot().suggestions).toEqual([])

    session.endComposition('task @al next', 7)

    expect(session.getSnapshot().completionQuery).toBe('@al')
    expect(session.acceptSuggestion()).toBe(10)
    expect(session.getSnapshot().query).toBe('task @alex next')
  })

  it.each(['s', 'se', 'second', '😀'])(
    'keeps completed results while refining to %s and forbids stale selection until replacement',
    (query) => {
      const { session, requests } = fixture()
      session.edit('first')
      requests[0]!.publish([recent[0]!])

      session.edit(query)
      session.moveResult(1)

      expect(requests[0]!.cancel).toHaveBeenCalledOnce()
      expect(session.getSnapshot()).toMatchObject({
        query,
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

      expect(session.getSnapshot()).toMatchObject({ completedQuery: query, items: [recent[1]], pending: false })
      expect(session.takeResult()).toBe('second')
      expect(session.getSnapshot().items).toBeUndefined()
    },
  )

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

  it('makes cleared results selectable in one transition and keeps a resulting dismissal closed', () => {
    const { session, requests } = fixture()
    session.edit('second')
    requests[0]!.publish([recent[1]!])
    const visited: string[] = []
    session.subscribe(() => {
      const state = session.getSnapshot()
      if (state.items && state.query === '' && !state.pending && visited.length === 0) {
        visited.push(session.takeResult()!)
      }
    })

    session.edit('')

    expect(visited).toEqual(['first'])
    expect(session.getSnapshot().items).toBeUndefined()
  })

  it('starts only the current search when a pending-state subscriber replaces the query', () => {
    const { session, requests } = fixture()
    session.subscribe(() => {
      if (session.getSnapshot().query === 'old') session.edit('new')
    })

    session.edit('old')
    session.close()

    expect(requests.map(({ query }) => query)).toEqual(['new'])
    expect(requests[0]!.cancel).toHaveBeenCalledOnce()
  })

  it('retains the newer cancellation handle when a search completes during startup', () => {
    const { session, source, requests } = fixture()
    const cancelOld = vi.fn()
    source.search.mockImplementationOnce((_query, publish) => {
      publish([])
      return cancelOld
    })
    session.subscribe(() => {
      if (session.getSnapshot().completedQuery === 'old' && !session.getSnapshot().pending) session.edit('new')
    })

    session.edit('old')
    session.close()

    expect(cancelOld).toHaveBeenCalledOnce()
    expect(requests[0]!.cancel).toHaveBeenCalledOnce()
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

  it('accepts synchronous no-match results without leaving pending work', () => {
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

  it.each(['#', '@', '&'])('owns %s selection, acceptance and composition without activating a result', (prefix) => {
    const { session, source } = fixture()
    source.suggestions.mockReturnValue(['work', 'worker'])
    session.edit(`${prefix}w`)

    session.moveSuggestion(-1)
    session.acceptSuggestion()

    expect(session.getSnapshot()).toMatchObject({ query: `${prefix}worker`, suggestions: [], pending: true })
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
