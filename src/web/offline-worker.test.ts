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
  it('keeps active metadata and serves navigation offline after an update download fails', async () => {
    const f = fixture()
    f.install('v1')
    await f.emit('install')
    await f.emit('activate')
    const activeFetch = f.handlers.get('fetch')!
    f.install('v2')
    f.scope.fetch.mockRejectedValue(new Error('offline'))

    await expect(f.emit('install')).rejects.toThrow('offline')

    const metadata = f.entries.get(`tree-offline-state:${base}`)!.get(`${base}__offline_state__`)!
    expect(await metadata.clone().json()).toMatchObject({ active: `${prefix}v1`, waiting: `${prefix}v1` })
    const respondWith = vi.fn()
    activeFetch({ request: { method: 'GET', url: `${base}?bookmark`, mode: 'navigate' }, respondWith })

    expect(await ((await respondWith.mock.calls[0]![0]) as Response).text()).toBe('file')
  })

  it('rejects a removed candidate even when the requesting runtime is retained', async () => {
    const f = fixture()
    f.install('v1')
    await f.emit('install')
    f.install('v2')
    await f.emit('install')
    f.entries.delete(`${prefix}v2`)
    const reply = { postMessage: vi.fn() }

    await f.emit('message', {
      data: { type: 'tree-activate-update', assets: [`${base}assets/app.js`] },
      source: { id: 'writer' },
      ports: [reply],
    })

    expect(reply.postMessage).toHaveBeenCalledExactlyOnceWith('superseded')
    expect(f.scope.skipWaiting).not.toHaveBeenCalled()
  })

  it('continues searching retained packages when an earlier cache lacks the requested asset', async () => {
    const f = fixture()
    f.install()
    await f.emit('install')
    f.entries.set(`${prefix}older`, new Map())
    f.entries.set(`${prefix}old`, new Map([[`${base}assets/lazy.js`, new Response('retained')]]))
    f.scope.fetch.mockRejectedValue(new Error('offline'))
    const respondWith = vi.fn()

    f.handlers.get('fetch')!({ request: new Request(`${base}assets/lazy.js`), respondWith })

    expect(await ((await respondWith.mock.calls[0]![0]) as Response).text()).toBe('retained')
  })

  it('ignores an empty message body before opening caches or checking clients', async () => {
    const f = fixture()
    f.install()
    const open = vi.spyOn(f.scope.caches, 'open')
    const reply = { postMessage: vi.fn() }

    await f.emit('message', { data: null, source: { id: 'writer' }, ports: [reply] })

    expect(open).not.toHaveBeenCalled()
    expect(f.scope.clients.matchAll).not.toHaveBeenCalled()
    expect(reply.postMessage).not.toHaveBeenCalled()
  })

  it.each(['partial-runtime', 'foreign-runtime'] as const)(
    'refuses activation when the complete requesting runtime exists only as %s',
    async (kind) => {
      const f = fixture()
      f.install()
      await f.emit('install')
      const assets = [`${base}assets/app.js`, `${base}assets/old-worker.js`]
      if (kind === 'foreign-runtime') {
        f.entries.set('another-app', new Map(assets.map((asset) => [asset, new Response('foreign')])))
      }
      const reply = { postMessage: vi.fn() }

      await f.emit('message', {
        data: { type: 'tree-activate-update', assets },
        source: { id: 'writer' },
        ports: [reply],
      })

      expect(reply.postMessage).toHaveBeenCalledExactlyOnceWith('superseded')
      expect(f.scope.skipWaiting).not.toHaveBeenCalled()
    },
  )

  it('activates for the scoped entry URL while ignoring windows from another application', async () => {
    const f = fixture()
    f.install()
    await f.emit('install')
    f.scope.clients.matchAll.mockResolvedValue([
      { id: 'writer', url: `${base}index.html?from=bookmark` },
      { id: 'other', url: 'https://tree.test/other/' },
    ])
    const reply = { postMessage: vi.fn() }

    await f.emit('message', {
      data: { type: 'tree-activate-update', assets: [`${base}assets/app.js`] },
      source: { id: 'writer' },
      ports: [reply],
    })

    expect(f.scope.clients.matchAll).toHaveBeenCalledExactlyOnceWith({ type: 'window', includeUncontrolled: true })
    expect(reply.postMessage).toHaveBeenCalledExactlyOnceWith('activating')
    expect(f.scope.skipWaiting).toHaveBeenCalledOnce()
  })

  it('serves a declared package file from cache for an ordinary fetch as well as navigation', async () => {
    const f = fixture()
    f.install()
    await f.emit('install')
    f.scope.fetch.mockClear()
    const respondWith = vi.fn()

    f.handlers.get('fetch')!({ request: new Request(`${base}index.html`), respondWith })

    const response = (await respondWith.mock.calls[0]![0]) as Response
    expect(await response.text()).toBe('file')
    expect(f.scope.fetch).not.toHaveBeenCalled()
  })

  it('preserves a newer installing generation when an older installation fails', async () => {
    const f = fixture()
    f.install('v1')
    await f.emit('install')
    await f.emit('activate')
    let failOld!: (error: Error) => void
    let finishNew!: (response: Response) => void
    f.scope.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((_resolve, reject) => {
          failOld = reject
        }),
    )
    f.install('v2')
    const old = f.emit('install')
    const rejected = expect(old).rejects.toThrow('old download failed')
    await vi.waitFor(() => expect(failOld).toBeDefined())
    f.scope.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishNew = resolve
        }),
    )
    f.install('v3')
    const newer = f.emit('install')
    await vi.waitFor(() => expect(finishNew).toBeDefined())

    failOld(new Error('old download failed'))
    await rejected

    const metadata = f.entries.get(`tree-offline-state:${base}`)!.get(`${base}__offline_state__`)!
    expect(await metadata.clone().json()).toMatchObject({ active: `${prefix}v1`, installing: `${prefix}v3` })
    expect(f.entries.has(`${prefix}v2`)).toBe(false)
    expect(f.entries.has(`${prefix}v3`)).toBe(true)

    finishNew(new Response('new file'))
    await newer
    expect(f.entries.get(`${prefix}v3`)!.has(`${base}assets/app.js`)).toBe(true)
  })

  it('accepts sixteen runtime assets and releases the lifecycle lock before activating', async () => {
    const f = fixture()
    f.install()
    await f.emit('install')
    const assets = Array.from({ length: 16 }, (_, i) => `${base}assets/chunk-${i}.js`)
    for (const asset of assets) f.entries.get(`${prefix}v1`)!.set(asset, new Response('asset'))
    let locked = false
    vi.spyOn(f.scope.locks, 'request').mockImplementation(async (_name, run) => {
      locked = true
      try {
        await run()
      } finally {
        locked = false
      }
    })
    f.scope.skipWaiting.mockImplementation(async () => {
      expect(locked).toBe(false)
    })
    const reply = { postMessage: vi.fn() }

    await f.emit('message', {
      data: { type: 'tree-activate-update', assets },
      source: { id: 'writer' },
      ports: [reply],
    })

    expect(f.scope.locks.request).toHaveBeenCalledExactlyOnceWith(`${prefix}lifecycle`, expect.any(Function))
    expect(f.scope.skipWaiting).toHaveBeenCalledOnce()
    expect(reply.postMessage).toHaveBeenCalledExactlyOnceWith('activating')
  })

  it.each(['missing-port', 'missing-id', 'unknown-message'] as const)(
    'ignores %s without cache or client operations',
    async (invalid) => {
      const f = fixture()
      f.install()
      const open = vi.spyOn(f.scope.caches, 'open')
      const reply = { postMessage: vi.fn() }

      await f.emit('message', {
        data: {
          type: invalid === 'unknown-message' ? 'unknown' : 'tree-offline-status',
          assets: [`${base}assets/app.js`],
        },
        source: invalid === 'missing-id' ? {} : { id: 'writer' },
        ports: invalid === 'missing-port' ? [] : [reply],
      })

      expect(open).not.toHaveBeenCalled()
      expect(reply.postMessage).not.toHaveBeenCalled()
      expect(f.scope.clients.matchAll).not.toHaveBeenCalled()
    },
  )

  it('serves the cached entry for index.html navigation with a query while ignoring nested routes', async () => {
    const f = fixture()
    f.install()
    await f.emit('install')
    const respondWith = vi.fn()

    f.handlers.get('fetch')!({
      request: { method: 'GET', url: `${base}index.html?from=bookmark`, mode: 'navigate' },
      respondWith,
    })
    const response = (await respondWith.mock.calls[0]![0]) as Response

    expect(await response.text()).toBe('file')
    respondWith.mockClear()
    f.handlers.get('fetch')!({ request: { method: 'GET', url: `${base}unrelated/`, mode: 'navigate' }, respondWith })
    expect(respondWith).not.toHaveBeenCalled()
  })

  it.each(['http-error', 'redirect'] as const)(
    'rejects an incomplete package after %s and retains the active version',
    async (failure) => {
      const f = fixture()
      f.install('v1')
      await f.emit('install')
      await f.emit('activate')
      f.install('v2')
      const response = new Response('bad', { status: failure === 'http-error' ? 503 : 200 })
      if (failure === 'redirect') Object.defineProperty(response, 'redirected', { value: true })
      f.scope.fetch.mockResolvedValueOnce(response)

      await expect(f.emit('install')).rejects.toThrow('Incomplete offline package')

      expect(f.entries.has(`${prefix}v1`)).toBe(true)
      expect(f.entries.has(`${prefix}v2`)).toBe(false)
      expect(f.scope.skipWaiting).not.toHaveBeenCalled()
    },
  )

  it.each([
    null,
    {},
    [],
    ['https://other.test/assets/app.js'],
    [`${base}assets/app.js`, 'https://other.test/assets/app.js'],
    [`${base}assets/app.js`, 42],
    [`${base}document.json`],
    [42],
    Array(17).fill(`${base}assets/app.js`),
  ])('ignores activation messages with invalid asset lists: %j', async (assets) => {
    const f = fixture()
    f.install()
    const reply = { postMessage: vi.fn() }

    await f.emit('message', {
      data: { type: 'tree-activate-update', assets },
      source: { id: 'writer' },
      ports: [reply],
    })

    expect(reply.postMessage).not.toHaveBeenCalled()
    expect(f.scope.clients.matchAll).not.toHaveBeenCalled()
    expect(f.scope.skipWaiting).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'reports offline readiness only when all requested assets are cached (complete=%s)',
    async (complete) => {
      const f = fixture()
      f.install()
      await f.emit('install')
      if (complete) f.entries.get(`${prefix}v1`)!.set(`${base}assets/style.css`, new Response('style'))
      const reply = { postMessage: vi.fn() }

      await f.emit('message', {
        data: { type: 'tree-offline-status', assets: [`${base}assets/app.js`, `${base}assets/style.css`] },
        source: { id: 'writer' },
        ports: [reply],
      })

      expect(reply.postMessage).toHaveBeenCalledExactlyOnceWith({ ready: complete })
      expect(f.scope.skipWaiting).not.toHaveBeenCalled()
      expect(f.scope.clients.claim).not.toHaveBeenCalled()
    },
  )

  it.each(['missing-candidate', 'missing-runtime', 'wrong-client', 'no-client'] as const)(
    'refuses activation for %s without claiming control',
    async (reason) => {
      const f = fixture()
      f.install()
      await f.emit('install')
      if (reason === 'missing-candidate') f.entries.delete(`${prefix}v1`)
      if (reason === 'missing-runtime') f.entries.get(`${prefix}v1`)!.delete(`${base}assets/app.js`)
      if (reason === 'wrong-client') f.scope.clients.matchAll.mockResolvedValue([{ id: 'other', url: base }])
      if (reason === 'no-client') f.scope.clients.matchAll.mockResolvedValue([])
      const reply = { postMessage: vi.fn() }

      await f.emit('message', {
        data: { type: 'tree-activate-update', assets: [`${base}assets/app.js`] },
        source: { id: 'writer' },
        ports: [reply],
      })

      expect(reply.postMessage).toHaveBeenCalledExactlyOnceWith(
        reason.startsWith('missing') ? 'superseded' : 'other-windows',
      )
      expect(f.scope.skipWaiting).not.toHaveBeenCalled()
      expect(f.scope.clients.claim).not.toHaveBeenCalled()
    },
  )

  it('fetches an uncached app asset from the network without consulting another application cache', async () => {
    const f = fixture()
    f.install()
    await f.emit('install')
    const request = new Request(`${base}assets/new.js`)
    f.entries.set('other-app', new Map([[request.url, new Response('unrelated')]]))
    f.scope.fetch.mockResolvedValueOnce(new Response('network'))
    const respondWith = vi.fn()

    f.handlers.get('fetch')!({ request, respondWith })
    const response = (await respondWith.mock.calls[0]![0]) as Response

    expect(await response.text()).toBe('network')
    expect(f.scope.fetch).toHaveBeenLastCalledWith(request)
  })

  it('requests integrity-checked files without HTTP cache and removes only a failed candidate', async () => {
    const f = fixture()
    f.entries.set(`${prefix}old`, new Map())
    f.install()
    f.scope.fetch.mockRejectedValueOnce(new Error('interrupted'))

    await expect(f.emit('install')).rejects.toThrow('interrupted')

    expect([...f.entries.keys()].filter((name) => name.startsWith(prefix))).toEqual([`${prefix}old`])
    expect(f.scope.fetch.mock.calls[0]![0]).toMatchObject({ cache: 'no-store', integrity: 'sha256-YQ==' })
    const metadata = f.entries.get(`tree-offline-state:${base}`)!.get(`${base}__offline_state__`)!
    expect(await metadata.clone().json()).toEqual({})
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
