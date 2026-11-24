import { captureFocusRestoration } from './editor-dom'

const EDITOR = '.node-input, .agenda-row'

// Presses on these keep their own focus and pointer behavior: editors, controls, Agenda rows, which
// take focus natively, and dialogs. Status and error messages stay selectable as ordinary page text.
// Node rows themselves are blank around their editor and controls: their drag and image-only
// activation use pointer and click events, which a prevented press default leaves intact.
const OWNS_PRESS = [
  '.node-input',
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
  '[role="button"]',
  'dialog',
  '[role="dialog"]',
  '.agenda-row',
  '[role="status"]',
  '[role="alert"]',
  '.status-bar-message',
].join(', ')

export interface PointerPress {
  readonly target: EventTarget | null
  readonly button: number
  readonly clientX: number
  readonly clientY: number
}

/**
 * Whether a primary or secondary pointer press must leave keyboard focus in the editor. A press on an
 * area that is not an editor, control or message — the margins, the space beside and below the rows,
 * or the location and status bars around their controls — would otherwise move focus to the page
 * body, where Vim Normal keys do nothing. Preventing the press's default action keeps focus, caret,
 * selection and mode, as the status-bar controls already do. Other buttons, such as a middle press
 * that starts autoscroll, and presses on a classic scrollbar keep their native behavior; overlay
 * scrollbars keep working with a prevented press.
 */
export function keepsEditorFocusOnPress(press: PointerPress, active: Element | null): boolean {
  const { target } = press
  if (press.button !== 0 && press.button !== 2) return false
  if (!(target instanceof Element) || active === null || !active.matches(EDITOR)) return false
  if (target.closest(OWNS_PRESS) !== null) return false
  return !onClassicScrollbar(target, press.clientX, press.clientY)
}

export interface BlankPressFocus {
  /** The main element's `mousedown`: keeps editor focus for a blank press. */
  press(event: PointerPress & { preventDefault(): void }): void
  /** The main element's `contextmenu` for that press. */
  contextMenu(): void
  /** The main element's `mouseup`, and any key before an editor handles it. */
  settle(): void
}

/**
 * Owns one pending selection return. Chromium on macOS dispatches `contextmenu` on the press and, in
 * its default action, moves the selection to the pointer even though the press kept focus. The
 * editor takes its captured selection back when that press is released, or before the next key or
 * press when a native menu swallows the release. Elsewhere `contextmenu` follows the release and
 * leaves the selection alone. The native menu, where the platform shows one, is left alone.
 */
export function createBlankPressFocus(): BlankPressFocus {
  let pending: { editor: Element; restore: () => void; menu: boolean } | undefined
  // A return applies only while its editor still has focus; a command that moved focus meanwhile,
  // such as Find opened after a browser menu took the release, keeps its own destination.
  const settle = (): void => {
    const current = pending
    pending = undefined
    if (current?.menu && document.activeElement === current.editor) current.restore()
  }
  return {
    press: (event) => {
      settle()
      const editor = document.activeElement
      if (editor === null || !keepsEditorFocusOnPress(event, editor)) return
      event.preventDefault()
      pending = { editor, restore: captureFocusRestoration(editor, 'editor'), menu: false }
    },
    contextMenu: () => {
      if (pending !== undefined) pending.menu = true
    },
    settle,
  }
}

// A classic scrollbar of a scrolling element occupies its border box outside the client area.
function onClassicScrollbar(element: Element, x: number, y: number): boolean {
  const style = getComputedStyle(element)
  const scrolls = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll'
  const bounds = element.getBoundingClientRect()
  return (
    (scrolls(style.overflowY) && x >= bounds.left + element.clientLeft + element.clientWidth) ||
    (scrolls(style.overflowX) && y >= bounds.top + element.clientTop + element.clientHeight)
  )
}
