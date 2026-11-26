import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppUpdates } from './app-updates'
import { NativeUpdateInstaller, type NativeUpdateResult } from './native-update-installer'

const results: NativeUpdateResult[] = ['downloaded', 'not-available', 'error']
const failures: NativeUpdateResult[] = ['not-available', 'error']
const FAILED = 'Update failed. Try Restart and Install again.'
const TIMED_OUT = 'Update preparation took too long. Retry Restart and Install, or quit and reopen Tree.'

afterEach(() => vi.useRealTimers())

/** An installer with a stand-in attempt whose save stays acknowledged until the attempt fails. */
function harness() {
  const state = { version: '1.2.4' as string | undefined, saved: true }
  const native = { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() }
  const attempt = {
    getVersion: () => state.version,
    isInstalling: () => state.saved,
    handOffToInstaller: vi.fn((quitAndInstall: () => void) => quitAndInstall()),
    fail: vi.fn<(message: string) => void>(() => {
      state.saved = false
    }),
  }
  const installer = new NativeUpdateInstaller(native, attempt)
  return { installer, native, attempt, state }
}

function handedOff() {
  const f = harness()
  f.installer.install()
  f.installer.nativeFinished('downloaded')
  return f
}

describe('native update installer transitions', () => {
  it.each(results)('ignores a native %s result while no operation is outstanding', (result) => {
    const { installer, native, attempt } = harness()

    installer.nativeFinished(result)

    expect(attempt.fail).not.toHaveBeenCalled()
    expect(attempt.handOffToInstaller).not.toHaveBeenCalled()
    installer.install()
    expect(native.checkForUpdates).toHaveBeenCalledOnce()
    expect(native.quitAndInstall).not.toHaveBeenCalled()
  })

  it('hands the staged package to the attempt that started staging', () => {
    const { installer, native, attempt } = harness()

    installer.install()
    expect(native.quitAndInstall).not.toHaveBeenCalled()
    installer.nativeFinished('downloaded')

    expect(attempt.handOffToInstaller).toHaveBeenCalledOnce()
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
    expect(native.checkForUpdates).toHaveBeenCalledOnce()
    expect(attempt.fail).not.toHaveBeenCalled()
  })

  it.each(failures)('fails the attempt that started staging after a native %s result', (result) => {
    const { installer, native, attempt } = harness()
    installer.install()

    installer.nativeFinished(result)

    expect(attempt.fail).toHaveBeenCalledExactlyOnceWith(FAILED)
    expect(native.checkForUpdates).toHaveBeenCalledOnce()
    expect(native.quitAndInstall).not.toHaveBeenCalled()
  })

  it('keeps a package staged after its attempt ended for the next attempt of that version', () => {
    const { installer, native, attempt, state } = harness()
    installer.install()
    state.saved = false

    installer.nativeFinished('downloaded')

    expect(attempt.handOffToInstaller).not.toHaveBeenCalled()
    expect(attempt.fail).not.toHaveBeenCalled()
    state.saved = true
    installer.install()
    expect(native.checkForUpdates).toHaveBeenCalledOnce()
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
  })

  it.each(failures)('stages again after a %s result that reached no attempt', (result) => {
    const { installer, native, attempt, state } = harness()
    installer.install()
    state.saved = false

    installer.nativeFinished(result)

    expect(attempt.fail).not.toHaveBeenCalled()
    state.saved = true
    installer.install()
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(native.quitAndInstall).not.toHaveBeenCalled()
  })

  it.each([
    ['downloaded', '1.2.4', 1, 1],
    ['downloaded', '1.2.5', 2, 0],
    ['not-available', '1.2.4', 2, 0],
    ['not-available', '1.2.5', 2, 0],
    ['error', '1.2.4', 2, 0],
    ['error', '1.2.5', 2, 0],
  ] as const)(
    'after a late %s result, a saved retry for %s has %i staging call(s) and %i handoff(s)',
    (result, version, stagings, handoffs) => {
      const { installer, native, attempt, state } = harness()
      installer.install()
      state.version = version
      installer.install()
      expect(native.checkForUpdates).toHaveBeenCalledOnce()

      installer.nativeFinished(result)

      expect(native.checkForUpdates).toHaveBeenCalledTimes(stagings)
      expect(native.quitAndInstall).toHaveBeenCalledTimes(handoffs)
      expect(attempt.fail).not.toHaveBeenCalled()
    },
  )

  it('installs a newer version only after its own staging completes', () => {
    const { installer, native, state } = harness()
    installer.install()
    state.version = '1.2.5'
    installer.install()
    installer.nativeFinished('downloaded')
    expect(native.quitAndInstall).not.toHaveBeenCalled()

    installer.nativeFinished('downloaded')

    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
  })

  it.each(['downloaded', 'not-available'] as const)(
    'keeps a handed-off installation outstanding after a native %s result',
    (result) => {
      const { installer, native, attempt } = handedOff()

      installer.nativeFinished(result)
      installer.install()

      expect(attempt.fail).not.toHaveBeenCalled()
      expect(native.checkForUpdates).toHaveBeenCalledOnce()
      expect(native.quitAndInstall).toHaveBeenCalledOnce()
    },
  )

  it('fails the handed-off attempt and discards its staging after an installer error', () => {
    const { installer, native, attempt, state } = handedOff()

    installer.nativeFinished('error')

    expect(attempt.fail).toHaveBeenCalledExactlyOnceWith(FAILED)
    state.saved = true
    installer.install()
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
  })

  it.each(['1.2.4', '1.2.5'])('stages %s for a saved retry only after the previous installation fails', (version) => {
    const { installer, native, attempt, state } = handedOff()
    state.version = version
    installer.install()
    expect(native.checkForUpdates).toHaveBeenCalledOnce()

    installer.nativeFinished('error')

    expect(attempt.fail).not.toHaveBeenCalled()
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('hands off a package that native staging reports before it returns', () => {
    const { installer, native, attempt } = harness()
    native.checkForUpdates.mockImplementationOnce(() => installer.nativeFinished('downloaded'))

    installer.install()

    expect(attempt.handOffToInstaller).toHaveBeenCalledOnce()
    expect(native.checkForUpdates).toHaveBeenCalledOnce()
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
    expect(attempt.fail).not.toHaveBeenCalled()
  })

  it('discards staging when the native installer reports an error before it returns', () => {
    const { installer, native, attempt, state } = harness()
    native.quitAndInstall.mockImplementationOnce(() => installer.nativeFinished('error'))
    installer.install()

    installer.nativeFinished('downloaded')

    expect(attempt.fail).toHaveBeenCalledExactlyOnceWith(FAILED)
    state.saved = true
    installer.install()
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('returns to idle when native staging throws', () => {
    const { installer, native } = harness()
    native.checkForUpdates.mockImplementationOnce(() => {
      throw new Error('staging unavailable')
    })

    expect(() => installer.install()).toThrow('staging unavailable')

    installer.install()
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('discards staging when the native installer throws during handoff', () => {
    const { installer, native, attempt } = harness()
    native.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('native failure')
    })
    attempt.handOffToInstaller.mockImplementationOnce((quitAndInstall) => {
      expect(quitAndInstall).toThrow('native failure')
    })
    installer.install()

    installer.nativeFinished('downloaded')

    installer.install()
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('requires a downloaded version before any native call', () => {
    const { installer, native, state } = harness()
    state.version = undefined

    expect(() => installer.install()).toThrow('No downloaded update version.')

    expect(native.checkForUpdates).not.toHaveBeenCalled()
  })

  it.each(['staging throws', 'the version was withdrawn'] as const)(
    'fails a waiting retry that cannot continue because %s',
    (reason) => {
      const { installer, native, attempt, state } = harness()
      installer.install()
      installer.install()
      if (reason === 'staging throws') {
        native.checkForUpdates.mockImplementationOnce(() => {
          throw new Error('staging unavailable')
        })
      } else {
        state.version = undefined
      }

      installer.nativeFinished('error')

      expect(attempt.fail).toHaveBeenCalledExactlyOnceWith(FAILED)
      expect(native.quitAndInstall).not.toHaveBeenCalled()
    },
  )
})

/** The real attempt and installer together, with the window close and the native side under test control. */
function installation() {
  vi.useFakeTimers()
  const native = { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() }
  const closing: Array<() => void> = []
  const release = vi.fn()
  const ports = {
    check: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
    install: (): void => installer.install(),
    canInstall: () => true,
    prepareQuit: vi.fn(() => release),
    closeForInstall: (whenClosed: () => void): void => {
      closing.push(whenClosed)
    },
    requestSave: vi.fn<(id: string) => void>(),
    finished: vi.fn<(message: string | null) => void>(),
    changed: () => undefined,
  }
  const updates = new AppUpdates(ports)
  const installer = new NativeUpdateInstaller(native, updates)
  updates.downloaded('1.2.4')

  return {
    updates,
    installer,
    native,
    ports,
    release,
    /** The user chooses Restart and Install and the renderer acknowledges its save. */
    saveAndInstall: (): void => {
      updates.request()
      updates.confirm(ports.requestSave.mock.lastCall![0], true)
    },
    /** The saved window is gone, so the pending handoff may continue. */
    windowClosed: (): void => closing.shift()!(),
    expire: (): void => {
      vi.advanceTimersByTime(60_000)
    },
  }
}

describe('installation attempts and native preparation', () => {
  it.each(results)('prepares a version downloaded after a timeout once the silent staging answers %s', (lateResult) => {
    const f = installation()
    f.saveAndInstall()
    f.expire()
    expect(f.ports.finished).toHaveBeenLastCalledWith(TIMED_OUT)

    f.updates.available('1.2.5')
    expect(f.updates.canRequest()).toBe(false)
    f.updates.downloaded('1.2.5')
    f.saveAndInstall()
    expect(f.native.checkForUpdates).toHaveBeenCalledOnce()

    f.installer.nativeFinished(lateResult)

    expect(f.native.quitAndInstall).not.toHaveBeenCalled()
    expect(f.native.checkForUpdates).toHaveBeenCalledTimes(2)
    f.installer.nativeFinished('downloaded')
    f.windowClosed()
    expect(f.native.quitAndInstall).toHaveBeenCalledOnce()
    expect(f.updates.getVersion()).toBe('1.2.5')
    expect(f.ports.download).not.toHaveBeenCalled()
  })

  it('installs nothing when silent staging completes while a newer version is only offered', () => {
    const f = installation()
    f.saveAndInstall()
    f.expire()
    f.updates.available('1.2.5')

    f.installer.nativeFinished('downloaded')

    expect(f.native.quitAndInstall).not.toHaveBeenCalled()
    expect(f.ports.prepareQuit).not.toHaveBeenCalled()
    expect(f.ports.finished).toHaveBeenCalledExactlyOnceWith(TIMED_OUT)
    expect(f.updates.getStatus()).toBe('available')
    expect(f.updates.canRequest()).toBe(false)
  })

  it.each(['1.2.4', '1.2.5'])('waits for the unanswered installer before preparing %s again', (version) => {
    const f = installation()
    f.saveAndInstall()
    f.installer.nativeFinished('downloaded')
    f.windowClosed()
    f.expire()
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.ports.finished).toHaveBeenLastCalledWith(TIMED_OUT)

    f.updates.available(version)
    f.updates.downloaded(version)
    f.saveAndInstall()
    f.installer.nativeFinished('downloaded')
    f.installer.nativeFinished('not-available')
    expect(f.native.checkForUpdates).toHaveBeenCalledOnce()
    expect(f.native.quitAndInstall).toHaveBeenCalledOnce()

    f.installer.nativeFinished('error')

    expect(f.updates.isInstalling()).toBe(true)
    expect(f.native.checkForUpdates).toHaveBeenCalledTimes(2)
    f.installer.nativeFinished('downloaded')
    f.windowClosed()
    expect(f.native.quitAndInstall).toHaveBeenCalledTimes(2)
  })

  it('discards native preparation but keeps the downloaded package after an installer error', () => {
    const f = installation()
    f.saveAndInstall()
    f.installer.nativeFinished('downloaded')
    f.windowClosed()

    f.installer.nativeFinished('error')

    expect(f.ports.finished).toHaveBeenLastCalledWith(FAILED)
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.updates.getStatus()).toBe('ready')
    expect(f.updates.getVersion()).toBe('1.2.4')
    f.saveAndInstall()
    expect(f.native.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(f.native.quitAndInstall).toHaveBeenCalledOnce()
    expect(f.ports.download).not.toHaveBeenCalled()
  })

  it('does not start the installer when the deadline passes before the window has closed', () => {
    const f = installation()
    f.saveAndInstall()
    f.installer.nativeFinished('downloaded')

    f.expire()
    f.windowClosed()

    expect(f.native.quitAndInstall).not.toHaveBeenCalled()
    expect(f.release).toHaveBeenCalledOnce()
    f.saveAndInstall()
    f.windowClosed()
    expect(f.native.checkForUpdates).toHaveBeenCalledOnce()
    expect(f.native.quitAndInstall).toHaveBeenCalledOnce()
  })
})

/**
 * Events that reach the main process: the provider offers a version, its download finishes, the
 * user chooses Restart and Install, the renderer acknowledges the save, the window closes or the
 * user quits, a deadline expires, the closed window lets a handoff continue, or the native side
 * answers.
 */
type Step = 'offer' | 'download' | 'request' | 'saved' | 'quit' | 'deadline' | 'closed' | NativeUpdateResult

const steps: Step[] = ['offer', 'download', 'request', 'saved', 'quit', 'deadline', 'closed', ...results]
const versions = ['1.2.4', '1.2.5', '1.2.6']
// A state is the private state of both owners. Timer handles and request IDs differ between
// replays of one state; a new volatile field would trip the finite-space guard below.
const volatile = new Set(['ports', 'native', 'attempt', 'timer', 'requestId'])

/**
 * One replayable run of the attempt and the installer against a native side that answers each
 * operation at most once, at any later time. Production code catches errors thrown by its ports,
 * so broken rules are collected instead of thrown from inside a port.
 */
function world() {
  vi.clearAllTimers()
  const broken: string[] = []
  const rule = (holds: boolean, description: string): void => {
    if (!holds) broken.push(description)
  }
  let outstanding: { phase: 'staging' | 'installing'; version: string } | null = null
  let staged: string | null = null
  let offers = 0
  let quitPermissions = 0
  let unfinishedAttempts = 0
  let installed: string | undefined
  const closing: Array<() => void> = []
  const requests: string[] = []

  const native = {
    checkForUpdates: (): void => {
      rule(outstanding === null, 'staging started during another native operation')
      rule(updates.isInstalling(), 'staging started without an acknowledged save')
      outstanding = { phase: 'staging', version: updates.getVersion()! }
    },
    quitAndInstall: (): void => {
      rule(outstanding === null, 'installation started during another native operation')
      rule(updates.isInstalling(), 'installation started without an acknowledged save')
      rule(quitPermissions === 1, 'installation started without the quit permission')
      rule(staged !== null && staged === updates.getVersion(), 'installation started for a version not staged for it')
      outstanding = { phase: 'installing', version: staged! }
      installed = staged!
    },
  }
  const updates = new AppUpdates({
    check: async () => undefined,
    download: () => {
      broken.push('installation started a download')
      return Promise.resolve()
    },
    install: () => installer.install(),
    canInstall: () => true,
    prepareQuit: () => {
      quitPermissions++
      return () => {
        quitPermissions--
      }
    },
    closeForInstall: (whenClosed) => {
      closing.push(whenClosed)
    },
    requestSave: (id) => {
      requests.push(id)
      unfinishedAttempts++
    },
    finished: () => {
      unfinishedAttempts--
    },
    changed: () => undefined,
  })
  const installer = new NativeUpdateInstaller(native, updates)
  const offer = (): unknown[] => [updates.isReady(), updates.getVersion(), updates.getDownloadVersion()]

  /** Returns false when the application cannot produce this step in the current state. */
  const perform = (step: Step): boolean => {
    const applying = updates.isApplying()
    // Checks and downloads wait for an attempt to end. The window closes within the same turn:
    // only a timer or a native callback can precede it.
    const interactive = !applying && closing.length === 0

    if (step === 'offer') {
      if (!interactive || offers === versions.length) return false
      updates.available(versions[offers++]!)
    } else if (step === 'download') {
      if (!interactive || updates.getDownloadVersion() === undefined) return false
      updates.downloaded(updates.getDownloadVersion())
    } else if (step === 'request') {
      if (!interactive || !updates.canRequest()) return false
      updates.request()
    } else if (step === 'saved') {
      if (!applying || updates.isInstalling()) return false
      updates.confirm(requests.at(-1)!, true)
    } else if (step === 'quit') {
      if (!applying) return false
      updates.cancelBeforeNativeQuit()
    } else if (step === 'deadline') {
      if (!applying) return false
      vi.advanceTimersByTime(60_000)
    } else if (step === 'closed') {
      if (closing.length === 0) return false
      closing.shift()!()
    } else {
      if (outstanding !== null && (outstanding.phase === 'staging' || step === 'error')) {
        staged = step === 'downloaded' ? outstanding.version : null
        outstanding = null
      }
      installer.nativeFinished(step)
    }
    return true
  }

  return {
    apply(step: Step): { possible: boolean; installed: string | undefined } {
      installed = undefined
      const before = offer()
      const possible = perform(step)

      if (step !== 'offer' && step !== 'download')
        rule(JSON.stringify(offer()) === JSON.stringify(before), 'installation changed the downloaded package')
      if (!updates.isApplying()) {
        rule(quitPermissions === 0, 'an ended attempt kept the quit permission')
        rule(unfinishedAttempts === 0, 'an ended attempt did not release the editor')
      }
      expect(broken).toEqual([])
      return { possible, installed }
    },
    canInstall: (): boolean => updates.isReady(),
    waitsForOlderOperation: (): boolean =>
      outstanding !== null && updates.isInstalling() && outstanding.version !== updates.getVersion(),
    fingerprint: (): string =>
      JSON.stringify(
        [updates, installer, outstanding, staged, offers, closing.length, quitPermissions, unfinishedAttempts],
        (key, value: unknown) => (volatile.has(key) ? undefined : value),
      ),
  }
}

describe('reachable installation states', () => {
  it('keeps one native operation, the requested version and a way to install in every state', () => {
    vi.useFakeTimers()
    const replay = (path: Step[]) => {
      const run = world()
      for (const step of path) run.apply(step)
      return run
    }
    const paths = new Map<string, Step[]>([[replay([]).fingerprint(), []]])
    const predecessors = new Map<string, Set<string>>()
    const installable = new Set<string>()
    const reachesInstallation = new Set<string>()
    const installedVersions = new Set<string>()
    let transitions = 0
    let waitedForOlderOperation = false

    for (const [state, path] of paths) {
      for (const step of steps) {
        const run = replay(path)
        let outcome: ReturnType<typeof run.apply>
        try {
          outcome = run.apply(step)
        } catch (error) {
          throw new Error(`${[...path, step].join(' > ')}: ${String(error)}`, { cause: error })
        }
        if (!outcome.possible) continue

        transitions++
        const next = run.fingerprint()
        if (!paths.has(next)) paths.set(next, [...path, step])
        if (!predecessors.has(next)) predecessors.set(next, new Set())
        predecessors.get(next)!.add(state)
        if (run.canInstall()) installable.add(next)
        if (run.waitsForOlderOperation()) waitedForOlderOperation = true
        if (outcome.installed !== undefined) {
          installedVersions.add(outcome.installed)
          reachesInstallation.add(state)
        }
      }
      expect(paths.size, 'The explored state space must be finite.').toBeLessThan(10_000)
    }
    const pending = [...reachesInstallation]
    for (const state of pending) {
      for (const previous of predecessors.get(state) ?? []) {
        if (reachesInstallation.has(previous)) continue
        reachesInstallation.add(previous)
        pending.push(previous)
      }
    }

    const stuck = [...installable].find((state) => !reachesInstallation.has(state))
    expect(
      stuck === undefined ? null : paths.get(stuck)!.join(' > '),
      'A downloaded package must stay installable.',
    ).toBe(null)
    expect(waitedForOlderOperation).toBe(true)
    expect([...installedVersions].sort()).toEqual(versions)
    expect(paths.size).toBeGreaterThan(100)
    expect(transitions).toBeGreaterThan(paths.size)
  })
})
