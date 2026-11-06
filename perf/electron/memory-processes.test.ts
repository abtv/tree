import { afterEach, expect, it, vi } from 'vitest'
import { assertMemoryBudget } from '../memory-budget'
import { collectWithGpuMemory } from './memory-processes'

afterEach(() => vi.useRealTimers())

it('requests a rendered frame when passive polling cannot start the GPU', async () => {
  vi.useFakeTimers()
  let rendered = false
  const complete = { processes: [{ type: 'GPU', workingSetSize: 150628 }] }
  const collect = vi.fn(async () => (rendered ? complete : { processes: [] }))
  const render = vi.fn(async () => {
    rendered = true
  })
  const pending = expect(collectWithGpuMemory(collect, render)).resolves.toEqual(complete)

  await vi.runAllTimersAsync()

  await pending
  expect(render).toHaveBeenCalledTimes(1)
})

it('waits for GPU memory before establishing the shared-session baseline', async () => {
  vi.useFakeTimers()
  // Ubuntu x64 run 42289048241: the first two samples omitted the GPU process.
  const incomplete = {
    processes: [
      { type: 'Browser', workingSetSize: 201708 },
      { type: 'Utility', workingSetSize: 99948 },
      { type: 'Tab', workingSetSize: 148556 },
    ],
  }
  const complete = {
    processes: [
      { type: 'Browser', workingSetSize: 192984 },
      { type: 'GPU', workingSetSize: 150628 },
      { type: 'Utility', workingSetSize: 99948 },
      { type: 'Tab', workingSetSize: 172152 },
    ],
  }
  const collect = vi.fn().mockResolvedValueOnce(incomplete).mockResolvedValue(complete)
  const pending = collectWithGpuMemory(collect, async () => {})

  await vi.runAllTimersAsync()
  const baseline = await pending
  const total = (sample: typeof complete) =>
    sample.processes.reduce((sum, process) => sum + process.workingSetSize * 1024, 0)

  expect(baseline).toEqual(complete)
  expect(() =>
    assertMemoryBudget([{ total: total(baseline) }, { total: total(complete) }], {
      total: { maxBytes: 800 * 1024 ** 2, growthBytes: 160 * 1024 ** 2 },
    }),
  ).not.toThrow()
  expect(() =>
    assertMemoryBudget([{ total: total(baseline) }, { total: total(baseline) + 161 * 1024 ** 2 }], {
      total: { maxBytes: 800 * 1024 ** 2, growthBytes: 160 * 1024 ** 2 },
    }),
  ).toThrow('growth')
})

it('does not retry or discard a complete high-footprint sample', async () => {
  const sample = { processes: [{ type: 'GPU', workingSetSize: 900 * 1024 }] }
  const collect = vi.fn().mockResolvedValue(sample)
  const render = vi.fn(async () => {})

  expect(await collectWithGpuMemory(collect, render)).toBe(sample)
  expect(collect).toHaveBeenCalledTimes(1)
  expect(render).not.toHaveBeenCalled()
})

it.each([
  { processes: [] },
  { processes: [{ type: 'GPU', workingSetSize: 0 }] },
  { processes: [{ type: 'GPU', workingSetSize: Number.NaN }] },
])('fails when GPU memory stays unavailable: $processes', async ({ processes }) => {
  vi.useFakeTimers()
  const collect = vi.fn().mockResolvedValue({ processes })
  const pending = expect(collectWithGpuMemory(collect, async () => {})).rejects.toThrow(
    'GPU memory was unavailable for 10 seconds',
  )

  await vi.advanceTimersByTimeAsync(10_000)

  await pending
})

it('propagates collection failures without retrying them', async () => {
  const collect = vi.fn().mockRejectedValue(new Error('Application closed'))

  await expect(collectWithGpuMemory(collect, async () => {})).rejects.toThrow('Application closed')
  expect(collect).toHaveBeenCalledTimes(1)
})

it('bounds a stalled frame capture instead of hanging the sample', async () => {
  vi.useFakeTimers()
  const pending = expect(
    collectWithGpuMemory(
      async () => ({ processes: [] }),
      () => new Promise<void>(() => {}),
    ),
  ).rejects.toThrow('GPU memory was unavailable for 10 seconds')

  await vi.advanceTimersByTimeAsync(10_000)

  await pending
})
