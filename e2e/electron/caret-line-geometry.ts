import type { Page } from '@playwright/test'

/** Measure the selected glyph independently of production scroll policy, for both editor types. */
export async function caretGeometry(window: Page) {
  return window.evaluate(() => {
    const input = document.activeElement as HTMLElement
    const viewport = document.querySelector<HTMLElement>('.scroll-viewport')!
    const bounds = viewport.getBoundingClientRect()
    let rect: DOMRect
    let offset: number
    if (input instanceof HTMLTextAreaElement) {
      const mirror = document.createElement('div')
      const style = getComputedStyle(input)
      for (const property of [
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'padding',
        'border',
        'box-sizing',
        'word-break',
        'overflow-wrap',
      ])
        mirror.style.setProperty(property, style.getPropertyValue(property))
      Object.assign(mirror.style, {
        position: 'fixed',
        visibility: 'hidden',
        whiteSpace: 'pre-wrap',
        width: `${input.getBoundingClientRect().width}px`,
        left: '0',
        top: '0',
      })
      mirror.textContent = input.value
      document.body.append(mirror)
      offset = input.selectionStart
      const range = document.createRange()
      range.setStart(mirror.firstChild!, Math.min(offset, input.value.length - 1))
      range.setEnd(mirror.firstChild!, Math.min(offset + 1, input.value.length))
      const measured = range.getBoundingClientRect()
      rect = new DOMRect(
        0,
        input.getBoundingClientRect().top + measured.top - input.scrollTop,
        measured.width,
        measured.height,
      )
      mirror.remove()
    } else {
      const range = getSelection()!.getRangeAt(0)
      rect = range.getBoundingClientRect()
      const prefix = document.createRange()
      prefix.selectNodeContents(input)
      prefix.setEnd(range.startContainer, range.startOffset)
      offset = prefix.toString().length
    }
    return {
      top: rect.top - bounds.top,
      bottom: bounds.bottom - rect.bottom,
      scroll: viewport.scrollTop,
      max: viewport.scrollHeight - viewport.clientHeight,
      offset,
      id: input.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId,
    }
  })
}
