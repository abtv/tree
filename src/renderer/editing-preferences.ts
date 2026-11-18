/** Retains the latest native or local choice across the initial read and React mount. */
export class BooleanPreference {
  private revision = 0
  private readonly listeners = new Set<() => void>()

  public constructor(private value: boolean) {}

  public getSnapshot = (): boolean => this.value

  public set = (value: boolean): void => {
    this.revision++
    if (this.value === value) return
    this.value = value
    this.listeners.forEach((listener) => listener())
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public observe(
    read: () => Promise<boolean>,
    onChange?: (listener: (value: boolean) => void) => () => void,
    reportError?: (error: unknown) => void,
  ): { ready: Promise<void>; dispose(): void } {
    let active = true
    const before = this.revision
    const remove = onChange?.(this.set)
    const ready = read().then(
      (value) => {
        if (active && before === this.revision) this.set(value)
      },
      (error: unknown) => {
        if (active && before === this.revision) reportError?.(error)
      },
    )
    return {
      ready,
      dispose() {
        active = false
        remove?.()
      },
    }
  }
}

export interface EditingPreferences {
  vim: BooleanPreference
  alwaysOnTop: BooleanPreference
}
