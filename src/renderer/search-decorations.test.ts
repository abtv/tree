// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useLayoutEffect } from 'react'
import { useSearchDecorations } from './search-decorations'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('commits a refined local highlight with the query on ordinary rows', () => {
  const commits: { query: string; lengths: number[] }[] = []
  const hook = renderHook(
    ({ query }) => {
      const ranges = useSearchDecorations('meeting projection', query)
      useLayoutEffect(() => {
        commits.push({ query, lengths: ranges.map(({ end, start }) => end - start) })
      })
    },
    { initialProps: { query: 'pro' } },
  )

  hook.rerender({ query: 'proj' })

  expect(commits.find((commit) => commit.query === 'proj')?.lengths).toEqual([4])
})

it.each([undefined, []])('yields on oversized mounted text and cancels obsolete query work (%j)', async (tags) => {
  vi.useFakeTimers()
  const text = 'a'.repeat(20_000) + 'target'
  const hook = renderHook(({ query }) => useSearchDecorations(text, query, tags), { initialProps: { query: 'a' } })

  expect(hook.result.current).toEqual([])

  hook.rerender({ query: 'target' })
  await act(async () => {
    await vi.runAllTimersAsync()
  })

  expect(hook.result.current).toEqual([{ start: 20_000, end: 20_006, className: 'search-match' }])

  hook.rerender({ query: '' })

  expect(hook.result.current).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})

it('updates a short mounted row independently of global counting and removes stale edited ranges', () => {
  const hook = renderHook(({ text }) => useSearchDecorations(text, 'apple'), { initialProps: { text: 'apple apple' } })

  expect(hook.result.current).toHaveLength(2)

  hook.rerender({ text: 'apple pear' })

  expect(hook.result.current).toEqual([{ start: 0, end: 5, className: 'search-match' }])
})

it('releases completed oversized ranges when a row moves to immediate highlighting', async () => {
  vi.useFakeTimers()
  // Longer than one decoration slice, so the rescan after the row returns is still pending when it is observed.
  const long = 'ordinary '.repeat(4000) + 'target'
  const hook = renderHook(({ text }) => useSearchDecorations(text, 'target'), { initialProps: { text: long } })
  await act(async () => {
    await vi.runAllTimersAsync()
  })
  expect(hook.result.current).toHaveLength(1)

  hook.rerender({ text: 'target' })
  expect(hook.result.current).toEqual([{ start: 0, end: 6, className: 'search-match' }])
  hook.rerender({ text: long })

  expect(hook.result.current).toEqual([])
})

// @requirement PRODUCT.md §20.14.2
it('highlights unordered global terms with independent smart case and merges overlaps', () => {
  const tags: [] = []
  const hook = renderHook(() => useSearchDecorations('Image detection image', 'tect Image detection tect', tags))

  expect(hook.result.current).toEqual([
    { start: 0, end: 5, className: 'search-match' },
    { start: 6, end: 15, className: 'search-match' },
  ])
})

it('combines literal terms with recognized marker ranges rather than marker substrings', () => {
  const tags = [{ start: 0, end: 5 }]
  const hook = renderHook(() => useSearchDecorations('@Alex @Alexander image', '@alex image', tags))

  expect(hook.result.current).toEqual([
    { start: 0, end: 5, className: 'search-match' },
    { start: 17, end: 22, className: 'search-match' },
  ])
})
