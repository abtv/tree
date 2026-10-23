export {}

declare global {
  type TreeIpcHandler = (...args: unknown[]) => unknown

  interface TreeIpcTestControl {
    get(channel: string): TreeIpcHandler | undefined
    wrap(channel: string, wrapper: (original: TreeIpcHandler, ...args: unknown[]) => unknown): void
  }

  var __treeIpc: TreeIpcTestControl
  var __treeArchiveWorkers: {
    /** Worker message types that are queued instead of delivered. */
    hold: string[]
    started: number
    held: Array<() => void>
    release(): void
  }
  var __treeDrainIpc: (() => Promise<void>) | undefined
  var __treeSharedTest:
    | {
        rejectDrain: boolean
        stallDrain: boolean
        boundsChangedAt: number
        pending: () => number
        errors: () => number
      }
    | undefined
}
