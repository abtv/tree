import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import { dayNumberOf } from '../domain/calendar-date'

afterEach(() => vi.useRealTimers())

async function setup(recognize: EditorServices['imageToText'], extra: Partial<EditorServices> = {}) {
  vi.useFakeTimers()
  let id = 0
  const store = new EditorStore(
    {
      ...(recognize === undefined ? {} : { imageToText: recognize }),
      load: async () => ({
        version: 1,
        document: {
          roots: [
            {
              id: 'image',
              text: 'Screenshot',
              attachment: { id: 'png', mimeType: 'image/png' },
              children: [{ id: 'existing', text: 'Existing child', children: [] }],
            },
            { id: 'other', text: 'Other image', attachment: { id: 'other-png', mimeType: 'image/png' }, children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'image' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
      ...extra,
    },
    () => `new-${id++}`,
  )
  await store.initialize()
  return store
}

function ready(store: EditorStore) {
  const state = store.getSnapshot()
  if (state.status !== 'ready') throw new Error('Expected ready')
  return state
}

it('appends paragraphs after existing children in one undo step without moving focus', async () => {
  const store = await setup(async () => ['', 'First line\nSecond line', '', 'Next paragraph', '', '', '', 'Last', ''])
  const before = ready(store)

  store.imageToText()
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toBe('Image to text: added 3 paragraphs.'))

  expect(ready(store).document.roots[0]!.children.map((child) => child.text)).toEqual([
    'Existing child',
    'First line Second line',
    '',
    'Next paragraph',
    '',
    'Last',
  ])
  expect(ready(store).focus).toBe(before.focus)

  store.undo()

  expect(ready(store).document).toBe(before.document)
})

it('serializes recognition and ignores duplicate commands while a node is queued', async () => {
  let finish!: (text: string[]) => void
  const recognize = vi
    .fn<NonNullable<EditorServices['imageToText']>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValueOnce(['Second result'])
  const store = await setup(recognize)

  store.imageToText()
  expect(ready(store).imageToTextStatus).toBe('Recognizing image… 0 queued')
  store.imageToText()
  expect(ready(store).imageToTextStatus).toBe('Image to text: this image is already queued.')
  store.selectNode('other', 0)
  store.imageToText()

  expect(recognize).toHaveBeenCalledTimes(1)
  expect(ready(store).imageToTextStatus).toContain('1 queued')

  finish(['First result'])
  await vi.waitFor(() => expect(ready(store).document.roots[1]!.children).toHaveLength(1))

  expect(recognize.mock.calls).toEqual([['png'], ['other-png']])
  expect(ready(store).location.selectedNodeId).toBe('other')
})

it('discards a late result even if a deleted source is restored by Undo', async () => {
  let finish!: (text: string[]) => void
  const store = await setup(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )

  store.imageToText()
  store.deleteSelected()
  store.undo()
  finish(['Stale result'])
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toContain('canceled'))

  expect(ready(store).document.roots[0]!.children.map((child) => child.text)).toEqual(['Existing child'])
})

it('shows errors in the status bar and allows a later retry', async () => {
  const recognize = vi
    .fn<NonNullable<EditorServices['imageToText']>>()
    .mockRejectedValueOnce(new Error('Native helper failed'))
    .mockResolvedValueOnce([])
  const store = await setup(recognize)

  store.imageToText()
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toBe('Image to text failed: Native helper failed'))
  store.imageToText()
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toContain('no English text'))

  expect(ready(store).document.roots[0]!.children).toHaveLength(1)
})

it('keeps unsupported platforms and image-less selections inert', async () => {
  const unsupported = await setup(undefined)
  const before = ready(unsupported)
  unsupported.imageToText()
  expect(unsupported.imageToTextAvailable).toBe(false)
  expect(ready(unsupported)).toBe(before)

  const recognize = vi.fn(async () => ['Text'])
  const store = await setup(recognize)
  store.selectNode('existing', 0)
  store.imageToText()
  expect(recognize).not.toHaveBeenCalled()
  expect(ready(store).imageToTextStatus).toContain('select an editable node')
})

it('does not create recognized nodes from a day or an editable Agenda occurrence', async () => {
  const today = dayNumberOf({ year: 2026, month: 11, day: 11 })
  const recognize = vi.fn(async () => ['Recognized'])
  const store = await setup(recognize, { today: () => today })
  store.editText('image', '2026-11-11 Image')
  store.openAgenda()
  const before = ready(store).document
  store.applyAgenda({ kind: 'select', key: `day:${today}`, cursor: 0 })

  store.imageToText()

  expect(recognize).not.toHaveBeenCalled()
  store.applyAgenda({ kind: 'select', key: `node:${today}:image`, cursor: 0 })
  store.imageToText()

  expect(recognize).not.toHaveBeenCalled()
  expect(ready(store).document).toBe(before)
})

it('discards a canceled queued source without calling recognition for it', async () => {
  let finish!: (text: string[]) => void
  const recognize = vi.fn<NonNullable<EditorServices['imageToText']>>(
    () =>
      new Promise((done) => {
        finish = done
      }),
  )
  const store = await setup(recognize)
  store.imageToText()
  store.selectNode('other', 0)
  store.imageToText()
  store.deleteSelected()

  finish(['First'])
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toContain('canceled'))

  expect(recognize).toHaveBeenCalledOnce()
})

