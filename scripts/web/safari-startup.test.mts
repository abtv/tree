import { expect, it, vi } from 'vitest'
import {
  createSafariSession,
  isSafariSessionTimeout,
  parseSafariProcesses,
  SafariSessionTimeoutError,
  stopOwnedSafari,
} from './safari-startup.mts'

it('cleans the failed attempt before retrying session creation once', async () => {
  const events: string[] = []
  const timeout = new SafariSessionTimeoutError('Synthetic session timeout')
  const attempt = vi.fn(async (number: number) => {
    events.push(`start ${number}`)
    try {
      if (number === 1) throw timeout
      return 'session'
    } finally {
      events.push(`cleanup ${number}`)
    }
  })

  const result = await createSafariSession(attempt, true, new AbortController().signal, () => {})

  expect(result).toBe('session')
  expect(events).toEqual(['start 1', 'cleanup 1', 'start 2', 'cleanup 2'])
})

it('propagates a second session timeout without a third attempt', async () => {
  const timeout = new SafariSessionTimeoutError('Synthetic session timeout')
  const attempt = vi.fn().mockRejectedValue(timeout)

  await expect(createSafariSession(attempt, true, new AbortController().signal, () => {})).rejects.toBe(timeout)

  expect(attempt).toHaveBeenCalledTimes(2)
})

it.each([new Error('Application assertion failed'), new Error('SafariDriver exited'), new Error('Cleanup failed')])(
  'does not retry other errors: %s',
  async (error) => {
    const attempt = vi.fn().mockRejectedValue(error)

    await expect(createSafariSession(attempt, true, new AbortController().signal, () => {})).rejects.toBe(error)

    expect(attempt).toHaveBeenCalledTimes(1)
  },
)

it('does not retry local runs or an interrupted run', async () => {
  const timeout = new SafariSessionTimeoutError('Synthetic session timeout')
  const local = vi.fn().mockRejectedValue(timeout)
  const controller = new AbortController()
  const interrupted = vi.fn(async () => {
    controller.abort(new Error('Interrupted'))
    throw timeout
  })

  await expect(createSafariSession(local, false, new AbortController().signal, () => {})).rejects.toBe(timeout)
  await expect(createSafariSession(interrupted, true, controller.signal, () => {})).rejects.toBe(timeout)

  expect(local).toHaveBeenCalledTimes(1)
  expect(interrupted).toHaveBeenCalledTimes(1)
})

it('classifies only request timeouts during session creation, excluding the overall budget and interruption', () => {
  const controller = new AbortController()
  const timeout = new DOMException('Timed out', 'TimeoutError')

  expect(isSafariSessionTimeout('/session', timeout, controller.signal)).toBe(true)
  expect(isSafariSessionTimeout('/session/123/url', timeout, controller.signal)).toBe(false)
  expect(isSafariSessionTimeout('/status', timeout, controller.signal)).toBe(false)
  expect(isSafariSessionTimeout('/session', new Error('Connection refused'), controller.signal)).toBe(false)

  controller.abort(timeout)

  expect(isSafariSessionTimeout('/session', timeout, controller.signal)).toBe(false)
})

it('recognizes only stock Safari and SafariDriver executables, retaining process start time', () => {
  const processes = parseSafariProcesses(`
  101 Sun Nov  8 20:00:00 2026 /System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari
  102 Sun Nov  8 20:00:01 2026 /usr/bin/safaridriver
  103 Sun Nov  8 20:00:02 2026 /System/Cryptexes/App/usr/libexec/SafariLaunchAgent
  104 Sun Nov  8 20:00:03 2026 /Applications/Safari Technology Preview.app/Contents/MacOS/Safari Technology Preview
  105 Sun Nov  8 20:00:04 2026 /usr/bin/safaridriver-other
`)

  expect(processes).toEqual([
    {
      pid: 101,
      identity:
        'Sun Nov  8 20:00:00 2026 /System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari',
      browser: true,
    },
    { pid: 102, identity: 'Sun Nov  8 20:00:01 2026 /usr/bin/safaridriver', browser: false },
  ])
})

it('signals only the owned browser, leaving drivers, new browsers and reused PIDs alone', async () => {
  const owned = { pid: 101, identity: 'original Safari', browser: true }
  const driver = { pid: 102, identity: 'driver', browser: false }
  const other = { pid: 103, identity: 'new Safari', browser: true }
  let signaled = false
  const read = vi.fn(async () => (signaled ? [driver, other] : [owned, driver]))
  const kill = vi.fn(() => {
    signaled = true
  })

  await stopOwnedSafari(read, kill)

  expect(kill.mock.calls).toEqual([[101, 'SIGTERM']])

  const reused = vi
    .fn()
    .mockResolvedValueOnce([owned])
    .mockResolvedValue([{ ...owned, identity: 'reused PID' }])
  kill.mockClear()

  await stopOwnedSafari(reused, kill)

  expect(kill).not.toHaveBeenCalled()
})

it('bounds cleanup and refuses recovery if the owned browser survives both signals', async () => {
  let now = 0
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 2000))
  const read = async () => [{ pid: 101, identity: 'owned Safari', browser: true }]
  const kill = vi.fn()
  try {
    await expect(stopOwnedSafari(read, kill)).rejects.toThrow('Owned Safari did not exit')

    expect(kill.mock.calls).toEqual([
      [101, 'SIGTERM'],
      [101, 'SIGKILL'],
    ])
  } finally {
    clock.mockRestore()
  }
})
