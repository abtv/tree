import { describe, expect, it, vi } from 'vitest'
import { EditorSaveScheduler } from './editor-save-scheduler'
import type { Clock } from './editor-store-types'
import { SAVE_IDLE_MILLISECONDS } from './save-policy'

const state = {
  document: { roots: [{ id: 'root', text: '', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

class ManualClock implements Clock {
  private readonly timers = new Map<number, { callback: () => void; at: number }>()
  private nextId = 1
  private now = 0

  public setTimeout(callback: () => void, milliseconds: number): number {
    const id = this.nextId
    this.nextId += 1
    this.timers.set(id, { callback, at: this.now + milliseconds })
    return id
  }

  public clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number)
  }

  public async advanceTo(time: number): Promise<void> {
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= time)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (due === undefined) break
      this.timers.delete(due[0])
      this.now = due[1].at
      due[1].callback()
      await settle()
    }
    this.now = time
  }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createHarness() {
  const clock = new ManualClock()
  const save = vi.fn(async (): Promise<void> => undefined)
  const cleanupAttachments = vi.fn(async (): Promise<void> => undefined)
  const scheduler = new EditorSaveScheduler({ save, cleanupAttachments }, clock, {
    currentState: () => state,
    referencedAttachmentIds: () => [],
    isPersistenceLocked: () => false,
    onPersistenceResult: vi.fn(),
  })
  return { clock, save, cleanupAttachments, scheduler }
}

const IDLE = SAVE_IDLE_MILLISECONDS

describe('EditorSaveScheduler idle saves', () => {
  it('saves once after the idle interval and postpones the save while changes continue', async () => {
    const { clock, save, scheduler } = createHarness()

    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE / 2)
    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE)
    expect(save).not.toHaveBeenCalled()

    await clock.advanceTo(IDLE / 2 + IDLE)
    expect(save).toHaveBeenCalledTimes(1)
    expect(scheduler.hasPendingChanges()).toBe(false)
  })

  it('cancels the armed idle save when an immediate save runs, and arms a fresh one for later changes', async () => {
    const { clock, save, scheduler } = createHarness()

    scheduler.markPersistedChange()
    await clock.advanceTo(1_000)
    scheduler.requestImmediateSave()
    await settle()
    expect(save).toHaveBeenCalledTimes(1)

    await clock.advanceTo(2_000)
    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE + 1_000)
    expect(save).toHaveBeenCalledTimes(1)

    await clock.advanceTo(2_000 + IDLE)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('arms an idle save for a change without delay after an immediate save cleared the timer', async () => {
    const { clock, save, scheduler } = createHarness()

    scheduler.markPersistedChange()
    await clock.advanceTo(1_000)
    scheduler.requestImmediateSave()
    await settle()

    await clock.advanceTo(2_000)
    scheduler.markPersistedChangeWithoutDelay()
    await clock.advanceTo(IDLE + 1_000)
    expect(save).toHaveBeenCalledTimes(1)

    await clock.advanceTo(2_000 + IDLE)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('does not postpone an armed idle save for a change without delay', async () => {
    const { clock, save, scheduler } = createHarness()

    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE / 2)
    scheduler.markPersistedChangeWithoutDelay()
    await clock.advanceTo(IDLE)

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does not save when no change is pending', async () => {
    const { save, scheduler } = createHarness()

    scheduler.requestImmediateSave()
    await settle()

    expect(save).not.toHaveBeenCalled()
  })

  it('stops an armed idle save when its timer is cancelled', async () => {
    const { clock, save, scheduler } = createHarness()

    scheduler.markPersistedChange()
    scheduler.cancelSaveTimer()
    await clock.advanceTo(IDLE * 2)

    expect(save).not.toHaveBeenCalled()
    expect(scheduler.hasPendingChanges()).toBe(true)
  })
})

describe('EditorSaveScheduler volume trigger', () => {
  it('does not turn a change without inserted words into a volume save after a failed save', async () => {
    const { clock, save, scheduler } = createHarness()
    save.mockRejectedValueOnce(new Error('disk full'))

    scheduler.noteChange(10, false)
    await settle()
    expect(save).toHaveBeenCalledTimes(1)
    scheduler.registerSaveFailure('save')
    scheduler.scheduleIdleSave()

    scheduler.noteChange(0, false)
    await settle()
    expect(save).toHaveBeenCalledTimes(1)

    await clock.advanceTo(IDLE)
    expect(save).toHaveBeenCalledTimes(2)
  })
})

describe('EditorSaveScheduler failure accounting', () => {
  it('counts only save failures toward the save-failure limit', () => {
    const { scheduler } = createHarness()

    expect(scheduler.registerSaveFailure(undefined)).toBe(true)
    expect(scheduler.registerSaveFailure(undefined)).toBe(true)
    expect(scheduler.registerSaveFailure(undefined)).toBe(true)
    expect(scheduler.registerSaveFailure('save')).toBe(true)
    expect(scheduler.registerSaveFailure('save')).toBe(true)
    expect(scheduler.registerSaveFailure('save')).toBe(false)
  })

  it('restarts the save-failure count after a cleanup failure', () => {
    const { scheduler } = createHarness()

    scheduler.registerSaveFailure('save')
    scheduler.registerSaveFailure('save')
    scheduler.registerCleanupFailure()

    expect(scheduler.registerSaveFailure('save')).toBe(true)
  })
})

describe('EditorSaveScheduler cleanup retry', () => {
  it('retries cleanup once after the idle interval without saving the document', async () => {
    const { clock, save, cleanupAttachments, scheduler } = createHarness()

    scheduler.scheduleCleanupRetry()
    await clock.advanceTo(IDLE - 1)
    expect(cleanupAttachments).not.toHaveBeenCalled()

    await clock.advanceTo(IDLE)
    expect(cleanupAttachments).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
  })

  it('replaces an armed cleanup retry with the latest one', async () => {
    const { clock, cleanupAttachments, scheduler } = createHarness()

    scheduler.scheduleCleanupRetry()
    await clock.advanceTo(IDLE / 2)
    scheduler.scheduleCleanupRetry()
    await clock.advanceTo(IDLE)
    expect(cleanupAttachments).not.toHaveBeenCalled()

    await clock.advanceTo(IDLE / 2 + IDLE)
    expect(cleanupAttachments).toHaveBeenCalledTimes(1)
  })

  // @requirement PRODUCT.md §16.1
  it('still saves pending changes at the idle interval when a cleanup retry is scheduled meanwhile', async () => {
    const { clock, save, scheduler } = createHarness()

    scheduler.markPersistedChange()
    await clock.advanceTo(1_000)
    scheduler.scheduleCleanupRetry()
    await clock.advanceTo(IDLE)

    expect(save).toHaveBeenCalledTimes(1)
  })
})
