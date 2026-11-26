import type { AppUpdateStatus } from '../../shared/ipc'

export const UPDATE_FAILED_MESSAGE = 'Update failed. Try Restart and Install again.'

type UpdatePackage =
  | { phase: 'unavailable' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string | undefined }

type UpdateCheck =
  | { phase: 'idle'; result: 'success' | 'failed' }
  | { phase: 'checking'; result: 'success' | 'failed'; pending: Promise<void>; reconnected: boolean }

type UpdateInstallation =
  | { phase: 'idle' }
  | { phase: 'awaiting-save'; requestId: string; timer: ReturnType<typeof setTimeout> }
  | { phase: 'preparing-install'; timer: ReturnType<typeof setTimeout> }
  | { phase: 'native-quit'; releaseQuit: () => void; timer: ReturnType<typeof setTimeout> }

/** Coordinates installation separately from ordinary quit: a failed save never permits installation. */
export class AppUpdates {
  // A failed recheck can coexist with a previously downloaded package.
  private package: UpdatePackage = { phase: 'unavailable' }
  private failure: 'failed' | 'download-failed' | null = null
  private backgroundCheck: UpdateCheck = { phase: 'idle', result: 'success' }
  private manualCheck: 'idle' | 'waiting' | 'notifying' = 'idle'
  private recheckRequested = false
  private installation: UpdateInstallation = { phase: 'idle' }

  public constructor(
    private readonly ports: {
      check(): Promise<unknown>
      download(): Promise<unknown>
      install(): void
      canInstall(): boolean
      prepareQuit(): () => void
      closeForInstall(whenClosed: () => void): void
      requestSave(id: string): void
      finished(message: string | null): void
      changed(): void
      progressChanged?(): void
      notifyCheck?(result: 'available' | 'ready' | 'current' | 'failed'): Promise<void>
    },
  ) {}

  public isReady(): boolean {
    return this.package.phase === 'ready'
  }
  public getVersion(): string | undefined {
    return this.package.phase === 'ready' ? this.package.version : undefined
  }
  public getDownloadVersion(): string | undefined {
    return this.package.phase === 'available' || this.package.phase === 'downloading' ? this.package.version : undefined
  }
  public isDownloading(): boolean {
    return this.package.phase === 'downloading'
  }
  public getStatus(): AppUpdateStatus {
    if (this.isApplying()) return 'installing'
    if (this.package.phase === 'downloading') return this.package.percent
    if (this.failure !== null) return this.failure
    return this.package.phase === 'unavailable' ? null : this.package.phase
  }

  public available(version: string): void {
    if (this.isDownloading() || (this.package.phase === 'ready' && this.package.version === version)) return
    if (this.getDownloadVersion() !== version && this.failure === 'download-failed') this.failure = null
    this.package = { phase: 'available', version }
    this.ports.changed()
  }

  public notAvailable(): void {
    if (this.package.phase === 'unavailable' || this.isDownloading()) return
    this.package = { phase: 'unavailable' }
    if (this.failure === 'download-failed') this.failure = null
    this.ports.changed()
  }

  public async requestDownload(): Promise<void> {
    if (this.package.phase !== 'available' || this.isChecking() || this.isApplying()) return
    const available = this.package
    this.package = { phase: 'downloading', version: available.version, percent: 0 }
    this.failure = null
    this.ports.changed()
    try {
      await this.ports.download()
      this.package = { phase: 'ready', version: available.version }
    } catch {
      this.package = available
      this.failure = 'download-failed'
    }
    this.publishOrRecheck()
  }

  public downloading(percent: number): void {
    if (this.package.phase !== 'downloading' || !Number.isFinite(percent)) return
    const next = Math.max(0, Math.min(100, Math.floor(percent)))
    if (this.package.percent === next) return
    this.package.percent = next
    this.ports.progressChanged?.()
  }
  public isChecking(): boolean {
    return this.backgroundCheck.phase === 'checking' || this.manualCheck !== 'idle'
  }
  public isNotifying(): boolean {
    return this.manualCheck === 'notifying'
  }
  public isApplying(): boolean {
    return this.installation.phase !== 'idle'
  }
  public isInstalling(): boolean {
    return this.installation.phase === 'preparing-install' || this.installation.phase === 'native-quit'
  }
  public cancelBeforeNativeQuit(): void {
    if (this.installation.phase === 'awaiting-save' || this.installation.phase === 'preparing-install') this.fail(null)
  }

