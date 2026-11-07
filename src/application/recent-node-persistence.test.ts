import { expect, it, vi } from 'vitest'
import { RecentNodePersistence } from './recent-node-persistence'

// @requirement PRODUCT.md §20.14
// @requirement PRODUCT.md §20.14.1
it('retires the pending timer on an explicit flush and gives later changes a fresh deadline', async () => {
  vi.useFakeTimers()
  try {
    const write = vi.fn(async () => undefined)
    const persistence = new RecentNodePersistence(
      { setTimeout, clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
      () => ['a'],
      write,
      vi.fn(),
    )
    persistence.changed()
    await vi.advanceTimersByTimeAsync(10_000)

    await persistence.flush()

    expect(write).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)

    persistence.changed()
    await vi.advanceTimersByTimeAsync(29_999)

    expect(write).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(1)

    expect(write).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
