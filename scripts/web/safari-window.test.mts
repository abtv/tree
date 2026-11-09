import { expect, it, vi } from 'vitest'
import { waitForSafariWindow, SafariDriverError } from './safari-window.mts'

it('reselects the same live window when Safari loses its selected context during opening', async () => {
  const missing = new SafariDriverError('no such window', '')
  const select = vi.fn().mockResolvedValue(undefined)
  const ready = vi.fn().mockRejectedValueOnce(missing).mockResolvedValue(true)
  const handles = vi.fn().mockResolvedValue(['launcher', 'application'])

  await waitForSafariWindow('application', { select, ready, handles }, AbortSignal.timeout(1000))

  expect(select.mock.calls).toEqual([['application'], ['application']])
  expect(handles).toHaveBeenCalledOnce()
  expect(ready).toHaveBeenCalledTimes(2)
})

it('fails if the application window actually disappeared', async () => {
  const missing = new SafariDriverError('no such window', '')
  const select = vi.fn().mockResolvedValue(undefined)
  const ready = vi.fn().mockRejectedValue(missing)
  const handles = vi.fn().mockResolvedValue(['launcher'])

  await expect(waitForSafariWindow('application', { select, ready, handles }, AbortSignal.timeout(1000))).rejects.toBe(
    missing,
  )

  expect(select).toHaveBeenCalledOnce()
})

it('does not swallow other driver or application failures', async () => {
  const failure = new SafariDriverError('javascript error', 'Application failed')
  const select = vi.fn().mockResolvedValue(undefined)
  const ready = vi.fn().mockRejectedValue(failure)
  const handles = vi.fn()

  await expect(waitForSafariWindow('application', { select, ready, handles }, AbortSignal.timeout(1000))).rejects.toBe(
    failure,
  )

  expect(handles).not.toHaveBeenCalled()
})

it('bounds repeated missing-context failures by cancellation', async () => {
  const missing = new SafariDriverError('no such window', '')
  const select = vi.fn().mockRejectedValue(missing)
  const ready = vi.fn()
  const handles = vi.fn().mockResolvedValue(['launcher', 'application'])
  const controller = new AbortController()
  handles.mockImplementation(async () => {
    controller.abort()
    return ['launcher', 'application']
  })

  await expect(waitForSafariWindow('application', { select, ready, handles }, controller.signal)).rejects.toThrow()

  expect(select).toHaveBeenCalledOnce()
  expect(ready).not.toHaveBeenCalled()
})

it('waits for application readiness and fails after the opening deadline', async () => {
  const select = vi.fn().mockResolvedValue(undefined)
  const ready = vi.fn().mockResolvedValue(false)
  const handles = vi.fn()
  const now = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(15_001)

  try {
    await expect(
      waitForSafariWindow('application', { select, ready, handles }, AbortSignal.timeout(1000)),
    ).rejects.toThrow('did not become ready within 15000ms')

    expect(ready).toHaveBeenCalledOnce()
    expect(handles).not.toHaveBeenCalled()
  } finally {
    now.mockRestore()
  }
})
