import './styles.css'
import './about.css'
import iconUrl from '../../assets/icons/tree-icon-source.png?url'

declare const __TREE_APP_VERSION__: string
declare const __TREE_BUILD_DATE__: string

document.querySelector<HTMLImageElement>('#about-icon')!.src = iconUrl
document.getElementById('about-version')!.textContent = `Version ${__TREE_APP_VERSION__} · ${__TREE_BUILD_DATE__}`
document.getElementById('about-close')!.addEventListener('click', () => window.close())

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    window.close()
  }
})
