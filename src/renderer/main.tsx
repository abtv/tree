import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorStore } from '../application/editor-store'
import { createElectronEditorServices } from '../infrastructure/renderer/electron-services'
import { App } from './App'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element was not found.')
}

const store = new EditorStore(createElectronEditorServices(), () => crypto.randomUUID())
void store.initialize()

window.treeApi.onQuitRequested((requestId) => {
  void store
    .flushPersistence()
    .then(() => window.treeApi.quit(requestId))
    .catch((error: unknown) => store.reportError(error))
})
window.treeApi.onQuitFailed((message) => store.reportError(new Error(message)))

createRoot(rootElement).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
)
