import type { AttachmentId } from '../domain/document'
import type { Clock } from './editor-store-types'
import {
  PersistenceCoordinator,
  type PersistedStateSource,
  type PersistenceFailureKind,
  type PersistenceServices,
} from './persistence-coordinator'
import {
  CLEANUP_MAX_CONSECUTIVE_FAILURES,
  SAVE_IDLE_MILLISECONDS,
  SAVE_MAX_CONSECUTIVE_FAILURES,
  SAVE_WORD_THRESHOLD,
} from './save-policy'

export interface SaveSchedulerContext {
  currentState(): PersistedStateSource | undefined
  referencedAttachmentIds(): Iterable<AttachmentId>
  isPersistenceLocked(): boolean
  onPersistenceResult(error: unknown | undefined, kind?: PersistenceFailureKind): void
}

export class EditorSaveScheduler {
  private readonly persistence: PersistenceCoordinator
  private saveTimer: unknown
  private changesPending = false
  private insertedWordsWatermark = 0
  private savedWordsWatermark = 0
  private pendingSaveWatermark: number | undefined
  private consecutiveSaveFailures = 0
  private consecutiveCleanupFailures = 0

  public constructor(
    services: PersistenceServices,
    private readonly clock: Clock,
    private readonly context: SaveSchedulerContext,
  ) {
    this.persistence = new PersistenceCoordinator(services, {
      currentState: () => this.context.currentState(),
      referencedAttachmentIds: () => this.context.referencedAttachmentIds(),
      hasPendingDocumentChanges: () => this.changesPending,
      onSaveCaptured: () => this.handleSaveCaptured(),
      onDocumentSaved: () => this.handleDocumentSaved(),
      onResult: (error, kind) => this.context.onPersistenceResult(error, kind),
    })
  }

  public hasPendingChanges(): boolean {
    return this.changesPending
  }

  public flush(): Promise<void> {
    return this.persistence.flush()
  }

  public requestSave(): void {
    this.persistence.requestSave()
  }

  public requestAttachmentCleanup(): void {
    this.persistence.requestAttachmentCleanup()
  }

  public discardPendingSaves(): void {
    this.persistence.discardPendingSaves()
  }

  public cancelSaveTimer(): void {
    if (this.saveTimer !== undefined) {
      this.clock.clearTimeout(this.saveTimer)
      this.saveTimer = undefined
    }
  }

  public resetFailures(): void {
    this.consecutiveSaveFailures = 0
    this.consecutiveCleanupFailures = 0
  }

  public registerCleanupFailure(): boolean {
    this.consecutiveCleanupFailures += 1
    this.consecutiveSaveFailures = 0
    return this.consecutiveCleanupFailures < CLEANUP_MAX_CONSECUTIVE_FAILURES
  }

  public registerSaveFailure(kind: PersistenceFailureKind | undefined): boolean {
    if (kind === 'save') this.consecutiveSaveFailures += 1
    this.changesPending = true
    return this.consecutiveSaveFailures < SAVE_MAX_CONSECUTIVE_FAILURES
  }

  public markPersistedChange(): void {
    this.changesPending = true
    if (this.context.isPersistenceLocked()) return
    this.scheduleIdleSave()
  }

  public noteChange(insertedWords: number, saveImmediately: boolean): void {
    if (insertedWords > 0) {
      this.insertedWordsWatermark += insertedWords
      if (this.insertedWordsWatermark - this.savedWordsWatermark >= SAVE_WORD_THRESHOLD) saveImmediately = true
    }
    this.markPersistedChange()
    if (saveImmediately) this.requestImmediateSave()
  }

  public requestImmediateSave(): void {
    this.requestPolicySave()
  }

  private requestPolicySave(): void {
    if (!this.changesPending) return
    if (this.saveTimer !== undefined) {
      this.clock.clearTimeout(this.saveTimer)
      this.saveTimer = undefined
    }
    this.changesPending = false
    this.persistence.requestSave()
  }

  public scheduleIdleSave(): void {
    if (this.saveTimer !== undefined) this.clock.clearTimeout(this.saveTimer)
    this.saveTimer = this.clock.setTimeout(() => {
      this.saveTimer = undefined
      this.requestPolicySave()
    }, SAVE_IDLE_MILLISECONDS)
  }

  public scheduleCleanupRetry(): void {
    if (this.saveTimer !== undefined) this.clock.clearTimeout(this.saveTimer)
    this.saveTimer = this.clock.setTimeout(() => {
      this.saveTimer = undefined
      this.persistence.requestAttachmentCleanup()
    }, SAVE_IDLE_MILLISECONDS)
  }

  private handleSaveCaptured(): void {
    this.pendingSaveWatermark = this.insertedWordsWatermark
  }

  private handleDocumentSaved(): void {
    if (this.pendingSaveWatermark === undefined) return
    this.savedWordsWatermark = Math.max(this.savedWordsWatermark, this.pendingSaveWatermark)
    this.pendingSaveWatermark = undefined
  }
}
