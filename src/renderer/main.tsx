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
import type { CommandServices } from '../application/command-registry'
import './styles.css'
import { blockExternalDrops } from './external-drop'

blockExternalDrops(window)

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element was not found.')
}

const store = new EditorStore(createElectronEditorServices(), () => crypto.randomUUID())
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
window.addEventListener('pagehide', () => dataOperations.dispose(), { once: true })
startRendererLifecycle(store, window.treeApi)

const registerViewCommands = (commands: Pick<CommandServices, 'showTree' | 'showAgenda'>) =>
  window.treeApi.onViewMenuCommand!((command) => {
    const run = command === 'tree' ? commands.showTree : commands.showAgenda
    void run().catch((error: unknown) => store.reportError(error))
  })

// An unreadable preference falls back to the first-run default, standard (non-Vim) editing.
void window.treeApi
  .getVimEnabled()
  .catch(() => false)
  .then((initialVimEnabled) => {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <App
            initialVimEnabled={initialVimEnabled}
            store={store}
            dataOperations={dataOperations}
            registerViewCommands={registerViewCommands}
          />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
