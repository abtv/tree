import type {
  NotesArchiveProgress,
  NotesExportResult,
  NotesFileChoice,
  NotesMenuCommand,
  NotesMenuState,
} from '../../shared/ipc'
import { exportProgressText, exportResultText } from './archive-messages'

export interface DesktopNotesApi {
  chooseNotesExportDestination(): Promise<NotesFileChoice>
  startNotesExport(): Promise<NotesExportResult>
  cancelNotesOperation(): Promise<void>
  onNotesProgress(listener: (progress: NotesArchiveProgress) => void): () => void
  onNotesMenuCommand(listener: (command: NotesMenuCommand) => void): () => void
  setNotesMenuState(state: NotesMenuState): Promise<void>
}

interface NotesStore {
  getSnapshot(): { status: string; persistenceLocked?: boolean }
  subscribe(listener: () => void): () => void
  flushPersistence(): Promise<void>
  reportError(error: unknown): void
}

export type DataActivity =
  | { readonly phase: 'idle' | 'choosing' | 'canceling' }
  | { readonly phase: 'running' | 'done' | 'failed'; readonly text: string }

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Coordinates the desktop archive commands without DOM, React or platform dependencies. */
export class DesktopDataOperations {
  private state: DataActivity = { phase: 'idle' }
  private listeners = new Set<() => void>()
  private stops: (() => void)[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private epoch = 0
  private started = false
  private disposed = false
  private lastMenu: NotesMenuState | undefined

  constructor(
    private readonly api: DesktopNotesApi,
    private readonly store: NotesStore,
  ) {}

  getSnapshot = (): DataActivity => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.started || this.disposed) return
    this.started = true
    this.stops = [
      this.store.subscribe(() => this.updateMenu()),
      this.api.onNotesProgress((progress) => {
        if (this.state.phase === 'running')
          this.publish({ phase: 'running', text: exportProgressText(progress.imagesDone, progress.imageCount) })
      }),
      this.api.onNotesMenuCommand((command) => {
        if (command === 'export') void this.exportNotes()
      }),
    ]
    this.updateMenu()
  }

  private busy(): boolean {
    return this.state.phase === 'choosing' || this.state.phase === 'running' || this.state.phase === 'canceling'
  }

  private updateMenu(): void {
    if (this.disposed) return
    const state = this.store.getSnapshot()
    const next = { canExport: state.status === 'ready' && !state.persistenceLocked && !this.busy(), canImport: false }
    if (next.canExport === this.lastMenu?.canExport && next.canImport === this.lastMenu.canImport) return
    this.lastMenu = next
    void this.api.setNotesMenuState(next).catch((error: unknown) => this.store.reportError(error))
  }

  private publish(state: DataActivity): void {
    this.state = state
    this.updateMenu()
    for (const listener of this.listeners) listener()
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  async exportNotes(): Promise<void> {
    const state = this.store.getSnapshot()
    if (this.disposed || this.busy() || state.status !== 'ready' || state.persistenceLocked) return
    this.clearTimer()
    const epoch = ++this.epoch
    const current = () => !this.disposed && this.epoch === epoch
    this.publish({ phase: 'choosing' })
    let failure = 'The export stopped unexpectedly.'
    try {
      const choice = await this.api.chooseNotesExportDestination()
      if (!current()) {
        await this.api.cancelNotesOperation()
        return
      }
      if (!choice.ok) {
        this.publish({ phase: 'idle' })
        return
      }
      this.publish({ phase: 'running', text: exportProgressText(0, 0) })
      try {
        await this.store.flushPersistence()
      } catch (error) {
        failure = `Your latest changes could not be saved: ${messageOf(error)}`
        throw error
      }
      if (!current()) return
      const result = await this.api.startNotesExport()
      if (!current()) return
      if (!result.ok) {
        this.publish(
          result.canceled ? { phase: 'idle' } : { phase: 'failed', text: `Export failed. ${result.message}` },
        )
        return
      }
      this.publish({ phase: 'done', text: exportResultText(result.fileName, result.summary) })
      if (result.summary.missingImageCount === 0)
        this.timer = setTimeout(() => {
          if (current()) this.dismiss()
        }, 6_000)
    } catch {
      if (!current()) return
      // A failed pre-export flush still owns the dialog-chosen destination in main.
      try {
        await this.api.cancelNotesOperation()
      } catch (error) {
        this.store.reportError(error)
      }
      if (current()) this.publish({ phase: 'failed', text: `Export failed. ${failure}` })
    }
  }

  dismiss = (): void => {
    if (this.busy()) return
    this.clearTimer()
    this.publish({ phase: 'idle' })
  }

  cancel = async (): Promise<void> => {
    if (this.state.phase !== 'running') return
    ++this.epoch
    this.publish({ phase: 'canceling' })
    try {
      await this.api.cancelNotesOperation()
    } catch (error) {
      this.store.reportError(error)
    }
    if (!this.disposed) this.publish({ phase: 'idle' })
  }

  dispose(): void {
    this.disposed = true
    ++this.epoch
    this.clearTimer()
    for (const stop of this.stops.splice(0)) stop()
    this.listeners.clear()
    void this.api.cancelNotesOperation().catch((error: unknown) => this.store.reportError(error))
  }
}
