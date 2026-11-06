import { describe, expect, it, vi } from 'vitest'
import { EditorSaveScheduler, type SaveSchedulerResult } from './editor-save-scheduler'
import type { Clock } from './editor-store-types'
import { SAVE_IDLE_MILLISECONDS, type SaveTiming } from './save-policy'

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

function createHarness(timing?: SaveTiming) {
  const clock = new ManualClock()
  const save = vi.fn(async (): Promise<void> => undefined)
  const cleanupAttachments = vi.fn(async (): Promise<void> => undefined)
  let locked = false
  const report = vi.fn((result: SaveSchedulerResult) => {
    if (result.status === 'success') locked = false
    else if (result.lock) locked = true
  })
  const scheduler = new EditorSaveScheduler(
    { save, cleanupAttachments },
    clock,
    {
      currentState: () => state,
      referencedAttachmentIds: () => [],
      isPersistenceLocked: () => locked,
      onPersistenceResult: report,
    },
    timing,
  )
  return { clock, save, cleanupAttachments, scheduler, report, locked: () => locked }
}

const IDLE = SAVE_IDLE_MILLISECONDS

it('uses explicit save and cleanup intervals without changing other clock timers', async () => {
  const { clock, save, cleanupAttachments, scheduler } = createHarness({
    idleMilliseconds: 300,
    cleanupRetryMilliseconds: 700,
  })
  const unrelated = vi.fn()
  clock.setTimeout(unrelated, IDLE)
  cleanupAttachments.mockRejectedValueOnce(new Error('unlink failed'))

  scheduler.markPersistedChange()
  await clock.advanceTo(299)

  expect(save).not.toHaveBeenCalled()

  await clock.advanceTo(300)
  scheduler.requestAttachmentCleanup()
  await settle()
  await clock.advanceTo(999)

  expect(save).toHaveBeenCalledTimes(1)
  expect(cleanupAttachments).toHaveBeenCalledTimes(1)
  expect(unrelated).not.toHaveBeenCalled()

  await clock.advanceTo(1_000)

  expect(cleanupAttachments).toHaveBeenCalledTimes(2)
  expect(save).toHaveBeenCalledTimes(1)

  await clock.advanceTo(IDLE)

  expect(unrelated).toHaveBeenCalledOnce()
})

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
})

describe('EditorSaveScheduler volume trigger', () => {
  it('does not turn a change without inserted words into a volume save after a failed save', async () => {
    const { clock, save, scheduler } = createHarness()
    save.mockRejectedValueOnce(new Error('disk full'))

    scheduler.noteChange(10, false)
    await settle()

    expect(save).toHaveBeenCalledTimes(1)

    scheduler.noteChange(0, false)
    await settle()

    expect(save).toHaveBeenCalledTimes(1)

    await clock.advanceTo(IDLE)

    expect(save).toHaveBeenCalledTimes(2)
  })
})

