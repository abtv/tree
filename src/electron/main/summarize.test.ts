import { PassThrough } from 'node:stream'
import { execFile } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSummarization } from './summarize'
import { SUMMARY_INPUT_BYTES, SUMMARY_MAX_REQUESTS, SUMMARY_OUTPUT_BYTES } from '../../shared/summarize'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
let finish: (error: Error | null, text: string) => void
let stdin: PassThrough
let kill: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  stdin = new PassThrough()
  kill = vi.fn()
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    finish = args[3] as typeof finish
    return { stdin, kill } as unknown as ReturnType<typeof execFile>
  })
})

afterEach(() => vi.useRealTimers())

it('coalesces availability probes and retries after a native failure', async () => {
  const worker = createSummarization('/helper')
  const first = worker.available()
  const duplicate = worker.available()

  expect(execFile).toHaveBeenCalledExactlyOnceWith(
    '/helper',
    ['--available'],
    { timeout: 15_000, maxBuffer: 32_768, killSignal: 'SIGKILL' },
    expect.any(Function),
  )
  expect(stdin.read()).toBeNull()
  finish(new Error('Native launch failed'), '')

  await expect(first).resolves.toBe(false)
  await expect(duplicate).resolves.toBe(false)
  const retry = worker.available()
  expect(execFile).toHaveBeenCalledTimes(2)
  finish(null, '{"available":true}')
  await expect(retry).resolves.toBe(true)
})

it('does not treat an unavailable native model as ready', async () => {
  const worker = createSummarization('/helper')
  expect(() => worker.cancelAll()).not.toThrow()
  const pending = worker.available()

  finish(null, '{"available":false}')

  await expect(pending).resolves.toBe(false)
  worker.cancelAll()
  expect(kill).not.toHaveBeenCalled()
})

