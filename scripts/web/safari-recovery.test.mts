import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runSafari } from './safari.mts'
import { readSafariProcesses, stopOwnedSafari } from './safari-startup.mts'

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}))
vi.mock('./safari-startup.mts', async (original) => ({
  ...(await original<typeof import('./safari-startup.mts')>()),
  readSafariProcesses: vi.fn(),
  stopOwnedSafari: vi.fn(),
}))

const platform = process.platform
const applicationFailure = new Error('Synthetic application failure after session creation')
let events: string[]
let sessions: number
let sessionFailures: number
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  events = []
  sessions = 0
  sessionFailures = 1
  vi.mocked(readSafariProcesses).mockResolvedValue([])
  vi.mocked(stopOwnedSafari).mockImplementation(async () => {
    events.push('browser cleanup')
  })
  vi.mocked(spawn).mockImplementation(() => {
    events.push('driver start')
    const child = Object.assign(new EventEmitter(), {
      pid: 123,
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill: (signal: NodeJS.Signals) => {
        events.push('driver cleanup')
        child.signalCode = signal
        queueMicrotask(() => child.emit('exit', null, signal))
        return true
      },
    })
    return child as unknown as ChildProcess
  })
  fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url).pathname
    if (path === '/status') return Response.json({ value: { ready: true } })
    if (path === '/session') {
      sessions += 1
      if (sessions <= sessionFailures) throw new DOMException('Synthetic hung session', 'TimeoutError')
      return Response.json({ value: { sessionId: 'synthetic', capabilities: { browserVersion: 'synthetic' } } })
    }
    if (path === '/session/synthetic/window') return Response.json({ value: 'launcher' })
    if (path === '/session/synthetic') return Response.json({ value: null })
    throw applicationFailure
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

it('restarts the driver only after cleanup and never retries a later application failure', async () => {
  await expect(runSafari(true)).rejects.toMatchObject({ cause: applicationFailure })

  expect(sessions).toBe(2)
  expect(events).toEqual([
    'driver start',
    'driver cleanup',
    'browser cleanup',
    'driver start',
    'driver cleanup',
    'browser cleanup',
  ])
  expect(spawn).toHaveBeenCalledTimes(2)
  expect(vi.mocked(spawn).mock.calls[0]?.slice(0, 2)).toEqual(['/usr/bin/safaridriver', ['--port', expect.any(String)]])
  const sessionRequests = fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === '/session')
  expect(sessionRequests).toHaveLength(2)
})

it('stops after the second timeout, cleaning both attempts', async () => {
  sessionFailures = 2

  await expect(runSafari(true)).rejects.toThrow('SafariDriver POST /session failed')

  expect(spawn).toHaveBeenCalledTimes(2)
  expect(stopOwnedSafari).toHaveBeenCalledTimes(2)
})

it('does not retry an application failure after first-attempt startup', async () => {
  sessionFailures = 0

  await expect(runSafari(true)).rejects.toMatchObject({ cause: applicationFailure })

  expect(spawn).toHaveBeenCalledTimes(1)
})

it('refuses to retry when cleanup fails and retains the session timeout as evidence', async () => {
  vi.mocked(stopOwnedSafari).mockRejectedValue(new Error('Cleanup blocked'))

  const failure = await runSafari(true).catch((error: unknown) => error)

  expect(failure).toBeInstanceOf(AggregateError)
  expect((failure as AggregateError).errors).toEqual([
    expect.objectContaining({ message: expect.stringContaining('POST /session failed') }),
    expect.objectContaining({ message: 'Cleanup blocked' }),
  ])
  expect(spawn).toHaveBeenCalledTimes(1)
})

it('preserves existing processes by failing CI preflight before starting or cleaning a driver', async () => {
  vi.mocked(readSafariProcesses).mockResolvedValue([{ pid: 500, identity: 'pre-existing Safari', browser: true }])

  await expect(runSafari(true)).rejects.toThrow('require no existing Safari/SafariDriver')

  expect(spawn).not.toHaveBeenCalled()
  expect(stopOwnedSafari).not.toHaveBeenCalled()
})

it('does not inspect, terminate or retry personal Safari on a local timeout', async () => {
  vi.stubEnv('GITHUB_ACTIONS', '')

  await expect(runSafari(true)).rejects.toThrow('SafariDriver POST /session failed')

  expect(spawn).toHaveBeenCalledTimes(1)
  expect(readSafariProcesses).not.toHaveBeenCalled()
  expect(stopOwnedSafari).not.toHaveBeenCalled()
  expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(['--port', expect.any(String)])
})
