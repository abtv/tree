import { describe, expect, it } from 'vitest'
import { EditorTextSession } from './editor-text-session'
import type { Clock } from './editor-store-types'

function manualClock() {
  const timers = new Map<number, () => void>()
  let nextHandle = 1
  const cleared: unknown[] = []
  const clock: Clock = {
    setTimeout: (callback) => {
      const handle = nextHandle
      nextHandle += 1
      timers.set(handle, callback)
      return handle
    },
    clearTimeout: (handle) => {
      cleared.push(handle)
      timers.delete(handle as number)
    },
  }
  return {
    clock,
    cleared,
    armed: () => timers.size,
    fire: () => [...timers.values()].forEach((callback) => callback()),
  }
}

describe('EditorTextSession', () => {
  it('is active only for the node it began on, until it ends', () => {
    const session = new EditorTextSession(manualClock().clock)

    expect(session.isActive('a')).toBe(false)
    session.begin('a')
    expect(session.isActive('a')).toBe(true)
    expect(session.isActive('b')).toBe(false)
    session.end()
    expect(session.isActive('a')).toBe(false)
  })

  it('ends the session when the boundary timer fires', () => {
    const time = manualClock()
    const session = new EditorTextSession(time.clock)
    session.begin('a')
    session.scheduleBoundary()

    expect(session.isActive('a')).toBe(true)
    time.fire()
    expect(session.isActive('a')).toBe(false)
  })

  it('cancels an armed boundary timer when the session ends', () => {
    const time = manualClock()
    const session = new EditorTextSession(time.clock)
    session.begin('a')
    session.scheduleBoundary()

    session.end()

    expect(time.armed()).toBe(0)
    expect(time.cleared).toEqual([1])
    session.end()
    expect(time.cleared).toEqual([1])
  })

  it('does not cancel anything when no boundary timer is armed', () => {
    const time = manualClock()
    const session = new EditorTextSession(time.clock)
    session.begin('a')

    session.end()
    session.scheduleBoundary()

    expect(time.cleared).toEqual([])
  })

  it('replaces the previous boundary timer when a new one is scheduled', () => {
    const time = manualClock()
    const session = new EditorTextSession(time.clock)
    session.begin('a')
    session.scheduleBoundary()
    session.scheduleBoundary()

    expect(time.cleared).toEqual([1])
    expect(time.armed()).toBe(1)
  })

  it('ends the session once after the next edit is marked standalone', () => {
    const session = new EditorTextSession(manualClock().clock)
    session.begin('a')
    session.markNextEditStandalone()

    expect(session.isActive('a')).toBe(false)
    session.begin('a')
    session.endIfStandalone()
    expect(session.isActive('a')).toBe(false)

    session.begin('a')
    session.endIfStandalone()
    expect(session.isActive('a')).toBe(true)
  })

  it('does nothing in endIfStandalone when no standalone edit was requested', () => {
    const session = new EditorTextSession(manualClock().clock)
    session.begin('a')

    session.endIfStandalone()

    expect(session.isActive('a')).toBe(true)
  })
})
