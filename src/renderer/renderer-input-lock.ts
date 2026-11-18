/** Desktop quit and update can overlap. Restore the editor only after the last lock releases. */
export function createRendererInputLock(root: HTMLElement): () => () => void {
  const events = ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'pointerdown', 'click']
  let holders = 0
  let previous: HTMLElement | null
  const block = (event: Event): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  return () => {
    if (holders++ === 0) {
      previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
      root.inert = true
      for (const event of events) window.addEventListener(event, block, true)
    }
    let released = false
    return () => {
      if (released) return
      released = true
      if (--holders !== 0) return
      root.inert = false
      for (const event of events) window.removeEventListener(event, block, true)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
      previous = null
    }
  }
}
