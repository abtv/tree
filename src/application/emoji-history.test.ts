import { expect, it, vi } from 'vitest'
import { EmojiHistory } from './emoji-history'
import { initialEmojiSuggestions, suggestEmoji } from '../domain/emoji-completion'

// @requirement PRODUCT.md §20.12
it('promotes unique accepted shortcodes, caches empty queries and leaves search ranking unchanged', async () => {
  const write = vi.fn<(names: readonly string[]) => Promise<void>>(async () => undefined)
  const history = new EmojiHistory(write, vi.fn())
  history.load(['rocket', 'cat', 'rocket', 'unknown', null])
  const initial = history.suggestions

  expect(initial.slice(0, 2).map(({ shortcode }) => shortcode)).toEqual(['rocket', 'cat'])
  expect(suggestEmoji(':', 1, initial)?.suggestions).toBe(initial)
  expect(suggestEmoji(':cat', 4, initial)).toEqual(suggestEmoji(':cat', 4))
  expect(suggestEmoji(':r', 2, initial)).toEqual(suggestEmoji(':r', 2))
  expect(initial.slice(2)).toEqual(
    initialEmojiSuggestions([]).filter(({ shortcode }) => !['rocket', 'cat'].includes(shortcode)),
  )
  history.remember('rocket')
  await history.flush()

  expect(history.suggestions).toBe(initial)
  expect(write).not.toHaveBeenCalled()

  history.remember('cat')
  await history.flush()

  expect(write).toHaveBeenLastCalledWith(['cat', 'rocket'])
  expect(history.suggestions.slice(0, 2).map(({ shortcode }) => shortcode)).toEqual(['cat', 'rocket'])
})

it('serializes concurrent acceptances and retries a failed preference on flush', async () => {
  let release!: () => void
  const write = vi
    .fn<(names: readonly string[]) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    .mockRejectedValueOnce(new Error('disk failure'))
    .mockResolvedValue(undefined)
  const report = vi.fn()
  const history = new EmojiHistory(write, report)
  history.remember('cat')
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
  history.remember('rocket')

  expect(write).toHaveBeenCalledOnce()
  release()
  await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())
  await history.flush()

  expect(write).toHaveBeenLastCalledWith(['rocket', 'cat'])
})

it('retries a failed write when the same first emoji is accepted again', async () => {
  const write = vi
    .fn<(names: readonly string[]) => Promise<void>>()
    .mockRejectedValueOnce(new Error('disk failure'))
    .mockResolvedValue(undefined)
  const report = vi.fn()
  const history = new EmojiHistory(write, report)
  history.remember('cat')
  await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())

  history.remember('cat')
  await history.flush()

  expect(write).toHaveBeenCalledTimes(2)
  expect(write).toHaveBeenLastCalledWith(['cat'])
})
