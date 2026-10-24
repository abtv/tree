// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorStore } from '../application/editor-store'
import { createVimCommandState } from './vim-command-state'
import type { VimMode } from './vim-editing'
import { useCommandPanel } from './use-command-panel'
import { APPLE_SHORTCUTS, OTHER_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'
import { MenuCommands, type MenuCommandSource } from '../application/menu-commands'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup(
  mode: VimMode = 'normal',
  enabled = true,
  rich = false,
  shortcuts: ShortcutProfile = APPLE_SHORTCUTS,
  menuCommands?: MenuCommandSource,
) {
  const historyWrite = vi.fn(async () => undefined)
  const appearanceWrite = vi.fn<(value: 'system' | 'light' | 'dark') => Promise<void>>(async () => undefined)
  window.treeApi = {
    getAppearance: async () => 'system',
    setAppearance: appearanceWrite,
    getCommandHistory: async () => [],
    setCommandHistory: historyWrite,
    getAlwaysOnTop: async () => false,
    setAlwaysOnTop: async () => undefined,
    getVimEnabled: async () => true,
    setVimEnabled: async () => undefined,
    quit: async () => undefined,
    quitWithoutSaving: async () => undefined,
    onQuitRequested: () => () => undefined,
    onQuitFailed: () => () => undefined,
    load: async () => null,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    readAttachment: async () => null,
    cleanupAttachments: async () => undefined,
  }
  const save = vi.fn(async () => undefined)
  const store = new EditorStore(
    {
      load: async () => null,
      save,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'root',
  )
  await store.initialize()
  save.mockClear()
  const commandState = createVimCommandState()
  function Harness() {
    const panel = useCommandPanel({
      store,
      vimEnabled: enabled,
      vimMode: mode,
      commandState,
      alwaysOnTop: false,
      setAlwaysOnTop: () => undefined,
      applyVimEnabled: async () => undefined,
      beforeViewChange: () => undefined,
      shortcuts,
      menuCommands,
    })
    return (
      <>
        {rich ? (
          <div contentEditable suppressContentEditableWarning aria-label="Editor" tabIndex={0}>
            alpha
          </div>
        ) : (
          <textarea aria-label="Editor" defaultValue="alpha" />
        )}
        {panel.message === undefined ? null : <span role="status">{panel.message}</span>}
        {panel.open ? <output aria-label="Selected row">{panel.selected}</output> : null}
        {panel.open ? (
          <output aria-label="Commands">{panel.matches.map((command) => command.name).join(',')}</output>
        ) : null}
        {panel.open ? (
          <input
            className="command-input-line"
            aria-label="Command"
            ref={panel.bindInput}
            value={panel.input}
            onChange={(event) => panel.changeInput(event.target.value)}
          />
        ) : null}
      </>
    )
  }
  await act(async () => {
    render(<Harness />)
  })
  const editor = screen.getByLabelText('Editor')
  editor.focus()
  return { editor, store, commandState, historyWrite, appearanceWrite, save }
}

describe('command panel owner', () => {
  // @requirement PRODUCT.md §20.2.28
  it('updates menu availability live, blocks disabled commands and launches supported actions with restored focus', async () => {
    const source = new MenuCommands()
    const launch = vi.fn(() => {
      expect(document.activeElement).toBe(editor)
    })
    source.update([{ name: 'export-notes', enabled: false, run: launch }])
    const { editor, historyWrite } = await setup('normal', true, false, APPLE_SHORTCUTS, source)
    fireEvent.keyDown(editor, { key: ':' })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'export-notes' } })
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Enter' })
    expect(launch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Command')).toBe(document.activeElement)
    expect(historyWrite).not.toHaveBeenCalled()
    act(() => source.update([{ name: 'export-notes', enabled: true, run: launch }]))
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Enter' })
    await waitFor(() => expect(historyWrite).toHaveBeenCalledExactlyOnceWith(['export-notes']))
    expect(launch).toHaveBeenCalledOnce()
    fireEvent.keyDown(editor, { key: ':' })
    act(() => source.update([{ name: 'resume-backing-up', enabled: true, run: launch }]))
    expect(screen.getByLabelText('Commands').textContent).toContain('resume-backing-up')
    expect(screen.getByLabelText('Commands').textContent).not.toContain('export-notes')
  })
  // @requirement PRODUCT.md §20.2.28
  it('restores backward rich selection endpoints on cancellation', async () => {
    const { editor } = await setup('visual', true, true)
    const text = editor.firstChild!
    const selection = window.getSelection()!
    selection.setBaseAndExtent(text, 4, text, 1)
    fireEvent.keyDown(editor, { key: 'P', metaKey: true, shiftKey: true })
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Escape' })
    expect(selection.anchorNode).toBe(text)
    expect(selection.anchorOffset).toBe(4)
    expect(selection.focusOffset).toBe(1)
  })
  // @requirement PRODUCT.md §20.2.28
  it('expires unknown-command feedback after two seconds and cancels old deadlines on key dismissal', async () => {
    const { editor } = await setup()
    vi.useFakeTimers()
    const unknown = (query: string): void => {
      fireEvent.keyDown(editor, { key: ':' })
      fireEvent.change(screen.getByLabelText('Command'), { target: { value: query } })
      fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Enter' })
    }
    // Read the hook's message through its status presentation in the harness.
    unknown('unknown')
    expect(screen.getByRole('status').textContent).toBe('Not a command: unknown')
    act(() => vi.advanceTimersByTime(1999))
    expect(screen.getByRole('status').textContent).toBe('Not a command: unknown')
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).toBeNull()
    unknown('first')
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.keyDown(editor, { key: 'h' })
    expect(screen.queryByRole('status')).toBeNull()
    unknown('second')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('status').textContent).toBe('Not a command: second')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('status')).toBeNull()
    expect(document.activeElement).toBe(editor)
  })
  // @requirement PRODUCT.md §20.2.28
  it.each<[VimMode, boolean]>([
    ['insert', true],
    ['replace', true],
    ['visual', true],
    ['visual-node', true],
    ['normal', false],
  ])('does not open in %s (Vim enabled %s)', async (mode, enabled) => {
    const { editor } = await setup(mode, enabled)
    fireEvent.keyDown(editor, { key: ':' })
    expect(screen.queryByLabelText('Command')).toBeNull()
  })

  // @requirement PRODUCT.md §20.2.28
  it.each<[VimMode, boolean]>([
    ['normal', true],
    ['insert', true],
    ['replace', true],
    ['visual', true],
    ['visual-node', true],
    ['insert', false],
  ])('opens with Cmd+Shift+P in %s (Vim enabled %s) and restores selection', async (mode, enabled) => {
    const { editor } = await setup(mode, enabled)
    ;(editor as HTMLTextAreaElement).setSelectionRange(1, 4, 'backward')
    fireEvent.keyDown(editor, { key: 'P', metaKey: true, shiftKey: true })
    expect(screen.getByLabelText('Command')).toBe(document.activeElement)
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Escape' })
    expect(document.activeElement).toBe(editor)
    expect((editor as HTMLTextAreaElement).selectionStart).toBe(1)
    expect((editor as HTMLTextAreaElement).selectionEnd).toBe(4)
    expect((editor as HTMLTextAreaElement).selectionDirection).toBe('backward')
  })

  it('drops pending assembly, restores selection on cancellation and does no per-key preference or document writes', async () => {
    const { editor, commandState, historyWrite, save } = await setup()
    ;(editor as HTMLTextAreaElement).setSelectionRange(2, 3)
    commandState.pending = { count: '3', operator: 'd', motionCount: '2' }
    fireEvent.keyDown(editor, { key: ':' })
    expect(commandState.pending).toBeUndefined()
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'theme' } })
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Escape' })
    expect(document.activeElement).toBe(editor)
    expect((editor as HTMLTextAreaElement).selectionStart).toBe(2)
    expect((editor as HTMLTextAreaElement).selectionEnd).toBe(3)
    expect(historyWrite).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('writes history once on success and excludes a rejected command', async () => {
    const { editor, historyWrite, appearanceWrite } = await setup()
    fireEvent.keyDown(editor, { key: ':' })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'dark' } })
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Enter' })
    await waitFor(() => expect(historyWrite).toHaveBeenCalledExactlyOnceWith(['set-theme-dark']))
    appearanceWrite.mockRejectedValueOnce(new Error('appearance write failed'))
    fireEvent.keyDown(editor, { key: ':' })
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'light' } })
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Enter' })
    await waitFor(() => expect(appearanceWrite).toHaveBeenCalledTimes(2))
    expect(historyWrite).toHaveBeenCalledTimes(1)
  })

  it('does not suppress a later click after a canceled outside pointer gesture', async () => {
    const { editor } = await setup()
    fireEvent.keyDown(editor, { key: ':' })
    fireEvent(editor, new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }))
    expect(screen.queryByLabelText('Command')).toBeNull()
    fireEvent(document, new Event('pointercancel', { bubbles: true }))
    const clicked = vi.fn()
    editor.addEventListener('click', clicked)
    fireEvent.click(editor)
    expect(clicked).toHaveBeenCalledOnce()
  })
})

