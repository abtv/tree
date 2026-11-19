// @vitest-environment jsdom
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { startAppUpdates } from './app-updates'
import { createRendererInputLock } from './renderer-input-lock'
import type { TreeApi } from '../shared/ipc'
import type { RendererLifecycleStore } from './lifecycle'

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
    flushPersistence: vi.fn<RendererLifecycleStore['flushPersistence']>(async () => {
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
  onTestFinished(cleanup)

  request('update-1')
  expect(store.flushPersistence).toHaveBeenCalledWith({
    cancelImageRecognition: true,
    sealEditsUntil: expect.any(AbortSignal),
  })
  const seal = store.flushPersistence.mock.lastCall![0]!.sealEditsUntil!
  expect(document.getElementById('root')!.inert).toBe(true)
  expect(confirm).not.toHaveBeenCalled()
  resolve()
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith('update-1', !fail))
  expect(store.requestQuitWithoutSavingPrompt).not.toHaveBeenCalled()

  finished(null)
  expect(seal.aborted).toBe(true)
  expect(document.getElementById('root')!.inert).toBe(false)
  cleanup()
})

it('keeps input sealed until overlapping quit and update requests both release it', () => {
  document.body.innerHTML = '<div id="root"><input></div>'
  const root = document.getElementById('root')!
  const input = root.querySelector('input')!
  input.focus()
  const acquire = createRendererInputLock(root)

  const quit = acquire()
  const update = acquire()
  quit()
  quit()

  expect(root.inert).toBe(true)
  expect(window.dispatchEvent(new Event('paste', { cancelable: true }))).toBe(false)
  update()
  expect(root.inert).toBe(false)
  expect(input).toBe(document.activeElement)
  expect(window.dispatchEvent(new Event('paste', { cancelable: true }))).toBe(true)
})

function deferred(): { promise: Promise<void>; resolve(): void; reject(error: Error): void } {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function updateHarness() {
  let request!: (id: string) => void
  let finished!: (message: string | null) => void
  const store = {
    initialize: vi.fn(),
    requestQuitWithoutSavingPrompt: vi.fn(),
    reportError: vi.fn(),
    flushPersistence: vi.fn<() => Promise<void>>().mockResolvedValue(),
  }
  const confirm = vi.fn<(id: string, saved: boolean) => Promise<void>>().mockResolvedValue()
  const removeRequest = vi.fn()
  const removeFinished = vi.fn()
  const api = {
    onAppUpdateRequested: (listener: typeof request) => {
      request = listener
      return removeRequest
    },
    onAppUpdateFinished: (listener: typeof finished) => {
      finished = listener
      return removeFinished
    },
    confirmAppUpdate: confirm,
  } as unknown as TreeApi
  const cleanup = startAppUpdates(store, api)
  onTestFinished(cleanup)
  return { store, confirm, request, finished, cleanup, removeRequest, removeFinished }
}

it.each(['resolve', 'reject'] as const)('ignores an earlier negative acknowledgment that later %ss', async (ending) => {
  document.body.innerHTML = '<div id="root"><input id="first"><input id="retry"></div>'
  const first = document.getElementById('first')!
  const retry = document.getElementById('retry')!
  const root = document.getElementById('root')!
  const oldConfirmation = deferred()
  const retrySave = deferred()
  const h = updateHarness()
  const saveError = new Error('first save failed')
  h.store.flushPersistence.mockRejectedValueOnce(saveError).mockReturnValueOnce(retrySave.promise)
  h.confirm.mockImplementation(async (_id, saved) => {
    if (!saved) await oldConfirmation.promise
  })
  first.focus()

  h.request('first')
  await vi.waitFor(() => expect(h.confirm).toHaveBeenCalledWith('first', false))
  h.finished(null)
  retry.focus()
  h.request('retry')
  h.request('duplicate')

  expect(h.store.flushPersistence).toHaveBeenCalledTimes(2)
  expect(root.inert).toBe(true)

  if (ending === 'reject') oldConfirmation.reject(new Error('old acknowledgment failed'))
  else oldConfirmation.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(root.inert).toBe(true)
  const blocked = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
  window.dispatchEvent(blocked)
  expect(blocked.defaultPrevented).toBe(true)
  expect(h.store.reportError.mock.calls).toEqual([[saveError]])

  retrySave.resolve()
  await vi.waitFor(() => expect(h.confirm).toHaveBeenCalledWith('retry', true))
  h.finished(null)

  expect(root.inert).toBe(false)
  expect(document.activeElement).toBe(retry)
  const unblocked = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
  window.dispatchEvent(unblocked)
  expect(unblocked.defaultPrevented).toBe(false)
})

it('disposal retires a pending acknowledgment without unlocking a replacement owner', async () => {
  document.body.innerHTML = '<div id="root"><input></div>'
  const root = document.getElementById('root')!
  const oldConfirmation = deferred()
  const old = updateHarness()
  old.store.flushPersistence.mockRejectedValueOnce(new Error('save failed'))
  old.confirm.mockReturnValueOnce(oldConfirmation.promise)

  old.request('old')
  await vi.waitFor(() => expect(old.confirm).toHaveBeenCalledWith('old', false))
  old.cleanup()

  expect(old.removeRequest).toHaveBeenCalledOnce()
  expect(old.removeFinished).toHaveBeenCalledOnce()

  const replacement = updateHarness()
  const save = deferred()
  replacement.store.flushPersistence.mockReturnValueOnce(save.promise)
  replacement.request('replacement')
  oldConfirmation.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(root.inert).toBe(true)

  save.resolve()
  await vi.waitFor(() => expect(replacement.confirm).toHaveBeenCalledWith('replacement', true))
  replacement.finished(null)

  expect(root.inert).toBe(false)
})

it.each(['resolve', 'reject'] as const)('ignores a timed-out save that later %ss during a retry', async (ending) => {
  document.body.innerHTML = '<div id="root"></div>'
  const save = deferred()
  const h = updateHarness()
  h.store.flushPersistence.mockReturnValueOnce(save.promise)

  h.request('timed-out')
  h.finished('Saving took too long.')
  h.request('retry')
  await vi.waitFor(() => expect(h.confirm).toHaveBeenCalledWith('retry', true))

  if (ending === 'reject') save.reject(new Error('old save failed'))
  else save.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(document.getElementById('root')!.inert).toBe(true)
  expect(h.confirm).toHaveBeenCalledTimes(1)
  expect(h.store.reportError.mock.calls).toEqual([[new Error('Saving took too long.')]])

  h.finished(null)

  expect(document.getElementById('root')!.inert).toBe(false)
})

it('releases a failed current acknowledgment when its original focus target was removed', async () => {
  document.body.innerHTML = '<div id="root"><input></div>'
  const input = document.querySelector('input')!
  const h = updateHarness()
  const confirmation = deferred()
  const saveError = new Error('save failed')
  const confirmationError = new Error('acknowledgment failed')
  h.store.flushPersistence.mockRejectedValueOnce(saveError)
  h.confirm.mockReturnValueOnce(confirmation.promise)
  input.focus()

  h.request('current')
  await vi.waitFor(() => expect(h.confirm).toHaveBeenCalledWith('current', false))
  input.remove()
  confirmation.reject(confirmationError)
  await vi.waitFor(() => expect(document.getElementById('root')!.inert).toBe(false))

  expect(h.store.reportError.mock.calls).toEqual([[saveError], [confirmationError]])
  const event = new Event('beforeinput', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})
