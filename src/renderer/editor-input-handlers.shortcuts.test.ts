// @vitest-environment jsdom
// @requirement PRODUCT.md §1.5

import type { KeyboardEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import type { VimKeyboardState } from './editor-input-handlers'
import { shortcutProfile, type ShortcutPlatform } from './shortcut-profile'
import { createEditorStoreDouble } from './test/editor-store-double'
import { createVimKeyboardDouble } from './test/vim-keyboard-double'

type Mode = VimKeyboardState['mode'] | 'standard'

const modes: Mode[] = ['standard', 'insert', 'normal', 'visual', 'visual-node', 'replace']
const node: TreeNode = { id: 'node', text: 'hello', children: [] }
const storeCalls = [
  'copy',
  'cut',
  'paste',
  'undo',
  'redo',
  'deleteSelected',
  'enter',
  'leave',
  'openAgenda',
  'toggleStrikethrough',
  'applyFold',
] as const

const quit = vi.fn(async () => {})

beforeEach(() => {
  vi.useFakeTimers()
  quit.mockClear()
  Object.assign(window, { treeApi: { quit } })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

interface Press {
  key: string
  ctrl?: boolean
  meta?: boolean
  alt?: boolean
  shift?: boolean
  altGraph?: boolean
}

function setup(platform: ShortcutPlatform, mode: Mode) {
  const store = createEditorStoreDouble({
    snapshot: { status: 'ready', location: { currentParentId: null, selectedNodeId: 'node' } },
    copy: vi.fn(async () => true),
    cut: vi.fn(async () => true),
    paste: vi.fn(async () => {}),
    deleteSelected: vi.fn(() => true),
  }) as EditorStore
  const input = document.createElement('textarea')
  input.value = node.text
  input.setSelectionRange(1, 3)
  const onPreviewAttachment = vi.fn()
  const double = mode === 'standard' ? undefined : createVimKeyboardDouble(node.id, { mode, onPreviewAttachment })
  const handle = createEditorKeyDownHandler({
    store,
    node: { ...node, attachment: { id: 'attachment', mimeType: 'image/png' } },
    isComposing: () => false,
    setSelectAllNodeId: vi.fn(),
    onPreviewAttachment,
    shiftFocusedNode: vi.fn(),
    vim: double?.vim,
    shortcuts: shortcutProfile(platform),
  })
  const press = (spec: Press): KeyboardEvent<HTMLElement> => {
    const event = {
      currentTarget: input,
      key: spec.key,
      altKey: spec.alt ?? false,
      ctrlKey: spec.ctrl ?? false,
      metaKey: spec.meta ?? false,
      shiftKey: spec.shift ?? false,
      repeat: false,
      nativeEvent: { isComposing: false },
      getModifierState: (name: string) => name === 'AltGraph' && spec.altGraph === true,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLElement>
    handle(event)
    return event
  }
  const outcome = (event: KeyboardEvent<HTMLElement>) => ({
    prevented: vi.mocked(event.preventDefault).mock.calls.length > 0,
    calls: storeCalls.filter((name) => vi.mocked(store[name] as () => unknown).mock.calls.length > 0),
    quit: quit.mock.calls.length,
    previews: onPreviewAttachment.mock.calls.length,
    selection: [input.selectionStart, input.selectionEnd],
  })
  return { store, double, input, press, outcome }
}

const primary = (platform: ShortcutPlatform): Pick<Press, 'ctrl' | 'meta'> =>
  platform === 'apple' ? { meta: true } : { ctrl: true }

const mappedCommands: Press[] = [
  { key: 'a' },
  { key: 'c' },
  { key: 'x' },
  { key: 'v' },
  { key: 'z' },
  { key: 'Z', shift: true },
  { key: 'y' },
  { key: 'e' },
  { key: 'p' },
  { key: '.' },
  { key: ',' },
  { key: 'Enter' },
  { key: 'Backspace' },
  { key: '0' },
  { key: 'q' },
]

describe('primary-modifier parity between the Apple and other profiles', () => {
  it.each(modes.flatMap((mode) => mappedCommands.map((command) => [mode, command] as const)))(
    'runs the same outcome for Cmd and Ctrl in %s with %o',
    (mode, command) => {
      const apple = setup('apple', mode)
      const appleOutcome = apple.outcome(apple.press({ ...command, ...primary('apple') }))
      vi.clearAllMocks()
      Object.assign(window, { treeApi: { quit } })
      const other = setup('other', mode)
      const otherOutcome = other.outcome(other.press({ ...command, ...primary('other') }))

      expect(otherOutcome).toEqual(appleOutcome)
    },
  )

  it('runs each mapped command with Ctrl in every Vim mode', () => {
    for (const mode of modes) {
      const { press, outcome, store } = setup('other', mode)

      expect(outcome(press({ key: 'z', ctrl: true })).calls).toEqual(['undo'])
      expect(vi.mocked(store.undo)).toHaveBeenCalledTimes(1)
    }
  })
})

describe('Ctrl precedence in Vim Normal and non-Insert modes on non-Apple platforms', () => {
  it.each([
    ['d', 'half-down'],
    ['u', 'half-up'],
  ] as const)('keeps Ctrl+%s the Vim viewport motion in Normal', (key, motion) => {
    const { press, double } = setup('other', 'normal')
    const event = press({ key, ctrl: true })

    expect(event.preventDefault).toHaveBeenCalled()
    expect(double!.vim.moveViewport).toHaveBeenCalledWith('node', motion, expect.any(Number))
  })

  it('keeps Ctrl+O leaving the node and Ctrl+R redoing in Normal', () => {
    const leave = setup('other', 'normal')

    leave.press({ key: 'o', ctrl: true })

    expect(leave.store.leave).toHaveBeenCalledTimes(1)

    const redo = setup('other', 'normal')

    redo.press({ key: 'r', ctrl: true })

    expect(redo.store.redo).toHaveBeenCalledTimes(1)
    expect(redo.store.undo).not.toHaveBeenCalled()
  })

  it.each(['visual', 'visual-node', 'replace'] as const)('blocks Ctrl+D/U/O/R in %s', (mode) => {
    for (const key of ['d', 'u', 'o', 'r']) {
      const { press, store } = setup('other', mode)

      expect(press({ key, ctrl: true }).preventDefault).toHaveBeenCalled()
      expect(store.leave).not.toHaveBeenCalled()
      expect(store.redo).not.toHaveBeenCalled()
    }
  })

  it.each(['normal', 'visual'] as const)('pastes with Ctrl+V in %s', (mode) => {
    const { press, store } = setup('other', mode)

    expect(press({ key: 'v', ctrl: true }).preventDefault).toHaveBeenCalled()
    expect(store.paste).toHaveBeenCalledTimes(1)
  })

  it.each(['normal', 'visual', 'visual-node', 'replace'] as const)('blocks an unmapped Ctrl key in %s', (mode) => {
    const { press } = setup('other', mode)

    expect(press({ key: 'n', ctrl: true }).preventDefault).toHaveBeenCalled()
    expect(press({ key: 'f', ctrl: true }).preventDefault).toHaveBeenCalled()
  })

  it.each(['standard', 'insert'] as const)('leaves an unmapped Ctrl key native in %s', (mode) => {
    const { press } = setup('other', mode)

    expect(press({ key: 'n', ctrl: true }).preventDefault).not.toHaveBeenCalled()
    expect(press({ key: 'd', ctrl: true }).preventDefault).not.toHaveBeenCalled()
  })

  it('quits from Replace with Ctrl+Q instead of swallowing it', () => {
    const { press } = setup('other', 'replace')

    expect(press({ key: 'q', ctrl: true }).preventDefault).toHaveBeenCalled()
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('keeps a pending count through a bare Control keydown', () => {
    const { press, double } = setup('other', 'normal')
    double!.commandState.pending = { count: '3', motionCount: '' }

    press({ key: 'Control', ctrl: true })

    expect(double!.commandState.pending).toEqual({ count: '3', motionCount: '' })
  })

  it('discards a pending count through a blocked Ctrl combination', () => {
    const { press, double } = setup('other', 'normal')
    double!.commandState.pending = { count: '3', motionCount: '' }

    press({ key: 'n', ctrl: true })

    expect(double!.commandState.pending).toBeUndefined()
  })
})

describe('inert modifier combinations on non-Apple platforms', () => {
  it.each(modes)('never treats AltGr+key as a shortcut in %s', (mode) => {
    const { press, outcome } = setup('other', mode)

    const result = outcome(press({ key: 'q', ctrl: true, alt: true, altGraph: true }))

    expect(result.calls).toEqual([])
    expect(result.quit).toBe(0)
  })

  it.each(modes)('gives Meta combinations no command in %s', (mode) => {
    const { press, outcome, store } = setup('other', mode)
    for (const key of ['z', 'q', 'p', 'c', 'Backspace', 'Enter', 'ArrowDown']) {
      const result = outcome(press({ key, meta: true }))

      expect(result.calls).toEqual([])
      expect(result.quit).toBe(0)
    }

    expect(vi.mocked(store.createSiblingOrFirstChild)).not.toHaveBeenCalled()
    expect(vi.mocked(store.moveSelection)).not.toHaveBeenCalled()
  })

  it('gives Ctrl+Meta no command', () => {
    const { press, outcome } = setup('other', 'standard')

    expect(outcome(press({ key: 'z', ctrl: true, meta: true })).calls).toEqual([])
  })

  it.each(modes)('gives Ctrl no command on the Apple profile in %s', (mode) => {
    const { press, outcome } = setup('apple', mode)
    for (const key of ['z', 'q', 'p', 'c', 'Backspace']) {
      const result = outcome(press({ key, ctrl: true }))

      expect(result.calls).toEqual([])
      expect(result.quit).toBe(0)
    }
  })
})
