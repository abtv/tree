import type { MenuItemConstructorOptions } from 'electron'

export interface ApplicationMenuState {
  vimEnabled: boolean
  alwaysOnTop: boolean
}

export interface ApplicationMenuActions {
  requestQuit: () => void
  setVimEnabled: (vimEnabled: boolean) => void
  setAlwaysOnTop: (alwaysOnTop: boolean) => void
}

// Commands follow the macOS menu conventions (docs/PRODUCT.md §1.3): the window command lives in Window
// and the text-editing command in Edit. The template is rebuilt from the current preferences so the
// check marks always match the status bar.
export function applicationMenuTemplate(
  state: ApplicationMenuState,
  actions: ApplicationMenuActions,
): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Tree',
      submenu: [{ label: 'Quit Tree', accelerator: 'CommandOrControl+Q', click: actions.requestQuit }],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Vim Editing',
          type: 'checkbox',
          checked: state.vimEnabled,
          click: (item) => actions.setVimEnabled(item.checked),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: state.alwaysOnTop,
          click: (item) => actions.setAlwaysOnTop(item.checked),
        },
      ],
    },
  ]
}
