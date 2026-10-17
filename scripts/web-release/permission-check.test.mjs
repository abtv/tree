import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertWorkflowWriteDenied } from './permission-check.mjs'
import { api } from './github.mjs'

const root = '/repos/tree-editor/tree-editor.github.io'
const manifest = { sourceRunId: '123', sourceRunAttempt: 2 }
describe('actual publisher workflow permission boundary', () => {
  afterEach(() => vi.unstubAllGlobals())
  it.each([
    ['Resource not accessible by integration', true],
    ['API rate limit exceeded', false],
    ['You have exceeded a secondary rate limit', false],
    ['Forbidden', false],
  ])('checks the complete API/probe contract for %s', async (message, accepted) => {
    const fetch = vi.fn(async (url, options) => {
      if (options.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.includes('/contents/.github/workflows/')) {
        return new Response(JSON.stringify({ message }), { status: 403 })
      }
      return new Response('{}', { status: 201 })
    })
    vi.stubGlobal('fetch', fetch)
    const result = assertWorkflowWriteDenied(root, 'a'.repeat(40), manifest, { request: api, token: 'secret' })
    if (accepted) await expect(result).resolves.toBeUndefined()
    else await expect(result).rejects.toThrow('GitHub API PUT failed (403)')
    expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'PUT', 'PUT', 'DELETE'])
    expect(fetch.mock.calls.every(([, options]) => options.headers.Authorization === 'Bearer secret')).toBe(true)
  })
  it.each([403, 404])('rejects an unrelated HTTP %s instead of treating it as permission proof', async (status) => {
    const request = vi.fn(async (path) => {
      if (path.includes('/contents/.github/workflows/')) {
        const error = new Error('Unrelated API failure')
        error.status = status
        throw error
      }
    })
    await expect(
      assertWorkflowWriteDenied(root, 'a'.repeat(40), manifest, { request, token: 'secret' }),
    ).rejects.toThrow('Unrelated API failure')
    expect(request.mock.calls.at(-1)[1].method).toBe('DELETE')
  })
  it('proves ordinary Contents write and requires workflow write rejection on the same branch, then cleans up', async () => {
    const request = vi.fn(async (path) => {
      if (path.includes('/contents/.github/workflows/')) {
        const error = new Error('Workflows permission denied')
        error.status = 403
        error.workflowWriteDenied = true
        throw error
      }
    })
    await expect(
      assertWorkflowWriteDenied(root, 'a'.repeat(40), manifest, { request, token: 'secret' }),
    ).resolves.toBeUndefined()
    expect(request.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'PUT', 'PUT', 'DELETE'])
    const creation = request.mock.calls[0][1].body
    expect(creation.ref).toBe('refs/heads/tree-publisher-permission-probe-123-2')
    expect(creation.sha).toBe('a'.repeat(40))
    expect(request.mock.calls[1][1].body.branch).not.toBe('main')
    expect(request.mock.calls[1][0]).toBe(`${root}/contents/tree-publisher-permission-probe.txt`)
    expect(request.mock.calls[2][1].body.branch).toBe(request.mock.calls[1][1].body.branch)
    const workflow = Buffer.from(request.mock.calls[2][1].body.content, 'base64').toString()
    expect(workflow).toContain('on: workflow_dispatch')
    expect(workflow).not.toContain('push:')
    expect(request.mock.calls.at(-1)[0]).toBe(`${root}/git/refs/heads/tree-publisher-permission-probe-123-2`)
  })

  it('refuses an overprivileged token and still removes only its probe branch', async () => {
    const request = vi.fn(async () => undefined)
    await expect(
      assertWorkflowWriteDenied(root, 'a'.repeat(40), manifest, { request, token: 'secret' }),
    ).rejects.toThrow('can write workflows')
    expect(request.mock.calls.at(-1)[1].method).toBe('DELETE')
    expect(request.mock.calls.every(([path]) => !path.endsWith('/refs/heads/main'))).toBe(true)
  })

  it('does not accept arbitrary API errors or hide cleanup failures', async () => {
    for (const stage of ['create', 'write', 'cleanup']) {
      const request = vi.fn(async (path, options) => {
        if (
          stage === 'create' ||
          (stage === 'write' && options.method === 'PUT') ||
          (stage === 'cleanup' && options.method === 'DELETE')
        )
          throw new Error('API unavailable')
        if (path.includes('/contents/.github/workflows/')) {
          const error = new Error('denied')
          error.status = 403
          error.workflowWriteDenied = true
          throw error
        }
      })
      await expect(
        assertWorkflowWriteDenied(root, 'a'.repeat(40), manifest, { request, token: 'secret' }),
      ).rejects.toThrow('API unavailable')
      if (stage === 'create') expect(request).toHaveBeenCalledOnce()
      else expect(request.mock.calls.at(-1)[1].method).toBe('DELETE')
    }
  })

  it('rejects a failed ordinary Contents write even with a permission-denial response', async () => {
    const request = vi.fn(async (path, options) => {
      if (options.method === 'PUT') {
        const error = new Error('Contents write denied')
        error.status = 403
        error.workflowWriteDenied = true
        throw error
      }
    })
    await expect(
      assertWorkflowWriteDenied(root, 'a'.repeat(40), manifest, { request, token: 'secret' }),
    ).rejects.toThrow('Contents write denied')
    expect(request.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'PUT', 'DELETE'])
    expect(request.mock.calls.some(([path]) => path.includes('/contents/.github/workflows/'))).toBe(false)
  })
})
