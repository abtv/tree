import type { Clock } from './editor-store-types'

/** Coalesces navigation metadata without postponing its deadline on every edit. */
export class RecentNodePersistence {
  private timer: unknown
  private revision = 0
  private saved = 0
  private pending: Promise<void> = Promise.resolve()

  public constructor(
    private readonly clock: Clock,
    private readonly read: () => readonly string[],
    private readonly write: ((ids: readonly string[]) => Promise<void>) | undefined,
    private readonly report: (error: unknown) => void,
  ) {}

  public changed(): void {
    this.revision++
    if (this.write === undefined || this.timer !== undefined) return
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined
      void this.flush().catch(this.report)
    }, 30_000)
  }

  public async flush(): Promise<void> {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer)
    this.timer = undefined
    const operation = this.pending
      .catch(() => undefined)
      .then(async () => {
        if (this.write === undefined) return
        while (this.saved !== this.revision) {
          const revision = this.revision
          await this.write(this.read())
          this.saved = revision
        }
      })
    this.pending = operation
    await operation
  }
}
