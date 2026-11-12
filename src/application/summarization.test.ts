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
  expect(summaryRoots({ roots }, 'a')).toEqual([roots[0]])
  expect(summaryRoots({ roots }, 'missing')).toEqual([])
})

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
it('rejects empty notes and a model that does not compress without copying partial output', async () => {
  const abort = new AbortController()

  await expect(
    summarizeForest(
      [node('empty', '')],
      async () => 'unused',
      abort.signal,
      () => undefined,
    ),
  ).rejects.toThrow('no text')
  await expect(
    summarizeForest(
      [node('long', 'x'.repeat(5000))],
      async () => 'x'.repeat(801),
      abort.signal,
      () => undefined,
    ),
  ).rejects.toThrow('compact summary')
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
