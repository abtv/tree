type UpdatePackage = { phase: 'unavailable' } | { phase: 'ready'; version: string | undefined }

type UpdateFeedback =
  { phase: 'idle' } | { phase: 'downloading'; percent: number } | { phase: 'failed'; percent: number | null }

type UpdateCheck =
  | { phase: 'idle'; result: 'success' | 'failed' }
  | { phase: 'checking'; result: 'success' | 'failed'; pending: Promise<void> }

type UpdateInstallation =
  | { phase: 'idle' }
  | { phase: 'awaiting-save'; requestId: string; timer: ReturnType<typeof setTimeout> }
  | { phase: 'preparing-install'; releaseQuit: () => void; timer: ReturnType<typeof setTimeout> }

/** Coordinates installation separately from ordinary quit: a failed save never permits installation. */
export class AppUpdates {
  // A failed recheck can coexist with a previously downloaded package.
  private package: UpdatePackage = { phase: 'unavailable' }
  private feedback: UpdateFeedback = { phase: 'idle' }
  private backgroundCheck: UpdateCheck = { phase: 'idle', result: 'success' }
  private manualCheck: 'idle' | 'waiting' | 'notifying' = 'idle'
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
    return this.installation.phase === 'preparing-install'
  }
  public cancelSaving(): void {
    if (this.installation.phase === 'awaiting-save') this.fail(null)
  }

  public downloaded(version?: string): void {
    this.package = { phase: 'ready', version }
    this.clearFailure()
    this.ports.changed()
  }

  public check(): Promise<void> {
    if (this.backgroundCheck.phase === 'checking') return this.backgroundCheck.pending
    if (this.isApplying()) return Promise.resolve()
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
        this.backgroundCheck = { phase: 'idle', result: this.backgroundCheck.result }
        this.ports.changed()
      })
    this.backgroundCheck = { phase: 'checking', result: 'success', pending }
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
      this.ports.changed()
    }
  }

  public request(): void {
    if (!this.isReady() || this.isChecking() || this.isApplying() || !this.ports.canInstall()) return
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
    this.installation = { phase: 'idle' }
    const releaseQuit = this.ports.prepareQuit()
    this.installation = {
      phase: 'preparing-install',
      releaseQuit,
      timer: setTimeout(() => this.fail('Update preparation took too long. Try Restart and Install again.'), 60_000),
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
    if (installation.phase === 'preparing-install') installation.releaseQuit()
    this.installation = { phase: 'idle' }
    if (installation.phase !== 'idle') this.ports.finished(message)
    this.ports.changed()
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
