// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRealStoreHarness } from './test/real-store-harness'
import { beginStructuralOpen, createVimCommandState } from './vim-command-state'
import { beginInsertSession, beginReplaceSession, createVimEditSessionState } from './vim-edit-session'
import {
  finishInsertSession,
  finishPendingEditSessions,
  finishReplaceSession,
  finishStructuralInsertSession,
  switchVimEditing,
} from './vim-session-finish'
import type { VimCaretState } from './vim-caret-transition'

afterEach(() => document.body.replaceChildren())

function input(text: string, rich = false): HTMLElement {
  const element = document.createElement(rich ? 'div' : 'textarea')
  if (element instanceof HTMLTextAreaElement) element.value = text
  else {
    element.contentEditable = 'true'
    element.textContent = text
  }
  document.body.append(element)
  return element
}

async function fixture(attached = false) {
  const harness = await createRealStoreHarness({
    document: {
      roots: [
        {
          id: 'node',
          text: 'hello',
          children: [],
          ...(attached ? { attachment: { id: 'image', mimeType: 'image/png' as const } } : {}),
        },
      ],
    },
  })
  const session = createVimEditSessionState()
  const commandState = createVimCommandState()
  const authority: { nodeId?: string; caret: VimCaretState } = {
    nodeId: 'node',
    caret: { cursor: 1, imageActive: false },
  }
  const applyCaretState = vi.fn()
  const deps = { store: harness.store, session, commandState, readAuthority: () => authority, applyCaretState }
  return { ...harness, session, commandState, authority, deps, applyCaretState }
}

describe('structural and plain Insert completion', () => {
  it.each([false, true])('captures structural text once (rich: %s)', (rich) => {
    const commandState = createVimCommandState()
    beginStructuralOpen(commandState, 'node', 'after')
    const element = input('created', rich)
    finishStructuralInsertSession({ commandState }, element)
    expect(commandState.lastChange).toEqual({ kind: 'structural-open', position: 'after', text: 'created' })
    const change = commandState.lastChange
    finishStructuralInsertSession({ commandState }, input('ignored'))
    expect(commandState.lastChange).toBe(change)
  })

  it.each([
    { completed: true, matching: true, text: 'hello!', rich: false, records: true },
    { completed: true, matching: true, text: 'hello!', rich: true, records: true },
    { completed: false, matching: true, text: 'hello!', rich: false, records: false },
    { completed: true, matching: false, text: 'hello!', rich: false, records: false },
    { completed: true, matching: true, text: 'hello', rich: false, records: false },
  ])(
    'records only a completed matching edit: $completed/$matching/$text/$rich',
    async ({ completed, matching, text, rich, records }) => {
      const f = await fixture()
      const element = input(text, rich)
      const previous = { kind: 'delete' as const, motion: 'l', count: 1 }
      f.commandState.lastChange = previous
      beginInsertSession(f.session, {
        nodeId: 'node',
        baseline: 'hello',
        position: 5,
        change: { kind: 'insert', entry: 'i' },
      })
      const finishStructuralInsert = vi.fn()
      const deps = { ...f.deps, finishStructuralInsert, getInput: () => (matching ? element : undefined) }
      finishInsertSession(deps, element, completed)
      if (completed) expect(finishStructuralInsert).toHaveBeenCalledWith(element)
      else expect(finishStructuralInsert).not.toHaveBeenCalled()
      expect(f.session.insert).toBeUndefined()
      if (records)
        expect(f.commandState.lastChange).toEqual({
          kind: 'insert',
          entry: 'i',
          insertedText: '!',
          insertOffset: 0,
          deleteCount: 0,
        })
      else expect(f.commandState.lastChange).toBe(previous)
      const recorded = f.commandState.lastChange
      finishInsertSession(deps, element, true)
      expect(f.commandState.lastChange).toBe(recorded)
    },
  )
})

