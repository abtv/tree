import { installOfflineWorker, type OfflineFile, type OfflineScope } from '../offline-worker'

declare const __OFFLINE_VERSION__: string
declare const __OFFLINE_FILES__: OfflineFile[]

const scope = self as unknown as OfflineScope
installOfflineWorker(
  {
    registration: scope.registration,
    caches,
    locks: navigator.locks,
    clients: scope.clients,
    skipWaiting: () => scope.skipWaiting(),
    fetch: (request) => fetch(request),
    addEventListener: scope.addEventListener.bind(self),
  },
  __OFFLINE_VERSION__,
  __OFFLINE_FILES__,
)
