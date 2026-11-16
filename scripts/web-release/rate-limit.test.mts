import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from './github.mts'
import { advanceReference } from './retry.mts'

const now = Date.parse('2026-11-16T00:00:00Z')
const path = '/repos/tree-editor/tree-editor.github.io/git/ref/heads/main'
const secret = 'response-details-must-not-be-logged'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each([
  [403, { 'retry-after': '3' }, secret, 3000],
  [429, { 'retry-after': new Date(now + 4000).toUTCString() }, secret, 4000],
  [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 65) }, secret, 65000],
  [
    403,
    { 'retry-after': '2', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 5) },
    secret,
    5000,
  ],
  [429, {}, secret, 60000],
  [403, {}, `API rate limit exceeded for 203.0.113.1. ${secret}`, 60000],
  [403, {}, `You have exceeded a secondary rate limit. ${secret}`, 60000],
] as const)('waits before retrying a rate-limited HTTP %i read', async (status, headers, message, delay) => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ message }), { status, headers }))
    .mockResolvedValueOnce(new Response('{"object":{"sha":"next"}}'))
  vi.stubGlobal('fetch', fetch)

  const result = api(path, { token: 'source-token' }).catch((error) => error)
  await vi.advanceTimersByTimeAsync(delay - 1)

  expect(fetch).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(1)

  expect(await result).toEqual({ object: { sha: 'next' } })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1])
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret)
})

it('bounds repeated short rate limits to four attempts with increasing delays', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response('{}', { status: 429, headers: { 'retry-after': '3' } })))
  vi.stubGlobal('fetch', fetch)

  const result = api(path).catch((error) => error)
  await vi.runAllTimersAsync()

  expect(await result).toMatchObject({ status: 429 })
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(Date.now() - now).toBe(21000)
})

it('bounds accumulated waiting even when each individual delay fits the budget', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response('{}', { status: 429, headers: { 'retry-after': '20' } })))
  vi.stubGlobal('fetch', fetch)

  const result = api(path).catch((error) => error)
  await vi.runAllTimersAsync()

  expect(await result).toMatchObject({ status: 429 })
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(Date.now() - now).toBe(60000)
})

it('stops repeated secondary limits within the waiting budget and identifies the cause', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(secret, { status: 429 })))
  vi.stubGlobal('fetch', fetch)

  const result = api(path).catch((error) => error)
  await vi.runAllTimersAsync()

  expect(await result).toMatchObject({ status: 429, message: expect.stringContaining('rate limit') })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(Date.now() - now).toBe(60000)
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret)
})

it.each([
  { 'retry-after': '91' },
  { 'retry-after': secret },
  { 'retry-after': '-1' },
  { 'retry-after': '' },
  { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 3600) },
  { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': secret },
  { 'x-ratelimit-remaining': '0' },
])('does not shorten excessive or invalid rate-limit waits: %j', async (headers) => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 403, headers })))
  vi.stubGlobal('fetch', fetch)

  const result = api(path).catch((error) => error)
  await vi.runAllTimersAsync()

  expect(await result).toMatchObject({ status: 403 })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(console.error).not.toHaveBeenCalled()
})

it.each(['Resource not accessible by integration', secret])(
  'does not retry an ordinary access denial',
  async (message) => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ message }), { status: 403 })))
    vi.stubGlobal('fetch', fetch)

    const result = api(path).catch((error) => error)
    await vi.runAllTimersAsync()

    expect(await result).toMatchObject({ status: 403, message: 'GitHub API GET failed (403)' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  },
)

it.each(['PUT', 'PATCH', 'DELETE', 'POST'])('does not replay a rate-limited mutable %s request', async (method) => {
  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response('{}', { status: 403, headers: { 'retry-after': '3' } })))
  vi.stubGlobal('fetch', fetch)

  await expect(api('/repos/abtv/tree/git/refs', { method })).rejects.toMatchObject({ status: 403 })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('does not treat a rate limit as proof that workflow writes are forbidden', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response('{"message":"Resource not accessible by integration"}', {
      status: 403,
      headers: { 'retry-after': '3' },
    }),
  )
  vi.stubGlobal('fetch', fetch)

  await expect(api('/repos/abtv/tree/contents/.github/workflows/probe.yml', { method: 'PUT' })).rejects.toMatchObject({
    status: 403,
    rateLimited: true,
    workflowWriteDenied: false,
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('waits before reconciling a rate-limited branch update', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '3' } }))
    .mockResolvedValueOnce(new Response('{"object":{"sha":"base"}}'))
    .mockResolvedValueOnce(new Response('{}'))
  vi.stubGlobal('fetch', fetch)

  const result = advanceReference('/repos/tree-editor/tree-editor.github.io', 'base', 'next', api, 'target').catch(
    (error) => error,
  )
  await vi.advanceTimersByTimeAsync(2999)

  expect(fetch).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(1)

  expect(await result).toBeUndefined()
  expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual(['PATCH', 'GET', 'PATCH'])
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[2])
})
