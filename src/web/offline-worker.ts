export interface OfflineFile {
  path: string
  integrity: string
}

interface LifetimeEvent extends Event {
  waitUntil(promise: Promise<unknown>): void
}
interface WorkerMessageEvent extends LifetimeEvent {
  data: unknown
  source: { id?: string } | null
  ports: readonly MessagePort[]
}
interface WorkerFetchEvent extends LifetimeEvent {
  request: Request
  respondWith(response: Promise<Response>): void
}
export interface OfflineScope {
  registration: { scope: string }
  caches: CacheStorage
  locks: Pick<LockManager, 'request'>
  clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: true }): Promise<{ id: string; url: string }[]>
    claim(): Promise<void>
  }
  skipWaiting(): Promise<void>
  fetch(request: Request): Promise<Response>
  addEventListener(type: 'install' | 'activate', handler: (event: LifetimeEvent) => void): void
  addEventListener(type: 'message', handler: (event: WorkerMessageEvent) => void): void
  addEventListener(type: 'fetch', handler: (event: WorkerFetchEvent) => void): void
}

/** Only app files enter these caches. Notes and images remain in IndexedDB. */
export function installOfflineWorker(scope: OfflineScope, version: string, files: readonly OfflineFile[]) {
  const base = scope.registration.scope
  const prefix = `tree-offline:${base}:`
  const cacheName = `${prefix}${version}`
  const url = (path: string) => new URL(path, base).href
  const paths = new Set(files.map((file) => url(file.path)))
  const metadataName = `tree-offline-state:${base}`
  const metadataKey = url('__offline_state__')
  type State = {
    active?: string | undefined
    runtime?: string | undefined
    waiting?: string | undefined
    installing?: string | undefined
  }
  const readState = async (): Promise<State> => {
    const response = await (await scope.caches.open(metadataName)).match(metadataKey)
    return response ? response.json() : {}
  }
  const writeState = async (state: State) => {
    await (await scope.caches.open(metadataName)).put(metadataKey, new Response(JSON.stringify(state)))
  }
  const prune = async (keep: (string | undefined)[]) => {
    for (const name of await scope.caches.keys()) {
      if (name.startsWith(prefix) && !keep.includes(name)) await scope.caches.delete(name)
    }
  }
  const exclusive = (run: () => Promise<void>) => scope.locks.request(`${prefix}lifecycle`, run)

  scope.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        let cache!: Cache
        try {
          await exclusive(async () => {
            cache = await scope.caches.open(cacheName)
            await writeState({ ...(await readState()), installing: cacheName })
          })
          // Sequential fetches bound temporary memory to one package file.
          for (const file of files) {
            const request = new Request(url(file.path), { cache: 'no-store', integrity: file.integrity })
            const response = await scope.fetch(request)
            if (!response.ok || response.redirected) throw new Error('Incomplete offline package')
            await cache.put(request, response)
          }
          await exclusive(async () => {
            const state = await readState()
            // Also retain the previous waiting worker: it can be entering automatic activation
            // while this installation completes. The next transition removes that extra package.
            await prune([state.active, state.runtime, state.waiting, cacheName])
            await writeState({ ...state, waiting: cacheName, installing: undefined })
          })
        } catch (error) {
          await exclusive(async () => {
            await scope.caches.delete(cacheName)
            const state = await readState()
            if (state.installing === cacheName) await writeState({ ...state, installing: undefined })
          })
          throw error
        }
      })(),
    )
  })

  scope.addEventListener('activate', (event) => {
    event.waitUntil(
      exclusive(async () => {
        const state = await readState()
        const first = state.active === undefined
        const next = state.active === cacheName ? state : { ...state, active: cacheName, runtime: state.active }
        await writeState(next)
        await prune([next.active, next.runtime, next.waiting, next.installing])
        // Initial setup must control the open page so unused workers can also load offline.
        // Updates never claim other windows; skipWaiting changes the existing controller itself.
        if (first) await scope.clients.claim()
      }),
    )
  })

  scope.addEventListener('message', (event) => {
    const message = event.data as { type?: unknown; assets?: unknown } | null
    if (
      (message?.type !== 'tree-activate-update' && message?.type !== 'tree-offline-status') ||
      !Array.isArray(message.assets) ||
      !message.assets.length ||
      message.assets.length > 16 ||
      !message.assets.every((asset: unknown) => typeof asset === 'string' && asset.startsWith(url('assets/'))) ||
      !event.source?.id ||
      !event.ports[0]
    )
      return
    const assets = message.assets as string[]
    const requester = event.source.id
    const reply = event.ports[0]
    if (message.type === 'tree-offline-status') {
      event.waitUntil(
        (async () => {
          const cache = await scope.caches.open(cacheName)
          reply.postMessage({ ready: (await Promise.all(assets.map((asset) => cache.match(asset)))).every(Boolean) })
        })(),
      )
      return
    }
    let activate = false
    event.waitUntil(
      exclusive(async () => {
        const clients = (await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter((client) =>
          client.url.startsWith(base),
        )
        if (clients.length !== 1 || clients[0]!.id !== requester) {
          reply.postMessage('other-windows')
          return
        }
        const names = await scope.caches.keys()
        if (!names.includes(cacheName)) {
          reply.postMessage('superseded')
          return
        }
        // Preserve the actual requesting runtime, including after an earlier activation timeout.
        let runtime: string | undefined
        for (const name of names) {
          if (!name.startsWith(prefix)) continue
          const cache = await scope.caches.open(name)
          if ((await Promise.all(assets.map((asset) => cache.match(asset)))).every(Boolean)) {
            runtime = name
            break
          }
        }
        if (!runtime) {
          reply.postMessage('superseded')
          return
        }
        await writeState({ ...(await readState()), active: cacheName, runtime })
        activate = true
      }).then(async () => {
        // Activation acquires this lock too; never await it while holding the lock.
        if (activate) {
          await scope.skipWaiting()
          reply.postMessage('activating')
        }
      }),
    )
  })

  scope.addEventListener('fetch', (event) => {
    const request = event.request
    const requested = new URL(request.url)
    if (request.method !== 'GET' || !request.url.startsWith(base)) return
    const navigation =
      request.mode === 'navigate' &&
      (requested.pathname === new URL(base).pathname || requested.pathname === new URL('index.html', base).pathname)
    if (!navigation && !paths.has(request.url) && !request.url.startsWith(url('assets/'))) return
    event.respondWith(
      (async () => {
        const key = navigation ? url('index.html') : request.url
        const current = await scope.caches.open(cacheName)
        const cached = await current.match(key)
        if (cached) return cached
        // A page from the previous release can still request its hashed worker or lazy chunk.
        for (const name of await scope.caches.keys()) {
          if (!name.startsWith(prefix) || name === cacheName) continue
          const old = await (await scope.caches.open(name)).match(key)
          if (old) return old
        }
        return scope.fetch(request)
      })(),
    )
  })
}
