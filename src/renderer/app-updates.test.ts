// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { startAppUpdates } from './app-updates'
import type { TreeApi } from '../shared/ipc'

afterEach(() => {
  document.body.innerHTML = ''
})

it.each([false, true])('flushes before acknowledging an update and restores input on failure (%s)', async (fail) => {
  document.body.innerHTML = '<div id="root"></div>'
  let request!: (id: string) => void
  let finished!: (message: string | null) => void
  let resolve!: () => void
  const gate = new Promise<void>((done) => {
    resolve = done
  })
  const store = {
    initialize: vi.fn(),
    requestQuitWithoutSavingPrompt: vi.fn(),
    reportError: vi.fn(),
    flushPersistence: vi.fn(async () => {
      await gate
      if (fail) throw new Error('save failed')
    }),
  }
  const confirm = vi.fn(async () => undefined)
  const api = {
    onAppUpdateRequested: (listener: typeof request) => {
      request = listener
      return vi.fn()
    },
    onAppUpdateFinished: (listener: typeof finished) => {
      finished = listener
      return vi.fn()
    },
    confirmAppUpdate: confirm,
  } as unknown as TreeApi
  const cleanup = startAppUpdates(store, api)

  request('update-1')
  expect(document.getElementById('root')!.inert).toBe(true)
  expect(confirm).not.toHaveBeenCalled()
  resolve()
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith('update-1', !fail))
  expect(store.requestQuitWithoutSavingPrompt).not.toHaveBeenCalled()

  finished(null)
  expect(document.getElementById('root')!.inert).toBe(false)
  cleanup()
})
