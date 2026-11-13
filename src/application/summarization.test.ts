import { expect, it, vi } from 'vitest'
import { EditorStore } from './editor-store'
import { Summarization, summarizeForest, summaryRoots } from './summarization'
import type { TreeNode } from '../domain/document'
import type { SummarizationPort } from '../shared/summarize'
import { dayNumberOf } from '../domain/calendar-date'

const node = (id: string, text = id, children: readonly TreeNode[] = []): TreeNode => ({
  id,
  text,
  children: [...children],
})
const port = (): SummarizationPort => ({
  available: vi.fn(async () => true),
  begin: vi.fn(async () => undefined),
  reduce: vi.fn(async (_id, _text, final) =>
    final ? 'The project is ready.\n\n- Review on Friday.' : 'The project is ready.',
  ),
  finish: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined),
})

// @requirement PRODUCT.md §15.2
it('selects a sibling range in tree order including descendants without duplicating them', () => {
  const roots = [node('a', 'First', [node('child')]), node('b'), node('c')]

  expect(summaryRoots({ roots }, 'a', { anchorId: 'b', focusId: 'a' })).toEqual(roots.slice(0, 2))
  expect(summaryRoots({ roots }, 'a', { anchorId: 'a', focusId: 'b' })).toEqual(roots.slice(0, 2))
  expect(summaryRoots({ roots }, 'a')).toEqual([roots[0]])
  expect(summaryRoots({ roots }, 'missing')).toEqual([])
})

// @requirement PRODUCT.md §15.2
it.each([
  { anchorId: 'missing', focusId: 'b' },
  { anchorId: 'a', focusId: 'missing' },
  { anchorId: 'a', focusId: 'child' },
  { anchorId: 'b', focusId: 'missing' },
  { anchorId: 'b', focusId: 'child' },
])('rejects a selection without two current sibling endpoints (%j)', (selection) => {
  const roots = [node('a', 'First', [node('child')]), node('b')]

  expect(summaryRoots({ roots }, 'a', selection)).toEqual([])
})

// @requirement PRODUCT.md §15.2
it('preserves complete source text and tree levels and trims the model result', async () => {
  const reduce = vi.fn(async () => '  Final summary  \n')

  const result = await summarizeForest(
    [node('a', ' First ', [node('child', 'Child')]), node('b', 'Second')],
    reduce,
    new AbortController().signal,
    () => undefined,
  )

  expect(reduce).toHaveBeenCalledExactlyOnceWith(
    'Node at level 1:  First \nNode at level 2: Child\nNode at level 1: Second',
    true,
  )
  expect(result).toBe('Final summary')
})

// @requirement PRODUCT.md §15.2
it.each(['\u007f', '\u0080', '\u07ff', '\u0800', '\uffff', '😀'])(
  'keeps requests within the UTF-8 budget for repeated %j',
  async (character) => {
    const reduce = vi.fn(async (text: string, final: boolean) => {
      expect(text.length).toBeGreaterThan(0)
      expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(2400)
      return final ? 'Final summary' : 'x'.repeat(800)
    })

    const result = await summarizeForest(
      [node('a', character.repeat(4000))],
      reduce,
      new AbortController().signal,
      () => undefined,
    )

    expect(result).toBe('Final summary')
    expect(reduce.mock.calls.length).toBeGreaterThan(1)
  },
)