  public handOffToInstaller(quitAndInstall: () => void): void {
    if (this.installation.phase !== 'preparing-install') return
    const handoff = {
      phase: 'native-quit',
      timer: this.installation.timer,
      releaseQuit: this.ports.prepareQuit(),
    } as const
    this.installation = handoff
    this.ports.closeForInstall(() => {
      if (this.installation !== handoff) return
      try {
        quitAndInstall()
      } catch {
        this.fail(UPDATE_FAILED_MESSAGE)
      }
    })
  }

  public downloaded(version?: string): void {
    // The provider emits before its download promise settles. Keep the active download
    // exclusive until that promise resolves and makes the package ready.
    if (this.isDownloading()) return
    this.package = { phase: 'ready', version }
    this.failure = null
    this.ports.changed()
  }

  public check(origin?: 'online'): Promise<void> {
    if (this.backgroundCheck.phase === 'checking') {
      if (origin === 'online') this.backgroundCheck.reconnected = true
      return this.backgroundCheck.pending
    }
    if (this.isNotifying() || this.isApplying() || this.isDownloading()) {
      this.recheckRequested = true
      return Promise.resolve()
    }
    this.recheckRequested = false
    if (this.failure !== 'download-failed') this.failure = null
    const pending = Promise.resolve()
      .then(() => this.ports.check())
      .then(
        () => undefined,
        () => {
          this.backgroundCheck = { ...this.backgroundCheck, result: 'failed' }
          this.failure = 'failed'
        },
      )
      .finally(() => {
        const check = this.backgroundCheck
        if (check.phase === 'checking' && check.reconnected && check.result === 'failed') this.recheckRequested = true
        this.backgroundCheck = { phase: 'idle', result: check.result }
        this.publishOrRecheck()
      })
    this.backgroundCheck = { phase: 'checking', result: 'success', pending, reconnected: false }
    this.ports.changed()
    return pending
  }

  public async checkManually(): Promise<void> {
    if (this.manualCheck !== 'idle' || this.isApplying() || this.isDownloading()) return
    this.manualCheck = 'waiting'
    this.ports.changed()
    try {
      await this.check()
      this.manualCheck = 'notifying'
      this.ports.changed()
      await this.ports.notifyCheck?.(
        this.backgroundCheck.result === 'failed'
          ? 'failed'
          : this.isReady()
            ? 'ready'
            : this.package.phase === 'available'
              ? 'available'
              : 'current',
      )
    } finally {
      this.manualCheck = 'idle'
      this.publishOrRecheck()
    }
  }

  private publishOrRecheck(): void {
    if (this.recheckRequested && !this.isChecking() && !this.isApplying() && !this.isDownloading()) void this.check()
    else this.ports.changed()
  }

  public canRequest(): boolean {
    return this.isReady() && !this.isChecking() && !this.isApplying() && this.ports.canInstall()
  }

  public request(): void {
    if (!this.canRequest()) return
    this.failure = null
    const requestId = crypto.randomUUID()
    this.installation = {
      phase: 'awaiting-save',
      requestId,
      timer: setTimeout(() => this.fail('Saving took too long. Try Restart and Install again.'), 15_000),
    }
    this.ports.changed()
    this.ports.requestSave(requestId)
  }

  public confirm(id: string, saved: boolean): void {
    const installation = this.installation
    if (installation.phase !== 'awaiting-save' || installation.requestId !== id)
      throw new Error('Invalid update request.')
    if (!saved || !this.ports.canInstall()) {
      this.fail(null)
      return
    }
    clearTimeout(installation.timer)
    this.installation = {
      phase: 'preparing-install',
      timer: setTimeout(
        () => this.fail('Update preparation took too long. Retry Restart and Install, or quit and reopen Tree.'),
        60_000,
      ),
    }
    try {
      this.ports.install()
    } catch {
      this.fail(UPDATE_FAILED_MESSAGE)
    }
  }

  public fail(message: string | null): void {
    const installation = this.installation
    if (installation.phase === 'idle') return
    clearTimeout(installation.timer)
    if (installation.phase === 'native-quit') installation.releaseQuit()
    this.installation = { phase: 'idle' }
    this.ports.finished(message)
    this.publishOrRecheck()
  }
}
