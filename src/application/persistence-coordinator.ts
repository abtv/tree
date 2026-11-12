import { serializeState, type AttachmentId, type Document, type Location, type ViewState } from '../domain/document'

export interface PersistenceServices {
  save(state: ReturnType<typeof serializeState>): Promise<void>
  cleanupAttachments(referencedIds: AttachmentId[]): Promise<void>
}

export interface PersistedStateSource {
  document: Document
  location: Location
  view?: ViewState
}

export interface PersistenceCoordinatorDependencies {
  currentState(): PersistedStateSource | undefined
  referencedAttachmentIds(): Iterable<AttachmentId>
  hasPendingDocumentChanges(): boolean
  onSaveCaptured(): void
  onDocumentSaved(): void
  onResult(error: unknown | undefined, kind?: PersistenceFailureKind): void
}

export type PersistenceFailureKind = 'save' | 'cleanup'

type PendingPersistence = 'none' | 'save' | 'cleanup' | 'save-and-cleanup' | 'deferred-cleanup'
type PersistencePhase = 'idle' | 'queued' | 'running' | 'saving' | 'cleaning'
type PersistenceOutcome = { status: 'success' } | { status: 'failure'; error: unknown }

function outcome(error?: unknown): PersistenceOutcome {
  return error === undefined ? { status: 'success' } : { status: 'failure', error }
}

export class PersistenceCoordinator {
  private saveQueue: Promise<void> = Promise.resolve()
  private phase: PersistencePhase = 'idle'
  private pending: PendingPersistence = 'none'
  private lastOutcome: PersistenceOutcome = { status: 'success' }
  private saveOutcome: PersistenceOutcome = { status: 'success' }

  public constructor(
    private readonly services: PersistenceServices,
    private readonly dependencies: PersistenceCoordinatorDependencies,
  ) {}

  public requestSave(): void {
    this.pending = this.hasPendingCleanup() ? 'save-and-cleanup' : 'save'
    this.schedule()
  }

  public requestAttachmentCleanup(): void {
    this.pending = this.hasPendingSave() ? 'save-and-cleanup' : 'cleanup'
    this.schedule()
  }

  public discardPendingSaves(): void {
    if (this.pending === 'save') this.pending = 'none'
    else if (this.pending === 'save-and-cleanup') this.pending = 'cleanup'
  }

  public async flush(): Promise<void> {
    this.schedulePendingCleanup()
    let queue: Promise<void>
    do {
      queue = this.saveQueue
      await queue
    } while (queue !== this.saveQueue)
    if (this.lastOutcome.status === 'failure') throw this.lastOutcome.error
  }

  private schedulePendingCleanup(): void {
    if (this.hasPendingCleanup() && this.phase === 'idle') {
      if (this.pending === 'deferred-cleanup') this.pending = 'cleanup'
      this.schedule()
    }
  }

  private hasPendingSave(): boolean {
    return this.pending === 'save' || this.pending === 'save-and-cleanup'
  }

  private hasPendingCleanup(): boolean {
    return this.pending === 'cleanup' || this.pending === 'save-and-cleanup' || this.pending === 'deferred-cleanup'
  }

  private hasRequestedWork(): boolean {
    return this.pending !== 'none' && this.pending !== 'deferred-cleanup'
  }

  private deferCleanup(): void {
    if (this.hasPendingSave()) this.pending = 'save-and-cleanup'
    else if (this.pending === 'none') this.pending = 'deferred-cleanup'
  }

  private schedule(): void {
    if (this.phase !== 'idle') return

    this.phase = 'queued'
    this.saveQueue = this.saveQueue
      .then(async () => {
        while (this.hasRequestedWork()) {
          this.phase = 'running'
          const saveRequested = this.hasPendingSave()
          const cleanupRequested = this.hasPendingCleanup()
          this.pending = 'none'
          try {
            const state = this.dependencies.currentState()
            if (state === undefined) continue
            if (saveRequested) {
              this.dependencies.onSaveCaptured()
              this.phase = 'saving'
              try {
                await this.services.save(serializeState(state.document, state.location, state.view))
                this.saveOutcome = outcome()
                this.dependencies.onDocumentSaved()
              } catch (error) {
                this.saveOutcome = outcome(error)
                if (cleanupRequested) this.deferCleanup()
                throw error
              }
              this.phase = 'running'
            }
            if (cleanupRequested) await this.runCleanup(saveRequested)
            this.lastOutcome = this.saveOutcome
            this.dependencies.onResult(this.lastOutcome.status === 'failure' ? this.lastOutcome.error : undefined)
          } catch (error) {
            this.reportFailure(error)
          }
        }
      })
      .finally(() => {
        this.phase = 'idle'
        if (this.hasRequestedWork()) this.schedule()
      })
  }

  private reportFailure(error: unknown): void {
    this.lastOutcome = outcome(error)
    const kind = this.phase === 'saving' ? 'save' : this.phase === 'cleaning' ? 'cleanup' : undefined
    this.dependencies.onResult(error, kind)
  }

  private async runCleanup(saveRequested: boolean): Promise<void> {
    if (!saveRequested && this.dependencies.hasPendingDocumentChanges()) {
      this.deferCleanup()
      return
    }
    try {
      this.phase = 'cleaning'
      await this.services.cleanupAttachments([...this.dependencies.referencedAttachmentIds()])
    } catch (error) {
      this.deferCleanup()
      throw error
    }
    this.phase = 'running'
  }
}
