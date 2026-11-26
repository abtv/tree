import { UPDATE_FAILED_MESSAGE } from './app-updates'

/** The part of an installation attempt that native preparation reads and drives. */
export interface InstallationAttempt {
  /** The downloaded version that the user asked to install. */
  getVersion(): string | undefined
  /** True from the acknowledged save until the attempt ends. */
  isInstalling(): boolean
  handOffToInstaller(quitAndInstall: () => void): void
  fail(message: string): void
}

export interface NativeUpdater {
  checkForUpdates(): void
  quitAndInstall(): void
}

export type NativeUpdateResult = 'downloaded' | 'not-available' | 'error'

type NativePackage =
  | { phase: 'idle' }
  | { phase: 'staging' | 'installing'; version: string; retryWaiting: boolean }
  | { phase: 'staged'; version: string }

/**
 * Owns what the macOS installer has done with the provider's downloaded ZIP. This state outlives
 * an installation attempt: a timeout ends the attempt, not the native operation it started.
 */
export class NativeUpdateInstaller {
  private package: NativePackage = { phase: 'idle' }

  public constructor(
    private readonly native: NativeUpdater,
    private readonly attempt: InstallationAttempt,
  ) {}

  /** Continues the saved attempt: hands off a package staged for its version, or stages one. */
  public install(): void {
    const version = this.attempt.getVersion()
    if (!version) throw new Error('No downloaded update version.')

    // Native callbacks carry no request ID. Keep at most one outstanding operation across timeouts.
    if (this.package.phase === 'staging' || this.package.phase === 'installing') {
      this.package.retryWaiting = true
      return
    }

    if (this.package.phase === 'staged' && this.package.version === version) {
      this.attempt.handOffToInstaller(() => this.start('installing', version))
    } else {
      this.start('staging', version)
    }
  }

  /** Ends the outstanding native operation, then lets a saved attempt continue or fail. */
  public nativeFinished(result: NativeUpdateResult): void {
    const operation = this.package
    if (operation.phase !== 'staging' && operation.phase !== 'installing') return
    // Staging ends with any result. A handed-off installation reports only its failure.
    if (operation.phase === 'installing' && result !== 'error') return

    // An installer failure does not prove the native copy is still staged. The
    // provider's downloaded ZIP remains ready for a fresh preparation on retry.
    this.package = result === 'downloaded' ? { phase: 'staged', version: operation.version } : { phase: 'idle' }
    if (!this.attempt.isInstalling()) return

    if (result !== 'downloaded' && !operation.retryWaiting) {
      this.attempt.fail(UPDATE_FAILED_MESSAGE)
      return
    }
    try {
      this.install()
    } catch {
      this.attempt.fail(UPDATE_FAILED_MESSAGE)
    }
  }

  private start(phase: 'staging' | 'installing', version: string): void {
    this.package = { phase, version, retryWaiting: false }
    try {
      if (phase === 'staging') this.native.checkForUpdates()
      else this.native.quitAndInstall()
    } catch (error) {
      this.package = { phase: 'idle' }
      throw error
    }
  }
}
