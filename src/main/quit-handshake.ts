export interface QuitHandshakeClock {
  setTimeout(callback: () => void, milliseconds: number): unknown
  clearTimeout(handle: unknown): void
}

const systemClock: QuitHandshakeClock = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export class QuitHandshake {
  private pendingRequestId: string | undefined
  private timeoutHandle: unknown
  private quitting = false

  public constructor(
    private readonly sendRequest: (requestId: string) => void,
    private readonly onTimeout: () => void,
    private readonly quit: () => void,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
    private readonly clock: QuitHandshakeClock = systemClock,
    private readonly timeoutMilliseconds = 5_000,
  ) {}

  public request(): void {
    if (this.quitting || this.pendingRequestId !== undefined) return
    const requestId = this.createRequestId()
    this.pendingRequestId = requestId
    this.timeoutHandle = this.clock.setTimeout(() => {
      this.pendingRequestId = undefined
      this.timeoutHandle = undefined
      this.onTimeout()
    }, this.timeoutMilliseconds)
    this.sendRequest(requestId)
  }

  public confirm(requestId: string): boolean {
    if (this.quitting || this.pendingRequestId !== requestId) return false
    this.clearTimeout()
    this.pendingRequestId = undefined
    this.quitting = true
    queueMicrotask(this.quit)
    return true
  }

  public isQuitting(): boolean {
    return this.quitting
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== undefined) this.clock.clearTimeout(this.timeoutHandle)
    this.timeoutHandle = undefined
  }
}
