import type { BrowserWindow, MenuItemConstructorOptions, WebContents } from 'electron'
import type { EditorContextMenuCommand, EditorContextMenuRequest } from '../shared/ipc'

export interface EditorContextMenuMenu {
  popup(options: { window: BrowserWindow; x: number; y: number; callback: () => void }): void
}

export interface EditorContextMenuMenuHost {
  buildFromTemplate(template: MenuItemConstructorOptions[]): EditorContextMenuMenu
}

export function showEditorContextMenu(
  menuHost: EditorContextMenuMenuHost,
  window: BrowserWindow,
  webContents: WebContents,
  openExternal: (url: string) => Promise<void>,
  reportError: (error: unknown) => void,
  request: EditorContextMenuRequest,
): Promise<EditorContextMenuCommand> {
  return new Promise((resolve) => {
    let command: EditorContextMenuCommand = null
    const choose = (value: EditorContextMenuCommand): void => {
      command = value
    }
    const template: MenuItemConstructorOptions[] = [
      {
        label: 'Look Up “' + request.selectionText + '”',
        enabled: request.selectionText.length > 0,
        click: () => webContents.showDefinitionForSelection(),
      },
      {
        label: 'Search with Google',
        enabled: request.selectionText.length > 0,
        click: () => {
          void openExternal(`https://www.google.com/search?q=${encodeURIComponent(request.selectionText)}`).catch(
            reportError,
          )
        },
      },
      { type: 'separator' },
      { label: 'Cut', enabled: request.canCut, click: () => choose('cut') },
      { label: 'Copy', enabled: request.canCopy, click: () => choose('copy') },
      { label: 'Paste', enabled: request.canPaste, click: () => choose('paste') },
      { label: 'Select All', enabled: request.canSelectAll, click: () => choose('selectAll') },
    ]
    const menu = menuHost.buildFromTemplate(template)
    menu.popup({ window, x: request.x, y: request.y, callback: () => resolve(command) })
  })
}
