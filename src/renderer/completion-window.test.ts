import { expect, it } from 'vitest'
import { completionWindow, revealCompletionOption } from './completion-window'

it('mounts only the visible section and its buffer after a large scroll in either direction', () => {
  expect(completionWindow(10_000, 0)).toEqual({ start: 0, end: 10 })
  expect(completionWindow(10_000, 100_001)).toEqual({ start: 3998, end: 4011 })
  expect(completionWindow(10_000, 249_816)).toEqual({ start: 9990, end: 10_000 })
})

it('reveals both directions and the ends without scrolling when the selection already fits', () => {
  expect(revealCompletionOption(4, 50, 100)).toBe(50)
  expect(revealCompletionOption(1, 50, 100)).toBe(25)
  expect(revealCompletionOption(7, 50, 100)).toBe(100)
  expect(revealCompletionOption(9_999, 0, 100)).toBe(249_900)
  expect(revealCompletionOption(0, 249_900, 100)).toBe(0)
})
