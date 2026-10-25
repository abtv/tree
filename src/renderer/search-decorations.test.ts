// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSearchDecorations } from './search-decorations'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('yields on oversized mounted text and cancels obsolete query work', async () => {
  vi.useFakeTimers()
  const text = 'a'.repeat(20_000) + 'target'
  const hook = renderHook(({ query }) => useSearchDecorations(text, query), { initialProps: { query: 'a' } })

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
