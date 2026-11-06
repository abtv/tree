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
import { installUpdateCommands } from './update-commands'
import type { CommandServices } from '../application/command-registry'
import './styles.css'
import { blockExternalDrops } from './external-drop'
import { installAboutDialog } from './about-dialog'

declare const __TREE_APP_VERSION__: string
declare const __TREE_BUILD_DATE__: string

blockExternalDrops(window)

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element was not found.')
}

const store = new EditorStore(createElectronEditorServices(), () => crypto.randomUUID())
const about = installAboutDialog(`Version ${__TREE_APP_VERSION__} · ${__TREE_BUILD_DATE__}`, (open) => {
  void window.treeApi.setAboutOpen!(open).catch((error: unknown) => store.reportError(error))
})
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
startRendererLifecycle(store, window.treeApi)
startAppUpdates(store, window.treeApi)

const registerViewCommands = (commands: Pick<CommandServices, 'showTree' | 'showAgenda'>) =>
  window.treeApi.onViewMenuCommand!((command) => {
    const run = command === 'tree' ? commands.showTree : commands.showAgenda
    void run().catch((error: unknown) => store.reportError(error))
  })

// An unreadable preference falls back to the first-run default, standard (non-Vim) editing.
void Promise.all([
  window.treeApi.getVimEnabled().catch(() => false),
  window.treeApi.getLineNumbers().catch(() => false),
]).then(([initialVimEnabled, initialLineNumbers]) => {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App
          showAbout={about.show}
          initialVimEnabled={initialVimEnabled}
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