describe('Replace completion', () => {
  it.each([false, true])('consumes absent or empty work without committing (empty: %s)', async (empty) => {
    const f = await fixture()
    if (empty) beginReplaceSession(f.session, { nodeId: 'node', baseline: 'hello', position: 1 })
    expect(finishReplaceSession(f.deps)).toBe(false)
    expect(f.session.replace).toBeUndefined()
    expect(f.node().text).toBe('hello')
    expect(f.applyCaretState).not.toHaveBeenCalled()
  })

  it.each([
    { present: true, preserve: false, retreat: false, attached: false, same: true },
    { present: false, preserve: false, retreat: true, attached: false, same: false },
    { present: true, preserve: true, retreat: false, attached: true, same: true },
    { present: false, preserve: true, retreat: false, attached: false, same: true },
  ])(
    'commits once with correct publication timing: $present/$preserve/$retreat/$attached/$same',
    async ({ present, preserve, retreat, attached, same }) => {
      const f = await fixture(attached)
      if (!same) f.authority.nodeId = 'other'
      beginReplaceSession(f.session, { nodeId: 'node', baseline: 'hello', position: 1 })
      f.session.replace!.typed = 'XY'
      const element = present ? input('native selection') : undefined
      if (element instanceof HTMLTextAreaElement) element.setSelectionRange(1, 4)
      expect(finishReplaceSession(f.deps, element, retreat, preserve)).toBe(true)
      expect(f.node().text).toBe('hXYlo')
      expect(f.commandState.lastChange).toEqual({ kind: 'overwrite', text: 'XY', replaced: 2 })
      expect(f.applyCaretState).toHaveBeenCalledWith(
        'node',
        { cursor: retreat ? 2 : 3, imageActive: false },
        false,
        preserve ? 'preserve-selection' : present ? 'immediate' : 'after-edit',
      )
      if (element instanceof HTMLTextAreaElement) {
        expect(element.value).toBe(preserve ? 'native selection' : 'hXYlo')
        if (preserve) expect([element.selectionStart, element.selectionEnd]).toEqual([1, 4])
      }
      expect(finishReplaceSession(f.deps, element)).toBe(false)
      expect(f.applyCaretState).toHaveBeenCalledTimes(1)
    },
  )
})

describe('pending edit flush', () => {
  it('commits a real Replace session once while discarding structural capture', async () => {
    const f = await fixture()
    beginStructuralOpen(f.commandState, 'node', 'after')
    beginReplaceSession(f.session, { nodeId: 'node', baseline: 'hello', position: 0 })
    f.session.replace!.typed = 'X'
    const changeVimMode = vi.fn()
    const deps = {
      session: f.session,
      commandState: f.commandState,
      finishVimReplace: () => finishReplaceSession(f.deps),
      getMode: () => 'replace' as const,
      changeVimMode,
    }
    expect(finishPendingEditSessions(deps)).toBe(true)
    expect(finishPendingEditSessions(deps)).toBe(false)
    expect(f.node().text).toBe('Xello')
    expect(f.commandState.structuralInsert).toBeUndefined()
    expect(f.applyCaretState).toHaveBeenCalledTimes(1)
  })
  it.each([true, false])('consumes plain Insert and forwards the commit flag (%s)', (committed) => {
    const session = createVimEditSessionState()
    beginInsertSession(session, {
      nodeId: 'node',
      baseline: '',
      position: 0,
      change: { kind: 'insert', entry: 'i' },
    })
    const changeVimMode = vi.fn()
    const finishVimReplace = vi.fn(() => {
      expect(session.insert).toBeUndefined()
      return committed
    })
    expect(
      finishPendingEditSessions({
        session,
        commandState: createVimCommandState(),
        finishVimReplace,
        getMode: () => (committed ? 'replace' : 'insert'),
        changeVimMode,
      }),
    ).toBe(committed)
    expect(changeVimMode.mock.calls).toEqual(committed ? [['normal']] : [])
  })
})

