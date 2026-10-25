import { createRoot } from 'react-dom/client'
import { App } from '../renderer/App'
import { ErrorBoundary } from '../renderer/ErrorBoundary'
import { EditorStore } from '../application/editor-store'
import { installBrowserPrototype } from './services'
import { capturePasteClipboard } from './paste'
import { isApplePlatform } from './device'
import { installDataMenu } from './data-menu'
import { browserMenuCommands } from './menu-commands'
import { installMenuFocus } from './menu-focus'
import type { CommandServices } from '../application/command-registry'
import { requestPersistentStorage, storageProtectionText } from './storage-persistence'
import { createAttachmentImageCache, decodeAttachmentImage } from '../infrastructure/renderer/attachment-image-cache'
import '../renderer/styles.css'
import './styles.css'
import { blockExternalDrops } from '../renderer/external-drop'

blockExternalDrops(window)

// Mobile browsers discard a tab under memory pressure well before a desktop Electron renderer would.
const WEB_ATTACHMENT_IMAGE_CACHE_LIMIT = 128 * 1024 * 1024

try {
  const bridge = await installBrowserPrototype()
  const store = new EditorStore(bridge.services, () => crypto.randomUUID(), undefined, {
    idleMilliseconds: 300,
    cleanupRetryMilliseconds: 300,
  })
  bridge.connect(store)
  await store.initialize()
  const menu = document.getElementById('tree-menu')!
  const menuFocus = installMenuFocus(menu, document.getElementById('tree-menu-button')!)
  installDataMenu(store, menu, bridge.data, menuFocus)
  const menuCommands = browserMenuCommands(menu)
  const treeButton = document.getElementById('prototype-tree') as HTMLButtonElement
  const agendaButton = document.getElementById('prototype-agenda') as HTMLButtonElement
  let viewCommands: Pick<CommandServices, 'showAgenda' | 'showTree'> | undefined
  treeButton.disabled = agendaButton.disabled = true
  const registerViewCommands = (commands: NonNullable<typeof viewCommands>) => {
    viewCommands = commands
    treeButton.disabled = agendaButton.disabled = false
    return () => {
      viewCommands = undefined
      treeButton.disabled = agendaButton.disabled = true
    }
  }
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App
        registerViewCommands={registerViewCommands}
        menuCommands={menuCommands}
        initialVimEnabled={await window.treeApi.getVimEnabled()}
        vimAvailable={bridge.vimAvailable}
        alwaysOnTopAvailable={false}
        shortcutPlatform={isApplePlatform(navigator) ? 'apple' : 'other'}
        store={store}
        deferRichEditing
        capturePasteClipboard={capturePasteClipboard}
        attachmentImages={createAttachmentImageCache(
          (id) => window.treeApi.readAttachment(id),
          decodeAttachmentImage,
          WEB_ATTACHMENT_IMAGE_CACHE_LIMIT,
        )}
      />
    </ErrorBoundary>,
  )
  const run = (action: () => void | Promise<unknown>) => async () => {
    menuFocus.close()
    try {
      await action()
    } catch (error) {
      store.reportError(error)
    }
  }
  treeButton.onclick = run(() => viewCommands?.showTree())
  agendaButton.onclick = run(() => viewCommands?.showAgenda())
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
  void requestPersistentStorage(navigator.storage).then((protection) => {
    const status = document.getElementById('storage-status')!
    const text = storageProtectionText(protection)
    status.textContent = text ?? ''
    status.hidden = text === undefined
  })
} catch (error) {
  const problem = document.getElementById('prototype-problem')!
  problem.textContent = error instanceof Error ? error.message : String(error)
  problem.hidden = false
}
