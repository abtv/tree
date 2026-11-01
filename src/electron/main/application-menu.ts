import type { MenuItemConstructorOptions } from 'electron'
import type { AppearancePreference } from '../../infrastructure/main/window-state'
import type { FindMenuCommand, NotesMenuCommand, NotesMenuState, ViewMenuCommand } from '../../shared/ipc'
import type { MenuIcons } from './menu-icons'

export interface ApplicationMenuState {
  modalOpen: boolean
  vimEnabled: boolean
  alwaysOnTop: boolean
  appearance: AppearancePreference
  notes: NotesMenuState
}

export interface ApplicationMenuActions {
  showAbout: () => void
  requestQuit: () => void
  setVimEnabled: (vimEnabled: boolean) => void
  setAlwaysOnTop: (alwaysOnTop: boolean) => void
  setAppearance: (appearance: AppearancePreference) => void
  notesCommand: (command: NotesMenuCommand) => void
  viewCommand: (command: ViewMenuCommand) => void
  findCommand: (command: FindMenuCommand) => void
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
  icons: MenuIcons,
): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Tree',
      submenu: [
        { label: 'About Tree', click: actions.showAbout },
        { type: 'separator' },
        { label: 'Quit Tree', accelerator: 'CommandOrControl+Q', click: actions.requestQuit },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Export Notes…',
          icon: icons.export,
          enabled: state.notes.canExport && !state.modalOpen,
          click: () => actions.notesCommand('export'),
        },
        {
          label: 'Import Notes…',
          icon: icons.import,
          enabled: state.notes.canImport && !state.modalOpen,
          click: () => actions.notesCommand('import'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Find…',
          enabled: !state.modalOpen,
          accelerator: 'CommandOrControl+F',
          registerAccelerator: false,
          click: () => actions.findCommand('find'),
        },
        {
          label: 'Find Next',
          enabled: !state.modalOpen,
          accelerator: 'CommandOrControl+G',
          registerAccelerator: false,
          click: () => actions.findCommand('next'),
        },
        {
          label: 'Find Previous',
          enabled: !state.modalOpen,
          accelerator: 'CommandOrControl+Shift+G',
          registerAccelerator: false,
          click: () => actions.findCommand('previous'),
        },
        {
          label: 'Search All Nodes…',
          enabled: !state.modalOpen,
          accelerator: 'CommandOrControl+;',
          registerAccelerator: false,
          click: () => actions.findCommand('all'),
        },
        { type: 'separator' },
        {
          label: 'Vim Editing',
          enabled: !state.modalOpen,
          type: 'checkbox',
          checked: state.vimEnabled,
          click: (item) => actions.setVimEnabled(item.checked),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Tree', enabled: !state.modalOpen, icon: icons.tree, click: () => actions.viewCommand('tree') },
        { label: 'Agenda', enabled: !state.modalOpen, icon: icons.agenda, click: () => actions.viewCommand('agenda') },
        { type: 'separator' },
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
          enabled: !state.modalOpen,
          type: 'checkbox',
          checked: state.alwaysOnTop,
          click: (item) => actions.setAlwaysOnTop(item.checked),
        },
      ],
    },
  ]
}
