import type { Clock, EditorServices } from '../../src/application/editor-store-types'
import type { EditorStore } from '../../src/application/editor-store'
import type { TreeApi } from '../../src/shared/ipc'
import { requireNode, serializeState, validatePersistedState } from '../../src/domain/document'
import { readEditableContent } from '../../src/renderer/editor-dom'
import { SAVE_IDLE_MILLISECONDS } from '../../src/application/save-policy'
import { extractClipboardLinks } from '../../src/infrastructure/main/clipboard'
import { validateAttachmentBytes, MAX_ATTACHMENT_BYTES } from '../../src/main/ipc-security'
import { applyAppearance } from './appearance'

const status = (text: string) => {
  document.getElementById('prototype-save-status')!.textContent = text
  const problem = document.getElementById('prototype-problem')!
  problem.hidden = text === 'Saving…' || text === 'Saved locally in this browser' || text === 'Editing — not saved yet'
  problem.textContent = problem.hidden ? '' : text
}

export async function installBrowserPrototype(): Promise<{
  services: EditorServices
  clock: Clock
  connect(store: EditorStore): void
}> {
  if (window.top !== window.self) throw new Error('Open the prototype directly, outside a frame.')
  if (!navigator.locks) throw new Error('This prototype needs browser Web Locks support.')
  let active = false
  let release: (() => void) | undefined
  await new Promise<void>((resolve, reject) => {
    void navigator.locks
      .request('tree-browser-prototype-writer', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(new Error('Tree is already open in another tab. Close that tab, then reload here.'))
          return
        }
        active = true
        resolve()
        await new Promise<void>((done) => {
          release = done
        })
      })
      .catch(reject)
  })
  const request = indexedDB.open('tree-browser-prototype', 1)
  request.onupgradeneeded = () => {
    request.result.createObjectStore('document')
    request.result.createObjectStore('blobs')
    request.result.createObjectStore('preferences')
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Another tab is blocking local storage. Close it and reload.'))
  })
  const guard = () => {
    if (!active) throw new Error('This editing session is no longer active. Reload the page.')
  }
  const read = <T>(store: string, key: string): Promise<T | undefined> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store)
      const value = tx.objectStore(store).get(key)
      tx.oncomplete = () => resolve(value.result)
      tx.onabort = () => reject(tx.error)
    })
  const write = (store: string, key: string, value: unknown): Promise<void> =>
    new Promise((resolve, reject) => {
      guard()
      const tx = db.transaction(store, 'readwrite', { durability: 'strict' })
      tx.objectStore(store).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('Local save failed.'))
      tx.onerror = () => {}
    })
  let store: EditorStore | undefined
  let dirty = false
  let savedDocument: unknown
  let saveFailed = false
  let lastInput: HTMLElement | undefined
  const hasBufferedEdit = () => {
    const state = store?.getSnapshot()
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused.matches('.node-input')) lastInput = focused
    const input = lastInput
    if (state?.status !== 'ready' || input === undefined || !input.isConnected) return false
    const nodeId =
      input.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId ??
      (input.matches('.current-parent-input') ? state.location.currentParentId : state.location.selectedNodeId)
    if (nodeId === null) return true
    const text = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
    try {
      return text !== requireNode(state.document, nodeId).node.text
    } catch {
      return false
    }
  }
  const updateStatus = () => {
    const state = store?.getSnapshot()
    if (state?.status !== 'ready') return
    const buffered = hasBufferedEdit()
    dirty = buffered || state.document !== savedDocument
    status(
      saveFailed
        ? 'Save failed — keep this tab open'
        : buffered
          ? 'Editing — not saved yet'
          : dirty
            ? 'Saving…'
            : 'Saved locally in this browser',
    )
  }
  let vimEnabled = (await read<boolean>('preferences', 'vim')) ?? false
  const savedAppearance = await read<string>('preferences', 'appearance')
  let appearance: 'system' | 'light' | 'dark' =
    savedAppearance === 'light' || savedAppearance === 'dark' ? savedAppearance : 'system'
  applyAppearance(appearance)
  const appearanceListeners = new Set<(value: 'system' | 'light' | 'dark') => void>()
  const vimListeners = new Set<(value: boolean) => void>()
  const updateVim = () => document.getElementById('prototype-vim')!.setAttribute('aria-pressed', String(vimEnabled))
  updateVim()
  const flush = async () => {
    try {
      await store?.flushPersistence()
      return true
    } catch (error) {
      status('Save failed — keep this tab open')
      store?.reportError(error)
      return false
    }
  }
  const services: EditorServices = {
    async load() {
      const saved = await read<unknown>('document', 'head')
      if (saved !== undefined) {
        const parsed = validatePersistedState(saved)
        status('Saved locally in this browser')
        return parsed
      }
      const now = new Date()
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const initial = serializeState(
        {
          roots: [
            { id: 'welcome', text: 'Welcome to Tree — edit this line', children: [] },
            {
              id: 'project',
              text: 'A project',
              children: [
                { id: 'first', text: 'First step', children: [] },
                { id: 'second', text: 'Second step', children: [] },
              ],
            },
            { id: 'today', text: `Try Agenda #${date}`, children: [] },
          ],
        },
        { currentParentId: null, selectedNodeId: 'welcome' },
        { expandedIds: ['project'] },
      )
      await write('document', 'head', initial)
      status('Saved locally in this browser')
      return initial
    },
    async save(value) {
      status('Saving…')
      try {
        await write('document', 'head', value)
        savedDocument = value.document
        saveFailed = false
        updateStatus()
      } catch (error) {
        saveFailed = true
        status('Save failed — keep this tab open')
        throw error
      }
    },
    async readClipboard() {
      const items = await navigator.clipboard.read()
      for (const item of items)
        if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png')
          if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error('Clipboard image is too large (maximum 25 MiB).')
          return { kind: 'image', png: new Uint8Array(await blob.arrayBuffer()) }
        }
      const textItem = items.find((item) => item.types.includes('text/plain'))
      const text = textItem ? await (await textItem.getType('text/plain')).text() : ''
      const htmlItem = items.find((item) => item.types.includes('text/html'))
      const html = htmlItem ? await (await htmlItem.getType('text/html')).text() : ''
      return { kind: 'text', text, links: extractClipboardLinks(html, text) }
    },
    writeClipboard: (payload) =>
      navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([payload.text], { type: 'text/plain' }),
          'text/html': new Blob([payload.html], { type: 'text/html' }),
        }),
      ]),
    async writeClipboardContent(payload) {
      if (payload.kind === 'text') {
        await navigator.clipboard.writeText(payload.text)
        return
      }
      const bytes = await read<Uint8Array>('blobs', payload.attachmentId)
      if (!bytes) throw new Error('Image could not be loaded.')
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': new Blob([bytes.slice()], { type: 'image/png' }) }),
      ])
    },
    async writeAttachment(id, bytes) {
      validateAttachmentBytes(bytes, () => true)
      const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }))
      bitmap.close()
      await write('blobs', id, bytes)
    },
    async cleanupAttachments() {
      /* Prototype retains image bytes; no production GC policy. */
    },
  }
  const noSubscription = () => () => {}
  const api: TreeApi = {
    ...services,
    readAttachment: async (id) => (await read<Uint8Array>('blobs', id)) ?? null,
    async getAlwaysOnTop() {
      return false
    },
    async setAlwaysOnTop() {
      throw new Error('Always on Top is unavailable in the browser.')
    },
    async getVimEnabled() {
      return vimEnabled
    },
    async setVimEnabled(value) {
      await write('preferences', 'vim', value)
      vimEnabled = value
      updateVim()
      for (const listener of vimListeners) listener(value)
    },
    onVimEnabledChanged(listener) {
      vimListeners.add(listener)
      return () => {
        vimListeners.delete(listener)
      }
    },
    async getAppearance() {
      return appearance
    },
    async setAppearance(value) {
      await write('preferences', 'appearance', value)
      appearance = value
      applyAppearance(value)
      for (const listener of appearanceListeners) listener(value)
    },
    onAppearanceChanged(listener) {
      appearanceListeners.add(listener)
      return () => {
        appearanceListeners.delete(listener)
      }
    },
    async getCommandHistory() {
      return (await read<string[]>('preferences', 'commands')) ?? []
    },
    setCommandHistory: (value) => write('preferences', 'commands', value),
    async quit() {
      if ((await flush()) && !dirty) window.close()
    },
    async quitWithoutSaving() {
      throw new Error('Close the browser tab to leave the prototype.')
    },
    onQuitRequested: noSubscription,
    onQuitFailed: noSubscription,
  }
  window.treeApi = api
  db.onversionchange = () => {
    active = false
    db.close()
    release?.()
    location.reload()
  }
  window.addEventListener('pagehide', () => {
    active = false
    db.close()
    release?.()
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload()
  })
  window.addEventListener('beforeunload', (event) => {
    const pending = dirty || hasBufferedEdit()
    if (pending) {
      event.preventDefault()
      event.returnValue = ''
      if (active) void flush()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && active) void flush()
  })
  for (const event of ['input', 'keydown', 'compositionend']) {
    document.addEventListener(event, () => queueMicrotask(updateStatus))
  }
  return {
    services,
    // Use the existing save scheduler without calling its shutdown edit finishers on
    // each autosave. Other editor timers keep their normal delays.
    clock: {
      setTimeout: (callback, milliseconds) =>
        setTimeout(callback, milliseconds === SAVE_IDLE_MILLISECONDS ? 300 : milliseconds),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    connect(editor) {
      store = editor
      editor.subscribe(() => {
        const state = editor.getSnapshot()
        if (state.status !== 'ready') return
        if (savedDocument === undefined) savedDocument = state.document
        updateStatus()
      })
    },
  }
}
