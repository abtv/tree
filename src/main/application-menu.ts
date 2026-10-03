import type { MenuItemConstructorOptions } from 'electron'
import type { AppearancePreference } from '../infrastructure/main/window-state'

export interface ApplicationMenuState {
  vimEnabled: boolean
  alwaysOnTop: boolean
  appearance: AppearancePreference
}

export interface ApplicationMenuActions {
  requestQuit: () => void
  setVimEnabled: (vimEnabled: boolean) => void
  setAlwaysOnTop: (alwaysOnTop: boolean) => void
  setAppearance: (appearance: AppearancePreference) => void
}

const appearanceItems: ReadonlyArray<{ label: string; value: AppearancePreference }> = [
  { label: 'Automatic', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

// Commands follow the macOS menu conventions (docs/PRODUCT.md §1.3): the window command lives in Window,
// the text-editing command in Edit, and the display command in View. The template is rebuilt from the
// current preferences so the check marks always match the status bar.
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
      label: 'View',
      submenu: [
        {
          label: 'Appearance',
          submenu: appearanceItems.map(({ label, value }) => ({
            label,
            type: 'radio' as const,
            checked: state.appearance === value,
            click: () => actions.setAppearance(value),
          })),
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
