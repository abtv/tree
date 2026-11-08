/** Coordinates installation separately from ordinary quit: a failed save never permits installation. */
export class AppUpdates {
  private percent: number | null = null
  private ready = false
  private readyVersion: string | undefined
  private failed = false
  private checking = false
  private pendingCheck: Promise<void> | undefined
  private manualCheck = false
  private notifying = false
  private checkFailed = false
  private requestId: string | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private releaseQuit: (() => void) | undefined

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
    return this.ready
  }
  public getVersion(): string | undefined {
    return this.readyVersion
  }
  public getStatus(): number | 'ready' | 'failed' | 'installing' | null {
    if (this.isApplying()) return 'installing'
    if (this.failed) return 'failed'
    return this.ready ? 'ready' : this.percent
  }

  public available(): void {
    this.ready = false
    this.readyVersion = undefined
    this.failed = false
    this.percent = 0
    this.ports.changed()
  }

  public downloading(percent: number): void {
    if (this.ready || !Number.isFinite(percent)) return
    const next = Math.max(0, Math.min(100, Math.floor(percent)))
    if (this.percent === next) return
    this.percent = next
    this.ports.progressChanged?.()
  }
  public isChecking(): boolean {
    return this.checking || this.manualCheck
  }
  public isNotifying(): boolean {
    return this.notifying
  }
  public isApplying(): boolean {
    return this.requestId !== undefined || this.releaseQuit !== undefined
  }
  public isInstalling(): boolean {
    return this.releaseQuit !== undefined
  }
  public cancelSaving(): void {
    if (this.requestId !== undefined) this.fail(null)
  }

  public downloaded(version?: string): void {
    this.ready = true
    this.readyVersion = version
    this.failed = false
    this.ports.changed()
  }

  public check(): Promise<void> {
    if (this.pendingCheck) return this.pendingCheck
    if (this.isApplying()) return Promise.resolve()
    this.checking = true
    this.checkFailed = false
    this.failed = false
    this.percent = null
    this.pendingCheck = Promise.resolve()
      .then(() => this.ports.check())
      .then(
        () => undefined,
        () => {
          this.checkFailed = true
          this.failed = true
        },
      )
      .finally(() => {
        this.percent = null
        this.checking = false
        this.pendingCheck = undefined
        this.ports.changed()
      })
    this.ports.changed()
    return this.pendingCheck
  }

  public async checkManually(): Promise<void> {
    if (this.manualCheck || this.isApplying()) return
    this.manualCheck = true
    this.ports.changed()
    try {
      await this.check()
      this.notifying = true
      this.ports.changed()
      await this.ports.notifyCheck?.(this.checkFailed ? 'failed' : this.ready ? 'ready' : 'current')
    } finally {
      this.manualCheck = false
      this.notifying = false
      this.ports.changed()
    }
  }

  public request(): void {
    if (!this.ready || this.isChecking() || this.isApplying() || !this.ports.canInstall()) return
    this.failed = false
    this.requestId = crypto.randomUUID()
    this.timer = setTimeout(() => this.fail('Saving took too long. Try Restart and Install again.'), 15_000)
    this.ports.changed()
    this.ports.requestSave(this.requestId)
  }

  public confirm(id: string, saved: boolean): void {
    if (this.requestId !== id) throw new Error('Invalid update request.')
    if (!saved || !this.ports.canInstall()) {
      this.fail(null)
      return
    }
    clearTimeout(this.timer)
    this.requestId = undefined
    this.releaseQuit = this.ports.prepareQuit()
    this.timer = setTimeout(() => this.fail('Update preparation took too long. Try Restart and Install again.'), 60_000)
    try {
      this.ports.install()
    } catch {
      this.fail('Update failed. Try Restart and Install again.')
    }
  }

  public fail(message: string | null): void {
    this.percent = null
    if (message !== null) this.failed = true
    const applying = this.isApplying()
    clearTimeout(this.timer)
    this.requestId = undefined
    this.releaseQuit?.()
    this.releaseQuit = undefined
    if (applying) this.ports.finished(message)
    this.ports.changed()
  }
}
