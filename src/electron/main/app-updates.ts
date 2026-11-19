type UpdatePackage = { phase: 'unavailable' } | { phase: 'ready'; version: string | undefined }

type UpdateFeedback =
  { phase: 'idle' } | { phase: 'downloading'; percent: number } | { phase: 'failed'; percent: number | null }

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
  private feedback: UpdateFeedback = { phase: 'idle' }
  private backgroundCheck: UpdateCheck = { phase: 'idle', result: 'success' }
  private manualCheck: 'idle' | 'waiting' | 'notifying' = 'idle'
  private recheckRequested = false
  private installation: UpdateInstallation = { phase: 'idle' }

  public constructor(
    private readonly ports: {
      check(): Promise<unknown>
      install(): void
      canInstall(): boolean
      prepareQuit(): () => void
      requestSave(id: string): void
      finished(message: string | null): void
      changed(): void
      progressChanged?(): void
      notifyCheck?(result: 'ready' | 'current' | 'failed'): Promise<void>
    },
  ) {}

  public isReady(): boolean {
    return this.package.phase === 'ready'
  }
  public getVersion(): string | undefined {
    return this.package.phase === 'ready' ? this.package.version : undefined
  }
  public getStatus(): number | 'ready' | 'failed' | 'installing' | null {
    if (this.isApplying()) return 'installing'
    if (this.feedback.phase === 'failed') return 'failed'
    return this.isReady() ? 'ready' : this.percent()
  }

  public available(): void {
    this.package = { phase: 'unavailable' }
    this.feedback = { phase: 'downloading', percent: 0 }
    this.ports.changed()
  }

  public downloading(percent: number): void {
    if (this.isReady() || !Number.isFinite(percent)) return
    const next = Math.max(0, Math.min(100, Math.floor(percent)))
    if (this.percent() === next) return
    this.feedback = { phase: this.feedback.phase === 'failed' ? 'failed' : 'downloading', percent: next }
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
    this.installation = { phase: 'native-quit', timer: this.installation.timer, releaseQuit: this.ports.prepareQuit() }
    quitAndInstall()
  }

  public downloaded(version?: string): void {
    this.package = { phase: 'ready', version }
    this.clearFailure()
    this.ports.changed()
  }

  public check(origin?: 'online'): Promise<void> {
    if (this.backgroundCheck.phase === 'checking') {
      if (origin === 'online') this.backgroundCheck.reconnected = true
      return this.backgroundCheck.pending
    }
    if (this.isNotifying() || this.isApplying()) {
      this.recheckRequested = true
      return Promise.resolve()
    }
    this.recheckRequested = false
    this.feedback = { phase: 'idle' }
    const pending = Promise.resolve()
      .then(() => this.ports.check())
      .then(
        () => undefined,
        () => {
          this.backgroundCheck = { ...this.backgroundCheck, result: 'failed' }
          this.feedback = { phase: 'failed', percent: this.percent() }
        },
      )
      .finally(() => {
        this.clearProgress()
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
    if (this.manualCheck !== 'idle' || this.isApplying()) return
    this.manualCheck = 'waiting'
    this.ports.changed()
    try {
      await this.check()
      this.manualCheck = 'notifying'
      this.ports.changed()
      await this.ports.notifyCheck?.(
        this.backgroundCheck.result === 'failed' ? 'failed' : this.isReady() ? 'ready' : 'current',
      )
    } finally {
      this.manualCheck = 'idle'
      this.publishOrRecheck()
    }
  }

  private publishOrRecheck(): void {
    if (this.recheckRequested && !this.isChecking() && !this.isApplying()) void this.check()
    else this.ports.changed()
  }

  public canRequest(): boolean {
    return this.isReady() && !this.isChecking() && !this.isApplying() && this.ports.canInstall()
  }

  public request(): void {
    if (!this.canRequest()) return
    this.clearFailure()
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
      this.fail('Update failed. Try Restart and Install again.')
    }
  }

  public fail(message: string | null): void {
    this.clearProgress()
    if (message !== null) this.feedback = { phase: 'failed', percent: null }
    const installation = this.installation
    if (installation.phase !== 'idle') clearTimeout(installation.timer)
    if (installation.phase === 'native-quit') installation.releaseQuit()
    this.installation = { phase: 'idle' }
    if (installation.phase !== 'idle') this.ports.finished(message)
    this.publishOrRecheck()
  }

  private percent(): number | null {
    return this.feedback.phase === 'idle' ? null : this.feedback.percent
  }

  private clearFailure(): void {
    const percent = this.percent()
    this.feedback = percent === null ? { phase: 'idle' } : { phase: 'downloading', percent }
  }

  private clearProgress(): void {
    this.feedback = this.feedback.phase === 'failed' ? { phase: 'failed', percent: null } : { phase: 'idle' }
  }
}