describe('command panel shortcuts per platform profile', () => {
  // @requirement PRODUCT.md §1.5
  it.each([
    ['Cmd+Shift+P on other', OTHER_SHORTCUTS, { metaKey: true }, false],
    ['Ctrl+Shift+P on other', OTHER_SHORTCUTS, { ctrlKey: true }, true],
    ['Ctrl+Meta+Shift+P on other', OTHER_SHORTCUTS, { ctrlKey: true, metaKey: true }, false],
    ['Ctrl+Alt+Shift+P on other', OTHER_SHORTCUTS, { ctrlKey: true, altKey: true }, false],
    ['Cmd+Shift+P on Apple', APPLE_SHORTCUTS, { metaKey: true }, true],
    ['Ctrl+Shift+P on Apple', APPLE_SHORTCUTS, { ctrlKey: true }, false],
    ['Cmd+Ctrl+Shift+P on Apple', APPLE_SHORTCUTS, { metaKey: true, ctrlKey: true }, false],
  ])('%s opens the panel: %s', async (_name, profile, modifiers, opens) => {
    const { editor } = await setup('normal', true, false, profile)
    fireEvent.keyDown(editor, { key: 'P', shiftKey: true, ...modifiers })
    expect(screen.queryByLabelText('Command') !== null).toBe(opens)
  })

  // @requirement PRODUCT.md §1.5
  it.each([OTHER_SHORTCUTS, APPLE_SHORTCUTS])(
    'moves the open panel selection with Ctrl+N and Ctrl+P',
    async (profile) => {
      const { editor } = await setup('normal', true, false, profile)
      fireEvent.keyDown(editor, { key: ':' })
      const command = screen.getByLabelText('Command')
      expect(screen.getByLabelText('Selected row').textContent).toBe('0')
      fireEvent.keyDown(command, { key: 'n', ctrlKey: true })
      expect(screen.getByLabelText('Selected row').textContent).toBe('1')
      fireEvent.keyDown(command, { key: 'n', ctrlKey: true })
      expect(screen.getByLabelText('Selected row').textContent).toBe('2')
      fireEvent.keyDown(command, { key: 'p', ctrlKey: true })
      expect(screen.getByLabelText('Selected row').textContent).toBe('1')
    },
  )

  // @requirement PRODUCT.md §1.5
  it('keeps Ctrl+P navigation ahead of the Agenda command while the panel is open', async () => {
    const { editor, store } = await setup('normal', true, false, OTHER_SHORTCUTS)
    const open = vi.spyOn(store, 'openAgenda')
    fireEvent.keyDown(editor, { key: ':' })
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'p', ctrlKey: true })
    expect(open).not.toHaveBeenCalled()
  })
})
