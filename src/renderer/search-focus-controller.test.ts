import { expect, it } from 'vitest'
import { SearchFocusController } from './search-focus-controller'

it.each([
  [true, true, false, false, false],
  [false, true, true, false, false],
  [true, false, false, false, true],
  [false, false, true, true, true],
])('separates draft suppression from borrowed DOM focus (%s, %s)', (draft, searchFocused, focus, caret, native) => {
  const controller = new SearchFocusController(() => ({ draft: draft!, searchFocused: searchFocused! }))

  expect(controller.canProjectFocus()).toBe(focus)
  expect(controller.canProjectCaret()).toBe(caret)
  expect(controller.canReadNativeCaret()).toBe(native)
  expect(controller.keepsSearchFocus()).toBe(searchFocused)
})

it('retains the latest match through control focus and consumes restoration once', () => {
  let searchFocused = true
  const controller = new SearchFocusController(() => ({ draft: false, searchFocused }))
  const first = { nodeId: 'a', cursor: 2, token: 1 }
  const latest = { nodeId: 'a', cursor: 7, token: 2 }

  controller.completeFocusProjection(first, true)
  controller.completeFocusProjection(latest, true)
  searchFocused = false

  expect(controller.canReadNativeCaret()).toBe(false)
  expect(controller.takeRestoration(latest, 'a')).toEqual(latest)
  expect(controller.takeRestoration(latest, 'a')).toBeUndefined()
  expect(controller.canReadNativeCaret()).toBe(true)
})

it('discards obsolete intent after manual focus, projection or a newer destination', () => {
  const controller = new SearchFocusController(() => ({ draft: false, searchFocused: false }))
  const focus = { nodeId: 'a', cursor: 2, token: 1 }

  controller.completeFocusProjection(focus, true)
  controller.editorFocused()

  expect(controller.takeRestoration(focus, 'a')).toBeUndefined()

  controller.completeFocusProjection(focus, true)
  controller.completeFocusProjection(focus, false)

  expect(controller.takeRestoration(focus, 'a')).toBeUndefined()

  controller.completeFocusProjection(focus, true)

  expect(controller.takeRestoration({ ...focus, token: 2 }, 'a')).toBeUndefined()
  expect(controller.takeRestoration(focus, 'a')).toBeUndefined()

  controller.completeFocusProjection(focus, true)

  expect(controller.takeRestoration(focus, 'b')).toBeUndefined()
})
