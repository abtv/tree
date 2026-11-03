import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppUpdates } from './app-updates'

function harness() {
  const release = vi.fn()
  const ports = {
    check: vi.fn<() => Promise<void>>(async () => undefined),
    install: vi.fn(),
    canInstall: vi.fn(() => true),
    prepareQuit: vi.fn(() => release),
    requestSave: vi.fn(),
    finished: vi.fn(),
    changed: vi.fn(),
    notifyCheck: vi.fn<(result: 'ready' | 'current' | 'failed') => Promise<void>>(async () => undefined),
  }
  const updates = new AppUpdates(ports)
  const request = () => {
    updates.downloaded()
    updates.request()
    return ports.requestSave.mock.lastCall![0] as string
  }
  return { updates, ports, release, request }
}

afterEach(() => vi.useRealTimers())

describe('desktop app updates', () => {
  it('requires downloaded readiness and a matching successful save before installing once', () => {
    const { updates, ports, request } = harness()
    updates.request()
    expect(ports.requestSave).not.toHaveBeenCalled()

    const id = request()
    updates.request()
    expect(ports.requestSave).toHaveBeenCalledOnce()
    expect(ports.install).not.toHaveBeenCalled()
    expect(() => updates.confirm('stale', true)).toThrow('Invalid update request')

    updates.confirm(id, true)
    expect(ports.prepareQuit).toHaveBeenCalledOnce()
    expect(ports.install).toHaveBeenCalledOnce()
  })

  it('keeps editing and normal quit safe after a save failure, timeout, or install error', () => {
    vi.useFakeTimers()
    const { updates, ports, release, request } = harness()
    updates.confirm(request(), false)
    expect(ports.install).not.toHaveBeenCalled()
    const stale = request()
    vi.advanceTimersByTime(15_000)
    expect(updates.isApplying()).toBe(false)
    expect(() => updates.confirm(stale, true)).toThrow()

    ports.install.mockImplementationOnce(() => {
      throw new Error('native failure')
    })
    updates.confirm(request(), true)
    expect(release).toHaveBeenCalledOnce()
    expect(updates.isApplying()).toBe(false)

    updates.confirm(request(), true)
    expect(ports.install).toHaveBeenCalledTimes(2)
  })

  it('rechecks data-operation availability after saving and cancels stale requests', () => {
    const { updates, ports, request } = harness()
    const id = request()
    ports.canInstall.mockReturnValue(false)
    updates.confirm(id, true)
    expect(ports.install).not.toHaveBeenCalled()

    ports.canInstall.mockReturnValue(true)
    request()
    updates.cancelSaving()
    expect(updates.isApplying()).toBe(false)
  })

  it('coalesces concurrent checks and retries a failed check', async () => {
    const { updates, ports } = harness()
    let finish!: () => void
    ports.check.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const pending = updates.check()
    const duplicate = updates.check()
    await Promise.resolve()
    expect(ports.check).toHaveBeenCalledOnce()
    finish()
    await pending
    await duplicate
    ports.check.mockRejectedValueOnce(new Error('offline'))
    await updates.check()
    await updates.check()
    expect(ports.check).toHaveBeenCalledTimes(3)
    updates.downloaded()
    await updates.check()
    expect(ports.check).toHaveBeenCalledTimes(3)
  })

  it('revokes quit permission if native staging never responds', () => {
    vi.useFakeTimers()
    const { updates, request, release } = harness()
    updates.confirm(request(), true)
    expect(updates.isInstalling()).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(updates.isInstalling()).toBe(false)
    expect(release).toHaveBeenCalledOnce()
  })

  it('reports manual results and retries after a failed check without installing', async () => {
    const { updates, ports } = harness()
    ports.check.mockRejectedValueOnce(new Error('offline'))
    await updates.checkManually()
    expect(ports.notifyCheck).toHaveBeenLastCalledWith('failed')
    await updates.checkManually()
    expect(ports.notifyCheck).toHaveBeenLastCalledWith('current')
    updates.downloaded()
    await updates.checkManually()
    expect(ports.notifyCheck).toHaveBeenLastCalledWith('ready')
    expect(ports.check).toHaveBeenCalledTimes(2)
    expect(ports.install).not.toHaveBeenCalled()
  })

  it('joins a background check and suppresses duplicate result dialogs', async () => {
    const { updates, ports } = harness()
    let finish!: () => void
    ports.check.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const background = updates.check()
    const manual = updates.checkManually()
    await updates.checkManually()
    expect(updates.isChecking()).toBe(true)
    expect(ports.notifyCheck).not.toHaveBeenCalled()
    finish()
    await background
    await manual
    expect(ports.check).toHaveBeenCalledOnce()
    expect(ports.notifyCheck).toHaveBeenCalledExactlyOnceWith('current')
    expect(updates.isChecking()).toBe(false)
  })
})
