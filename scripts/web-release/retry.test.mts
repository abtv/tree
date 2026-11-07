import { afterEach, expect, it, vi } from 'vitest'
import { api } from './github.mts'
import { advanceReference } from './retry.mts'
import type { ApiError, ApiOptions } from './types.mts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it.each([500, 502, 503, 504])('bounds retries for HTTP %i to four total requests', async (status) => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status })))
  vi.stubGlobal('fetch', fetch)

  const result = api('/repos/abtv/tree/git/ref/heads/main').catch((error) => error)
  await vi.runAllTimersAsync()

  expect(await result).toMatchObject({ status })
  expect(fetch).toHaveBeenCalledTimes(4)
})

it.each([401, 403, 404, 409, 422, 429])('does not retry HTTP %i', async (status) => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status }))
  vi.stubGlobal('fetch', fetch)

  await expect(api('/repos/abtv/tree/git/ref/heads/main')).rejects.toMatchObject({ status })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each(['PUT', 'PATCH', 'DELETE', 'POST'])('does not blindly replay %s on a mutable resource', async (method) => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }))
  vi.stubGlobal('fetch', fetch)

  await expect(api('/repos/abtv/tree/git/refs', { method })).rejects.toMatchObject({ status: 500 })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('honors Retry-After and refuses delays beyond the retry budget', async () => {
  vi.useFakeTimers()
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'Retry-After': '5' } }))
    .mockResolvedValueOnce(new Response('{}'))
  vi.stubGlobal('fetch', fetch)

  const result = api('/repos/abtv/tree/git/ref/heads/main')
  await vi.advanceTimersByTimeAsync(4999)
  expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await result
  expect(fetch).toHaveBeenCalledTimes(2)

  fetch.mockReset().mockResolvedValue(new Response('{}', { status: 503, headers: { 'Retry-After': '61' } }))
  await expect(api('/repos/abtv/tree/git/ref/heads/main')).rejects.toMatchObject({ status: 503 })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('retries fetch connection loss but not malformed successful JSON', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(new Response('{}'))
  vi.stubGlobal('fetch', fetch)

  const result = api('/repos/abtv/tree/git/ref/heads/main')
  await vi.runAllTimersAsync()
  await expect(result).resolves.toEqual({})
  expect(fetch).toHaveBeenCalledTimes(2)

  fetch.mockReset().mockResolvedValue(new Response('invalid JSON'))
  await expect(api('/repos/abtv/tree/git/ref/heads/main')).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it.each(['applied', 'unchanged', 'concurrent', 'unreadable'])(
  'reconciles a lost branch update response when the head is %s',
  async (state) => {
    vi.useFakeTimers()
    let patches = 0
    let reads = 0
    const request = vi.fn(async (_path: string, options: ApiOptions = {}) => {
      if (options.method === 'PATCH') {
        expect(options).toMatchObject({ token: 'target', body: { sha: 'next', force: false } })
        patches++
        if (patches > 1) return {}
      } else {
        reads++
        if (state === 'unreadable') {
          const error: ApiError = new Error('unavailable')
          error.status = 503
          throw error
        }
        return { object: { sha: state === 'applied' ? 'next' : state === 'unchanged' ? 'base' : 'other' } }
      }
      const error: ApiError = new Error('lost response')
      error.status = 500
      throw error
    })

    const result = advanceReference('/repos/tree-editor/tree-editor.github.io', 'base', 'next', request, 'target').then(
      () => 'success',
      (error) => error.message,
    )
    await vi.runAllTimersAsync()

    expect(await result).toBe(
      state === 'concurrent'
        ? 'Hosting branch changed during publication; publication stopped'
        : state === 'unreadable'
          ? 'unavailable'
          : 'success',
    )
    expect(patches).toBe(state === 'unchanged' ? 2 : 1)
    expect(reads).toBeGreaterThan(0)
  },
)

it.each(['blobs', 'trees', 'commits'])(
  'retries Git %s creation without changing its bytes or authorization',
  async (kind) => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{"sha":"blob"}'))
    vi.stubGlobal('fetch', fetch)

    const result = expect(
      api(`/repos/tree-editor/tree-editor.github.io/git/${kind}`, {
        method: 'POST',
        token: 'secret',
        body: { content: 'YQ==', encoding: 'base64' },
      }),
    ).resolves.toEqual({ sha: 'blob' })
    await vi.runAllTimersAsync()

    await result
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1])
  },
)
