// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LinkRange, TreeNode } from '../domain/document'
import { setCaret } from './editor-dom'
import { EditorComposition } from './editor-composition'
import { createTextEditHandlers } from './node-input-text-handlers'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimCommandState } from './vim-command-state'
import { createVimEditSessionState } from './vim-edit-session'
import type { VimMode } from './vim-editing'

afterEach(() => document.body.replaceChildren())

const url = 'https://example.test'

function textarea(text: string, cursor = text.length) {
  const input = document.createElement('textarea')
  input.value = text
  document.body.append(input)
  input.setSelectionRange(cursor, cursor)
  return input
}

function richInput(text: string, cursor = text.length) {
  const input = document.createElement('div')
  input.contentEditable = 'true'
  input.textContent = text
  document.body.append(input)
  setCaret(input, cursor)
  return input
}

async function fixture(text = 'hello', links?: LinkRange[]) {
  const node: TreeNode = { id: 'node', text, children: [], ...(links === undefined ? {} : { links }) }
  const harness = await createRealStoreHarness({ document: { roots: [node] } })
  let mode: VimMode = 'insert'
  const deps = {
    store: harness.store,
    composition: new EditorComposition(),
    pendingLinkDraft: { current: undefined as { nodeId: string; range: LinkRange } | undefined },
    schedulePendingCaret: vi.fn(),
    requestProjectionCommit: vi.fn(),
    getMode: () => mode,
    session: createVimEditSessionState(),
    commandState: createVimCommandState(),
    finishVimReplace: vi.fn(() => true),
  } satisfies Parameters<typeof createTextEditHandlers>[0]
  return {
    ...harness,
    deps,
    handlers: () => createTextEditHandlers(deps, harness.node()),
    setMode: (value: VimMode) => {
      mode = value
    },
  }
}

describe('textarea text edits', () => {
  it('retains native Agenda composition until completion and then restores the caret', async () => {
    const f = await fixture('2026-10-14 ')
    const row = document.createElement('div')
    row.className = 'agenda-row'
    const input = richInput('2026-10-14 composed', 18)

    row.append(input)
    document.body.append(row)

    setCaret(input, 18)
    f.deps.composition.start(input, '2026-10-14 ')

    f.handlers().onContentInput({ currentTarget: input, nativeEvent: { isComposing: true } } as never)

    expect(f.node().text).toBe('2026-10-14 composed')
    expect(f.deps.schedulePendingCaret).not.toHaveBeenCalled()

    f.handlers().onCompositionEnd({ currentTarget: input } as never)

    expect(f.deps.schedulePendingCaret).toHaveBeenCalledWith({ nodeId: 'node', input, cursor: 18, refocus: true })
    expect(f.deps.requestProjectionCommit).toHaveBeenCalledOnce()

    f.handlers().onContentInput({ currentTarget: input, nativeEvent: { isComposing: false } } as never)

    expect(f.deps.schedulePendingCaret).toHaveBeenCalledTimes(2)
  })
  it('keeps incomplete URLs as plain text without scheduling a caret', async () => {
    const f = await fixture('http:')

    f.handlers().onTextChange({ currentTarget: textarea('http:/') } as never)

    expect(f.node().text).toBe('http:/')
    expect(f.node().links ?? []).toEqual([])
    expect(f.deps.schedulePendingCaret).not.toHaveBeenCalled()
  })

  it('recognizes a completed URL and schedules refocus before the editor replacement', async () => {
    const f = await fixture('https://example.')
    const input = textarea(url, 5)
    f.deps.schedulePendingCaret.mockImplementation(() => {
      expect(f.node().text).toBe('https://example.')
    })

    f.handlers().onTextChange({ currentTarget: input, nativeEvent: { isComposing: false } } as never)

    expect(f.node()).toMatchObject({ text: url, links: [{ start: 0, end: url.length, url }] })
    expect(f.deps.schedulePendingCaret).toHaveBeenCalledExactlyOnceWith({ nodeId: 'node', cursor: 5, refocus: true })
  })

  it.each(['owned', 'native'] as const)('defers URL recognition during %s composition', async (source) => {
    const f = await fixture('https://example.')
    const input = textarea(url)
    const handlers = f.handlers()
    if (source === 'owned') f.deps.composition.start(input, 'https://example.')

    handlers.onTextChange({ currentTarget: input, nativeEvent: { isComposing: source === 'native' } } as never)

    expect(f.node().text).toBe(url)
    expect(f.node().links ?? []).toEqual([])
    expect(f.deps.schedulePendingCaret).not.toHaveBeenCalled()
  })
})

