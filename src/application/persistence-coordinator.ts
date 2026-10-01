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

export class PersistenceCoordinator {
  private saveQueue: Promise<void> = Promise.resolve()
  // Mutation triage: the initial `requested` value and the `workQueued` guard are equivalent through
  // the public API. No work runs before a request sets `requested`, and without the guard an extra
  // request only chains an empty continuation behind the running one, because the saveQueue keeps
  // the runs serialized and the running loop already consumes the new request.
  private workQueued = false
  private requested = false
  private saveRequested = false
  private cleanupRequested = false
  private error: unknown
  private saveError: unknown
  private failureKind: PersistenceFailureKind | undefined

  public constructor(
    private readonly services: PersistenceServices,
    private readonly dependencies: PersistenceCoordinatorDependencies,
  ) {}

  public requestSave(): void {
    this.request(true)
  }

  public requestAttachmentCleanup(): void {
    this.cleanupRequested = true
    this.request(false)
  }

  public discardPendingSaves(): void {
    this.saveRequested = false
    if (!this.cleanupRequested) this.requested = false
  }

  public async flush(): Promise<void> {
    this.schedulePendingCleanup()
    let queue: Promise<void>
    do {
      queue = this.saveQueue
      await queue
    } while (queue !== this.saveQueue)
    if (this.error !== undefined) throw this.error
  }

  private schedulePendingCleanup(): void {
    if (this.cleanupRequested && !this.workQueued) this.request(false)
  }

  private request(save: boolean): void {
    this.requested = true
    this.saveRequested ||= save
    if (this.workQueued) return

    this.workQueued = true
    this.saveQueue = this.saveQueue
      .then(async () => {
        while (this.requested) {
          this.requested = false
          const saveRequested = this.saveRequested
          const cleanupRequested = this.cleanupRequested
          this.saveRequested = false
          this.cleanupRequested = false
          try {
            const state = this.dependencies.currentState()
            if (state === undefined) continue
            if (saveRequested) {
              this.dependencies.onSaveCaptured()
              try {
                await this.services.save(serializeState(state.document, state.location, state.view))
                this.saveError = undefined
                this.dependencies.onDocumentSaved()
              } catch (error) {
                this.saveError = error
                this.failureKind = 'save'
                if (cleanupRequested) this.cleanupRequested = true
                throw error
              }
            }
            if (cleanupRequested) await this.runCleanup(saveRequested)
            this.error = this.saveError
            this.dependencies.onResult(this.error)
          } catch (error) {
            this.error = error
            this.dependencies.onResult(error, this.failureKind)
            this.failureKind = undefined
          }
        }
      })
      .finally(() => {
        this.workQueued = false
        if (this.requested) this.request(this.saveRequested)
      })
  }

  private async runCleanup(saveRequested: boolean): Promise<void> {
    if (!saveRequested && this.dependencies.hasPendingDocumentChanges()) {
      this.cleanupRequested = true
      return
    }
    try {
      await this.services.cleanupAttachments([...this.dependencies.referencedAttachmentIds()])
    } catch (error) {
      this.cleanupRequested = true
      this.failureKind = 'cleanup'
      throw error
    }
  }
}
