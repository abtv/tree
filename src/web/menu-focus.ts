import { getSelectionEndpoints, setSelectionRange } from '../renderer/editor-dom'

/** The browser menu borrows editing focus; explicit destinations and dialogs retain ownership. */
export interface MenuFocus {
  close(): void
  restore(): void
  dispose(): void
}

export function installMenuFocus(menu: HTMLElement, trigger: HTMLElement): MenuFocus {
  let previous: { element: HTMLElement; anchor?: number; focus?: number } | undefined
  let open = false
  let outside = false
  let disposed = false
  const remember = (element: EventTarget | null) => {
    if (!(element instanceof HTMLElement) || !element.matches('.node-input, .agenda-row')) return
    previous = element.matches('.node-input') ? { element, ...getSelectionEndpoints(element) } : { element }
  }
  const restore = () => {
    if (disposed || previous === undefined || !previous.element.isConnected) return
    const { element, anchor, focus } = previous
    element.focus({ preventScroll: true })
    if (anchor !== undefined && focus !== undefined) setSelectionRange(element, anchor, focus)
  }
  const close = () => {
    if (!open) return // Command-panel actions also invoke the hidden menu's handlers.
    menu.hidePopover()
    restore()
  }
  const focusout = (event: FocusEvent) => remember(event.target)
  const pointerdown = (event: PointerEvent) => {
    if (event.target instanceof Node && trigger.contains(event.target)) remember(document.activeElement)
    outside = open && event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)
    if (outside) {
      // Restore before the new press so the editor's ordinary blur commits any buffered edit
      // when the browser focuses the clicked destination. The press still places its own caret.
      menu.hidePopover()
      restore()
    }
  }
  const beforetoggle = (event: Event) => {
    if ((event as ToggleEvent).newState === 'open') {
      remember(document.activeElement)
      open = true
      outside = false
      return
    }
    open = false
    if (outside) return
    // Native dismissal can restore the trigger after beforetoggle. Do not override a dialog,
    // a view-changing action or a control the user explicitly focused while closing the menu.
    queueMicrotask(() => {
      const active = document.activeElement
      if (!open && (active === trigger || active === document.body || menu.contains(active))) restore()
    })
  }
  const keydown = (event: KeyboardEvent) => {
    if (!open || event.key !== 'Escape' || event.isComposing) return
    if (!(event.target instanceof Node) || (!menu.contains(event.target) && event.target !== trigger)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    close()
  }
  const focusin = (event: FocusEvent) => {
    if (!open || !(event.target instanceof Node) || menu.contains(event.target) || trigger.contains(event.target))
      return
    outside = true
    const destination = event.target
    menu.hidePopover()
    if (destination !== previous?.element && destination instanceof HTMLElement) {
      // Tab/programmatic departure also needs the ordinary editor blur before focus moves on.
      restore()
      destination.focus({ preventScroll: true })
    }
  }
  document.addEventListener('focusout', focusout, true)
  document.addEventListener('focusin', focusin, true)
  document.addEventListener('pointerdown', pointerdown, true)
  document.addEventListener('keydown', keydown, true)
  menu.addEventListener('beforetoggle', beforetoggle)
  const dispose = () => {
    disposed = true
    previous = undefined
    document.removeEventListener('focusout', focusout, true)
    document.removeEventListener('focusin', focusin, true)
    document.removeEventListener('pointerdown', pointerdown, true)
    document.removeEventListener('keydown', keydown, true)
    menu.removeEventListener('beforetoggle', beforetoggle)
    window.removeEventListener('pagehide', dispose)
  }
  window.addEventListener('pagehide', dispose, { once: true })
  return { close, restore, dispose }
}
