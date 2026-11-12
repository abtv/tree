export interface QuitHandshakeClock {
  setTimeout(callback: () => void, milliseconds: number): unknown
  clearTimeout(handle: unknown): void
}

const systemClock: QuitHandshakeClock = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

type QuitState =
  { kind: 'idle' } | { kind: 'waiting'; requestId: string; timeoutHandle: unknown } | { kind: 'quitting' }

export class QuitHandshake {
  private state: QuitState = { kind: 'idle' }

  public constructor(
    private readonly sendRequest: (requestId: string) => void,
    private readonly onTimeout: () => void,
    private readonly quit: () => void,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
    private readonly clock: QuitHandshakeClock = systemClock,
    private readonly timeoutMilliseconds = 5_000,
  ) {}

  public request(): void {
    if (this.state.kind !== 'idle') return
    const requestId = this.createRequestId()
    this.state = { kind: 'waiting', requestId, timeoutHandle: undefined }
    this.state.timeoutHandle = this.clock.setTimeout(() => {
      this.state = { kind: 'idle' }
      this.onTimeout()
    }, this.timeoutMilliseconds)
    this.sendRequest(requestId)
  }

  public confirm(requestId: string): boolean {
    if (this.state.kind !== 'waiting' || this.state.requestId !== requestId) return false
    this.clearTimeout()
    this.state = { kind: 'quitting' }
    queueMicrotask(this.quit)
    return true
  }

  public force(): void {
    if (this.state.kind === 'quitting') return
    this.clearTimeout()
    this.state = { kind: 'quitting' }
    queueMicrotask(this.quit)
  }

  public isQuitting(): boolean {
    return this.state.kind === 'quitting'
  }

  private clearTimeout(): void {
    if (this.state.kind === 'waiting' && this.state.timeoutHandle !== undefined)
      this.clock.clearTimeout(this.state.timeoutHandle)
    if (this.state.kind === 'waiting') this.state.timeoutHandle = undefined
  }
}
