// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import { serializeState } from '../domain/document'
import { installBrowserPrototype } from './services'
import { applyAppearance } from './appearance'
import { validatePngAttachment } from './attachment-validation'
import { MAX_ATTACHMENT_BYTES } from '../shared/attachment-limits'

const storage = vi.hoisted(() => ({ open: vi.fn(), read: vi.fn(), sweep: vi.fn(), discard: vi.fn() }))
vi.mock('./storage-schema', () => ({
  openDatabase: storage.open,
  readValue: storage.read,
  sweepStagedImages: storage.sweep,
  discardStagedImages: storage.discard,
}))
vi.mock('./appearance', () => ({ applyAppearance: vi.fn() }))
vi.mock('./attachment-validation', () => ({ validatePngAttachment: vi.fn(async () => undefined) }))

const head = () =>
  serializeState(
    { roots: [{ id: 'root', text: 'saved', children: [] }] },
    { currentParentId: null, selectedNodeId: 'root' },
    { expandedIds: [] },
  )

function fixture() {
  document.body.innerHTML =
    '<span id="prototype-save-status"></span><span id="prototype-problem"></span><div id="prototype-vim-controls"><button id="prototype-vim"></button></div>'
  const values = new Map<string, unknown>()
  const put = vi.fn()
  const transactions: Array<{ oncomplete: (() => void) | null; onabort: (() => void) | null; error: Error | null }> = []
  const db = {
    close: vi.fn(),
    onversionchange: null as (() => void) | null,
    transaction: vi.fn(() => {
      const tx = {
        objectStore: () => ({ put }),
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null as Error | null,
      }
      transactions.push(tx)
      return tx
    }),
  }
  storage.open.mockResolvedValue(db)
  storage.read.mockImplementation(async (_db, store, key) => values.get(`${store}:${key}`))
  storage.sweep.mockResolvedValue(undefined)
  storage.discard.mockResolvedValue(undefined)
  const lockReleased = vi.fn()
  const locks = {
    request: vi.fn(async (_name: string, _options: unknown, run: (lock: object | null) => Promise<void>) => {
      await run({})
      lockReleased()
    }),
  }
  const clipboard = {
    read: vi.fn(
      async () => [] as Array<{ types: string[]; getType(type: string): Promise<Pick<Blob, 'arrayBuffer' | 'text'>> }>,
    ),
    write: vi.fn<(items: Array<{ values: Record<string, Blob | Promise<Blob>> }>) => Promise<void>>(
      async () => undefined,
    ),
    writeText: vi.fn(async () => undefined),
  }
  vi.stubGlobal('navigator', { locks, clipboard, platform: 'MacIntel', userAgent: 'Macintosh', maxTouchPoints: 0 })
  vi.stubGlobal(
    'ClipboardItem',
    class {
      constructor(readonly values: unknown) {}
    },
  )
  const status = () => document.getElementById('prototype-save-status')!.textContent
  return { values, db, put, transactions, lockReleased, locks, clipboard, status }
}

function connectStore(installed: Awaited<ReturnType<typeof installBrowserPrototype>>) {
  const saved = head()
  let notify = () => {}
  const flush = vi.fn<() => Promise<void>>(async () => undefined)
  const reportError = vi.fn()
  const getSnapshot = vi.fn(() => ({ status: 'ready', ...saved }))
  installed.connect({
    getSnapshot,
    subscribe: (listener: () => void) => {
      notify = listener
    },
    flushPersistence: flush,
    reportError,
  } as unknown as EditorStore)
  notify()
  return { saved, notify, flush, reportError, getSnapshot }
}

