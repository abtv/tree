import type {
  NotesArchiveProgress,
  NotesExportResult,
  NotesFileChoice,
  NotesMenuCommand,
  NotesMenuState,
  NotesImportPreparation,
  NotesImportCommit,
  NotesImportNotice,
} from '../../shared/ipc'
import { exportProgressText, exportResultText, importProgressText } from './archive-messages'
import { MenuCommands } from '../menu-commands'

export interface DesktopNotesApi {
  chooseNotesExportDestination(): Promise<NotesFileChoice>
  startNotesExport(): Promise<NotesExportResult>
  cancelNotesOperation(): Promise<void>
  onNotesProgress(listener: (progress: NotesArchiveProgress) => void): () => void
  onNotesMenuCommand(listener: (command: NotesMenuCommand) => void): () => void
  setNotesMenuState(state: NotesMenuState): Promise<void>
  chooseNotesImportArchive(): Promise<NotesFileChoice>
  prepareNotesImport(): Promise<NotesImportPreparation>
  commitNotesImport(): Promise<NotesImportCommit>
  takeNotesImportNotice(): Promise<NotesImportNotice | null>
  showReplacedNotesFolder(): Promise<void>
  suspendWrites(): void
  resumeWrites(): void
  reload(): void
}

interface NotesStore {
  getSnapshot(): { status: string; persistenceLocked?: boolean }
  subscribe(listener: () => void): () => void
  flushPersistence(): Promise<void>
  reportError(error: unknown): void
}

export type DataActivity =
  | { readonly phase: 'idle' | 'choosing' | 'canceling' }
  | {
      readonly phase: 'running' | 'done' | 'failed'
      readonly text: string
      readonly showFolder?: boolean
      readonly focusAction?: boolean
    }
  | { readonly phase: 'confirming' | 'replacing' | 'restart'; readonly text: string }

type PreparedImport = Extract<NotesImportPreparation, { ok: true }>
type PreparationState = { phase: 'none' } | { phase: 'prepared'; value: PreparedImport }

interface ReplacementAttempt {
  stage: 'flushing' | 'committing'
}

type OperationState =
  | { phase: 'idle' | 'canceling' }
  | { phase: 'choosing'; direction: 'import' | 'export' }
  | {
      phase: 'running'
      direction: 'import' | 'export'
      stage: 'flushing' | 'transferring'
      text: string
    }
  | { phase: 'confirming' | 'restart'; text: string }
  | { phase: 'replacing'; attempt: ReplacementAttempt }
  | { phase: 'done' | 'failed'; text: string; showFolder?: boolean; focusAction?: boolean }

