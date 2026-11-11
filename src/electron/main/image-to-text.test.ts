import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { createImageToText } from './image-to-text'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))

let finish: (error: Error | null, stdout: string) => void
let stdin: PassThrough
let kill: ReturnType<typeof vi.fn>

beforeEach(() => {
  stdin = new PassThrough()
  kill = vi.fn()
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    finish = args[3] as typeof finish
    return { stdin, kill } as unknown as ReturnType<typeof execFile>
  })
})
afterEach(() => vi.clearAllMocks())

it('sends bytes through stdin with bounded execution, preserving blank separators', async () => {
  const worker = createImageToText('/fixed/helper')
  const bytes = new Uint8Array([1, 2, 3])

  const pending = worker.recognize(async () => bytes)
  await vi.waitFor(() => expect(execFile).toHaveBeenCalledOnce())
  finish(null, '[" First ", "", "Second"]')

  await expect(pending).resolves.toEqual(['First', '', 'Second'])
  expect(stdin.read()).toEqual(Buffer.from(bytes))
  expect(execFile).toHaveBeenCalledWith(
    '/fixed/helper',
    [],
    {
      timeout: 60_000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    },
    expect.any(Function),
  )
})

it.each([
  [null, 'The image could not be loaded.'],
  [new Uint8Array(), 'The image is invalid or too large.'],
  [new Uint8Array(25 * 1024 * 1024 + 1), 'The image is invalid or too large.'],
] as const)('rejects missing or oversized input before spawning', async (bytes, message) => {
  await expect(createImageToText('/helper').recognize(async () => bytes)).rejects.toThrow(message)
  expect(execFile).not.toHaveBeenCalled()
})

it('accepts an image and result exactly at their respective limits', async () => {
  const bytes = new Uint8Array(25 * 1024 * 1024)
  const paragraphs = Array.from({ length: 1000 }, (_, index) => `Line ${index}`)
  const pending = createImageToText('/helper').recognize(async () => bytes)
  await vi.waitFor(() => expect(execFile).toHaveBeenCalledOnce())

  finish(null, JSON.stringify(paragraphs))

  await expect(pending).resolves.toEqual(paragraphs)
  expect(stdin.read()).toHaveLength(bytes.byteLength)
})

it('rejects concurrent work and cancels an attachment read before a process starts', async () => {
  let resolve!: (bytes: Uint8Array) => void
  const worker = createImageToText('/helper')
  const pending = worker.recognize(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const rejected = expect(pending).rejects.toThrow('canceled')

  await expect(worker.recognize(async () => new Uint8Array([1]))).rejects.toThrow('already running')
  worker.cancel()
  resolve(new Uint8Array([1]))

  await rejected
  expect(execFile).not.toHaveBeenCalled()
})

it('kills active work, tolerates a closed input pipe and permits a retry', async () => {
  const worker = createImageToText('/helper')
  const pending = worker.recognize(async () => new Uint8Array([1]))
  const rejected = expect(pending).rejects.toThrow('could not recognize')
  await vi.waitFor(() => expect(execFile).toHaveBeenCalledOnce())

  stdin.emit('error', new Error('EPIPE'))
  worker.cancel()
  finish(new Error('killed'), '')

  await rejected
  expect(kill).toHaveBeenCalledWith('SIGKILL')
  const retry = worker.recognize(async () => new Uint8Array([1]))
  await vi.waitFor(() => expect(execFile).toHaveBeenCalledTimes(2))
  finish(null, '[]')
  await expect(retry).resolves.toEqual([])
})

it.each(['{}', '[1]', JSON.stringify(Array(1001).fill('text'))])(
  'rejects malformed or excessive native output',
  async (output) => {
    const pending = createImageToText('/helper').recognize(async () => new Uint8Array([1]))
    const rejected = expect(pending).rejects.toThrow('Apple Vision returned an invalid result.')
    await vi.waitFor(() => expect(execFile).toHaveBeenCalledOnce())

    finish(null, output)

    await rejected
  },
)

it('rejects invalid JSON and releases the worker for another request', async () => {
  const worker = createImageToText('/helper')
  const pending = worker.recognize(async () => new Uint8Array([1]))
  const rejected = expect(pending).rejects.toThrow(SyntaxError)
  await vi.waitFor(() => expect(execFile).toHaveBeenCalledOnce())

  finish(null, 'invalid JSON')
  await rejected
  const retry = worker.recognize(async () => new Uint8Array([2]))
  await vi.waitFor(() => expect(execFile).toHaveBeenCalledTimes(2))
  finish(null, '["Recovered"]')

  await expect(retry).resolves.toEqual(['Recovered'])
})