it('keeps the editor usable during recognition and appends after newly created children', async () => {
  let finish!: (text: string[]) => void
  const store = await setup(
    () =>
      new Promise((done) => {
        finish = done
      }),
  )
  store.imageToText()
  store.selectNode('existing', 0)
  store.editText('existing', 'Edited while waiting')
  store.createSiblingWithText('after', 'New child')
  const before = ready(store)

  finish(['OCR result'])
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toContain('added 1'))

  expect(ready(store).document.roots[0]!.children.map((child) => child.text)).toEqual([
    'Edited while waiting',
    'New child',
    'OCR result',
  ])
  expect(ready(store).focus).toBe(before.focus)
  store.undo()
  expect(ready(store).document).toBe(before.document)
  store.redo()
  expect(ready(store).document.roots[0]!.children.at(-1)?.text).toBe('OCR result')
})

it('bounds the pending queue and continues after a failed image', async () => {
  let fail!: (error: Error) => void
  const recognize = vi
    .fn<NonNullable<EditorServices['imageToText']>>()
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject
        }),
    )
    .mockResolvedValue([])
  const store = await setup(recognize, {
    load: async () => ({
      version: 1,
      document: {
        roots: Array.from({ length: 21 }, (_, n) => ({
          id: `node-${n}`,
          text: '',
          attachment: { id: `image-${n}`, mimeType: 'image/png' },
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'node-0' },
    }),
  })

  for (let n = 0; n < 21; n++) {
    store.selectNode(`node-${n}`, 0)
    store.imageToText()
  }

  expect(ready(store).imageToTextStatus).toContain('queue is full')
  expect(recognize).toHaveBeenCalledOnce()
  fail(new Error('Unreadable image'))
  await vi.waitFor(() => expect(recognize).toHaveBeenCalledTimes(20))
  expect(ready(store).imageToTextStatus).toContain('Unreadable image')
  expect(ready(store).document.roots.every((node) => node.children.length === 0)).toBe(true)
})

it('does not create empty children for a whitespace-only result', async () => {
  const store = await setup(async () => ['', ' \n ', ''])
  const before = ready(store).document

  store.imageToText()
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toContain('no English text'))

  expect(ready(store).document).toBe(before)
})

it('counts recognized words toward the normal autosave threshold', async () => {
  const save = vi.fn(async () => undefined)
  const store = await setup(async () => ['one two three four five', 'six seven eight nine ten'], { save })

  store.imageToText()
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toBe('Image to text: added 2 paragraphs.'))

  expect(save).toHaveBeenCalledOnce()
})

it('retires pending OCR before shutdown flush and allows a later explicit retry', async () => {
  let finish!: (text: string[]) => void
  const recognize = vi
    .fn<NonNullable<EditorServices['imageToText']>>()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done
        }),
    )
    .mockResolvedValue(['Retry'])
  const store = await setup(recognize)
  const before = ready(store).document
  await store.flushPersistence()
  store.imageToText()

  const flushing = store.flushPersistence({ cancelImageRecognition: true })
  store.imageToText()
  expect(ready(store).imageToTextStatus).toBe('Image to text: saving in progress. Please wait.')
  finish(['Late result'])
  await flushing
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toContain('canceled'))

  expect(ready(store).document).toBe(before)
  expect(recognize).toHaveBeenCalledOnce()
  store.imageToText()
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toContain('added 1'))
})

it('does not retire recognition for an ordinary archive snapshot flush', async () => {
  let finish!: (text: string[]) => void
  const store = await setup(
    () =>
      new Promise((done) => {
        finish = done
      }),
  )
  store.imageToText()

  await store.flushPersistence()
  finish(['Still recognized'])

  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toContain('added 1'))
})

it.each([1, 2])('reports %s successful paragraphs as well as failures from a mixed queue', async (count) => {
  let fail!: (error: Error) => void
  const recognize = vi
    .fn<NonNullable<EditorServices['imageToText']>>()
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject
        }),
    )
    .mockResolvedValue(Array.from({ length: count }, (_, index) => `Paragraph ${index}`))
  const store = await setup(recognize)
  store.imageToText()
  store.selectNode('other', 0)
  store.imageToText()

  fail(new Error('Unreadable image'))
  await vi.waitFor(() => expect(ready(store).document.roots[1]!.children).toHaveLength(count))

  expect(ready(store).imageToTextStatus).toBe(
    `Image to text: added ${count} ${count === 1 ? 'paragraph' : 'paragraphs'}. Image to text failed: Unreadable image`,
  )
})

