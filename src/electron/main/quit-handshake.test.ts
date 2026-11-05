import { describe, expect, it, vi } from 'vitest'
import { QuitHandshake, type QuitHandshakeClock } from './quit-handshake'

function createClock() {
  let callback: (() => void) | undefined
  const clock: QuitHandshakeClock = {
    setTimeout: (next) => {
      callback = next
      return 'timeout'
    },
    clearTimeout: vi.fn(),
  }
  return { clock, fire: () => callback?.() }
}

describe('QuitHandshake', () => {
  it('cancels the timeout after confirmation and keeps later requests inert', async () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn()
      const timeout = vi.fn()
      const quit = vi.fn()
      const handshake = new QuitHandshake(send, timeout, quit, () => 'confirmed')

      handshake.request()
      expect(handshake.confirm('confirmed')).toBe(true)
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

    expect(onTimeout).toHaveBeenCalledOnce()

    handshake.request()

    expect(sent).toEqual(['request-1', 'request-2'])
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
