import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppUpdates } from './app-updates'

function harness() {
  const release = vi.fn()
  const ports = {
    check: vi.fn<() => Promise<void>>(async () => undefined),
    download: vi.fn<() => Promise<void>>(async () => undefined),
    install: vi.fn(),
    canInstall: vi.fn(() => true),
    prepareQuit: vi.fn(() => release),
    closeForInstall: vi.fn((install: () => void) => install()),
    requestSave: vi.fn(),
    finished: vi.fn(),
    changed: vi.fn(),
    progressChanged: vi.fn(),
    notifyCheck: vi.fn<(result: 'available' | 'ready' | 'current' | 'failed') => Promise<void>>(async () => undefined),
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
  it('publishes a replacement offer without downloading before consent', () => {
    const { updates, ports } = harness()
    updates.downloaded('1.2.4')
    const states: unknown[] = []
    ports.changed.mockImplementation(() => states.push([updates.isReady(), updates.getVersion(), updates.getStatus()]))

    updates.available('1.2.5')

    expect(states).toEqual([[false, undefined, 'available']])
    expect(ports.download).not.toHaveBeenCalled()
  })

  it('clears a previous failure as soon as a background check starts', async () => {
    const { updates, ports } = harness()
    ports.check.mockRejectedValueOnce(new Error('offline'))
    await updates.check()
    expect(updates.getStatus()).toBe('failed')
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
      download: ports.download,
      install: ports.install,
      canInstall: ports.canInstall,
      prepareQuit: ports.prepareQuit,
      closeForInstall: ports.closeForInstall,
      requestSave: ports.requestSave,
      finished: ports.finished,
      changed: ports.changed,
    })

    updates.available('1.2.4')
    const pending = updates.requestDownload()
    updates.downloading(42)
    expect(updates.getStatus()).toBe(42)
    await pending
    await updates.checkManually()

    expect(updates.getStatus()).toBe('ready')
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

  it('ignores progress without an explicitly started download', () => {
    const { updates } = harness()
    updates.downloading(42)

    updates.fail(null)

    expect(updates.getStatus()).toBeNull()
  })

  it('coalesces background checks while saving and staging and runs one if installation stops', async () => {
    vi.useFakeTimers()
    const { updates, ports, request } = harness()
    const id = request()

    await updates.check()
    updates.confirm(id, true)
    await updates.check()

    expect(ports.check).not.toHaveBeenCalled()
    expect(updates.isInstalling()).toBe(true)
    updates.fail(null)
    await Promise.resolve()
    expect(ports.check).toHaveBeenCalledOnce()
  })

  it('keeps same-version readiness and requires consent before downloading a different package', async () => {
    const { updates, ports } = harness()
    updates.downloaded('1.2.4')
    expect(updates.getVersion()).toBe('1.2.4')

    updates.available('1.2.4')
    expect(updates.getStatus()).toBe('ready')
    updates.available('1.2.5')
    expect(updates.getStatus()).toBe('available')
    expect(ports.download).not.toHaveBeenCalled()
    const pending = updates.requestDownload()
    updates.downloading(42)
    updates.request()

    expect(updates.isReady()).toBe(false)
    expect(updates.getVersion()).toBeUndefined()
    expect(updates.getStatus()).toBe(42)
    expect(ports.requestSave).not.toHaveBeenCalled()

    await pending
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
    updates.cancelBeforeNativeQuit()
  })
  it('checks the server again even when a package is already ready', async () => {
    const { updates, ports } = harness()
    updates.downloaded()

    await updates.checkManually()

    expect(ports.check).toHaveBeenCalledOnce()
  })

  it('does not offer to install a package withdrawn by a successful check', async () => {
    const { updates, ports } = harness()
    updates.downloaded('1.2.4')
    ports.check.mockImplementationOnce(async () => updates.notAvailable())

    await updates.checkManually()
    updates.request()

    expect(updates.getStatus()).toBeNull()
    expect(ports.notifyCheck).toHaveBeenCalledWith('current')
    expect(ports.requestSave).not.toHaveBeenCalled()
  })

  it('publishes a withdrawal of the failed download once', async () => {
    const { updates, ports } = harness()
    updates.available('1.2.4')
    ports.download.mockRejectedValueOnce(new Error('offline'))
    await updates.requestDownload()
    const changes: unknown[] = []
    ports.changed.mockImplementation(() => changes.push([updates.getStatus(), updates.getDownloadVersion()]))

    updates.notAvailable()
    updates.notAvailable()
    await updates.requestDownload()

    expect(changes).toEqual([[null, undefined]])
    expect(ports.download).toHaveBeenCalledOnce()
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
  it('publishes bounded whole percentages only for an active download', async () => {
    const { updates, ports } = harness()
    updates.available('1.2.4')
    const pending = updates.requestDownload()
    ports.changed.mockClear()
    for (let i = 0; i < 10000; i++) updates.downloading(i / 100)
    expect(ports.progressChanged).toHaveBeenCalledTimes(99)
    expect(ports.changed).not.toHaveBeenCalled()
    expect(updates.getStatus()).toBe(99)
    updates.downloading(Number.NaN)
    expect(updates.getStatus()).toBe(99)

    await pending
    updates.downloading(12)
    expect(updates.getStatus()).toBe('ready')
  })
  it('starts with no manual check or result notification in progress', () => {
    const { updates } = harness()

    expect(updates.isReady()).toBe(false)
    expect(updates.getVersion()).toBeUndefined()
    expect(updates.getStatus()).toBeNull()
    expect(updates.isChecking()).toBe(false)
    expect(updates.isNotifying()).toBe(false)
  })

  it('publishes the first whole percentage and bounds progress at both ends', async () => {
    const { updates, ports } = harness()

    updates.available('1.2.4')
    const pending = updates.requestDownload()

    expect(updates.getStatus()).toBe(0)
    updates.downloading(-1)
    expect(ports.progressChanged).not.toHaveBeenCalled()
    updates.downloading(100.9)
    expect(updates.getStatus()).toBe(100)
    updates.downloading(Infinity)
    expect(updates.getStatus()).toBe(100)
    expect(ports.progressChanged).toHaveBeenCalledOnce()
    await pending
  })

  it('preserves the offer after failure and does not retry without consent', async () => {
    const { updates, ports } = harness()
    updates.available('1.2.4')
    ports.download.mockRejectedValueOnce(new Error('offline'))

    await updates.requestDownload()
    updates.downloading(42)

    expect(updates.getStatus()).toBe('download-failed')
    expect(updates.getDownloadVersion()).toBe('1.2.4')
    expect(ports.progressChanged).not.toHaveBeenCalled()
    expect(ports.download).toHaveBeenCalledOnce()

    await updates.requestDownload()
    expect(ports.download).toHaveBeenCalledTimes(2)
    expect(updates.getStatus()).toBe('ready')
  })

  it('keeps the failed download visible through a queued check for the same version', async () => {
    const { updates, ports } = harness()
    let rejectDownload!: (error: Error) => void
    ports.download.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectDownload = reject
        }),
    )
    ports.check.mockImplementationOnce(async () => updates.available('1.2.4'))
    updates.available('1.2.4')

    const pending = updates.requestDownload()
    await updates.check('online')
    rejectDownload(new Error('offline'))
    await pending
    await vi.waitFor(() => expect(updates.isChecking()).toBe(false))

    expect(ports.download).toHaveBeenCalledOnce()
    expect(ports.check).toHaveBeenCalledOnce()
    expect(updates.getStatus()).toBe('download-failed')

    updates.available('1.2.5')
    expect(updates.getStatus()).toBe('available')
    updates.notAvailable()
    expect(updates.getStatus()).toBeNull()
  })

  // @requirement PRODUCT.md §26
  it('keeps the checked package pinned until the explicitly requested download has settled', async () => {
    const { updates, ports } = harness()
    let finish!: () => void
    const states: unknown[] = []
    let publishedBeforeDownload: unknown[] = []
    ports.download.mockImplementationOnce(() => {
      publishedBeforeDownload = [...states]
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    updates.available('1.2.4')

    await updates.checkManually()
    expect(ports.notifyCheck).toHaveBeenCalledWith('available')
    expect(ports.download).not.toHaveBeenCalled()
    ports.changed.mockImplementation(() => states.push([updates.getStatus(), updates.getDownloadVersion()]))
    const pending = updates.requestDownload()
    updates.downloaded('1.2.4')
    await updates.check('online')
    await updates.requestDownload()
    updates.request()

    expect(ports.check).toHaveBeenCalledOnce()
    expect(ports.download).toHaveBeenCalledOnce()
    expect(ports.requestSave).not.toHaveBeenCalled()
    expect(publishedBeforeDownload).toEqual([[0, '1.2.4']])
    expect(updates.getStatus()).toBe(0)

    finish()
    await pending
    expect(ports.check).toHaveBeenCalledTimes(2)
    expect(updates.getVersion()).toBe('1.2.4')
    expect(updates.getDownloadVersion()).toBeUndefined()
  })

  it('clears incomplete progress after a successful check with no ready package', async () => {
    const { updates, ports } = harness()
    ports.check.mockImplementationOnce(async () => updates.downloading(42))

    await updates.check()

    expect(updates.getStatus()).toBeNull()
    expect(updates.isReady()).toBe(false)
  })

  it('publishes waiting and notification states throughout a manual check', async () => {
    const { updates, ports } = harness()
    const states: string[] = []
    ports.changed.mockImplementation(() => states.push(`${updates.isChecking()}:${updates.isNotifying()}`))

    await updates.checkManually()

    expect([...new Set(states)]).toEqual(['true:false', 'true:true', 'false:false'])
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
    updates.cancelBeforeNativeQuit()

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
    await updates.check()
    await updates.check()
    expect(ports.check).toHaveBeenCalledOnce()
    expect(ports.requestSave).not.toHaveBeenCalled()
    expect(ports.notifyCheck).toHaveBeenCalledOnce()

    close()
    await pending
    await vi.waitFor(() => expect(updates.isChecking()).toBe(false))

    expect(ports.check).toHaveBeenCalledTimes(2)
    expect(updates.isChecking()).toBe(false)
    expect(updates.isNotifying()).toBe(false)
    updates.request()
    expect(ports.requestSave).toHaveBeenCalledOnce()
    updates.cancelBeforeNativeQuit()
  })

  it('clears save timers on cancellation and reports only the active request', () => {
    vi.useFakeTimers()
    const { updates, ports, request } = harness()
    updates.cancelBeforeNativeQuit()
    expect(ports.finished).not.toHaveBeenCalled()
    const stale = request()

    updates.cancelBeforeNativeQuit()

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

    expect(ports.finished).toHaveBeenLastCalledWith(
      'Update preparation took too long. Retry Restart and Install, or quit and reopen Tree.',
    )
    expect(release).not.toHaveBeenCalled()
    expect(updates.isApplying()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores manual checks while saving or staging an install', async () => {
    const { updates, ports, request } = harness()
    const id = request()
    await updates.checkManually()
    updates.confirm(id, true)
    await updates.checkManually()

    expect(ports.notifyCheck).not.toHaveBeenCalled()
    expect(ports.check).not.toHaveBeenCalled()
    expect(updates.isInstalling()).toBe(true)
    updates.cancelBeforeNativeQuit()
    expect(updates.isApplying()).toBe(false)
  })

  it('releases quit permission and reports a native install error once', () => {
    vi.useFakeTimers()
    const { updates, ports, release, request } = harness()
    ports.install.mockImplementationOnce(() => {
      updates.handOffToInstaller(() => {
        throw new Error('native failure')
      })
    })

    updates.confirm(request(), true)
    updates.fail('late error')

    expect(release).toHaveBeenCalledOnce()
    expect(ports.finished).toHaveBeenCalledExactlyOnceWith('Update failed. Try Restart and Install again.')
    expect(updates.getStatus()).toBe('ready')
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
    expect(ports.prepareQuit).not.toHaveBeenCalled()
    expect(ports.install).toHaveBeenCalledOnce()
    const quit = vi.fn()
    updates.handOffToInstaller(quit)
    updates.handOffToInstaller(quit)
    updates.cancelBeforeNativeQuit()
    expect(quit).toHaveBeenCalledOnce()
    expect(ports.prepareQuit).toHaveBeenCalledOnce()
    expect(updates.isInstalling()).toBe(true)
    updates.fail(null)
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
    expect(release).not.toHaveBeenCalled()
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
    updates.cancelBeforeNativeQuit()
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
    const duplicate = updates.check('online')

    expect(duplicate).toBe(pending)

    await Promise.resolve()
    expect(ports.check).toHaveBeenCalledOnce()
    finish()
    await pending
    await duplicate
    expect(ports.check).toHaveBeenCalledOnce()
    ports.check.mockRejectedValueOnce(new Error('offline'))
    await updates.check()
    await updates.check()
    expect(ports.check).toHaveBeenCalledTimes(3)
    updates.downloaded()
    await updates.check()
    expect(ports.check).toHaveBeenCalledTimes(4)
  })

  it('performs one reconnect check after an overlapping offline request fails', async () => {
    const { updates, ports } = harness()
    let fail!: (error: Error) => void
    ports.check.mockReturnValueOnce(
      new Promise<void>((_, reject) => {
        fail = reject
      }),
    )
    const first = updates.check()
    const duplicate = updates.check('online')
    updates.check('online')
    expect(duplicate).toBe(first)

    fail(new Error('previous connection lost'))
    await first

    await vi.waitFor(() => expect(ports.check).toHaveBeenCalledTimes(2))
    expect(ports.notifyCheck).not.toHaveBeenCalled()
  })

  it('reports a shared failed check without retrying when the connection has not changed', async () => {
    const { updates, ports } = harness()
    ports.check.mockRejectedValueOnce(new Error('offline'))

    await Promise.all([updates.check(), updates.checkManually()])

    expect(ports.check).toHaveBeenCalledOnce()
    expect(ports.notifyCheck).toHaveBeenCalledExactlyOnceWith('failed')
  })

  it('shows the failed manual result before retrying on a restored connection', async () => {
    const { updates, ports } = harness()
    ports.check.mockRejectedValueOnce(new Error('offline'))
    let close!: () => void
    ports.notifyCheck.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        close = resolve
      }),
    )

    const manual = updates.checkManually()
    await updates.check('online')
    await vi.waitFor(() => expect(ports.notifyCheck).toHaveBeenCalledExactlyOnceWith('failed'))
    expect(ports.check).toHaveBeenCalledOnce()

    close()
    await manual

    expect(ports.check).toHaveBeenCalledTimes(2)
    expect(ports.notifyCheck).toHaveBeenCalledOnce()
  })

  it('revokes quit permission if the native quit never completes', () => {
    vi.useFakeTimers()
    const { updates, request, release } = harness()
    updates.confirm(request(), true)
    updates.handOffToInstaller(vi.fn())
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
