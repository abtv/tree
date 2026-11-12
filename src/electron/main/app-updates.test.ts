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
    progressChanged: vi.fn(),
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
  it('publishes a replacement download before progress arrives', () => {
    const { updates, ports } = harness()
    updates.downloaded('1.2.4')
    const states: unknown[] = []
    ports.changed.mockImplementation(() => states.push([updates.isReady(), updates.getVersion(), updates.getStatus()]))

    updates.available()

    expect(states).toEqual([[false, undefined, 0]])
  })

  it('clears a previous failure as soon as a background check starts', async () => {
    const { updates, ports } = harness()
    updates.fail('offline')
    let finish!: () => void
    ports.check.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )

    const pending = updates.check()
    expect(updates.getStatus()).toBeNull()
    await Promise.resolve()
    finish()
    await pending
  })

  it('supports consumers without optional progress and result observers', async () => {
    const { ports } = harness()
    const updates = new AppUpdates({
      check: ports.check,
      install: ports.install,
      canInstall: ports.canInstall,
      prepareQuit: ports.prepareQuit,
      requestSave: ports.requestSave,
      finished: ports.finished,
      changed: ports.changed,
    })

    updates.downloading(42)
    await updates.checkManually()

    expect(updates.getStatus()).toBeNull()
    expect(updates.isChecking()).toBe(false)
    expect(updates.isNotifying()).toBe(false)
  })

  it('clears prior failures on retry and returns to ready after a failed save', () => {
    vi.useFakeTimers()
    const { updates, ports, request } = harness()
    const first = request()
    updates.fail('Saving failed.')
    expect(() => updates.confirm(first, true)).toThrow('Invalid update request.')

    updates.request()
    const retry = ports.requestSave.mock.lastCall![0] as string
    updates.confirm(retry, false)

    expect(updates.isApplying()).toBe(false)
    expect(updates.getStatus()).toBe('ready')
    expect(ports.finished).toHaveBeenLastCalledWith(null)
    expect(ports.install).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps neutral cancellation from turning an idle download into a failure', () => {
    const { updates } = harness()
    updates.downloading(42)

    updates.fail(null)

    expect(updates.getStatus()).toBeNull()
  })

  it('ignores direct background checks while saving and staging installation', async () => {
    vi.useFakeTimers()
    const { updates, ports, request } = harness()
    const id = request()

    await updates.check()
    updates.confirm(id, true)
    await updates.check()

    expect(ports.check).not.toHaveBeenCalled()
    expect(updates.isInstalling()).toBe(true)
    updates.fail(null)
  })

  it('replaces readiness before downloading another package and exposes its version only on completion', () => {
    const { updates, ports } = harness()
    updates.downloaded('1.2.4')
    expect(updates.getVersion()).toBe('1.2.4')

    updates.available()
    updates.downloading(42)
    updates.request()

    expect(updates.isReady()).toBe(false)
    expect(updates.getVersion()).toBeUndefined()
    expect(updates.getStatus()).toBe(42)
    expect(ports.requestSave).not.toHaveBeenCalled()

    updates.fail('offline')
    expect(updates.isReady()).toBe(false)
    expect(updates.getStatus()).toBe('failed')
    updates.available()
    expect(updates.getStatus()).toBe(0)
    updates.downloaded('1.2.5')
    expect(updates.getVersion()).toBe('1.2.5')
    expect(updates.getStatus()).toBe('ready')
  })

  it('blocks installation throughout a background recheck', async () => {
    const { updates, ports } = harness()
    updates.downloaded('1.2.4')
    let finish!: () => void
    ports.check.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const checking = updates.check()
    await Promise.resolve()

    updates.request()
    expect(ports.requestSave).not.toHaveBeenCalled()
    finish()
    await checking
    updates.request()
    expect(updates.getStatus()).toBe('installing')
    updates.cancelSaving()
  })
  it('checks the server again even when a package is already ready', async () => {
    const { updates, ports } = harness()
    updates.downloaded()

    await updates.checkManually()

    expect(ports.check).toHaveBeenCalledOnce()
  })

  it('reports a failed recheck instead of claiming the existing package is current', async () => {
    const { updates, ports } = harness()
    updates.downloaded('1.2.4')
    ports.check.mockRejectedValueOnce(new Error('offline'))

    await updates.checkManually()

    expect(ports.notifyCheck).toHaveBeenCalledWith('failed')
    expect(updates.isReady()).toBe(true)
    expect(updates.getVersion()).toBe('1.2.4')
    expect(updates.getStatus()).toBe('failed')
  })
  it('publishes bounded whole percentages and clears failed downloads', async () => {
    const { updates, ports } = harness()
    for (let i = 0; i < 10000; i++) updates.downloading(i / 100)
    expect(ports.progressChanged).toHaveBeenCalledTimes(100)
    expect(ports.changed).not.toHaveBeenCalled()
    expect(updates.getStatus()).toBe(99)
    updates.downloading(Number.NaN)
    expect(updates.getStatus()).toBe(99)

    updates.fail('offline')
    expect(updates.getStatus()).toBe('failed')
    ports.check.mockImplementationOnce(async () => {
      updates.downloading(42)
      throw new Error('offline')
    })
    await updates.check()
    expect(updates.getStatus()).toBe('failed')

    updates.downloaded()
    updates.downloading(12)
    expect(updates.getStatus()).toBe('ready')
  })
  it('starts with no manual check or result notification in progress', () => {
    const { updates } = harness()

    expect(updates.isChecking()).toBe(false)
    expect(updates.isNotifying()).toBe(false)
  })

  it('notifies menu observers when a background check starts and finishes', async () => {
    const { updates, ports } = harness()
    const states: boolean[] = []
    ports.changed.mockImplementation(() => states.push(updates.isChecking()))

    await updates.check()

    expect(states).toEqual([true, false])
  })

  it('restores command availability when the native result dialog fails', async () => {
    const { updates, ports } = harness()
    const failure = new Error('The native dialog is unavailable.')
    ports.notifyCheck.mockRejectedValueOnce(failure)

    await expect(updates.checkManually()).rejects.toBe(failure)

    expect(updates.isChecking()).toBe(false)
    expect(updates.isNotifying()).toBe(false)
    await updates.checkManually()
    expect(ports.notifyCheck).toHaveBeenCalledTimes(2)
    expect(ports.install).not.toHaveBeenCalled()
  })

  it('notifies command observers before requesting a save and after cancellation', () => {
    vi.useFakeTimers()
    const { updates, ports } = harness()
    updates.downloaded()
    const applying: boolean[] = []
    ports.changed.mockImplementation(() => applying.push(updates.isApplying()))
    ports.requestSave.mockImplementation(() => {
      expect(applying).toEqual([true])
    })

    updates.request()
    updates.cancelSaving()

    expect(applying).toEqual([true, false])
    expect(ports.install).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('exposes readiness and rejects an install while another data operation is busy', () => {
    const { updates, ports } = harness()
    expect(updates.isReady()).toBe(false)
    updates.downloaded()
    expect(updates.isReady()).toBe(true)
    expect(ports.changed).toHaveBeenCalledOnce()
    ports.canInstall.mockReturnValue(false)

    updates.request()

    expect(ports.requestSave).not.toHaveBeenCalled()
    expect(updates.isApplying()).toBe(false)
  })

  it('keeps update commands blocked until the manual result dialog closes', async () => {
    const { updates, ports } = harness()
    let close!: () => void
    ports.notifyCheck.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          close = resolve
        }),
    )
    updates.downloaded()
    const pending = updates.checkManually()
    await vi.waitFor(() => expect(ports.notifyCheck).toHaveBeenCalledOnce())

    expect(updates.isChecking()).toBe(true)
    expect(updates.isNotifying()).toBe(true)
    updates.request()
    await updates.checkManually()
    expect(ports.requestSave).not.toHaveBeenCalled()
    expect(ports.notifyCheck).toHaveBeenCalledOnce()

    close()
    await pending

    expect(updates.isChecking()).toBe(false)
    expect(updates.isNotifying()).toBe(false)
    updates.request()
    expect(ports.requestSave).toHaveBeenCalledOnce()
    updates.cancelSaving()
  })

  it('clears save timers on cancellation and reports only the active request', () => {
    vi.useFakeTimers()
    const { updates, ports, request } = harness()
    updates.cancelSaving()
    expect(ports.finished).not.toHaveBeenCalled()
    const stale = request()

    updates.cancelSaving()

    expect(ports.finished).toHaveBeenCalledExactlyOnceWith(null)
    expect(vi.getTimerCount()).toBe(0)
    expect(() => updates.confirm(stale, true)).toThrow('Invalid update request.')
  })

  it('reports the exact save and native staging deadlines and allows retry', () => {
    vi.useFakeTimers()
    const { updates, ports, release, request } = harness()
    request()
    vi.advanceTimersByTime(14_999)
    expect(updates.isApplying()).toBe(true)
    expect(ports.finished).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(ports.finished).toHaveBeenLastCalledWith('Saving took too long. Try Restart and Install again.')

    updates.confirm(request(), true)
    vi.advanceTimersByTime(59_999)
    expect(release).not.toHaveBeenCalled()
    expect(updates.isInstalling()).toBe(true)
    vi.advanceTimersByTime(1)

    expect(ports.finished).toHaveBeenLastCalledWith('Update preparation took too long. Try Restart and Install again.')
    expect(release).toHaveBeenCalledOnce()
    expect(updates.isApplying()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores manual checks while saving or staging an install', async () => {
    const { updates, ports, request } = harness()
    const id = request()
    await updates.checkManually()
    updates.confirm(id, true)
    await updates.checkManually()
    updates.cancelSaving()

    expect(ports.notifyCheck).not.toHaveBeenCalled()
    expect(ports.check).not.toHaveBeenCalled()
    expect(updates.isInstalling()).toBe(true)
    updates.fail(null)
  })

  it('releases quit permission and reports a native install error once', () => {
    vi.useFakeTimers()
    const { updates, ports, release, request } = harness()
    ports.install.mockImplementationOnce(() => {
      throw new Error('native failure')
    })

    updates.confirm(request(), true)
    updates.fail('late error')

    expect(release).toHaveBeenCalledOnce()
    expect(ports.finished).toHaveBeenCalledExactlyOnceWith('Update failed. Try Restart and Install again.')
    expect(vi.getTimerCount()).toBe(0)
  })

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

    expect(duplicate).toBe(pending)

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
    expect(ports.check).toHaveBeenCalledTimes(4)
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
    expect(ports.check).toHaveBeenCalledTimes(3)
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
