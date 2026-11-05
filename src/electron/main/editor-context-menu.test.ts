import type { BrowserWindow, MenuItemConstructorOptions, WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { EditorContextMenuMenuHost } from './editor-context-menu'
import { showEditorContextMenu } from './editor-context-menu'
import { validateEditorContextMenuRequest } from './ipc-security'

function createHarness() {
  let template: MenuItemConstructorOptions[] = []
  let popupCallback: (() => void) | undefined
  const popup = vi.fn(({ callback }: { callback: () => void }) => {
    popupCallback = callback
  })
  const menuHost: EditorContextMenuMenuHost = {
    buildFromTemplate: (value) => {
      template = value
      return {
        popup,
      }
    },
  }
  const webContents = { showDefinitionForSelection: vi.fn() } as unknown as WebContents
  const window = {} as BrowserWindow
  const click = (label: string) => {
    const item = template.find((entry) => entry.label === label)
    if (item === undefined || typeof item.click !== 'function') throw new Error(`Missing menu item: ${label}`)
    if (item.enabled === false) throw new Error(`Disabled menu item: ${label}`)
    item.click({} as never, window, {} as never)
  }
  return {
    menuHost,
    webContents,
    window,
    popup,
    click,
    dismiss: () => popupCallback?.(),
    getTemplate: () => template,
    choose: (label: string) => {
      click(label)
      popupCallback?.()
    },
  }
}

// @requirement PRODUCT.md §13.2
describe('editor context menu', () => {
  it.each([
    ['Cut', 'cut'],
    ['Paste', 'paste'],
    ['Select All', 'selectAll'],
  ] as const)('returns %s only after the native menu closes', async (label, command) => {
    const harness = createHarness()
    const result = showEditorContextMenu(harness.menuHost, harness.window, harness.webContents, vi.fn(), vi.fn(), {
      x: 17,
      y: 29,
      selectionText: '',
      canCut: true,
      canCopy: false,
      canPaste: true,
      canSelectAll: true,
    })

    expect(harness.popup).toHaveBeenCalledWith({ window: harness.window, x: 17, y: 29, callback: expect.any(Function) })
    expect(harness.getTemplate().map((item) => item.enabled)).toEqual([
      false,
      false,
      undefined,
      true,
      false,
      true,
      true,
    ])
    const settled = vi.fn()
    void result.then(settled)

    harness.click(label)
    await Promise.resolve()

    expect(settled).not.toHaveBeenCalled()
    harness.dismiss()

    await expect(result).resolves.toBe(command)
  })

  it('dismisses without an editing command and invokes the native dictionary for Look Up', async () => {
    const harness = createHarness()
    const result = showEditorContextMenu(harness.menuHost, harness.window, harness.webContents, vi.fn(), vi.fn(), {
      x: 0,
      y: 0,
      selectionText: 'word',
      canCut: true,
      canCopy: true,
      canPaste: true,
      canSelectAll: false,
    })
    expect(harness.getTemplate().map((item) => item.enabled)).toEqual([true, true, undefined, true, true, true, false])
    expect(harness.getTemplate()[2]).toEqual({ type: 'separator' })

    harness.choose('Look Up “word”')

    expect(harness.webContents.showDefinitionForSelection).toHaveBeenCalledOnce()
    await expect(result).resolves.toBeNull()
  })

  it('builds the native editing menu and resolves the selected command', async () => {
    const harness = createHarness()
    const promise = showEditorContextMenu(
      harness.menuHost,
      harness.window,
      harness.webContents,
      vi.fn(async () => undefined),
      vi.fn(),
      { x: 4, y: 8, selectionText: 'Test', canCut: true, canCopy: true, canPaste: false, canSelectAll: true },
    )

    expect(harness.getTemplate().map((item) => item.label)).toEqual([
      'Look Up “Test”',
      'Search with Google',
      undefined,
      'Cut',
      'Copy',
      'Paste',
      'Select All',
    ])
    expect(harness.getTemplate().find((item) => item.label === 'Paste')?.enabled).toBe(false)

    harness.choose('Copy')

    await expect(promise).resolves.toBe('copy')
  })

  it('reports a failed Google search launch', async () => {
    const harness = createHarness()
    const reportError = vi.fn()
    const openExternal = vi.fn(async () => {
      throw new Error('launch failed')
    })
    showEditorContextMenu(harness.menuHost, harness.window, harness.webContents, openExternal, reportError, {
      x: 0,
      y: 0,
      selectionText: 'Test',
      canCut: false,
      canCopy: false,
      canPaste: false,
      canSelectAll: true,
    })

    harness.choose('Search with Google')
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error)))
  })

  it('uses the validated bounded selection in the Look Up label and Google query', async () => {
    const harness = createHarness()
    const openExternal = vi.fn(async () => undefined)
    const selectionText = 'selected '.repeat(40)
    const request = validateEditorContextMenuRequest({
      x: 0,
      y: 0,
      selectionText,
      canCut: false,
      canCopy: false,
      canPaste: false,
      canSelectAll: true,
    })

    showEditorContextMenu(harness.menuHost, harness.window, harness.webContents, openExternal, vi.fn(), request)

    const bounded = request.selectionText

    expect(harness.getTemplate()[0]?.label).toBe(`Look Up “${bounded}”`)
    expect(bounded.endsWith('…')).toBe(true)

    harness.choose('Search with Google')

    expect(openExternal).toHaveBeenCalledWith(`https://www.google.com/search?q=${encodeURIComponent(bounded)}`)
  })
})
