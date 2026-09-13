import { serializeState, type AttachmentId, type Document, type Location } from '../domain/document'

export interface PersistenceServices {
  save(state: ReturnType<typeof serializeState>): Promise<void>
  cleanupAttachments(referencedIds: AttachmentId[]): Promise<void>
}

export interface PersistenceCoordinatorDependencies {
  currentState(): { document: Document; location: Location } | undefined
  referencedAttachmentIds(): Iterable<AttachmentId>
  onResult(error: unknown | undefined): void
}

export class PersistenceCoordinator {
  private saveQueue: Promise<void> = Promise.resolve()
  private workQueued = false
  private requested = false
  private saveRequested = false
  private error: unknown

  public constructor(
    private readonly services: PersistenceServices,
    private readonly dependencies: PersistenceCoordinatorDependencies,
  ) {}

  public requestSave(): void {
    this.request(true)
  }

  public requestAttachmentCleanup(): void {
    this.request(false)
  }

  public async flush(): Promise<void> {
    await this.saveQueue
    if (this.error !== undefined) throw this.error
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
          this.saveRequested = false
          try {
            const state = this.dependencies.currentState()
            if (state === undefined) continue
            if (saveRequested) await this.services.save(serializeState(state.document, state.location))
            await this.services.cleanupAttachments([...this.dependencies.referencedAttachmentIds()])
            this.error = undefined
            this.dependencies.onResult(undefined)
          } catch (error) {
            this.error = error
            this.dependencies.onResult(error)
          }
        }
      })
      .finally(() => {
        this.workQueued = false
        if (this.requested) this.request(this.saveRequested)
      })
  }
}
