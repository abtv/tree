import { captureFocusRestoration } from './editor-dom'

/**
 * Keep keyboard focus where it was when the window was left.
 *
 * Chromium on macOS normally restores the focused element when the window becomes key again. After
 * some deactivations, such as hiding the application or `BrowserWindow.blur()`, it loses the stored
 * native focus and applies initial focus instead: the first sequentially focusable element, such as
 * the location's `Top level` button. That substitution happens before the window `focus` event, so
 * the listener recognizes it and returns focus, caret and selection to the element that was left.
 * A different element that Chromium kept, such as one the application focused while the window was
 * inactive, stays focused. A removed departure element leaves Chromium's result unchanged.
 */
export function installWindowFocusReturn(target: Window = window): () => void {
  const document = target.document
  let left: { element: Element | null; restore: () => void } | undefined

  // Element focus events do not bubble, so these non-capturing listeners see only the window's own.
  const blur = (): void => {
    const element = document.activeElement
    // Editor scope restores node-input selections only: setting a document selection inside a
    // contenteditable could move focus away from a departure control such as a dialog button.
    left = { element, restore: captureFocusRestoration(element, 'editor') }
  }

  const focus = (): void => {
    if (left === undefined) return
    const { element, restore } = left
    left = undefined
    const current = document.activeElement
    if (current === element || !isInitialFocusTarget(document, current)) return
    if (element === null || element === document.body) {
      if (current instanceof HTMLElement) current.blur()
      return
    }
    // Restoring inside the event keeps the initial-focus element from receiving focus events.
    restore()
  }

  target.addEventListener('blur', blur)
  target.addEventListener('focus', focus)
  return () => {
    target.removeEventListener('blur', blur)
    target.removeEventListener('focus', focus)
  }
}

/**
 * Whether `current` is where Chromium's initial focus lands: the first sequentially focusable
 * element in tree order, within the topmost modal dialog when one is open, or the body when there is
 * none. Tree order cannot tell which of several open dialogs is topmost, so each open dialog's first
 * element qualifies. The renderer opens every native dialog with `showModal()` and assigns no positive
 * `tabindex`, so tree order is the navigation order.
 */
export function isInitialFocusTarget(document: Document, current: Element | null): boolean {
  const dialogs = Array.from(document.querySelectorAll('dialog[open]'))
  const scopes = dialogs.length === 0 ? [document.body] : dialogs
  return scopes.some((scope) => current === (firstSequentiallyFocusable(document, scope) ?? document.body))
}

function firstSequentiallyFocusable(document: Document, scope: Element): HTMLElement | undefined {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof HTMLElement && sequentiallyFocusable(node)) return node
  }
  return undefined
}

function sequentiallyFocusable(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.closest('[inert]') !== null) return false
  if ('disabled' in element && element.disabled === true) return false
  return typeof element.checkVisibility !== 'function' || element.checkVisibility({ visibilityProperty: true })
}
