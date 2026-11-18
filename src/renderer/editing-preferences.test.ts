import { expect, it, vi } from 'vitest'
import { BooleanPreference } from './editing-preferences'

it('retains a newer choice even when it equals the default and the initial reply differs', async () => {
  const preference = new BooleanPreference(false)
  const listener = vi.fn()
  const unsubscribe = preference.subscribe(listener)
  let changed!: (value: boolean) => void
  const disposeNative = vi.fn()
  const source = preference.observe(
    async () => true,
    (notify) => {
      changed = notify
      return disposeNative
    },
  )

  changed(false)
  await source.ready

  expect(preference.getSnapshot()).toBe(false)
  expect(listener).not.toHaveBeenCalled()
  changed(true)
  expect(listener).toHaveBeenCalledOnce()
  unsubscribe()
  source.dispose()
  expect(disposeNative).toHaveBeenCalledOnce()
})

it('discards stale reads and errors after disposal or a local change', async () => {
  const preference = new BooleanPreference(false)
  const error = new Error('unavailable')
  const report = vi.fn()
  const stale = preference.observe(async () => true)
  stale.dispose()
  await stale.ready
  expect(preference.getSnapshot()).toBe(false)

  const failed = preference.observe(
    async () => {
      throw error
    },
    undefined,
    report,
  )
  preference.set(true)
  await failed.ready
  expect(report).not.toHaveBeenCalled()

  const current = preference.observe(
    async () => {
      throw error
    },
    undefined,
    report,
  )
  await current.ready
  expect(report).toHaveBeenCalledExactlyOnceWith(error)
  expect(preference.getSnapshot()).toBe(true)
})