describe('Vim editing switch', () => {
  it('finishes structural Insert when disabling and reads the updated authority', async () => {
    const f = await fixture()
    const element = input('created') as HTMLTextAreaElement
    element.focus()
    beginStructuralOpen(f.commandState, 'node', 'after')
    const events: string[] = []
    switchVimEditing(
      {
        ...f.deps,
        getInput: () => element,
        changeVimMode: () => events.push('mode'),
        finishVimInsert: (input) => {
          events.push('insert')
          finishInsertSession(
            {
              ...f.deps,
              finishStructuralInsert: (input) => finishStructuralInsertSession(f.deps, input),
              getInput: () => element,
            },
            input,
          )
        },
        finishVimReplace: () => {
          events.push('replace')
          f.authority.caret = { cursor: 5, imageActive: true }
          return false
        },
        setNodeVisualSelection: () => events.push('visual'),
        applyCaretState: (...args) => {
          events.push('caret')
          f.applyCaretState(...args)
        },
      },
      false,
    )
    expect(events).toEqual(['insert', 'replace', 'visual', 'caret', 'mode'])
    expect(f.commandState.lastChange).toBeUndefined()
    expect(f.applyCaretState).toHaveBeenCalledWith(
      'node',
      { cursor: 5, imageActive: false },
      false,
      'preserve-selection',
    )
  })
  async function switching(attached = false) {
    const f = await fixture(attached)
    const element = input('hello') as HTMLTextAreaElement
    const changeVimMode = vi.fn()
    const finishVimInsert = vi.fn()
    const finishVimReplace = vi.fn(() => false)
    const setNodeVisualSelection = vi.fn()
    return {
      ...f,
      element,
      switchDeps: {
        ...f.deps,
        getInput: (): HTMLElement | undefined => element,
        changeVimMode,
        finishVimInsert,
        finishVimReplace,
        setNodeVisualSelection,
      },
    }
  }

  it.each([true, false])('switches only the mode while the store is loading (%s)', async (enabled) => {
    const f = await switching()
    vi.spyOn(f.store, 'getSnapshot').mockReturnValue({ status: 'loading' })
    switchVimEditing(f.switchDeps, enabled)
    expect(f.switchDeps.changeVimMode).toHaveBeenCalledWith(enabled ? 'normal' : 'insert')
    expect(f.applyCaretState).not.toHaveBeenCalled()
  })

  it.each([
    { enabled: true, focused: true, selection: false, image: false, registered: true },
    { enabled: true, focused: true, selection: true, image: false, registered: true },
    { enabled: true, focused: false, selection: false, image: false, registered: true },
    { enabled: false, focused: true, selection: true, image: false, registered: true },
    { enabled: false, focused: true, selection: false, image: true, registered: true },
    { enabled: false, focused: false, selection: false, image: false, registered: false },
  ])(
    'switches a ready editor: $enabled/$focused/$selection/$image/$registered',
    async ({ enabled, focused, selection, image, registered }) => {
      const f = await switching(image)
      if (focused) f.element.focus()
      f.element.setSelectionRange(1, selection ? 4 : 1)
      f.authority.caret = { cursor: 5, imageActive: image }
      if (!registered) f.switchDeps.getInput = () => undefined
      switchVimEditing(f.switchDeps, enabled)
      expect(f.switchDeps.changeVimMode).toHaveBeenCalledWith(enabled ? 'normal' : 'insert')
      const cursor = image && !enabled ? 5 : focused ? 1 : f.snapshot().focus.cursor
      expect(f.applyCaretState).toHaveBeenCalledWith(
        'node',
        { cursor, imageActive: false },
        false,
        !enabled || !focused || selection ? 'preserve-selection' : 'immediate',
      )
      if (!enabled) {
        expect(f.switchDeps.finishVimInsert.mock.calls).toEqual(focused ? [[f.element]] : [])
        expect(f.switchDeps.finishVimReplace).toHaveBeenCalledWith(focused ? f.element : undefined, false, true)
        expect(f.switchDeps.setNodeVisualSelection).toHaveBeenCalledWith(undefined)
      }
    },
  )
})
