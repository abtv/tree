import type { TreeApi } from '../shared/ipc'

declare global {
  interface Window {
    treeApi: TreeApi
  }
}

export {}
