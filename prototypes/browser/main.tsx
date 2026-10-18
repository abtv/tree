import { createRoot } from 'react-dom/client'
import { App } from '../../src/renderer/App'
import { ErrorBoundary } from '../../src/renderer/ErrorBoundary'
import { EditorStore } from '../../src/application/editor-store'
import { installBrowserPrototype } from './services'
import '../../src/renderer/styles.css'
import './prototype.css'

try {
  const bridge = await installBrowserPrototype()
  const store = new EditorStore(bridge.services, () => crypto.randomUUID(), bridge.clock)
  bridge.connect(store)
  await store.initialize()
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App initialVimEnabled={await window.treeApi.getVimEnabled()} store={store} deferRichEditing />
    </ErrorBoundary>,
  )
  const menu = document.getElementById('tree-menu')!
  const run = (action: () => void | Promise<unknown>) => async () => {
    menu.hidePopover()
    try {
      await action()
    } catch (error) {
      store.reportError(error)
    }
  }
  document.getElementById('prototype-tree')!.onclick = run(() => store.closeAgenda())
  document.getElementById('prototype-agenda')!.onclick = run(() => store.openAgenda())
  document.getElementById('prototype-vim')!.onclick = run(async () => {
    await window.treeApi.setVimEnabled(!(await window.treeApi.getVimEnabled()))
  })
  const updateAppearance = (value: string) => {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-appearance]')) {
      button.setAttribute('aria-pressed', String(button.dataset.appearance === value))
    }
  }
  updateAppearance(await window.treeApi.getAppearance())
  window.treeApi.onAppearanceChanged?.(updateAppearance)
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-appearance]')) {
    button.onclick = run(() => window.treeApi.setAppearance(button.dataset.appearance as 'system' | 'light' | 'dark'))
  }
  Object.assign(window, { prototypeStore: store })
} catch (error) {
  const problem = document.getElementById('prototype-problem')!
  problem.textContent = error instanceof Error ? error.message : String(error)
  problem.hidden = false
}