it('keeps an active inference owned when an overlapping availability probe completes', async () => {
  const worker = createSummarization('/helper')
  const available = worker.available()
  const finishProbe = finish
  await worker.begin('job')
  stdin = new PassThrough()
  const pending = worker.reduce('job', 'Notes', true)

  finishProbe(null, '{"available":true}')
  await expect(available).resolves.toBe(true)
  worker.cancelAll()
  finish(null, '{"text":"Late"}')

  await expect(pending).rejects.toThrow('canceled')
  expect(kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
})

it('releases a completed inference before cancellation of its job', async () => {
  const worker = createSummarization('/helper')
  await worker.begin('job')
  const pending = worker.reduce('job', 'Notes', true)
  finish(null, '{"text":"Summary"}')
  await expect(pending).resolves.toBe('Summary')

  await worker.cancel('job')

  expect(kill).not.toHaveBeenCalled()
})

it('accepts exact UTF-8 input and output limits and rejects an oversized result', async () => {
  const worker = createSummarization('/helper')
  await worker.begin('job')
  const input = 'é'.repeat(SUMMARY_INPUT_BYTES / 2)
  const output = 'é'.repeat(SUMMARY_OUTPUT_BYTES / 2)

  const exact = worker.reduce('job', input, false)
  finish(null, JSON.stringify({ text: output }))
  await expect(exact).resolves.toBe(output)
  const excessive = worker.reduce('job', 'Notes', true)
  finish(null, JSON.stringify({ text: output + 'é' }))

  await expect(excessive).rejects.toThrow('Apple Intelligence returned an invalid summary.')
})

it('enforces the total native request limit and resets it for the next job', async () => {
  const worker = createSummarization('/helper')
  await worker.begin('job')

  for (let index = 0; index < SUMMARY_MAX_REQUESTS; index++) {
    stdin = new PassThrough()
    const pending = worker.reduce('job', 'Notes', false)
    finish(null, '{"text":"Summary"}')
    await expect(pending).resolves.toBe('Summary')
  }

  await expect(worker.reduce('job', 'Notes', true)).rejects.toThrow('Summarization exceeded its processing limit.')
  expect(execFile).toHaveBeenCalledTimes(SUMMARY_MAX_REQUESTS)
  await worker.finish('job', 'Summary')
  await worker.begin('next')
  stdin = new PassThrough()
  const next = worker.reduce('next', 'Notes', true)
  finish(null, '{"text":"New summary"}')
  await expect(next).resolves.toBe('New summary')
})

it('accepts work exactly at the job deadline and rejects it after the deadline', async () => {
  vi.useFakeTimers()
  const worker = createSummarization('/helper')
  await worker.begin('job')

  vi.advanceTimersByTime(15 * 60_000)
  const exact = worker.reduce('job', 'Notes', false)
  finish(null, '{"text":"Summary"}')
  await expect(exact).resolves.toBe('Summary')
  vi.advanceTimersByTime(1)

  await expect(worker.reduce('job', 'Notes', true)).rejects.toThrow('Summarization exceeded its processing limit.')
  expect(execFile).toHaveBeenCalledOnce()
})

it('rejects concurrent inference and releases the native worker after a failed result', async () => {
  const worker = createSummarization('/helper')
  await worker.begin('job')
  const pending = worker.reduce('job', 'Notes', false)

  await expect(worker.reduce('job', 'Other', true)).rejects.toThrow('unavailable or already running')
  stdin.emit('error', new Error('EPIPE'))
  finish(new Error('Native worker failed'), '{"text":"Incomplete"}')
  await expect(pending).rejects.toThrow('Apple Intelligence could not summarize the notes. Please try again.')
  stdin = new PassThrough()
  const retry = worker.reduce('job', 'Notes', true)
  finish(null, '{"text":"Recovered"}')

  await expect(retry).resolves.toBe('Recovered')
})

it.each(['null', '[]', '42', '{"text":"  "}', '{"error":"Model unavailable"}'])(
  'rejects malformed native output %s without exposing a partial result',
  async (output) => {
    const worker = createSummarization('/helper')
    await worker.begin('job')
    const pending = worker.reduce('job', 'Notes', true)

    finish(null, output)

    await expect(pending).rejects.toThrow('Apple Intelligence')
  },
)

it('keeps cancellation scoped to the active job and stops all work on application exit', async () => {
  const worker = createSummarization('/helper')
  await worker.begin('job')
  const pending = worker.reduce('job', 'Notes', false)

  await worker.cancel('stale')
  await expect(worker.finish('stale', 'Summary')).rejects.toThrow('Summarization was canceled.')
  expect(kill).not.toHaveBeenCalled()
  worker.cancelAll()
  finish(null, '{"text":"Late"}')

  await expect(pending).rejects.toThrow('Summarization was canceled.')
  expect(kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  await worker.begin('next')
  await worker.cancel('next')
})

it('waits for retired inference and rejects a replacement canceled during that wait', async () => {
  const worker = createSummarization('/helper')
  await worker.begin('old')
  const pending = worker.reduce('old', 'Notes', false)
  const rejected = expect(pending).rejects.toThrow('canceled')
  await worker.cancel('old')
  const replacement = worker.begin('new')
  const replacementRejected = expect(replacement).rejects.toThrow('Summarization was canceled.')

  await worker.cancel('new')
  finish(null, '{"text":"Late"}')

  await rejected
  await replacementRejected
})

// @requirement PRODUCT.md §15.2
it('uses a fixed executable, bounded pipes and a fresh inference for each reduction', async () => {
  const worker = createSummarization('/fixed/tree-summarize')
  const available = worker.available()
  finish(null, '{"available":true}')
  await expect(available).resolves.toBe(true)
  await worker.begin('job')
  stdin = new PassThrough()

  const request = worker.reduce('job', 'Notes', true)
  expect(JSON.parse(stdin.read().toString())).toEqual({ text: 'Notes', final: true })
  expect(execFile).toHaveBeenLastCalledWith(
    '/fixed/tree-summarize',
    [],
    expect.objectContaining({ timeout: 60000, maxBuffer: 32768, killSignal: 'SIGKILL' }),
    expect.any(Function),
  )
  finish(null, '{"text":" Summary "}')

  await expect(request).resolves.toBe('Summary')
  await worker.finish('job', 'Summary')
  await expect(worker.reduce('job', 'Notes', true)).rejects.toThrow('unavailable')
})

// @requirement PRODUCT.md §15.2
it('rejects concurrent jobs, oversized requests and late results after cancellation', async () => {
  const worker = createSummarization('/helper')
  await worker.begin('job')
  await expect(worker.begin('other')).rejects.toThrow('already running')
  await expect(worker.reduce('job', 'x'.repeat(2401), false)).rejects.toThrow('too large')
  expect(execFile).not.toHaveBeenCalled()
  const pending = worker.reduce('job', 'Notes', true)
  const rejected = expect(pending).rejects.toThrow('canceled')

  await worker.cancel('job')
  finish(null, '{"text":"Late"}')

  await rejected
  expect(kill).toHaveBeenCalledWith('SIGKILL')
})

// @requirement PRODUCT.md §15.2
it.each(['invalid', '{}', '{"text":""}', '{"text":42}'])('rejects invalid model output %s', async (output) => {
  const worker = createSummarization('/helper')
  await worker.begin('job')
  const pending = worker.reduce('job', 'Notes', true)
  const rejected = expect(pending).rejects.toThrow(
    output === 'invalid'
      ? 'Apple Intelligence could not summarize the notes. Please try again.'
      : 'Apple Intelligence returned an invalid summary.',
  )

  finish(null, output)

  await rejected
})
