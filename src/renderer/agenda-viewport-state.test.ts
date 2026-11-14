import { expect, it } from 'vitest'
import { AgendaViewportState } from './agenda-viewport-state'

const timeline = { kind: 'timeline' as const }
const focused = {
  kind: 'focused-day' as const,
  day: 1,
  timelineReturn: { weekStart: 0, selectedKey: 'node:1:a', collapsed: new Set<string>(), scrollTop: 0 },
}

it('orders opening, line delegation, anchor suppression and row intent; remount restores opening', () => {
  const state = new AgendaViewportState<object, object>()
  const row = { key: 'node:1:a', nodeId: 'a', document: {}, rows: {} }

  expect(state.takeReveal(true, 'native')).toBe('today')
  expect(state.takeReveal(true, 'native')).toBe('native-line')
  expect(state.takeReveal(false, 'synthetic')).toBe('synthetic-line')
  expect(state.takeReveal(false, 'none')).toBe('keyboard-row')

  state.navigate('pointer')

  expect(state.takeReveal(false, 'none')).toBe('pointer-row')

  state.captureAnchor(0)
  state.commit(row, false)

  expect(state.takeReveal(false, 'native')).toBe('native-line')
  expect(state.takeReveal(false, 'none')).toBe('cancel')
  expect(state.commit(row, true)).toBe(0)
  expect(state.takeReveal(false, 'none')).toBe('cancel')

  state.commit(row, true)

  expect(state.takeReveal(false, 'none')).toBe('pointer-row')

  state.navigate('none')

  expect(state.takeReveal(false, 'none')).toBe('cancel')

  state.mount()

  expect(state.takeReveal(true, 'none')).toBe('today')
})

it('restores zero scroll only after measurement and keeps end tracking independent of pending geometry', () => {
  const state = new AgendaViewportState<object, object>()
  const row = { key: 'node:1:a', nodeId: 'a', document: {}, rows: {} }

  expect(state.presentationChanged(timeline)).toBe('none')
  expect(state.presentationChanged(timeline)).toBe('none')

  state.navigate('pointer')

  expect(state.presentationChanged(focused)).toBe('start')
  expect(state.takeReveal(false, 'none')).toBe('keyboard-row')
  expect(state.presentationChanged({ ...focused, day: 2 })).toBe('none')
  expect(state.presentationChanged(timeline)).toBe('restore')
  expect(state.takeReveal(false, 'none')).toBe('cancel')
  expect(state.presentationChanged(timeline)).toBe('none')

  state.followEnd(true)
  state.captureAnchor(55)
  state.captureAnchor(80)

  expect(state.followsEnd).toBe(true)
  expect(state.takeRestoration(false)).toBeUndefined()
  expect(state.commit(row, false)).toBeUndefined()
  expect(state.takeRestoration(true)).toBe(0)
  expect(state.takeRestoration(true)).toBeUndefined()
  expect(state.commit(row, true)).toBe(55)
  expect(state.commit(row, true)).toBeUndefined()
  expect(state.followsEnd).toBe(true)

  state.followEnd(false)

  expect(state.followsEnd).toBe(false)
})

it('measures only a changed projection of the same active node and consumes the latest local line once', () => {
  const state = new AgendaViewportState<object, object>()
  const previous = { key: 'node:1:a', nodeId: 'a', document: {}, rows: {} }
  const changed = { nodeId: 'a', document: {}, rows: {} }

  expect(state.anchorSource(changed)).toBeUndefined()

  state.commit(previous, true)

  expect(state.anchorSource(changed)).toBe('node:1:a')
  expect(state.anchorSource({ ...changed, nodeId: 'b' })).toBeUndefined()
  expect(state.anchorSource({ ...changed, document: previous.document })).toBeUndefined()
  expect(state.anchorSource({ ...changed, rows: previous.rows })).toBeUndefined()

  state.commit({ ...previous, nodeId: undefined }, true)

  expect(state.anchorSource({ ...changed, nodeId: undefined })).toBeUndefined()

  state.captureAnchor(undefined)

  expect(state.commit(previous, true)).toBeUndefined()
  expect(state.takeReveal(false, 'none')).toBe('keyboard-row')

  const first = { key: 'day:1', anchor: 2, focus: 2 }
  const latest = { key: 'day:1', anchor: 4, focus: 4 }

  state.revealLine(first)
  state.revealLine(latest)

  expect(state.takeLine()).toBe(latest)
  expect(state.takeLine()).toBeUndefined()
})

// @requirement PRODUCT.md §23.7
it('anchors each later edit after consuming the previous correction', () => {
  const state = new AgendaViewportState<object, object>()
  const row = { key: 'node:1:a', nodeId: 'a', document: {}, rows: {} }

  state.navigate('pointer')
  state.captureAnchor(30)

  expect(state.commit(row, true)).toBe(30)
  expect(state.takeReveal(false, 'none')).toBe('cancel')

  state.commit(row, true)

  expect(state.takeReveal(false, 'none')).toBe('pointer-row')

  state.captureAnchor(75)

  expect(state.commit({ ...row, document: {}, rows: {} }, true)).toBe(75)
  expect(state.takeReveal(false, 'none')).toBe('cancel')

  state.commit(row, true)

  expect(state.takeReveal(false, 'none')).toBe('pointer-row')
})
