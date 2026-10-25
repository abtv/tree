import { describe, expect, it, vi } from 'vitest'
import { installOfflineWorker, type OfflineScope } from './offline-worker'

const base = 'https://tree.test/app/'
const prefix = `tree-offline:${base}:`

function fixture() {
  const entries = new Map<string, Map<string, Response>>()
  const handlers = new Map<string, (event: unknown) => void>()
  const key = (request: RequestInfo | URL) =>
    typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
  const caches = {
    keys: async () => [...entries.keys()],
    delete: vi.fn(async (name: string) => entries.delete(name)),
    open: async (name: string) => {
      if (!entries.has(name)) entries.set(name, new Map())
      return {
        put: async (request: Request, response: Response) => {
          entries.get(name)!.set(key(request), response)
        },
        match: async (request: RequestInfo) => entries.get(name)!.get(key(request))?.clone(),
      }
    },
  }
  const scope = {
    registration: { scope: base },
    caches,
    locks: { request: async (_name: string, run: () => Promise<void>) => run() },
    clients: { matchAll: vi.fn(async () => [{ id: 'writer', url: base }]), claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(async () => {}),
    fetch: vi.fn<(request: Request) => Promise<Response>>(async () => new Response('file')),
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers.set(name, handler)
    },
  }
  const install = (version = 'v1') =>
    installOfflineWorker(scope as unknown as OfflineScope, version, [
      { path: 'index.html', integrity: 'sha256-YQ==' },
      { path: 'assets/app.js', integrity: 'sha256-Yg==' },
    ])
  const emit = async (type: string, data: Record<string, unknown> = {}) => {
    let pending: Promise<unknown> | undefined
    handlers.get(type)!({
      ...data,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise
      },
    })
    await pending
  }
  return { scope, entries, install, emit, handlers }
}

describe('offline package lifecycle', () => {
  it('requests integrity-checked files without HTTP cache and removes only a failed candidate', async () => {
    const f = fixture()
    f.entries.set(`${prefix}old`, new Map())
    f.install()
    f.scope.fetch.mockRejectedValueOnce(new Error('interrupted'))

    await expect(f.emit('install')).rejects.toThrow('interrupted')

    expect([...f.entries.keys()].filter((name) => name.startsWith(prefix))).toEqual([`${prefix}old`])
    expect(f.scope.fetch.mock.calls[0]![0]).toMatchObject({ cache: 'no-store', integrity: 'sha256-YQ==' })
    expect(f.scope.skipWaiting).not.toHaveBeenCalled()
  })

  it('keeps at most the active and previous complete versions without touching other apps', async () => {
    const f = fixture()
    f.entries.set('other-app', new Map())
    for (const version of ['v1', 'v2', 'v3', 'v4']) {
      f.install(version)
      await f.emit('install')
      await f.emit('activate')
    }

    expect([...f.entries.keys()].filter((name) => name.startsWith(prefix))).toEqual([`${prefix}v3`, `${prefix}v4`])
    expect(f.entries.has('other-app')).toBe(true)
    expect(f.scope.clients.claim).toHaveBeenCalledOnce()
  })

  it('requires the sole scoped window to request activation over a reply port', async () => {
    const f = fixture()
    const reply = { postMessage: vi.fn() }
    f.install()
    await f.emit('install')
    const request = { type: 'tree-activate-update', assets: [`${base}assets/app.js`] }

    await f.emit('message', { data: 'unrelated', source: { id: 'writer' }, ports: [reply] })
    await f.emit('message', { data: request, source: null, ports: [reply] })
    f.scope.clients.matchAll.mockResolvedValue([
      { id: 'writer', url: base },
      { id: 'blocked', url: base },
    ])
    await f.emit('message', { data: request, source: { id: 'writer' }, ports: [reply] })

    expect(reply.postMessage).toHaveBeenLastCalledWith('other-windows')
    expect(f.scope.skipWaiting).not.toHaveBeenCalled()

    f.scope.clients.matchAll.mockResolvedValue([
      { id: 'writer', url: base },
      { id: 'unrelated', url: 'https://tree.test/elsewhere/' },
    ])
    await f.emit('message', { data: request, source: { id: 'writer' }, ports: [reply] })

    expect(reply.postMessage).toHaveBeenLastCalledWith('activating')
    expect(f.scope.skipWaiting).toHaveBeenCalledOnce()
  })

  it('serves current and previous assets offline but does not intercept unrelated requests', async () => {
    const f = fixture()
    f.install()
    await f.emit('install')
    f.entries.set(`${prefix}old`, new Map([[`${base}assets/old.js`, new Response('old worker')]]))
    const fetch = async (request: Partial<Request>) => {
      const respondWith = vi.fn()
      f.handlers.get('fetch')!({ request: { method: 'GET', ...request }, respondWith })
      return respondWith.mock.calls[0]?.[0] as Promise<Response> | undefined
    }

    expect(await (await fetch({ url: `${base}?query`, mode: 'navigate' }))?.text()).toBe('file')
    expect(await (await fetch({ url: `${base}assets/old.js` }))?.text()).toBe('old worker')
    expect(await fetch({ url: `${base}sw.js` })).toBeUndefined()
    expect(await fetch({ url: 'https://other.test/assets/app.js' })).toBeUndefined()
    expect(await fetch({ url: `${base}assets/app.js`, method: 'POST' })).toBeUndefined()
  })

  it('bounds waiting generations and preserves the actual old page across repeated activation attempts', async () => {
    const f = fixture()
    f.install('v1')
    await f.emit('install')
    await f.emit('activate')
    f.entries.get(`${prefix}v1`)!.set(`${base}assets/old-entry.js`, new Response('old page'))

    for (const version of ['v2', 'v3', 'v4', 'v5']) {
      f.install(version)
      await f.emit('install')
    }

    expect([...f.entries.keys()].filter((name) => name.startsWith(prefix))).toEqual([
      `${prefix}v1`,
      `${prefix}v4`,
      `${prefix}v5`,
    ])

    const request = { type: 'tree-activate-update', assets: [`${base}assets/old-entry.js`] }
    const reply = { postMessage: vi.fn() }
    await f.emit('message', { data: request, source: { id: 'writer' }, ports: [reply] })
    await f.emit('activate')
    f.install('v6')
    await f.emit('install')
    await f.emit('message', { data: request, source: { id: 'writer' }, ports: [reply] })
    await f.emit('activate')

    expect([...f.entries.keys()].filter((name) => name.startsWith(prefix))).toEqual([`${prefix}v1`, `${prefix}v6`])
    expect(f.scope.clients.claim).toHaveBeenCalledOnce()
  })

  it('does not remove a newer in-flight installation when a ready update activates', async () => {
    const f = fixture()
    f.install('v1')
    await f.emit('install')
    await f.emit('activate')
    f.install('v2')
    await f.emit('install')
    const activateReady = f.handlers.get('activate')!
    let finish!: (response: Response) => void
    f.scope.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    f.install('v3')
    const installation = f.emit('install')
    await vi.waitFor(() => expect(finish).toBeDefined())
    let activation!: Promise<unknown>
    activateReady({
      waitUntil: (promise: Promise<unknown>) => {
        activation = promise
      },
    })
    await activation

    expect(f.entries.has(`${prefix}v3`)).toBe(true)

    finish(new Response('file'))
    await installation

    expect(f.entries.get(`${prefix}v3`)!.has(`${base}index.html`)).toBe(true)
    expect(f.entries.get(`${prefix}v3`)!.has(`${base}assets/app.js`)).toBe(true)
  })
})
