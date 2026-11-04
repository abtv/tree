import { expect, it, vi } from 'vitest'
import { MenuCommands } from '../application/menu-commands'
import type { TreeApi, UpdateCommandsState } from '../shared/ipc'
import { installUpdateCommands } from './update-commands'

it('keeps live menu availability ahead of a stale initial read and disposes subscriptions', async () => {
  let notify!: (state: UpdateCommandsState) => void
  let resolve!: (state: UpdateCommandsState) => void
  const stop = vi.fn()
  const api = {
    getUpdateCommands: () =>
      new Promise<UpdateCommandsState>((done) => {
        resolve = done
      }),
    runUpdateCommand: vi.fn(async () => undefined),
    onUpdateCommandsChanged: (listener: typeof notify) => {
      notify = listener
      return stop
    },
  } as unknown as TreeApi
  const data = new MenuCommands()
  const source = installUpdateCommands(api, data, vi.fn())
  const changed = vi.fn()
  source.subscribe(changed)

  expect(source.getSnapshot().map((entry) => entry.enabled)).toEqual([false, false])
  notify({ 'check-for-updates': true, 'update-app': true })
  resolve({ 'check-for-updates': false, 'update-app': false })
  await Promise.resolve()

  expect(source.getSnapshot().map((entry) => entry.enabled)).toEqual([true, true])
  data.update([{ name: 'import-notes', enabled: true, run: vi.fn() }])
  expect(source.getSnapshot().map((entry) => entry.name)).toEqual(['import-notes', 'check-for-updates', 'update-app'])
  source.dispose()
  expect(stop).toHaveBeenCalledOnce()
  changed.mockClear()
  notify({ 'check-for-updates': false, 'update-app': false })
  expect(changed).not.toHaveBeenCalled()
})