function activityOf(operation: OperationState): DataActivity {
  switch (operation.phase) {
    case 'choosing':
      return { phase: 'choosing' }
    case 'running':
      return { phase: 'running', text: operation.text }
    case 'replacing':
      return { phase: 'replacing', text: 'Replacing Notes…' }
    default:
      return operation
  }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Coordinates the desktop archive commands without DOM, React or platform dependencies. */
export class DesktopDataOperations {
  readonly menuCommands = new MenuCommands()
  private operation: OperationState = { phase: 'idle' }
  private activity: DataActivity = activityOf(this.operation)
  private listeners = new Set<() => void>()
  private stops: (() => void)[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private epoch = 0
  private lifecycle: 'created' | 'started' | 'disposed' = 'created'
  private lastMenu: NotesMenuState | undefined
  private preparation: PreparationState = { phase: 'none' }
  private noticeTaken = false

  getConfirmation = (): PreparedImport | undefined =>
    this.preparation.phase === 'prepared' ? this.preparation.value : undefined

  constructor(
    private readonly api: DesktopNotesApi,
    private readonly store: NotesStore,
  ) {}

  getSnapshot = (): DataActivity => this.activity
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.lifecycle !== 'created') return
    this.lifecycle = 'started'
    this.stops = [
      this.store.subscribe(() => this.updateMenu()),
      this.api.onNotesProgress((progress) => {
        if (this.operation.phase === 'running') {
          const text = this.operation.direction === 'import' ? importProgressText : exportProgressText
          this.publish({ ...this.operation, text: text(progress.imagesDone, progress.imageCount) })
        }
      }),
      this.api.onNotesMenuCommand((command) => {
        if (command === 'export') void this.exportNotes()
        if (command === 'import') void this.importNotes()
      }),
    ]
    this.updateMenu()
  }

  private busy(): boolean {
    return (
      this.preparation.phase === 'prepared' ||
      ['choosing', 'running', 'canceling', 'replacing', 'restart'].includes(this.operation.phase)
    )
  }

  private updateMenu(): void {
    if (this.lifecycle === 'disposed') return
    const state = this.store.getSnapshot()
    const available = !state.persistenceLocked && !this.busy()
    const next = {
      canExport: state.status === 'ready' && available,
      canImport: (state.status === 'ready' || state.status === 'error') && available,
    }
    this.menuCommands.update([
      {
        name: 'export-notes',
        enabled: next.canExport,
        run: () => {
          void this.exportNotes()
        },
      },
      {
        name: 'import-notes',
        enabled: next.canImport,
        run: () => {
          void this.importNotes()
        },
      },
    ])
    if (!this.noticeTaken && (state.status === 'ready' || state.status === 'error')) {
      this.noticeTaken = true
      void this.showImportNotice()
    }
    if (next.canExport === this.lastMenu?.canExport && next.canImport === this.lastMenu.canImport) return
    this.lastMenu = next
    void this.api.setNotesMenuState(next).catch((error: unknown) => this.store.reportError(error))
  }

  private publish(operation: OperationState): void {
    this.operation = operation
    this.activity = activityOf(operation)
    this.updateMenu()
    for (const listener of this.listeners) listener()
  }

  private beginTransfer(): void {
    if (this.operation.phase === 'running') this.operation = { ...this.operation, stage: 'transferring' }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  async exportNotes(fromConfirmation = false): Promise<void> {
    const state = this.store.getSnapshot()
    if (
      this.lifecycle === 'disposed' ||
      (this.busy() && !(fromConfirmation && this.operation.phase === 'confirming')) ||
      state.status !== 'ready' ||
      state.persistenceLocked
    )
      return
    this.clearTimer()
    const epoch = ++this.epoch
    const current = () => this.lifecycle !== 'disposed' && this.epoch === epoch
    this.publish({ phase: 'choosing', direction: 'export' })
    let failure = 'The export stopped unexpectedly.'
    try {
      const choice = await this.api.chooseNotesExportDestination()
      if (!current()) {
        await this.api.cancelNotesOperation()
        return
      }
      if (!choice.ok) {
        this.publish(this.preparation.phase === 'none' ? { phase: 'idle' } : { phase: 'confirming', text: '' })
        return
      }
      this.publish({ phase: 'running', direction: 'export', stage: 'flushing', text: exportProgressText(0, 0) })
      try {
        await this.store.flushPersistence()
      } catch (error) {
        failure = `Your latest changes could not be saved: ${messageOf(error)}`
        throw error
      }
      if (!current()) return
      this.beginTransfer()
      const result = await this.api.startNotesExport()
      if (!current()) return
      if (!result.ok) {
        if (this.preparation.phase === 'prepared') {
          this.publish({ phase: 'confirming', text: result.canceled ? '' : `Export failed. ${result.message}` })
          return
        }
        this.publish(
          result.canceled ? { phase: 'idle' } : { phase: 'failed', text: `Export failed. ${result.message}` },
        )
        return
      }
      if (this.preparation.phase === 'prepared') {
        this.publish({ phase: 'confirming', text: exportResultText(result.fileName, result.summary) })
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
      this.preparation = { phase: 'none' }
      if (current()) this.publish({ phase: 'failed', text: `Export failed. ${failure}` })
    }
  }

  async importNotes(): Promise<void> {
    const state = this.store.getSnapshot()
    if (
      this.lifecycle === 'disposed' ||
      this.busy() ||
      !['ready', 'error'].includes(state.status) ||
      state.persistenceLocked
    )
      return
    this.clearTimer()
    const epoch = ++this.epoch
    const current = () => this.lifecycle !== 'disposed' && epoch === this.epoch
    this.publish({ phase: 'choosing', direction: 'import' })
    try {
      const choice = await this.api.chooseNotesImportArchive()
      if (!current()) return
      if (!choice.ok) {
        this.publish({ phase: 'idle' })
        return
      }
      this.publish({ phase: 'running', direction: 'import', stage: 'flushing', text: importProgressText(0, 0) })
      if (state.status === 'ready') {
        try {
          await this.store.flushPersistence()
        } catch (error) {
          throw new Error(`Your latest changes could not be saved: ${messageOf(error)}`, { cause: error })
        }
      }
      if (!current()) return
      this.beginTransfer()
      const result = await this.api.prepareNotesImport()
      if (!current()) return
      if (!result.ok) {
        this.publish(
          result.canceled ? { phase: 'idle' } : { phase: 'failed', text: `Import failed. ${result.message}` },
        )
        return
      }
      this.preparation = { phase: 'prepared', value: result }
      this.publish({ phase: 'confirming', text: '' })
    } catch (error) {
      if (!current()) return
      await this.api.cancelNotesOperation().catch((cause: unknown) => this.store.reportError(cause))
      if (current()) this.publish({ phase: 'failed', text: `Import failed. ${messageOf(error)}` })
    }
  }

  replaceNotes = async (): Promise<void> => {
    if (
      this.operation.phase !== 'confirming' ||
      this.preparation.phase !== 'prepared' ||
      this.store.getSnapshot().persistenceLocked
    )
      return
    const attempt: ReplacementAttempt = { stage: 'flushing' }
    this.publish({ phase: 'replacing', attempt })
    try {
      if (this.store.getSnapshot().status === 'ready') await this.store.flushPersistence()
      if (this.lifecycle === 'disposed') return
      this.api.suspendWrites()
      attempt.stage = 'committing'
      const result = await this.api.commitNotesImport()
      if (result.ok) {
        this.api.reload()
        return
      }
      if (!result.canceled && result.restartRequired) {
        this.publish({
          phase: 'restart',
          text: `Import failed. ${result.message} Restart Tree to complete the import.`,
        })
        return
      }
      this.preparation = { phase: 'none' }
      this.api.resumeWrites()
      this.publish(result.canceled ? { phase: 'idle' } : { phase: 'failed', text: `Import failed. ${result.message}` })
    } catch (error) {
      // An IPC failure during commit cannot prove that the journal was not written.
      if (attempt.stage === 'committing') {
        this.publish({
          phase: 'restart',
          text: `Import failed. ${messageOf(error)} Restart Tree to complete the import.`,
        })
      } else {
        this.preparation = { phase: 'none' }
        await this.api.cancelNotesOperation().catch((cause: unknown) => this.store.reportError(cause))
        this.publish({
          phase: 'failed',
          text: `Import failed. Your latest changes could not be saved: ${messageOf(error)}`,
        })
      }
    }
  }

  private async showImportNotice(): Promise<void> {
    try {
      const notice = await this.api.takeNotesImportNotice()
      if (this.lifecycle === 'disposed' || notice === null || this.busy()) return
      const text = notice.fileName === undefined ? 'Imported notes.' : `Imported “${notice.fileName}”.`
      this.publish({
        phase: 'done',
        text: notice.replacedFolder === null ? text : `${text} Your previous notes are in “${notice.replacedFolder}”.`,
        showFolder: notice.replacedFolder !== null,
        focusAction: true,
      })
      if (notice.replacedFolder === null) this.timer = setTimeout(this.dismiss, 6000)
    } catch (error) {
      this.store.reportError(error)
    }
  }

  showReplacedFolder = (): void => {
    void this.api.showReplacedNotesFolder().catch((error: unknown) => this.store.reportError(error))
  }

  dismiss = (): void => {
    if (this.busy()) return
    this.clearTimer()
    this.publish({ phase: 'idle' })
  }

  cancel = async (): Promise<void> => {
    if (!['running', 'confirming'].includes(this.operation.phase)) return
    ++this.epoch
    this.publish({ phase: 'canceling' })
    try {
      await this.api.cancelNotesOperation()
    } catch (error) {
      this.store.reportError(error)
    }
    this.preparation = { phase: 'none' }
    if (this.lifecycle !== 'disposed') this.publish({ phase: 'idle' })
  }

  dispose(): void {
    this.lifecycle = 'disposed'
    ++this.epoch
    this.clearTimer()
    for (const stop of this.stops.splice(0)) stop()
    this.listeners.clear()
    void this.api.cancelNotesOperation().catch((error: unknown) => this.store.reportError(error))
  }
}
