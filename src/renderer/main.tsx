import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorStore } from '../application/editor-store'
import { DesktopDataOperations } from '../application/notes-archive/desktop-data-operations'
import {
  createElectronEditorServices,
  suspendNotesWrites,
  resumeNotesWrites,
} from '../infrastructure/renderer/electron-services'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { startRendererLifecycle } from './lifecycle'
import { startAppUpdates } from './app-updates'
import { createRendererInputLock } from './renderer-input-lock'
import { BooleanPreference } from './editing-preferences'
import { installUpdateCommands } from './update-commands'
import type { CommandServices } from '../application/command-registry'
import { appearanceColorScheme, type AppearancePreference } from '../shared/appearance'
import './styles.css'
import { blockExternalDrops } from './external-drop'
import { installAboutDialog } from './about-dialog'
import { installWindowFocusReturn } from './window-focus-return'

declare const __TREE_APP_VERSION__: string
declare const __TREE_BUILD_DATE__: string

blockExternalDrops(window)
const stopWindowFocusReturn = installWindowFocusReturn(window)
window.addEventListener('pagehide', () => stopWindowFocusReturn(), { once: true })

const applyAppearance = (value: AppearancePreference): void => {
  document.documentElement.dataset.appearance = value
  document.documentElement.style.colorScheme = appearanceColorScheme(value)
}
let appearanceChanged = false
const stopAppearanceChanges = window.treeApi.onAppearanceChanged?.((value) => {
  appearanceChanged = true
  applyAppearance(value)
})
window.addEventListener('pagehide', () => stopAppearanceChanges?.(), { once: true })

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element was not found.')
}

const store = new EditorStore(createElectronEditorServices(), () => crypto.randomUUID())
const preferences = { vim: new BooleanPreference(false), alwaysOnTop: new BooleanPreference(false) }
const vim = preferences.vim.observe(window.treeApi.getVimEnabled, window.treeApi.onVimEnabledChanged)
const pin = preferences.alwaysOnTop.observe(
  window.treeApi.getAlwaysOnTop,
  window.treeApi.onAlwaysOnTopChanged,
  (error) => store.reportError(error),
)
window.addEventListener(
  'pagehide',
  () => {
    vim.dispose()
    pin.dispose()
  },
  { once: true },
)
let confirmingQuit = false
const syncModal = (): void => {
  const open =
    confirmingQuit || document.querySelector('#app-about-dialog[open], dialog[open][role="alertdialog"]') !== null
  void window.treeApi.setRendererModalOpen!(open).catch((error: unknown) => store.reportError(error))
}
const about = installAboutDialog(`Version ${__TREE_APP_VERSION__} · ${__TREE_BUILD_DATE__}`, syncModal)
const stopAboutRequests = window.treeApi.onAboutRequested!(() => about.show())
window.addEventListener(
  'pagehide',
  () => {
    stopAboutRequests()
    about.dispose()
  },
  { once: true },
)
const dataOperations = new DesktopDataOperations(
  {
    chooseNotesExportDestination: () => window.treeApi.chooseNotesExportDestination!(),
    startNotesExport: () => window.treeApi.startNotesExport!(),
    cancelNotesOperation: () => window.treeApi.cancelNotesOperation!(),
    setNotesMenuState: (state) => window.treeApi.setNotesMenuState!(state),
    onNotesProgress: (listener) => window.treeApi.onNotesProgress!(listener),
    onNotesMenuCommand: (listener) => window.treeApi.onNotesMenuCommand!(listener),
    chooseNotesImportArchive: () => window.treeApi.chooseNotesImportArchive!(),
    prepareNotesImport: () => window.treeApi.prepareNotesImport!(),
    commitNotesImport: () => window.treeApi.commitNotesImport!(),
    takeNotesImportNotice: () => window.treeApi.takeNotesImportNotice!(),
    showReplacedNotesFolder: () => window.treeApi.showReplacedNotesFolder!(),
    suspendWrites: suspendNotesWrites,
    resumeWrites: resumeNotesWrites,
    reload: () => window.location.reload(),
  },
  store,
)
dataOperations.start()
const menuCommands = installUpdateCommands(window.treeApi, dataOperations.menuCommands, (error) =>
  store.reportError(error),
)
window.addEventListener('pagehide', () => menuCommands.dispose(), { once: true })
window.addEventListener('pagehide', () => dataOperations.dispose(), { once: true })
const lockInput = createRendererInputLock(rootElement)
startRendererLifecycle(store, window.treeApi, () => {
  const release = lockInput()
  confirmingQuit = true
  syncModal()
  return () => {
    confirmingQuit = false
    release()
    syncModal()
  }
})
startAppUpdates(store, window.treeApi, lockInput)

const registerViewCommands = (commands: Pick<CommandServices, 'showTree' | 'showAgenda'>) =>
  window.treeApi.onViewMenuCommand!((command) => {
    const run = command === 'tree' ? commands.showTree : commands.showAgenda
    void run().catch((error: unknown) => store.reportError(error))
  })

// An unreadable preference falls back to the first-run default, standard (non-Vim) editing.
void Promise.all([
  vim.ready,
  window.treeApi.getLineNumbers().catch(() => false),
  window.treeApi.getAppearance().catch((): AppearancePreference => 'system'),
]).then(([, initialLineNumbers, initialAppearance]) => {
  if (!appearanceChanged) applyAppearance(initialAppearance)

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App
          showAbout={about.show}
          onQuitDialogChange={syncModal}
          startupPreferences={preferences}
          initialLineNumbers={initialLineNumbers}
          store={store}
          dataOperations={dataOperations}
          menuCommands={menuCommands}
          registerViewCommands={registerViewCommands}
        />
      </ErrorBoundary>
    </StrictMode>,
  )
})
