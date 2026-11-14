import { getSelectionEndpoints, hasMultiCharacterSelection } from './editor-dom'

/** Paint-only projection of the current caret. Never changes selection, focus or document state. */
export function createActiveLineHighlight() {
  let previous: HTMLElement | undefined
  let observed: HTMLElement | undefined
  let frame: number | undefined
  let resize: ResizeObserver | undefined
  let mounted = false
  let readRoot: () => HTMLElement | null = () => null

  const clear = (): void => {
    previous?.removeAttribute('data-active-line')
    previous?.style.removeProperty('--active-line-top')
    previous?.style.removeProperty('--active-line-height')
    previous = undefined
  }

  const observe = (element: HTMLElement | undefined): void => {
    if (element === observed) return
    resize?.disconnect()
    observed = element
    if (element !== undefined) resize?.observe(element)
  }

  const paint = (row: HTMLElement, top: number, height: number): void => {
    const nextTop = `${top}px`
    const nextHeight = `${height}px`
    if (row.style.getPropertyValue('--active-line-top') !== nextTop) row.style.setProperty('--active-line-top', nextTop)
    if (row.style.getPropertyValue('--active-line-height') !== nextHeight)
      row.style.setProperty('--active-line-height', nextHeight)
    if (!row.hasAttribute('data-active-line')) row.setAttribute('data-active-line', '')
    previous = row
  }

  const update = (root: HTMLElement | null = readRoot()): void => {
    const active = root?.ownerDocument.activeElement
    const row = active instanceof HTMLElement ? active.closest<HTMLElement>('.node-row,.agenda-row') : null
    if (row !== previous) clear()
    if (root === null || row === null || !root.contains(row)) {
      observe(undefined)
      clear()
      return
    }

    if (row.querySelector('.node-input-image-caret')) {
      const image = row.querySelector<HTMLElement>('.attachment-image,.attachment-placeholder')
      observe(image ?? row)
      if (image === null) return clear()
      const bounds = image.getBoundingClientRect()
      if (bounds.height <= 0) return clear()
      const frame = image.closest<HTMLElement>('.attachment-image-caret')
      const frameStyle = frame === null ? undefined : getComputedStyle(frame)
      const outset =
        frameStyle === undefined || frameStyle.outlineStyle === 'none'
          ? 0
          : Math.max(
              0,
              (Number.parseFloat(frameStyle.outlineWidth) || 0) + (Number.parseFloat(frameStyle.outlineOffset) || 0),
            )
      const framedBounds = frame?.getBoundingClientRect() ?? bounds
      paint(row, framedBounds.top - row.getBoundingClientRect().top - outset, framedBounds.height + 2 * outset)
      return
    }

    const input =
      active instanceof HTMLElement && active.matches('.node-input')
        ? active
        : (row.querySelector<HTMLElement>('.agenda-text,.agenda-label') ?? row)
    observe(input)
    const bounds = input.getBoundingClientRect()
    const style = getComputedStyle(input)
    const height = Number.parseFloat(style.lineHeight)
    const inset = ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'].reduce(
      (total, property) => total + (Number.parseFloat(style.getPropertyValue(property)) || 0),
      0,
    )
    if (!Number.isFinite(height) || bounds.height <= 0) return clear()

    let rect: DOMRect | undefined
    const marks = row.querySelectorAll<HTMLElement>('.agenda-caret,.agenda-selection')
    if (bounds.height <= height + inset + 1) {
      // A single line needs no caret measurement or textarea mirror, but its row may be taller.
      rect = bounds
    } else if (marks.length > 0) {
      const backwards = row.dataset.caretEnd === 'start'
      const mark = marks[backwards ? 0 : marks.length - 1]!
      const rects = mark.getClientRects()
      rect = rects[backwards ? 0 : rects.length - 1]
    } else if (input instanceof HTMLTextAreaElement) {
      rect = textareaCaretRect(input, root.classList.contains('vim-state-normal') && !hasMultiCharacterSelection(input))
    } else {
      const selection = input.ownerDocument.getSelection()
      if (selection !== null && selection.rangeCount > 0 && input.contains(selection.focusNode)) {
        const range = selection.getRangeAt(0).cloneRange()
        const rects = range.getClientRects()
        // The Normal block is one selected character; other selections follow their active end.
        if (root.classList.contains('vim-state-normal') && !hasMultiCharacterSelection(input)) rect = rects[0]
        else if (root.classList.contains('vim-state-visual'))
          rect = rects[selection.direction === 'backward' ? 0 : rects.length - 1]
        else {
          range.collapse(selection.direction === 'backward')
          rect = range.getClientRects()[0]
          // Chromium exposes no range rectangle after a rich editor's trailing BR.
          if (
            rect === undefined &&
            input.textContent?.endsWith('\n') &&
            getSelectionEndpoints(input).focus === input.textContent.length
          ) {
            const bottomInset =
              (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
            rect = new DOMRect(bounds.left, bounds.bottom - bottomInset - height, bounds.width, height)
          }
        }
        range.detach()
      }
    }
    if (rect === undefined || rect.height === 0) return clear()
    const line = Math.max(0, Math.round((rect.top - bounds.top) / height))
    const top = bounds.top - row.getBoundingClientRect().top + line * height
    paint(row, top, height)
  }

  const schedule = (): void => {
    if (!mounted || frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      update()
    })
  }

  return {
    update,
    mount(root: () => HTMLElement | null): () => void {
      mounted = true
      readRoot = root
      resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
      observed = undefined
      const document = readRoot()?.ownerDocument ?? globalThis.document
      for (const type of ['selectionchange', 'focusin']) document.addEventListener(type, updateEvent)
      for (const type of ['focusout', 'pointerup', 'input', 'scroll']) document.addEventListener(type, schedule, true)
      globalThis.addEventListener('resize', schedule)
      update()
      return () => {
        mounted = false
        readRoot = () => null
        if (frame !== undefined) cancelAnimationFrame(frame)
        frame = undefined
        for (const type of ['selectionchange', 'focusin']) document.removeEventListener(type, updateEvent)
        for (const type of ['focusout', 'pointerup', 'input', 'scroll'])
          document.removeEventListener(type, schedule, true)
        globalThis.removeEventListener('resize', schedule)
        resize?.disconnect()
        resize = undefined
        observed = undefined
        clear()
      }
    },
  }

  function updateEvent(): void {
    update()
  }
}

