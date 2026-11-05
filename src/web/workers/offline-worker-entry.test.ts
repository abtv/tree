import { afterEach, expect, it, vi } from 'vitest'
import type { OfflineScope } from '../offline-worker'

const install = vi.hoisted(() => vi.fn())
vi.mock('../offline-worker', () => ({ installOfflineWorker: install }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('connects the service worker lifecycle to its actual global ports and packaged manifest', async () => {
  vi.resetModules()
  const scope = {
    registration: { scope: 'https://tree.example/app/' },
    clients: { claim: vi.fn(), matchAll: vi.fn() },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: vi.fn(),
  }
  const caches = { open: vi.fn() }
  const locks = { request: vi.fn() }
  const response = new Response('asset')
  const fetch = vi.fn(async () => response)
  const files = [{ path: 'index.html', integrity: 'sha256-package' }]
  vi.stubGlobal('self', scope)
  vi.stubGlobal('caches', caches)
  vi.stubGlobal('navigator', { locks })
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('__OFFLINE_VERSION__', 'package-version')
  vi.stubGlobal('__OFFLINE_FILES__', files)

  await import('./offline.worker')

  expect(install).toHaveBeenCalledExactlyOnceWith(expect.any(Object), 'package-version', files)
  const adapter = install.mock.calls[0]![0] as OfflineScope
  expect(adapter.registration).toBe(scope.registration)
  expect(adapter.clients).toBe(scope.clients)
  expect(adapter.caches).toBe(caches)
  expect(adapter.locks).toBe(locks)
  const handler = vi.fn()
  adapter.addEventListener('install', handler)
  expect(scope.addEventListener).toHaveBeenCalledExactlyOnceWith('install', handler)
  expect(scope.addEventListener.mock.contexts).toEqual([scope])
  const request = new Request('https://tree.example/app/index.html')
  await expect(adapter.fetch(request)).resolves.toBe(response)
  expect(fetch).toHaveBeenCalledExactlyOnceWith(request)
  await expect(adapter.skipWaiting()).resolves.toBeUndefined()
  expect(scope.skipWaiting).toHaveBeenCalledExactlyOnceWith()
  expect(scope.skipWaiting.mock.contexts).toEqual([scope])

  const failure = new Error('worker activation failed')
  scope.skipWaiting.mockRejectedValueOnce(failure)
  await expect(adapter.skipWaiting()).rejects.toBe(failure)
})
