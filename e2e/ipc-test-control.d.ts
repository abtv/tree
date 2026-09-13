export {}

declare global {
  type TreeIpcHandler = (...args: unknown[]) => unknown

  interface TreeIpcTestControl {
    get(channel: string): TreeIpcHandler | undefined
    wrap(channel: string, wrapper: (original: TreeIpcHandler, ...args: unknown[]) => unknown): void
  }

  var __treeIpc: TreeIpcTestControl
}
