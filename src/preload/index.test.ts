import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '../shared/ipc'

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(() => Promise.resolve()),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}))

describe('preload bridge', () => {
  beforeAll(async () => {
    await import('../preload/index')
  })

  beforeEach(() => {
    mocks.invoke.mockClear()
  })

  it('forwards the quit handshake request ID to the main process', async () => {
    const { treeApi } = await import('../preload/index')

    await treeApi.quit('request-1')

    expect(mocks.invoke).toHaveBeenCalledWith(ipcChannels.quit, 'request-1')
  })
})
