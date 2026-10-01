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

  // Mutation triage: guards that only skip `clearTimeout(undefined)` are equivalent, because clearing
  // an unarmed timer is a no-op. A pending change with no armed timer (a locked editor) defers the
  // cleanup retry anyway, so returning early in `scheduleCleanupRetry` is equivalent there too.
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

  /**
   * Marks a pending change that must not postpone an idle save already armed for earlier changes.
   * Continuous input such as scrolling would otherwise keep resetting the timer and hold back a
   * pending text edit until the input stopped.
   */
  public markPersistedChangeWithoutDelay(): void {
    this.changesPending = true
    if (this.context.isPersistenceLocked() || this.saveTimer !== undefined) return
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
    // A pending change already has its idle save armed. The coordinator keeps the failed cleanup
    // requested, so that save retries it, and replacing the timer would postpone a save that
    // PRODUCT.md §16.1 requires at the idle interval.
    if (this.changesPending && this.saveTimer !== undefined) return
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
    // The coordinator always captures a save before acknowledging it, so this guard is an internal defense.
    if (this.pendingSaveWatermark === undefined) return
    this.savedWordsWatermark = Math.max(this.savedWordsWatermark, this.pendingSaveWatermark)
    this.pendingSaveWatermark = undefined
  }
}