it('normalizes every hard line break and saves a short OCR result only when idle', async () => {
  const save = vi.fn(async () => undefined)
  const store = await setup(async () => ['  one\r\ntwo\rthree\nfour\u2028five\u2029six  '], { save })

  store.imageToText()
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toBe('Image to text: added 1 paragraph.'))

  expect(ready(store).document.roots[0]!.children.at(-1)?.text).toBe('one two three four five six')
  expect(save).not.toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(10_000)

  expect(save).toHaveBeenCalledOnce()
})

it('ignores OCR after initialization failed without replacing the document error', async () => {
  const recognize = vi.fn(async () => ['Unexpected'])
  const store = await setup(recognize, {
    load: async () => {
      throw new Error('Cannot open notes')
    },
  })
  const before = store.getSnapshot()

  store.imageToText()

  expect(before).toMatchObject({ status: 'error', message: 'Cannot open notes' })
  expect(store.getSnapshot()).toBe(before)
  expect(recognize).not.toHaveBeenCalled()
})

it('keeps typing before and after OCR in separate undo steps', async () => {
  let finish!: (text: string[]) => void
  const store = await setup(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  store.imageToText()
  store.selectNode('other', 0)
  store.editText('other', 'Before OCR')

  finish(['Recognized'])
  await vi.waitFor(() => expect(ready(store).imageToTextStatus).toBe('Image to text: added 1 paragraph.'))
  store.editText('other', 'After OCR')
  store.undo()

  expect(ready(store).document.roots[1]!.text).toBe('Before OCR')
  expect(ready(store).document.roots[0]!.children.at(-1)?.text).toBe('Recognized')

  store.undo()

  expect(ready(store).document.roots[0]!.children.map((child) => child.text)).toEqual(['Existing child'])
  expect(ready(store).document.roots[1]!.text).toBe('Before OCR')

  store.undo()

  expect(ready(store).document.roots[1]!.text).toBe('Other image')
})

it('rejects pending results and new OCR requests when saving becomes locked', async () => {
  let finish!: (text: string[]) => void
  const recognize = vi.fn<NonNullable<EditorServices['imageToText']>>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const save = vi.fn(async () => {
    throw new Error('disk full')
  })
  const store = await setup(recognize, { save })
  store.imageToText()
  store.editText('other', 'Changed')

  for (let attempt = 0; attempt < 3; attempt++) await expect(store.flushPersistence()).rejects.toThrow('disk full')
  expect(ready(store).persistenceLocked).toBe(true)
  const before = ready(store).document
  finish(['Must not be inserted'])
  await vi.waitFor(() =>
    expect(ready(store).imageToTextStatus).toBe(
      'Image to text failed: Saving is unavailable. Please retry after saving is restored.',
    ),
  )
  store.imageToText()

  expect(ready(store).imageToTextStatus).toBe('Image to text: select an editable node with an image.')
  expect(ready(store).document).toBe(before)
  expect(recognize).toHaveBeenCalledOnce()
})

it('reports total successful paragraphs and the error across three queued images', async () => {
  let finish!: (text: string[]) => void
  const recognize = vi
    .fn<NonNullable<EditorServices['imageToText']>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValueOnce(['Second'])
    .mockRejectedValueOnce(new Error('Last image failed'))
  const store = await setup(recognize, {
    load: async () => ({
      version: 1,
      document: {
        roots: [0, 1, 2].map((n) => ({
          id: `node-${n}`,
          text: '',
          attachment: { id: `png-${n}`, mimeType: 'image/png' },
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'node-0' },
    }),
  })
  const statuses: Array<string | undefined> = []
  const unsubscribe = store.subscribe(() => statuses.push(ready(store).imageToTextStatus))
  for (let n = 0; n < 3; n++) {
    store.selectNode(`node-${n}`, 0)
    store.imageToText()
  }

  finish(['First'])
  await vi.waitFor(() =>
    expect(ready(store).imageToTextStatus).toBe(
      'Image to text: added 2 paragraphs. Image to text failed: Last image failed',
    ),
  )

  expect(statuses).toContain('Recognizing image… 0 queued')
  expect(statuses).toContain('Recognizing image… 1 queued')
  expect(statuses).toContain('Image to text failed: Last image failed')
  expect(statuses.at(-1)).toBe('Image to text: added 2 paragraphs. Image to text failed: Last image failed')
  unsubscribe()
})