// @requirement PRODUCT.md §15.2
it('rejects a final model result when cancellation arrives during inference', async () => {
  const abort = new AbortController()
  const progress = vi.fn()
  const reduce = vi.fn(async () => {
    abort.abort(new Error('Canceled during inference'))
    return 'Late summary'
  })

  await expect(summarizeForest([node('a')], reduce, abort.signal, progress)).rejects.toThrow(
    'Canceled during inference',
  )

  expect(progress).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §15.2
it('yields while traversing a branch so cancellation can stop it before model work', async () => {
  const roots = Array.from({ length: 129 }, (_, index) => node(String(index), index === 0 ? 'Notes' : ''))
  const abort = new AbortController()
  const reduce = vi.fn(async () => 'Unused')
  vi.useFakeTimers()
  try {
    setTimeout(() => abort.abort(new Error('Canceled during traversal')), 0)
    const outcome = expect(summarizeForest(roots, reduce, abort.signal, () => undefined)).rejects.toThrow(
      'Canceled during traversal',
    )

    await vi.runAllTimersAsync()
    await outcome

    expect(reduce).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

// @requirement PRODUCT.md §15.2
it.each([
  { label: 'ASCII', character: 'a', length: 1_250_000 },
  { label: 'one-byte boundary', character: '\u007f', length: 1_250_000 },
  { label: 'two-byte text', character: 'é', length: 550_000 },
  { label: 'two-byte boundary', character: '\u07ff', length: 550_000 },
  { label: 'three-byte boundary', character: '\uffff', length: 500_000 },
])('summarizes large $label source within the invocation request budget', async ({ character, length }) => {
  const result = await summarizeForest(
    [node('large', character.repeat(length))],
    async (text, final) => {
      expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(2400)
      return final ? 'Final summary' : 'x'.repeat(800)
    },
    new AbortController().signal,
    () => undefined,
  )

  expect(result).toBe('Final summary')
})

// @requirement PRODUCT.md §15.2
it.each([3180, 3181])(
  'keeps near-boundary assembled requests within 2400 bytes (%i source characters)',
  async (length) => {
    const result = await summarizeForest(
      [node('a', 'A'.repeat(length))],
      async (text, final) => {
        expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(2400)
        return final ? 'Final summary' : 'x'.repeat(800)
      },
      new AbortController().signal,
      () => undefined,
    )

    expect(result).toBe('Final summary')
  },
)

// @requirement PRODUCT.md §15.2
it('reduces long Unicode text and a wide forest sequentially within the byte budget', async () => {
  let active = 0
  const calls: Array<{ text: string; final: boolean }> = []
  const reduce = async (text: string, final: boolean) => {
    expect(++active).toBe(1)
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(2400)
    expect(text).not.toMatch(/[\uD800-\uDBFF]$/)
    calls.push({ text, final })
    await Promise.resolve()
    active--
    return final ? 'Final summary' : 'Compact branch summary'
  }

  const result = await summarizeForest(
    [
      node(
        'root',
        'A project',
        Array.from({ length: 200 }, (_, index) => node(String(index), 'Notes 😀 '.repeat(40))),
      ),
    ],
    reduce,
    new AbortController().signal,
    () => undefined,
  )

  expect(result).toBe('Final summary')
  expect(calls.length).toBeGreaterThan(2)
  expect(calls.filter((call) => call.final)).toHaveLength(1)
})

// @requirement PRODUCT.md §15.2
it.each([
  { label: 'English', text: 'Alice brings the books on Friday. Bob reserves the room. '.repeat(16).trim() },
  { label: 'Unicode', text: '😀'.repeat(201) },
  { label: 'maximum request size', text: 'x'.repeat(2400) },
])('recompresses oversized $label intermediate output without truncating it', async ({ text: oversized }) => {
  const reduce = vi.fn(async (_text: string, final: boolean): Promise<string> =>
    final ? 'Final summary' : 'Compact summary',
  )
  reduce.mockResolvedValueOnce(oversized)
  const progress = vi.fn()

  const result = await summarizeForest(
    [node('long', 'Detailed notes. '.repeat(300))],
    reduce,
    new AbortController().signal,
    progress,
  )

  expect(result).toBe('Final summary')
  expect(reduce).toHaveBeenNthCalledWith(2, oversized, false)
  expect(progress.mock.calls.at(-1)).toEqual([reduce.mock.calls.length])
})

// @requirement PRODUCT.md §15.2
it('accepts an exactly 800-byte intermediate summary without recompressing it alone', async () => {
  const intermediate = 'x'.repeat(800)
  const reduce = vi.fn(async (_text: string, final: boolean) => (final ? 'Final summary' : intermediate))

  const result = await summarizeForest(
    [node('long', 'Detailed notes. '.repeat(300))],
    reduce,
    new AbortController().signal,
    () => undefined,
  )

  expect(result).toBe('Final summary')
  expect(reduce.mock.calls[1]![0].startsWith(`${intermediate}\n`)).toBe(true)
  expect(reduce.mock.calls.some(([text]) => text === intermediate)).toBe(false)
})

// @requirement PRODUCT.md §15.2
it('passes every chunk of long node text to the model without adding source content', async () => {
  const source = 'A'.repeat(5000)
  const intermediate = 'Summary'
  const inputs: string[] = []
  const reduce = async (text: string) => {
    inputs.push(text)
    return intermediate
  }

  await summarizeForest([node('a', source)], reduce, new AbortController().signal, () => undefined)

  const received = inputs.join('')
  expect(received.replaceAll(intermediate, '').replace('Node at level 1: ', '').replaceAll('\n', '')).toBe(source)
})

// @requirement PRODUCT.md §15.2
it('rejects empty notes without asking the model', async () => {
  const abort = new AbortController()

  await expect(
    summarizeForest(
      [node('empty', '')],
      async () => 'unused',
      abort.signal,
      () => undefined,
    ),
  ).rejects.toThrow('no text')
})

// @requirement PRODUCT.md §15.2
it('rejects whitespace-only notes without asking the model', async () => {
  const reduce = vi.fn(async () => 'Unused')

  await expect(
    summarizeForest([node('a', ' \t\n')], reduce, new AbortController().signal, () => undefined),
  ).rejects.toThrow('no text')

  expect(reduce).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §15.2
it.each([
  { output: '', attempts: 1 },
  { output: 'x'.repeat(2401), attempts: 1 },
  { output: 'x'.repeat(801), attempts: 3 },
])('bounds recovery for unusable intermediate results (%#)', async ({ output, attempts }) => {
  const reduce = vi.fn(async () => output)

  await expect(
    summarizeForest([node('long', 'x'.repeat(5000))], reduce, new AbortController().signal, () => undefined),
  ).rejects.toThrow('compact summary')

  expect(reduce).toHaveBeenCalledTimes(attempts)
})

// @requirement PRODUCT.md §15.2
it('checks cancellation before recompressing an oversized result', async () => {
  const abort = new AbortController()
  const reduce = vi.fn(async () => 'x'.repeat(801))

  await expect(
    summarizeForest([node('long', 'x'.repeat(5000))], reduce, abort.signal, () => abort.abort(new Error('Canceled'))),
  ).rejects.toThrow('Canceled')

  expect(reduce).toHaveBeenCalledOnce()
})

// @requirement PRODUCT.md §15.2
it('charges recompression requests to the invocation limit', async () => {
  let calls = 0
  const reduce = vi.fn(async () => (++calls % 2 === 1 ? 'x'.repeat(801) : 'Compact summary'))

  await expect(
    summarizeForest([node('long', 'x'.repeat(900_000))], reduce, new AbortController().signal, () => undefined),
  ).rejects.toThrow('too many summarization steps')

  expect(reduce).toHaveBeenCalledTimes(1000)
})

// @requirement PRODUCT.md §15.2
it.each([
  { count: 100_000, admitted: true },
  { count: 100_001, admitted: false },
])('admits at most 100,000 source nodes ($count)', async ({ count, admitted }) => {
  const roots = Array.from({ length: count }, (_, index) => node(String(index), index === 0 ? 'Notes' : ''))

  vi.useFakeTimers()
  try {
    const work = summarizeForest(
      roots,
      async () => 'Summary',
      new AbortController().signal,
      () => undefined,
    )
    const outcome = admitted
      ? expect(work).resolves.toBe('Summary')
      : expect(work).rejects.toThrow('too large to summarize')

    await vi.runAllTimersAsync()
    await outcome
  } finally {
    vi.useRealTimers()
  }
})

// @requirement PRODUCT.md §15.2
it.each([
  { size: 16 * 1024 * 1024, character: 'é', bytes: 2, error: 'Model reached', requests: 1 },
  { size: 16 * 1024 * 1024 + 1, character: 'é', bytes: 2, error: 'too large to summarize', requests: 0 },
  { size: 16 * 1024 * 1024, character: 'x', bytes: 1, error: 'Model reached', requests: 1 },
])(
  'admits at most 16 MiB of UTF-8 source text ($size, $character)',
  async ({ size, character, bytes, error, requests }) => {
    const roots = [node('source', character.repeat(Math.floor(size / bytes)) + 'x'.repeat(size % bytes))]
    const reduce = vi.fn(async (): Promise<string> => {
      throw new Error('Model reached')
    })

    vi.useFakeTimers()
    try {
      const outcome = expect(
        summarizeForest(roots, reduce, new AbortController().signal, () => undefined),
      ).rejects.toThrow(error)

      await vi.runAllTimersAsync()
      await outcome

      expect(reduce).toHaveBeenCalledTimes(requests)
    } finally {
      vi.useRealTimers()
    }
  },
)

// @requirement PRODUCT.md §15.2
it('keeps summaries unavailable when the native service is absent', async () => {
  const owner = new Summarization()

  expect(owner.getSnapshot()).toEqual({ available: false, running: false })

  await owner.refresh()

  expect(owner.getSnapshot()).toEqual({ available: false, running: false })
})

// @requirement PRODUCT.md §15.2
it('notifies current subscribers and ignores an obsolete availability response', async () => {
  const service = port()
  let resolveOlder!: (available: boolean) => void
  vi.mocked(service.available).mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        resolveOlder = resolve
      }),
  )
  vi.mocked(service.available).mockResolvedValueOnce(false)
  const owner = new Summarization(service)
  const removed = vi.fn()
  const retained = vi.fn()
  const unsubscribe = owner.subscribe(removed)
  owner.subscribe(retained)
  const older = owner.refresh()
  unsubscribe()

  await owner.refresh()
  resolveOlder(true)
  await older

  expect(owner.getSnapshot().available).toBe(false)
  expect(removed).not.toHaveBeenCalled()
  expect(retained).toHaveBeenCalledOnce()
})

// @requirement PRODUCT.md §15.2
it('keeps summarization unavailable until all suspensions finish', async () => {
  const service = port()
  const owner = new Summarization(service)
  await owner.refresh()
  const resumeFirst = owner.suspend()
  const resumeSecond = owner.suspend()

  resumeFirst()
  await owner.refresh()
  owner.start([node('a')])

  expect(owner.getSnapshot().available).toBe(false)
  expect(service.begin).not.toHaveBeenCalled()

  resumeSecond()
  await owner.refresh()

  expect(owner.getSnapshot().available).toBe(true)
})

// @requirement PRODUCT.md §15.2
it('disables summaries when the model availability request fails', async () => {
  const service = port()
  const owner = new Summarization(service)
  await owner.refresh()
  vi.mocked(service.available).mockRejectedValue(new Error('Unavailable'))

  await owner.refresh()
  owner.start([node('a')])

  expect(owner.getSnapshot().available).toBe(false)
  expect(service.begin).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §15.2
it('cancels an invocation after fifteen minutes and rejects its late preparation result', async () => {
  vi.useFakeTimers()
  try {
    const service = port()
    let begin!: () => void
    vi.mocked(service.begin).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          begin = resolve
        }),
    )
    const owner = new Summarization(service)
    await owner.refresh()
    owner.start([node('a')])

    await vi.advanceTimersByTimeAsync(15 * 60_000 - 1)

    expect(service.cancel).not.toHaveBeenCalled()
    expect(owner.getSnapshot().running).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    begin()
    await vi.advanceTimersByTimeAsync(0)

    expect(service.cancel).toHaveBeenCalled()
    expect(owner.getSnapshot()).toMatchObject({ running: false, message: 'Summarization canceled.' })
    expect(service.reduce).not.toHaveBeenCalled()
    expect(service.finish).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

// @requirement PRODUCT.md §15.2
it('does not let a canceled invocation timer cancel a newer invocation', async () => {
  vi.useFakeTimers()
  try {
    const service = port()
    const beginnings: (() => void)[] = []
    vi.mocked(service.begin).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          beginnings.push(resolve)
        }),
    )
    const owner = new Summarization(service)
    await owner.refresh()
    owner.start([node('old')])
    await vi.advanceTimersByTimeAsync(60_000)
    owner.cancel()
    await vi.advanceTimersByTimeAsync(0)
    owner.start([node('new')])

    await vi.advanceTimersByTimeAsync(14 * 60_000)

    expect(service.cancel).toHaveBeenCalledOnce()
    expect(owner.getSnapshot()).toMatchObject({ running: true, message: 'Summarizing…' })

    beginnings.forEach((begin) => begin())
    await vi.advanceTimersByTimeAsync(0)

    expect(service.finish).toHaveBeenCalledOnce()
    expect(owner.getSnapshot()).toMatchObject({ running: false, message: 'Summary copied.' })
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

// @requirement PRODUCT.md §15.2
it('publishes progress and releases its invocation timer after successful completion', async () => {
  vi.useFakeTimers()
  try {
    const service = port()
    const owner = new Summarization(service)
    const states: string[] = []
    owner.subscribe(() => states.push(owner.getSnapshot().message ?? ''))
    await owner.refresh()

    owner.start([node('a')])
    await vi.advanceTimersByTimeAsync(0)

    expect(states).toEqual([
      '',
      'Summarizing…',
      'Summarizing… 1 sections processed',
      'Copying summary…',
      'Summary copied.',
    ])
    expect(service.finish).toHaveBeenCalledOnce()
    expect(owner.getSnapshot().running).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

// @requirement PRODUCT.md §15.2
it('does not copy after cancellation while inference is pending and allows another job', async () => {
  const service = port()
  let done!: (text: string) => void
  vi.mocked(service.reduce).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  const owner = new Summarization(service)
  await owner.refresh()

  owner.start([node('a')])
  owner.start([node('b')])
  await vi.waitFor(() => expect(service.reduce).toHaveBeenCalledOnce())
  owner.cancel()
  done('Late result')
  await vi.waitFor(() => expect(service.cancel).toHaveBeenCalled())

  expect(service.finish).not.toHaveBeenCalled()
  expect(owner.getSnapshot()).toMatchObject({ running: false, message: 'Summarization canceled.' })
  owner.start([node('new')])
  await vi.waitFor(() => expect(service.finish).toHaveBeenCalledOnce())
})

// @requirement PRODUCT.md §15.2
it('sends only one cancellation request while its acknowledgment is pending', async () => {
  const service = port()
  let begin!: () => void
  let acknowledge!: (canceled: boolean) => void
  vi.mocked(service.begin).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        begin = resolve
      }),
  )
  vi.mocked(service.cancel).mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        acknowledge = resolve
      }),
  )
  const owner = new Summarization(service)
  await owner.refresh()
  owner.start([node('a')])

  owner.cancel()
  owner.cancel()

  expect(service.cancel).toHaveBeenCalledOnce()
  expect(owner.getSnapshot().running).toBe(true)

  acknowledge(true)
  await vi.waitFor(() => expect(owner.getSnapshot().running).toBe(false))
  begin()
  // Let the released begin continuation settle before checking for late work.
  await new Promise<void>((resolve) => setTimeout(resolve, 0))

  expect(service.reduce).not.toHaveBeenCalled()
  expect(service.finish).not.toHaveBeenCalled()
  expect(owner.getSnapshot().message).toBe('Summarization canceled.')
})

// @requirement PRODUCT.md §15.2
it('does not finish a final result when cancellation is requested from its progress notification', async () => {
  const service = port()
  const owner = new Summarization(service)
  owner.subscribe(() => {
    if (owner.getSnapshot().message?.includes('sections processed')) owner.cancel()
  })
  await owner.refresh()

  owner.start([node('a')])
  await vi.waitFor(() => expect(owner.getSnapshot().running).toBe(false))

  expect(service.finish).not.toHaveBeenCalled()
  expect(owner.getSnapshot()).toMatchObject({ running: false, message: 'Summarization canceled.' })
})

// @requirement PRODUCT.md §15.2
it('keeps unavailable commands disabled and preserves failure details without copying', async () => {
  const service = port()
  vi.mocked(service.available).mockResolvedValue(false)
  const owner = new Summarization(service)
  await owner.refresh()
  owner.start([node('a')])
  expect(service.begin).not.toHaveBeenCalled()

  vi.mocked(service.available).mockResolvedValue(true)
  vi.mocked(service.reduce).mockRejectedValue(new Error('Model stopped'))
  await owner.refresh()
  owner.start([node('a')])
  await vi.waitFor(() => expect(owner.getSnapshot().message).toContain('Model stopped'))

  expect(service.finish).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §15.2
it('does not report cancellation after the final clipboard commit has started', async () => {
  const service = port()
  let finish!: () => void
  vi.mocked(service.finish).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  vi.mocked(service.cancel).mockResolvedValue(false)
  const owner = new Summarization(service)
  await owner.refresh()
  owner.start([node('a')])
  await vi.waitFor(() => expect(owner.getSnapshot().message).toBe('Copying summary…'))

  owner.cancel()

  expect(owner.getSnapshot()).toMatchObject({ running: true, message: 'Copying summary…' })
  finish()
  await vi.waitFor(() => expect(owner.getSnapshot()).toMatchObject({ running: false, message: 'Summary copied.' }))
})

// @requirement PRODUCT.md §15.2
it('retires a final result waiting for the clipboard queue when quit preparation suspends summaries', async () => {
  const service = port()
  let reject!: (error: Error) => void
  vi.mocked(service.finish).mockImplementation(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail
      }),
  )
  vi.mocked(service.cancel).mockImplementation(async () => {
    reject?.(new Error('Canceled before clipboard commit'))
    return true
  })
  const owner = new Summarization(service)
  await owner.refresh()
  owner.start([node('a')])
  await vi.waitFor(() => expect(service.finish).toHaveBeenCalledOnce())

  const resume = owner.suspend()
  await vi.waitFor(() =>
    expect(owner.getSnapshot()).toMatchObject({ available: false, running: false, message: 'Summarization canceled.' }),
  )

  expect(service.cancel).toHaveBeenCalled()
  resume()
  await vi.waitFor(() => expect(owner.getSnapshot().available).toBe(true))
})

// @requirement PRODUCT.md §15.2
it('captures current text and descendants without changing document, focus, history or save state', async () => {
  const service = port()
  const roots = [node('a', 'Project', [node('child', 'Friday review')]), node('b')]
  const save = vi.fn(async () => undefined)
  const store = new EditorStore(
    {
      summarization: service,
      load: async () => ({ version: 1, document: { roots }, location: { currentParentId: null, selectedNodeId: 'a' } }),
      save,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'new',
  )
  await store.initialize()
  await store.summarization.refresh()
  const before = store.getSnapshot()
  save.mockClear()

  store.summarize()
  await vi.waitFor(() => expect(service.finish).toHaveBeenCalledOnce())

  expect(service.reduce).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Friday review'), true)
  expect(store.getSnapshot()).toBe(before)
  expect(save).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §15.2
it('cancels store summarization on renderer disposal and rejects a late model result', async () => {
  const service = port()
  let finish!: (text: string) => void
  vi.mocked(service.reduce).mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  )
  const store = new EditorStore(
    {
      summarization: service,
      load: async () => ({
        version: 1,
        document: { roots: [node('a', 'Notes')] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'new',
  )
  await store.initialize()
  await store.summarization.refresh()
  store.summarize()
  await vi.waitFor(() => expect(service.reduce).toHaveBeenCalledOnce())

  store.disposeSearch()
  finish('Late summary')
  await vi.waitFor(() => expect(store.summarization.getSnapshot().running).toBe(false))

  expect(service.finish).not.toHaveBeenCalled()
  expect(store.summarization.getSnapshot().message).toBe('Summarization canceled.')
})

// @requirement PRODUCT.md §15.2
it('enables store summarization only when initialized, available and idle', async () => {
  const service = port()
  const store = new EditorStore(
    {
      summarization: service,
      load: async () => ({
        version: 1,
        document: { roots: [node('a', 'Notes')] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'new',
  )
  await store.summarization.refresh()

  expect(store.canSummarize).toBe(false)

  await store.initialize()
  vi.mocked(service.available).mockResolvedValue(false)
  await store.summarization.refresh()

  expect(store.canSummarize).toBe(false)

  vi.mocked(service.available).mockResolvedValue(true)
  await store.summarization.refresh()
  let finishBegin!: () => void
  vi.mocked(service.begin).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishBegin = resolve
      }),
  )

  expect(store.canSummarize).toBe(true)

  store.summarize()

  expect(store.canSummarize).toBe(false)

  finishBegin()
  await vi.waitFor(() => expect(service.finish).toHaveBeenCalledOnce())

  expect(store.canSummarize).toBe(true)
})

// @requirement PRODUCT.md §15.2
it('finishes a buffered edit before capturing the text to summarize', async () => {
  const service = port()
  const store = new EditorStore(
    {
      summarization: service,
      load: async () => ({
        version: 1,
        document: { roots: [node('a', 'Original notes')] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'new',
  )
  await store.initialize()
  await store.summarization.refresh()
  let pending = true
  const unregister = store.registerPendingEditFinisher(() => {
    if (!pending) return false
    pending = false
    store.editText('a', 'Buffered replacement')
    return true
  })

  store.summarize()
  await vi.waitFor(() => expect(service.finish).toHaveBeenCalledOnce())

  expect(service.reduce).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Buffered replacement'), true)
  expect(vi.mocked(service.reduce).mock.calls[0]![1]).not.toContain('Original notes')

  unregister()
})

// @requirement PRODUCT.md §15.2
it('disables Agenda headers instead of summarizing a stale tree selection', async () => {
  const service = port()
  const store = new EditorStore(
    {
      summarization: service,
      today: () => dayNumberOf({ year: 2026, month: 11, day: 12 }),
      load: async () => ({
        version: 1,
        document: { roots: [node('a', '2026-11-12 Project', [node('child', 'Unscheduled details')])] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'new',
  )
  await store.initialize()
  await store.summarization.refresh()
  store.openAgenda()

  expect(store.canSummarize).toBe(false)
  store.summarize()
  expect(service.begin).not.toHaveBeenCalled()

  const row = store.getAgendaRows().find((row) => row.kind === 'node')!
  store.applyAgenda({ kind: 'select', key: row.key })
  expect(store.canSummarize).toBe(true)
  store.summarize()
  await vi.waitFor(() => expect(service.finish).toHaveBeenCalledOnce())

  expect(service.reduce).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Unscheduled details'), true)
})

// @requirement PRODUCT.md §15.2
it('keeps the invocation snapshot when source editing precedes the first native response', async () => {
  const service = port()
  let begin!: () => void
  vi.mocked(service.begin).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        begin = resolve
      }),
  )
  const store = new EditorStore(
    {
      summarization: service,
      load: async () => ({
        version: 1,
        document: { roots: [node('a', 'Original notes')] },
        location: { currentParentId: null, selectedNodeId: 'a' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'new',
  )
  await store.initialize()
  await store.summarization.refresh()

  store.summarize()
  store.editText('a', 'Edited while preparing')
  begin()
  await vi.waitFor(() => expect(service.finish).toHaveBeenCalledOnce())

  expect(service.reduce).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Original notes'), true)
  expect(vi.mocked(service.reduce).mock.calls[0]![1]).not.toContain('Edited while preparing')
})
