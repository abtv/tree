import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorStore } from '../application/editor-store'
import { createElectronEditorServices } from '../infrastructure/renderer/electron-services'
import { App } from './App'
import { startRendererLifecycle } from './lifecycle'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element was not found.')
}

const store = new EditorStore(createElectronEditorServices(), () => crypto.randomUUID())
startRendererLifecycle(store, window.treeApi)

createRoot(rootElement).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
)