describe.each(['onContentInput', 'onContentChange'] as const)('%s link reconciliation', (handler) => {
  it('preserves existing links, then retains and consumes a matching draft', async () => {
    const original = `see ${url}`
    const links = [{ start: 4, end: original.length, url }]
    const f = await fixture(original, links)
    const input = richInput(original, 3)

    f.handlers()[handler]({ currentTarget: input } as never)

    expect(f.node()).toMatchObject({ text: original, links })
    expect(f.deps.pendingLinkDraft.current).toBeUndefined()

    input.textContent = 'see https//example.test'

    setCaret(input, 3)
    f.handlers()[handler]({ currentTarget: input } as never)

    expect(f.node().links ?? []).toEqual([])
    expect(f.deps.pendingLinkDraft.current).toEqual({
      nodeId: 'node',
      range: { start: 4, end: input.textContent.length, url: 'https//example.test' },
    })

    input.textContent = original

    setCaret(input, 3)
    f.handlers()[handler]({ currentTarget: input } as never)

    expect(f.node()).toMatchObject({ text: original, links })
    expect(f.deps.pendingLinkDraft.current).toBeUndefined()
    if (handler === 'onContentInput') {
      expect(f.deps.schedulePendingCaret).toHaveBeenLastCalledWith({ nodeId: 'node', input, cursor: 3 })
    } else {
      expect(f.deps.schedulePendingCaret).not.toHaveBeenCalled()
    }
  })

  it.each(['other-node', 'stale-text'] as const)('ignores a draft for %s', async (reason) => {
    const f = await fixture('plain')
    f.deps.pendingLinkDraft.current = {
      nodeId: reason === 'other-node' ? 'other' : 'node',
      range: { start: 0, end: url.length, url },
    }
    const input = richInput('plain!')

    f.handlers()[handler]({ currentTarget: input } as never)

    expect(f.node().text).toBe('plain!')
    expect(f.node().links ?? []).toEqual([])
    expect(f.deps.pendingLinkDraft.current).toBeUndefined()
  })
})

it('treats a missing content-change text value as empty', async () => {
  const f = await fixture()

  f.handlers().onContentChange({ currentTarget: { textContent: null } } as never)

  expect(f.node().text).toBe('')
  expect(f.deps.pendingLinkDraft.current).toBeUndefined()
})

describe('composition transitions', () => {
  it('clears pending commands before finishing Replace and marking composition active', async () => {
    const f = await fixture()
    const input = textarea('hello')
    f.deps.commandState.pending = { count: '', operator: 'd', motionCount: '' }
    f.deps.finishVimReplace.mockImplementation(() => {
      expect(f.deps.commandState.pending).toBeUndefined()
      expect(f.deps.composition.owns(input)).toBe(false)

      return true
    })

    f.handlers().onCompositionStart({ currentTarget: input } as never)

    expect(f.deps.finishVimReplace).toHaveBeenCalledExactlyOnceWith(undefined, false, true)
    expect(f.deps.composition.owns(input)).toBe(true)
  })

  it.each(['textarea', 'rich'] as const)(
    'resumes Replace with the %s native insertion position and text',
    async (kind) => {
      const f = await fixture()
      const handlers = f.handlers()

      f.setMode('replace')
      const input = kind === 'textarea' ? textarea('composed', 4) : richInput('composed', 4)
      f.deps.composition.start(input, 'hello')

      handlers.onCompositionEnd({ currentTarget: input } as never)

      expect(f.deps.session.replace).toEqual({ nodeId: 'node', baseline: 'composed', position: 4, typed: '' })
      expect(f.deps.composition.owns(input)).toBe(false)
    },
  )

  it.each(['insert', 'normal', 'visual'] as const)(
    'ends composition without creating a Replace session in %s mode',
    async (mode) => {
      const f = await fixture()
      const input = textarea('hello')
      f.deps.composition.start(input, 'hello')

      f.setMode(mode)
      f.handlers().onCompositionEnd({ currentTarget: input } as never)

      expect(f.deps.session.replace).toBeUndefined()
      expect(f.deps.composition.owns(input)).toBe(false)
    },
  )
})
