import iconUrl from '../../assets/icons/tree-icon-source.png?url'
import { captureFocusRestoration } from './editor-dom'
import './about.css'

/** One eagerly mounted dialog, shared by both platform entry points. */
export function installAboutDialog(version: string, changed: (open: boolean) => void = () => undefined) {
  const dialog = document.createElement('dialog')
  dialog.id = 'app-about-dialog'
  dialog.className = 'about-window'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-labelledby', 'about-title')
  dialog.setAttribute('data-editor-focus-borrow', '')
  dialog.innerHTML = `<main>
    <img id="about-icon" width="64" height="64" alt="">
    <h1 id="about-title">Tree</h1>
    <span id="app-version"></span>
    <p>© 2026 Andrei Butov</p>
    <p>Licensed under the <a href="https://github.com/abtv/tree/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a></p>
    <p><a id="app-repository" href="https://github.com/abtv/tree" target="_blank" rel="noopener noreferrer">GitHub repository</a></p>
    <button id="about-close" type="button" autofocus>Close</button>
  </main>`
  dialog.querySelector<HTMLImageElement>('#about-icon')!.src = iconUrl
  dialog.querySelector('#app-version')!.textContent = version
  document.body.append(dialog)
  const button = dialog.querySelector<HTMLButtonElement>('#about-close')!
  let restore: () => void = () => undefined
  let open = false

  const finish = () => {
    if (!open) return
    open = false
    changed(false)
    restore()
    restore = () => undefined
  }
  const close = () => {
    dialog.close()
    finish()
  }
  button.addEventListener('click', close)
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })
  dialog.addEventListener('close', () => {
    if (!dialog.open) finish()
  })
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return
    const bounds = dialog.getBoundingClientRect()
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  })

  return {
    show() {
      if (open) {
        button.focus()
        return
      }
      restore = captureFocusRestoration(document.activeElement, 'native-with-input')
      dialog.showModal()
      open = true
      changed(true)
    },
    close,
    dispose() {
      close()
      dialog.remove()
    },
  }
}
