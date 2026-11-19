import { describe, expect, it, vi } from 'vitest'
import { QuitHandshake, type QuitHandshakeClock } from './quit-handshake'

function createClock() {
  const callbacks: Array<() => void> = []
  const clock: QuitHandshakeClock = {
    setTimeout: (next) => {
      callbacks.push(next)
      return callbacks.length
    },
    clearTimeout: vi.fn(),
  }
  return { clock, callbacks, fire: () => callbacks.at(-1)?.() }
}

describe('QuitHandshake', () => {
  it('enters terminal state before the quit microtask and forces from idle only once', async () => {
    const send = vi.fn()
    const quit = vi.fn()
    const { clock } = createClock()
    const handshake = new QuitHandshake(send, vi.fn(), quit, () => 'idle', clock)

    expect(handshake.isQuitting()).toBe(false)
    expect(handshake.confirm('idle')).toBe(false)
    handshake.force()
    handshake.force()
    handshake.request()

    expect(handshake.isQuitting()).toBe(true)
    expect(quit).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(clock.clearTimeout).not.toHaveBeenCalled()

    await Promise.resolve()

    expect(quit).toHaveBeenCalledOnce()
  })

  it('cancels the timeout after confirmation and keeps later requests inert', async () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn()
      const timeout = vi.fn()
      const quit = vi.fn()
      const handshake = new QuitHandshake(send, timeout, quit, () => 'confirmed')

      handshake.request()
      expect(handshake.confirm('confirmed')).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      await Promise.resolve()
      handshake.request()
      vi.advanceTimersByTime(5000)

      expect(handshake.isQuitting()).toBe(true)
      expect(send).toHaveBeenCalledOnce()
      expect(quit).toHaveBeenCalledOnce()
      expect(timeout).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends one request and confirms only the matching request', async () => {
    const sent: string[] = []
    const quit = vi.fn()
    const { clock } = createClock()
    const handshake = new QuitHandshake(
      (requestId) => sent.push(requestId),
      vi.fn(),
      quit,
      () => 'request-1',
      clock,
    )

    handshake.request()
    handshake.request()

    expect(sent).toEqual(['request-1'])
    expect(handshake.confirm('wrong')).toBe(false)
    expect(handshake.confirm('request-1')).toBe(true)

    await Promise.resolve()

    expect(quit).toHaveBeenCalledOnce()
    expect(handshake.confirm('request-1')).toBe(false)
  })

  it('accepts a retry immediately after the renderer reports a failed save', () => {
    const sent = vi.fn()
    const { clock } = createClock()
    let id = 0
    const handshake = new QuitHandshake(sent, vi.fn(), vi.fn(), () => String(++id), clock)
    handshake.request()
    handshake.cancel('1')
    handshake.request()
    handshake.cancel('1')

    expect(sent.mock.calls).toEqual([['1'], ['2']])
    expect(handshake.confirm('2')).toBe(true)
  })

  it('reports a timeout and permits a later request', () => {
    const sent: string[] = []
    const onTimeout = vi.fn()
    const { clock, fire } = createClock()
    let nextId = 0
    const handshake = new QuitHandshake(
      (requestId) => sent.push(requestId),
      onTimeout,
      vi.fn(),
      () => `request-${++nextId}`,
      clock,
    )

    handshake.request()
    fire()

    expect(handshake.isQuitting()).toBe(false)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(sent[0])

    handshake.request()

    expect(sent).toEqual(['request-1', 'request-2'])
  })

  it('ignores the callback from a cancelled deadline during a later quit request', async () => {
    const send = vi.fn()
    const timeout = vi.fn()
    const quit = vi.fn()
    const { clock, callbacks } = createClock()
    let id = 0
    const handshake = new QuitHandshake(send, timeout, quit, () => String(++id), clock)
    handshake.request()
    const staleDeadline = callbacks[0]!

    handshake.cancel('1')
    staleDeadline()

    expect(clock.clearTimeout).toHaveBeenCalledExactlyOnceWith(1)
    expect(timeout).not.toHaveBeenCalled()

    handshake.request()
    staleDeadline()

    expect(send.mock.calls).toEqual([['1'], ['2']])
    expect(timeout).not.toHaveBeenCalled()
    expect(handshake.confirm('2')).toBe(true)
    expect(clock.clearTimeout).toHaveBeenLastCalledWith(2)
    await Promise.resolve()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('forces an immediate quit, clears the pending timeout, and ignores later requests', async () => {
    const sent: string[] = []
    const quit = vi.fn()
    const { clock } = createClock()
    const handshake = new QuitHandshake(
      (requestId) => sent.push(requestId),
      vi.fn(),
      quit,
      () => 'request-1',
      clock,
    )

    handshake.request()
    handshake.force()
    await Promise.resolve()

    expect(quit).toHaveBeenCalledOnce()
    expect(clock.clearTimeout).toHaveBeenCalled()

    handshake.request()
    handshake.force()
    await Promise.resolve()

    expect(quit).toHaveBeenCalledOnce()
    expect(sent).toEqual(['request-1'])
  })
})