let windowEvents: ReturnType<typeof vi.spyOn>
let documentEvents: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  windowEvents = vi.spyOn(window, 'addEventListener')
  documentEvents = vi.spyOn(document, 'addEventListener')
})
afterEach(() => {
  vi.useRealTimers()
  window.dispatchEvent(new Event('pagehide'))
  for (const [type, listener, options] of windowEvents.mock.calls) window.removeEventListener(type, listener, options)
  for (const [type, listener, options] of documentEvents.mock.calls)
    document.removeEventListener(type, listener, options)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('browser editing service contracts', () => {
  it('rejects an embedded frame before acquiring writer ownership or opening storage', async () => {
    const f = fixture()
    const frame = document.createElement('iframe')
    document.body.append(frame)
    vi.stubGlobal('window', frame.contentWindow)

    await expect(installBrowserPrototype()).rejects.toThrow('Open the prototype directly, outside a frame.')

    expect(f.locks.request).not.toHaveBeenCalled()
    expect(storage.open).not.toHaveBeenCalled()
  })

  it('handles unload and background flushing before an editor store is connected', async () => {
    const f = fixture()
    await installBrowserPrototype()
    const initialStatus = f.status()
    const errors: unknown[] = []
    window.addEventListener('error', (event) => {
      event.preventDefault()
      errors.push(event.error)
    })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const unload = new Event('beforeunload', { cancelable: true })

    window.dispatchEvent(unload)
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()

    expect(unload.defaultPrevented).toBe(false)
    expect(errors).toEqual([])
    expect(f.status()).toBe(initialStatus)
  })

  it.each(['rejected', 'thrown'] as const)('explains recovery after a %s storage-open failure', async (kind) => {
    const f = fixture()
    const failure = new Error('Storage unavailable')
    if (kind === 'rejected') storage.open.mockRejectedValueOnce(failure)
    else
      storage.open.mockImplementationOnce(() => {
        throw failure
      })

    await expect(installBrowserPrototype()).rejects.toMatchObject({
      message:
        'Tree could not open local storage. Reload this tab to try again. To use Tree in another tab, close this tab first.',
      cause: failure,
    })

    expect(storage.sweep).not.toHaveBeenCalled()
    expect(f.lockReleased).not.toHaveBeenCalled()
  })

  it('does not treat a focused editor as unsaved document data before the store finishes loading', async () => {
    fixture()
    const installed = await installBrowserPrototype()
    const flushPersistence = vi.fn()
    installed.connect({
      getSnapshot: () => ({ status: 'loading' }),
      subscribe: () => () => {},
      flushPersistence,
    } as unknown as EditorStore)
    const input = document.createElement('textarea')
    input.className = 'node-input'
    input.value = 'buffered text'
    document.body.append(input)
    input.focus()
    const unload = new Event('beforeunload', { cancelable: true })
    const errors: unknown[] = []
    window.addEventListener('error', (event) => {
      errors.push(event.error)
      event.preventDefault()
    })

    window.dispatchEvent(unload)

    expect(errors).toEqual([])
    expect(unload.defaultPrevented).toBe(false)
    expect(flushPersistence).not.toHaveBeenCalled()
  })

  it('compares the parent heading with its own node rather than the selected child', async () => {
    const f = fixture()
    const installed = await installBrowserPrototype()
    const saved = serializeState(
      { roots: [{ id: 'parent', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }] },
      { currentParentId: 'parent', selectedNodeId: 'child' },
      { expandedIds: [] },
    )
    let notify = () => {}
    installed.connect({
      getSnapshot: () => ({ status: 'ready', ...saved }),
      subscribe: (listener: () => void) => {
        notify = listener
      },
    } as unknown as EditorStore)
    const input = document.createElement('textarea')
    input.className = 'node-input current-parent-input'
    input.value = 'Parent'
    document.body.append(input)
    input.focus()

    notify()

    expect(f.status()).toBe('Saved locally in this browser')
    input.value = 'Changed parent'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    expect(f.status()).toBe('Editing — not saved yet')
  })

  it('keeps a changed document dirty until its successful retry clears the save error', async () => {
    const f = fixture()
    const installed = await installBrowserPrototype()
    const store = connectStore(installed)
    const changed = { ...store.saved, document: { roots: [{ id: 'root', text: 'changed', children: [] }] } }
    store.getSnapshot.mockReturnValue({ status: 'ready', ...changed })
    store.notify()

    expect(f.status()).toBe('Saving…')
    expect(document.getElementById('prototype-problem')!.hidden).toBe(true)
    const failed = installed.services.save(changed)
    const rejection = expect(failed).rejects.toThrow('Local save failed.')
    f.transactions[0]!.onabort!()
    await rejection
    store.notify()

    expect(f.status()).toBe('Save failed — keep this tab open')
    expect(document.getElementById('prototype-problem')!.hidden).toBe(false)

    const retry = installed.services.save(changed)
    f.transactions[1]!.oncomplete!()
    await retry

    expect(f.status()).toBe('Saved locally in this browser')
    expect(document.getElementById('prototype-problem')!.hidden).toBe(true)
    expect(document.getElementById('prototype-problem')!.textContent).toBe('')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    expect(store.flush).not.toHaveBeenCalled()
  })

  it('protects a newly buffered edit before a status notification has run', async () => {
    fixture()
    const installed = await installBrowserPrototype()
    const store = connectStore(installed)
    const input = document.createElement('textarea')
    input.className = 'node-input'
    input.value = 'changed before input notification'
    document.body.append(input)
    input.focus()

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)

    expect(unload.defaultPrevented).toBe(true)
    expect(store.flush).toHaveBeenCalledOnce()
  })

  // @requirement PRODUCT.md §1.4
  it('cancels native unload with a string returnValue while an edit remains buffered', async () => {
    fixture()
    const installed = await installBrowserPrototype()
    const store = connectStore(installed)
    const input = document.createElement('textarea')
    input.className = 'node-input'
    input.value = 'buffered before native close'
    document.body.append(input)
    input.focus()
    const unload = new Event('beforeunload', { cancelable: true })
    // BeforeUnloadEvent has a string returnValue; Event's boolean setter would cancel on assignment.
    Object.defineProperty(unload, 'returnValue', { value: '', writable: true })

    window.dispatchEvent(unload)

    expect(unload.defaultPrevented).toBe(true)
    expect(store.flush).toHaveBeenCalledOnce()
  })

  it('does not request another save from an inactive dirty page', async () => {
    fixture()
    const installed = await installBrowserPrototype()
    const store = connectStore(installed)
    store.getSnapshot.mockReturnValue({ ...store.getSnapshot(), document: head().document })
    store.notify()
    window.dispatchEvent(new Event('pagehide'))

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)

    expect(unload.defaultPrevented).toBe(true)
    expect(store.flush).not.toHaveBeenCalled()
  })

  it.each(['keydown', 'compositionend'])(
    'updates buffered rich text after %s and forgets a detached input',
    async (event) => {
      const f = fixture()
      const installed = await installBrowserPrototype()
      const store = connectStore(installed)
      const row = document.createElement('div')
      row.dataset.nodeId = 'root'
      const input = document.createElement('div')
      input.className = 'node-input'
      input.contentEditable = 'true'
      input.tabIndex = 0
      input.textContent = 'edited rich text'
      row.append(input)
      document.body.append(row)
      input.focus()

      input.dispatchEvent(new Event(event, { bubbles: true }))
      await Promise.resolve()

      expect(f.status()).toBe('Editing — not saved yet')

      row.remove()
      store.notify()

      expect(f.status()).toBe('Saved locally in this browser')
      const unload = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unload)
      expect(unload.defaultPrevented).toBe(false)
    },
  )

  it('ignores stale input nodes that no longer exist in the current document', async () => {
    const f = fixture()
    const installed = await installBrowserPrototype()
    const store = connectStore(installed)
    const row = document.createElement('div')
    row.dataset.nodeId = 'removed'
    const input = document.createElement('textarea')
    input.className = 'node-input'
    input.value = 'old text'
    row.append(input)
    document.body.append(row)
    input.focus()

    store.notify()

    expect(f.status()).toBe('Saved locally in this browser')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    expect(store.flush).not.toHaveBeenCalled()
  })

  it('waits for successful persistence before closing a clean browser tab', async () => {
    fixture()
    const installed = await installBrowserPrototype()
    const store = connectStore(installed)
    let finish!: () => void
    store.flush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})

    const quit = window.treeApi.quit()
    expect(store.flush).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    finish()
    await quit

    expect(close).toHaveBeenCalledOnce()
  })

  it('keeps the tab open and reports the original failure when the quit flush rejects', async () => {
    const f = fixture()
    const installed = await installBrowserPrototype()
    const store = connectStore(installed)
    const failure = new Error('disk full')
    store.flush.mockRejectedValueOnce(failure)
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})

    await window.treeApi.quit()

    expect(close).not.toHaveBeenCalled()
    expect(store.reportError).toHaveBeenCalledExactlyOnceWith(failure)
    expect(f.status()).toBe('Save failed — keep this tab open')
    expect(document.getElementById('prototype-problem')!.hidden).toBe(false)
  })

  it('does not close a tab while text remains buffered after the flush', async () => {
    const f = fixture()
    const installed = await installBrowserPrototype()
    connectStore(installed)
    const input = document.createElement('textarea')
    input.className = 'node-input'
    input.value = 'buffered edit'
    document.body.append(input)
    input.focus()
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})

    await window.treeApi.quit()

    expect(close).not.toHaveBeenCalled()
    expect(f.status()).toBe('Editing — not saved yet')
    expect(document.getElementById('prototype-problem')!.hidden).toBe(true)
    expect(document.getElementById('prototype-problem')!.textContent).toBe('')
  })

  it('flushes a hidden active page but ignores visibility changes after pagehide', async () => {
    fixture()
    const installed = await installBrowserPrototype()
    const store = connectStore(installed)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)

    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.flush).not.toHaveBeenCalled()
    hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.flush).toHaveBeenCalledOnce()
    window.dispatchEvent(new Event('pagehide'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(store.flush).toHaveBeenCalledOnce()
  })

  it('writes rich clipboard text with both MIME types and plain content through writeText', async () => {
    const f = fixture()
    const { services } = await installBrowserPrototype()

    await services.writeClipboard!({ text: 'label', html: '<b>label</b>' })
    await services.writeClipboardContent!({ kind: 'text', text: 'plain' })

    const values = f.clipboard.write.mock.calls[0]![0][0]!.values
    const read = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(blob)
      })
    expect(Object.keys(values)).toEqual(['text/plain', 'text/html'])
    expect((values['text/plain'] as Blob).type).toBe('text/plain')
    expect((values['text/html'] as Blob).type).toBe('text/html')
    expect(await read(values['text/plain'] as Blob)).toBe('label')
    expect(await read(values['text/html'] as Blob)).toBe('<b>label</b>')
    expect(f.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('plain')
    expect(f.clipboard.write).toHaveBeenCalledOnce()
  })

  it('starts an image clipboard write synchronously and supplies the loaded image through its promise', async () => {
    const f = fixture()
    const { services } = await installBrowserPrototype()
    let loaded!: (bytes: Uint8Array) => void
    storage.read.mockImplementationOnce(
      () =>
        new Promise<Uint8Array>((resolve) => {
          loaded = resolve
        }),
    )

    const pending = services.writeClipboardContent!({ kind: 'image', attachmentId: 'image' })

    expect(f.clipboard.write).toHaveBeenCalledOnce()
    expect(storage.read).toHaveBeenLastCalledWith(f.db, 'blobs', 'image')
    const image = f.clipboard.write.mock.calls[0]![0][0]!.values['image/png'] as Promise<Blob>
    expect(image).toBeInstanceOf(Promise)
    loaded(new Uint8Array([137, 80, 78, 71]))
    const blob = await image
    expect(blob.type).toBe('image/png')
    const reader = new FileReader()
    const bytes = new Promise((resolve) => {
      reader.onload = () => resolve(reader.result)
    })
    reader.readAsArrayBuffer(blob)
    expect(new Uint8Array((await bytes) as ArrayBuffer)).toEqual(new Uint8Array([137, 80, 78, 71]))
    await pending
  })

  it.each(['missing-image', 'clipboard-denied'] as const)(
    'preserves the original image-copy failure for %s',
    async (reason) => {
      const f = fixture()
      const { services } = await installBrowserPrototype()
      const denied = new Error('clipboard denied')
      if (reason === 'clipboard-denied') f.values.set('blobs:image', new Uint8Array([1]))
      f.clipboard.write.mockRejectedValueOnce(denied)

      const pending = services.writeClipboardContent!({ kind: 'image', attachmentId: 'image' })

      if (reason === 'missing-image') await expect(pending).rejects.toThrow('Image could not be loaded.')
      else await expect(pending).rejects.toBe(denied)
      expect(f.clipboard.writeText).not.toHaveBeenCalled()
    },
  )

  it.each([MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_BYTES + 1])(
    'checks clipboard image size %i before reading bytes',
    async (size) => {
      const f = fixture()
      const { services } = await installBrowserPrototype()
      const arrayBuffer = vi.fn(async () => new Uint8Array([1]).buffer)
      f.clipboard.read.mockResolvedValueOnce([
        { types: ['image/png'], getType: async () => ({ size, arrayBuffer, text: async () => '' }) },
      ])

      const result = services.readClipboard()

      if (size === MAX_ATTACHMENT_BYTES) {
        await expect(result).resolves.toEqual({ kind: 'image', png: new Uint8Array([1]) })
        expect(arrayBuffer).toHaveBeenCalledOnce()
      } else {
        await expect(result).rejects.toThrow('Clipboard image is too large (maximum 25 MiB).')
        expect(arrayBuffer).not.toHaveBeenCalled()
      }
    },
  )

  it('validates attachment bytes before creating a durable write transaction', async () => {
    const f = fixture()
    const { services } = await installBrowserPrototype()
    const bytes = new Uint8Array([1, 2])
    vi.mocked(validatePngAttachment).mockRejectedValueOnce(new Error('invalid PNG'))

    await expect(services.writeAttachment!('bad', bytes)).rejects.toThrow('invalid PNG')
    expect(f.db.transaction).not.toHaveBeenCalled()
    const pending = services.writeAttachment!('valid', bytes)
    await vi.waitFor(() => expect(f.put).toHaveBeenCalledExactlyOnceWith(bytes, 'valid'))
    expect(validatePngAttachment).toHaveBeenLastCalledWith(bytes)
    expect(f.db.transaction).toHaveBeenCalledExactlyOnceWith('blobs', 'readwrite', { durability: 'strict' })
    f.transactions[0]!.oncomplete!()
    await pending
  })

  it('closes storage, releases writer ownership and reloads on a database version change', async () => {
    const f = fixture()
    const installed = await installBrowserPrototype()
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    f.db.onversionchange!()
    await vi.waitFor(() => expect(f.lockReleased).toHaveBeenCalledOnce())

    expect(f.db.close).toHaveBeenCalledOnce()
    expect(f.lockReleased).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledOnce()
    await expect(installed.services.save(head())).rejects.toThrow('no longer active')
    expect(f.db.transaction).not.toHaveBeenCalled()
  })

  it.each([false, true])('reloads a restored page only when pageshow persisted=%s', async (persisted) => {
    fixture()
    await installBrowserPrototype()
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }))

    expect(reload).toHaveBeenCalledTimes(persisted ? 1 : 0)
  })

  it.each(['2026-01-02', '2026-10-31'])(
    'creates the welcome document with the local Agenda date %s only when no head exists',
    async (date) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(`${date}T12:00:00`))
      const f = fixture()
      const { services } = await installBrowserPrototype()
      const loaded = services.load()
      await vi.waitFor(() => expect(f.put).toHaveBeenCalledOnce())
      const initial = f.put.mock.calls[0]![0]

      expect(f.put.mock.calls[0]![1]).toBe('head')
      expect(f.db.transaction).toHaveBeenCalledExactlyOnceWith('document', 'readwrite', { durability: 'strict' })
      expect(initial.document.roots.map((node: { id: string }) => node.id)).toEqual(['welcome', 'project', 'today'])
      expect(initial.document.roots[1].children.map((node: { text: string }) => node.text)).toEqual([
        'First step',
        'Second step',
      ])
      expect(initial.document.roots[0].text).toBe('Welcome to Tree — edit this line')
      expect(initial.document.roots[1].text).toBe('A project')
      expect(initial.document.roots[2].text).toBe(`Try Agenda #${date}`)
      expect(initial.location).toEqual({ currentParentId: null, selectedNodeId: 'welcome' })
      expect(initial.view).toEqual({ expandedIds: ['project'] })
      f.transactions[0]!.oncomplete!()
      await expect(loaded).resolves.toEqual(initial)
      expect(f.status()).toBe('Saved locally in this browser')
    },
  )

  it.each(['system', 'light', 'dark', 'invalid'])(
    'restores saved appearance %s and persists changes before notifying',
    async (savedAppearance) => {
      const f = fixture()
      f.values.set('preferences:appearance', savedAppearance)
      await installBrowserPrototype()
      const expected = savedAppearance === 'light' || savedAppearance === 'dark' ? savedAppearance : 'system'
      expect(await window.treeApi.getAppearance()).toBe(expected)
      expect(applyAppearance).toHaveBeenLastCalledWith(expected)
      const changed = vi.fn()
      const stop = window.treeApi.onAppearanceChanged!(changed)

      const pending = window.treeApi.setAppearance('dark')
      expect(changed).not.toHaveBeenCalled()
      expect(f.put).toHaveBeenLastCalledWith('dark', 'appearance')
      f.transactions[0]!.oncomplete!()
      await pending

      expect(await window.treeApi.getAppearance()).toBe('dark')
      expect(f.db.transaction).toHaveBeenLastCalledWith('preferences', 'readwrite', { durability: 'strict' })
      expect(applyAppearance).toHaveBeenLastCalledWith('dark')
      expect(changed).toHaveBeenCalledExactlyOnceWith('dark')
      stop()
      const next = window.treeApi.setAppearance('light')
      f.transactions[1]!.oncomplete!()
      await next
      expect(changed).toHaveBeenCalledOnce()
    },
  )

  it('loads Vim preferences, updates the control and unsubscribes listeners', async () => {
    const f = fixture()
    f.values.set('preferences:vim', true)
    const installed = await installBrowserPrototype()
    expect(installed.vimAvailable).toBe(true)
    expect(document.getElementById('prototype-vim-controls')!.hidden).toBe(false)
    expect(await window.treeApi.getVimEnabled()).toBe(true)
    expect(document.getElementById('prototype-vim')!.getAttribute('aria-pressed')).toBe('true')
    const changed = vi.fn()
    const stop = window.treeApi.onVimEnabledChanged!(changed)

    const pending = window.treeApi.setVimEnabled(false)
    expect(f.put).toHaveBeenLastCalledWith(false, 'vim')
    expect(changed).not.toHaveBeenCalled()
    f.transactions[0]!.oncomplete!()
    await pending

    expect(await window.treeApi.getVimEnabled()).toBe(false)
    expect(document.getElementById('prototype-vim')!.getAttribute('aria-pressed')).toBe('false')
    expect(f.db.transaction).toHaveBeenLastCalledWith('preferences', 'readwrite', { durability: 'strict' })
    expect(changed).toHaveBeenCalledExactlyOnceWith(false)
    stop()
    const next = window.treeApi.setVimEnabled(true)
    f.transactions[1]!.oncomplete!()
    await next
    expect(changed).toHaveBeenCalledOnce()
  })

  it.each([undefined, 'true', true, false])(
    'loads and durably saves line numbers separately from notes (%j)',
    async (saved) => {
      const f = fixture()
      f.values.set('preferences:line-numbers', saved)
      await installBrowserPrototype()

      expect(await window.treeApi.getLineNumbers()).toBe(saved === true)

      const pending = window.treeApi.setLineNumbers(true)

      expect(f.put).toHaveBeenLastCalledWith(true, 'line-numbers')
      expect(f.db.transaction).toHaveBeenLastCalledWith('preferences', 'readwrite', { durability: 'strict' })

      f.transactions[0]!.oncomplete!()
      await pending

      expect(await window.treeApi.getLineNumbers()).toBe(true)
    },
  )

  it('disables Vim on an iPad even with a saved enabled preference', async () => {
    const f = fixture()
    f.values.set('preferences:vim', true)
    vi.stubGlobal('navigator', { locks: f.locks, platform: 'MacIntel', userAgent: 'Macintosh', maxTouchPoints: 5 })
    const installed = await installBrowserPrototype()

    await window.treeApi.setVimEnabled(true)

    expect(installed.vimAvailable).toBe(false)
    expect(await window.treeApi.getVimEnabled()).toBe(false)
    expect(document.getElementById('prototype-vim-controls')!.hidden).toBe(true)
    expect(f.put).not.toHaveBeenCalled()
  })

  it('reports desktop-only commands as unavailable and returns missing attachments as null', async () => {
    const f = fixture()
    await installBrowserPrototype()

    expect(await window.treeApi.getAlwaysOnTop()).toBe(false)
    await expect(window.treeApi.setAlwaysOnTop(true)).rejects.toThrow('Always on Top is unavailable in the browser.')
    await expect(window.treeApi.quitWithoutSaving()).rejects.toThrow('Close the browser tab to leave the prototype.')
    expect(await window.treeApi.readAttachment('missing')).toBeNull()
    f.values.set('blobs:image', new Uint8Array([1, 2]))
    expect(await window.treeApi.readAttachment('image')).toEqual(new Uint8Array([1, 2]))
  })

  it('requires an available exclusive writer lock before opening storage', async () => {
    const f = fixture()
    f.locks.request.mockImplementationOnce(async (_name, _options, run) => {
      await run(null)
    })

    await expect(installBrowserPrototype()).rejects.toThrow('already open in another tab')
    expect(storage.open).not.toHaveBeenCalled()
    expect(f.locks.request).toHaveBeenCalledWith(
      'tree-browser-prototype-writer',
      { ifAvailable: true },
      expect.any(Function),
    )
  })

  it('preserves a rejected writer-lock request without opening storage', async () => {
    const f = fixture()
    const failure = new Error('locks unavailable')
    f.locks.request.mockRejectedValueOnce(failure)

    await expect(installBrowserPrototype()).rejects.toBe(failure)

    expect(storage.open).not.toHaveBeenCalled()
  })

  it('provides inert unsubscribe functions for desktop quit subscriptions', async () => {
    fixture()
    await installBrowserPrototype()
    const requested = vi.fn()
    const failed = vi.fn()

    const stopRequested = window.treeApi.onQuitRequested(requested)
    const stopFailed = window.treeApi.onQuitFailed(failed)
    stopRequested()
    stopFailed()

    expect(requested).not.toHaveBeenCalled()
    expect(failed).not.toHaveBeenCalled()
  })

  it('rejects browsers without Web Locks before touching storage', async () => {
    fixture()
    vi.stubGlobal('navigator', {})

    await expect(installBrowserPrototype()).rejects.toThrow('Web Locks support')
    expect(storage.open).not.toHaveBeenCalled()
  })

  it('loads persisted notes and reports a save only after transaction completion', async () => {
    const f = fixture()
    const saved = head()
    f.values.set('document:head', saved)
    const { services, data } = await installBrowserPrototype()
    const notified = vi.fn()
    const stop = data.onSaved(notified)

    expect(await services.load()).toEqual(saved)
    expect(f.status()).toBe('Saved locally in this browser')
    const pending = services.save(saved)

    expect(f.status()).toBe('Saving…')
    expect(f.db.transaction).toHaveBeenCalledExactlyOnceWith('document', 'readwrite', { durability: 'strict' })
    expect(f.put).toHaveBeenCalledExactlyOnceWith(saved, 'head')
    expect(notified).not.toHaveBeenCalled()
    f.transactions[0]!.oncomplete!()
    await pending
    expect(notified).toHaveBeenCalledOnce()
    stop()
    const next = services.save(saved)
    f.transactions[1]!.oncomplete!()
    await next
    expect(notified).toHaveBeenCalledOnce()
  })

  it('preserves transaction failures, exposes unsaved status, and does not notify backup', async () => {
    const f = fixture()
    const { services, data } = await installBrowserPrototype()
    const notified = vi.fn()
    data.onSaved(notified)
    const failure = new Error('quota')
    const pending = services.save(head())
    const rejected = expect(pending).rejects.toBe(failure)
    f.transactions[0]!.error = failure

    f.transactions[0]!.onabort!()
    await rejected

    expect(notified).not.toHaveBeenCalled()
    expect(f.status()).toBe('Save failed — keep this tab open')
    expect(document.getElementById('prototype-problem')!.hidden).toBe(false)
  })

  it('suspends writes during replacement and prevents them after pagehide', async () => {
    const f = fixture()
    const { services, data } = await installBrowserPrototype()
    const resume = data.suspendWrites()

    await expect(services.save(head())).rejects.toThrow('no longer active')
    expect(f.db.transaction).not.toHaveBeenCalled()
    resume()
    const saved = services.save(head())
    f.transactions[0]!.oncomplete!()
    await saved
    await data.discardStagedImages()
    expect(storage.discard).toHaveBeenCalledExactlyOnceWith(f.db)
    window.dispatchEvent(new Event('pagehide'))
    await expect(services.save(head())).rejects.toThrow('no longer active')
    await Promise.resolve()

    expect(f.db.close).toHaveBeenCalledOnce()
    expect(f.lockReleased).toHaveBeenCalledOnce()
    expect(f.db.transaction).toHaveBeenCalledOnce()
  })

  it('preserves history defaults and writes each history to its own preference key', async () => {
    const f = fixture()
    const { services } = await installBrowserPrototype()
    expect(await services.loadEmojiHistory!()).toEqual([])
    expect(await services.loadRecentNodes!()).toEqual([])
    expect(await window.treeApi.getCommandHistory()).toEqual([])
    expect(await window.treeApi.getVimEnabled()).toBe(false)
    f.values.set('preferences:commands', ['find'])
    expect(await window.treeApi.getCommandHistory()).toEqual(['find'])
    f.values.set('preferences:emoji-history', ['cat'])
    f.values.set('preferences:recent-nodes', ['root'])
    expect(await services.loadEmojiHistory!()).toEqual(['cat'])
    expect(await services.loadRecentNodes!()).toEqual(['root'])

    const saves = [
      services.saveEmojiHistory!(['cat']),
      services.saveRecentNodes!(['root']),
      window.treeApi.setCommandHistory(['command']),
    ]
    for (const tx of f.transactions) tx.oncomplete!()
    await Promise.all(saves)

    expect(f.put.mock.calls).toEqual([
      [['cat'], 'emoji-history'],
      [['root'], 'recent-nodes'],
      [['command'], 'commands'],
    ])
    expect(f.db.transaction.mock.calls).toEqual([
      ['preferences', 'readwrite', { durability: 'strict' }],
      ['preferences', 'readwrite', { durability: 'strict' }],
      ['preferences', 'readwrite', { durability: 'strict' }],
    ])
  })

  it('reads PNG before text and preserves hyperlinks from rich text', async () => {
    const f = fixture()
    const { services } = await installBrowserPrototype()
    const getImage = vi.fn(async () => ({
      size: 2,
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
      text: async () => '',
    }))
    f.clipboard.read.mockResolvedValueOnce([
      {
        types: ['image/png', 'text/plain'],
        getType: getImage,
      },
    ])
    expect(await services.readClipboard()).toEqual({ kind: 'image', png: new Uint8Array([1, 2]) })
    expect(getImage).toHaveBeenCalledExactlyOnceWith('image/png')
    f.clipboard.read.mockResolvedValueOnce([
      {
        types: ['text/plain', 'text/html'],
        getType: async (type) => {
          if (type !== 'text/plain' && type !== 'text/html') throw new Error('Unavailable clipboard type')
          return {
            arrayBuffer: async () => new ArrayBuffer(0),
            text: async () => (type === 'text/plain' ? 'label' : '<a href="https://example.com">label</a>'),
          }
        },
      },
    ])
    expect(await services.readClipboard()).toEqual({
      kind: 'text',
      text: 'label',
      links: [{ start: 0, end: 5, url: 'https://example.com' }],
    })
    expect(await services.readClipboard()).toEqual({ kind: 'text', text: '', links: [] })
  })

  it('reads plain clipboard text without requiring HTML', async () => {
    const f = fixture()
    const { services } = await installBrowserPrototype()
    const getType = vi.fn(async (type: string) => {
      if (type !== 'text/plain') throw new Error('Unavailable clipboard type')
      return { text: async () => 'plain text', arrayBuffer: async () => new ArrayBuffer(0) }
    })
    f.clipboard.read.mockResolvedValueOnce([{ types: ['text/plain'], getType }])

    await expect(services.readClipboard()).resolves.toEqual({ kind: 'text', text: 'plain text', links: [] })

    expect(getType).toHaveBeenCalledExactlyOnceWith('text/plain')
  })

  it('reflects buffered text in status and protects unsaved edits on unload', async () => {
    const f = fixture()
    const installed = await installBrowserPrototype()
    const saved = head()
    let notify = () => {}
    const flush = vi.fn(async () => undefined)
    const store = {
      getSnapshot: () => ({ status: 'ready', ...saved }),
      subscribe: (listener: () => void) => {
        notify = listener
      },
      flushPersistence: flush,
    }
    installed.connect(store as unknown as EditorStore)
    notify()
    expect(f.status()).toBe('Saved locally in this browser')
    const input = document.createElement('textarea')
    input.className = 'node-input'
    input.value = 'unsaved edit'
    document.body.append(input)
    input.focus()
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()

    expect(f.status()).toBe('Editing — not saved yet')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    expect(flush).toHaveBeenCalledOnce()
    installed.data.suspendWrites()
    const replacing = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(replacing)
    expect(replacing.defaultPrevented).toBe(false)
  })
})