/** A single disposable mirror of the focused textarea, including an empty final insertion line. */
function textareaCaretRect(input: HTMLTextAreaElement, normal: boolean): DOMRect {
  const bounds = input.getBoundingClientRect()
  const style = getComputedStyle(input)
  const mirror = input.ownerDocument.createElement('div')
  for (const property of [
    'font',
    'letter-spacing',
    'word-spacing',
    'padding',
    'border',
    'box-sizing',
    'word-break',
    'overflow-wrap',
    'tab-size',
    'text-indent',
    'direction',
    'unicode-bidi',
    'text-align',
  ])
    mirror.style.setProperty(property, style.getPropertyValue(property))
  Object.assign(mirror.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    left: `${bounds.left}px`,
    top: `${bounds.top - input.scrollTop}px`,
    width: `${bounds.width}px`,
  })
  const cursor = normal || input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd
  mirror.append(input.ownerDocument.createTextNode(input.value.slice(0, cursor)))
  const marker = input.ownerDocument.createElement('span')
  marker.textContent = input.value.slice(cursor, cursor + 1) || '\u200b'
  mirror.append(marker, input.ownerDocument.createTextNode(input.value.slice(cursor + 1)))
  input.ownerDocument.body.append(mirror)
  try {
    return marker.getBoundingClientRect()
  } finally {
    mirror.remove()
  }
}
