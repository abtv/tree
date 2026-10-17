import { describe, expect, it, vi } from 'vitest'
import { assertWorkflowWriteDenied } from './permission-check.mjs'

const root = '/repos/tree-editor/tree-editor.github.io'
const manifest = { sourceRunId: '123', sourceRunAttempt: 2 }
describe('actual publisher workflow permission boundary', () => {
  it('proves Contents write through branch creation and requires workflow write rejection, then cleans up', async () => {
    const request = vi.fn(async (path, options) => {
      if (options.method === 'PUT') {
        const error = new Error('Workflows permission denied')
        error.status = 403
        throw error
      }
    })
    await expect(
      assertWorkflowWriteDenied(root, 'a'.repeat(40), manifest, { request, token: 'secret' }),
    ).resolves.toBeUndefined()
    expect(request.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'PUT', 'DELETE'])
    const creation = request.mock.calls[0][1].body
    expect(creation.ref).toBe('refs/heads/tree-publisher-permission-probe-123-2')
    expect(creation.sha).toBe('a'.repeat(40))
    expect(request.mock.calls[1][1].body.branch).not.toBe('main')
    const workflow = Buffer.from(request.mock.calls[1][1].body.content, 'base64').toString()
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
        if (options.method === 'PUT') {
          const error = new Error('denied')
          error.status = 404
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
})
