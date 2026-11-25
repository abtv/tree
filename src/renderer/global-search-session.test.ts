import { describe, expect, it, vi } from 'vitest'
import type { NodeResult } from '../application/node-result'
import type { SearchScheduler } from '../application/search-executor'
import { GlobalSearchSession } from './global-search-session'

const initial: readonly NodeResult[] = [
  { id: 'first', text: 'First', path: null },
  { id: 'second', text: 'Second', path: null },
]

function fixture(scheduler?: SearchScheduler) {
  const requests: {
    query: string
    publish: (items: readonly NodeResult[]) => void
    cancel: ReturnType<typeof vi.fn>
  }[] = []
  const source = {
    initial: vi.fn(() => initial),
    suggestions: vi.fn<(query: string, uniqueOnly?: boolean) => readonly string[]>(() => []),
    search: vi.fn((query: string, publish: (items: readonly NodeResult[]) => void) => {
      const cancel = vi.fn()
      requests.push({ query, publish, cancel })
      return cancel
    }),
  }
  const session = new GlobalSearchSession(source, scheduler)
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

  it('resolves distinct marker fragments independently of the caret and reuses unchanged resolutions', () => {
    const { session, source, requests } = fixture()
    const names: Record<string, readonly string[]> = {
      '@al': ['alex'],
      '@bo': ['bob'],
      '#wo': ['work'],
      '&mee': ['meeting'],
    }
    source.suggestions.mockImplementation((term) => names[term] ?? [])
    const query = '@al @bo #wo &mee rev'

    session.edit(query)
    requests[0]!.publish(initial)
    session.updateSelection(2, 4)
    session.updateSelection(2)

    expect(requests.map(({ query }) => query)).toEqual(['@alex @bob #work &meeting rev'])
    expect(session.getSnapshot()).toMatchObject({
      query,
      completedQuery: query,
      completedMarkerFragments: [
        { fragment: '@al', name: 'alex' },
        { fragment: '@bo', name: 'bob' },
        { fragment: '#wo', name: 'work' },
        { fragment: '&mee', name: 'meeting' },
      ],
    })

    source.suggestions.mockClear()
    session.edit(`${query}iew`)

    expect(source.suggestions).not.toHaveBeenCalled()
    expect(requests[1]?.query).toBe('@alex @bob #work &meeting review')
  })

  it('keeps a reused pending search current and reevaluates uniqueness on document refresh', () => {
    const { session, source, requests } = fixture()
    source.suggestions.mockReturnValue(['alex'])
    session.edit('@a')

    session.edit('@al ')
    requests[0]!.publish(initial)

    expect(requests).toHaveLength(1)
    expect(session.getSnapshot()).toMatchObject({
      completedQuery: '@al ',
      completedMarkerFragments: [{ fragment: '@al', name: 'alex' }],
    })

    source.suggestions.mockReturnValue(['alex', 'alice'])
    session.refresh()
    requests[0]!.publish([])

    expect(requests[1]?.query).toBe('@al')
    expect(session.getSnapshot()).toMatchObject({ pending: true, items: initial })
  })

  it('expands repeated and equivalent marker terms only once in the effective query', () => {
    const { session, source, requests } = fixture()
    const name = `project-${'a'.repeat(512)}`
    source.suggestions.mockReturnValue([name])
    const query = `${'# '.repeat(500)}#pr ${'notes '.repeat(20)}`

    session.edit(query)
    requests[0]!.publish(initial)

    expect(requests[0]!.query).toBe(`#${name} notes`)
    expect(session.getSnapshot()).toMatchObject({
      query,
      completedQuery: query,
      completedMarkerFragments: [
        { fragment: '#', name },
        { fragment: '#pr', name },
      ],
    })
  })

  it('yields during distinct catalog lookups and rejects queued work after a newer edit or close', () => {
    const queued: { run: () => void; cancel: ReturnType<typeof vi.fn> }[] = []
    const { session, source, requests } = fixture({
      schedule(run) {
        const cancel = vi.fn()
        queued.push({ run, cancel })
        return cancel
      },
    })
    const pasted = Array.from({ length: 24 }, (_, index) => `#missing${index}`).join(' ')

    session.edit(`${pasted} notes`)

    expect(source.suggestions.mock.calls.length).toBeLessThan(24)
    expect(requests).toHaveLength(0)
    expect(session.getSnapshot().pending).toBe(true)
    const stale = queued.shift()!

    session.edit('new')
    stale.run()

    expect(stale.cancel).toHaveBeenCalledOnce()
    expect(requests.map(({ query }) => query)).toEqual(['new'])

    session.edit(pasted)
    while (queued.length > 0) queued.shift()!.run()

    expect(requests.map(({ query }) => query)).toEqual(['new', pasted])

    session.edit(`${pasted.replaceAll('missing', 'other')} notes`)
    session.close()
    queued.shift()!.run()

    expect(requests).toHaveLength(2)
    expect(session.getSnapshot().items).toBeUndefined()
  })

  it.each(['s', 'se', 'second', '😀'])(
    'keeps completed results while refining to %s and forbids stale selection until replacement',
    (query) => {
      const { session, requests } = fixture()
      session.edit('first')
      requests[0]!.publish([initial[0]!])

      session.edit(query)
      session.moveResult(1)

      expect(requests[0]!.cancel).toHaveBeenCalledOnce()
      expect(session.getSnapshot()).toMatchObject({
        query,
        completedQuery: 'first',
        items: [initial[0]],
        pending: true,
        selected: 0,
      })
      expect(session.takeResult()).toBeUndefined()

      requests[0]!.publish([])

      expect(session.getSnapshot().pending).toBe(true)
      expect(session.getSnapshot().items).toEqual([initial[0]])

      requests[1]!.publish([initial[1]!])

      expect(session.getSnapshot()).toMatchObject({ completedQuery: query, items: [initial[1]], pending: false })
      expect(session.takeResult()).toBe('second')
      expect(session.getSnapshot().items).toBeUndefined()
    },
  )

  it('cancels clear, close and reopen without allowing old callbacks to revive the session', () => {
    const { session, requests } = fixture()
    session.edit('first')

    session.edit('')
    requests[0]!.publish([])

    expect(session.getSnapshot()).toMatchObject({ query: '', completedQuery: '', items: initial, pending: false })

    session.edit('second')
    expect(session.close()).toBe(true)
    expect(session.close()).toBe(false)
    requests[1]!.publish(initial)

    expect(session.getSnapshot().items).toBeUndefined()
    expect(requests[1]!.cancel).toHaveBeenCalledOnce()

    session.open()
    requests[1]!.publish([])

    expect(session.getSnapshot()).toMatchObject({ query: '', items: initial, pending: false, selected: 0 })
  })

  it('makes cleared results selectable in one transition and keeps a resulting dismissal closed', () => {
    const { session, requests } = fixture()
    session.edit('second')
    requests[0]!.publish([initial[1]!])
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
    requests[0]!.publish(initial)

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