describe('EditorSaveScheduler failure lifecycle', () => {
  it('stops automatic writes at the failure limit and unlocks after a successful final save', async () => {
    const { clock, save, scheduler, locked, report } = createHarness()
    const error = new Error('disk full')
    save.mockRejectedValue(error)

    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE * 3)

    expect(save).toHaveBeenCalledTimes(3)
    expect(locked()).toBe(true)
    expect(report).toHaveBeenLastCalledWith({ status: 'failure', error, lock: true })
    expect(scheduler.hasPendingChanges()).toBe(true)

    scheduler.markPersistedChangeWithoutDelay()
    await clock.advanceTo(IDLE * 10)

    expect(save).toHaveBeenCalledTimes(3)

    save.mockResolvedValue(undefined)
    scheduler.requestImmediateSave()
    await scheduler.flush()

    expect(save).toHaveBeenCalledTimes(4)
    expect(locked()).toBe(false)
    expect(report).toHaveBeenLastCalledWith({ status: 'success' })
    expect(scheduler.hasPendingChanges()).toBe(false)

    save.mockRejectedValue(error)
    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE * 11)

    expect(save).toHaveBeenCalledTimes(5)
    expect(locked()).toBe(false)
  })

  it('does not count a repeated earlier save error as another failed write', async () => {
    const { clock, save, scheduler, cleanupAttachments, locked, report } = createHarness()
    const error = new Error('disk full')
    save.mockRejectedValue(error)
    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE * 2)

    for (let repeat = 0; repeat < 3; repeat++) {
      scheduler.requestAttachmentCleanup()
      await settle()
    }

    expect(save).toHaveBeenCalledTimes(2)
    expect(cleanupAttachments).not.toHaveBeenCalled()
    expect(locked()).toBe(false)
    expect(report).toHaveBeenLastCalledWith({ status: 'failure', error, lock: false })

    await clock.advanceTo(IDLE * 3)

    expect(save).toHaveBeenCalledTimes(3)
    expect(locked()).toBe(true)
  })

  it('resets save failure accounting when a saved document is followed by a cleanup failure', async () => {
    const { clock, save, cleanupAttachments, scheduler, locked } = createHarness()
    save.mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce(new Error('second'))
    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE * 2)
    cleanupAttachments.mockRejectedValueOnce(new Error('unlink'))

    scheduler.requestImmediateSave()
    scheduler.requestAttachmentCleanup()
    await settle()

    expect(save).toHaveBeenCalledTimes(3)
    expect(cleanupAttachments).toHaveBeenCalledOnce()
    expect(scheduler.hasPendingChanges()).toBe(false)
    expect(locked()).toBe(false)

    save.mockRejectedValue(new Error('new failure'))
    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE * 4)

    expect(save).toHaveBeenCalledTimes(5)
    expect(locked()).toBe(false)

    await clock.advanceTo(IDLE * 5)

    expect(locked()).toBe(true)
  })

  it('discards a queued write when the in-flight third attempt fails', async () => {
    const { clock, save, scheduler, locked } = createHarness()
    save.mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce(new Error('second'))
    scheduler.markPersistedChange()
    await clock.advanceTo(IDLE * 2)
    let reject: (error: Error) => void = () => undefined
    save.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail
        }),
    )

    scheduler.requestImmediateSave()
    await settle()
    scheduler.requestSave()
    reject(new Error('third'))
    await expect(scheduler.flush()).rejects.toThrow('third')
    await clock.advanceTo(IDLE * 10)

    expect(save).toHaveBeenCalledTimes(3)
    expect(locked()).toBe(true)
  })
})

describe('EditorSaveScheduler cleanup retry', () => {
  it('bounds cleanup retries without saving or locking, retaining work for a later flush', async () => {
    const { clock, save, cleanupAttachments, scheduler, locked } = createHarness()
    cleanupAttachments.mockRejectedValue(new Error('unlink'))

    scheduler.requestAttachmentCleanup()
    await settle()
    await clock.advanceTo(IDLE - 1)

    expect(cleanupAttachments).toHaveBeenCalledOnce()

    await clock.advanceTo(IDLE)

    expect(cleanupAttachments).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()

    await clock.advanceTo(IDLE * 10)

    expect(cleanupAttachments).toHaveBeenCalledTimes(3)
    expect(scheduler.hasPendingChanges()).toBe(false)
    expect(locked()).toBe(false)

    cleanupAttachments.mockResolvedValue(undefined)
    await scheduler.flush()

    expect(cleanupAttachments).toHaveBeenCalledTimes(4)
    expect(save).not.toHaveBeenCalled()
  })

  it('replaces an armed cleanup retry with the latest one', async () => {
    const { clock, cleanupAttachments, scheduler } = createHarness()
    cleanupAttachments.mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce(new Error('second'))

    scheduler.requestAttachmentCleanup()
    await settle()
    await clock.advanceTo(IDLE / 2)
    scheduler.requestAttachmentCleanup()
    await settle()
    await clock.advanceTo(IDLE)

    expect(cleanupAttachments).toHaveBeenCalledTimes(2)

    await clock.advanceTo(IDLE / 2 + IDLE)

    expect(cleanupAttachments).toHaveBeenCalledTimes(3)
  })

  // @requirement PRODUCT.md §16.1
  it('still saves pending changes at the idle interval when a cleanup retry is scheduled meanwhile', async () => {
    const { clock, save, cleanupAttachments, scheduler } = createHarness()
    let reject: (error: Error) => void = () => undefined
    cleanupAttachments.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail
        }),
    )
    scheduler.requestAttachmentCleanup()
    await settle()

    scheduler.markPersistedChange()
    await clock.advanceTo(1_000)
    reject(new Error('unlink'))
    await settle()
    await clock.advanceTo(IDLE)

    expect(save).toHaveBeenCalledTimes(1)
    expect(cleanupAttachments).toHaveBeenCalledTimes(2)
  })
})
