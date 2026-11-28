import type { Locator, Page } from '@playwright/test'
import { dragSelectText } from './fixtures'

/** The viewport x one pixel after the boundary before `offset` on a single-line editor's text. */
export function textX(field: Locator, offset: number): Promise<number> {
  return field.evaluate((element, offset) => {
    if (element instanceof HTMLTextAreaElement) {
      const style = getComputedStyle(element)
      const context = document.createElement('canvas').getContext('2d')!
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing
      const left =
        element.getBoundingClientRect().left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
      return left + context.measureText(element.value.slice(0, offset)).width + 1
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let remaining = offset
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      const length = text.textContent?.length ?? 0
      if (remaining < length) {
        const range = document.createRange()
        range.setStart(text, remaining)
        range.setEnd(text, remaining + 1)
        return range.getBoundingClientRect().left + 1
      }
      remaining -= length
    }
    throw new Error(`Offset ${offset} is outside the editor text.`)
  }, offset)
}

export interface CharacterBox {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * The viewport box of the character at each UTF-16 offset of a plain or rich editor, measured
 * without moving the selection; a text area is measured on a mirror laid over it.
 */
export function characterBoxes(field: Locator): Promise<CharacterBox[]> {
  return field.evaluate((element) => {
    let measured = element as HTMLElement
    let mirror: HTMLElement | undefined
    if (element instanceof HTMLTextAreaElement) {
      mirror = document.createElement('div')
      const style = getComputedStyle(element)
      for (const property of [
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'line-height',
        'letter-spacing',
        'padding',
        'border',
        'box-sizing',
        'word-break',
        'overflow-wrap',
        'tab-size',
      ])
        mirror.style.setProperty(property, style.getPropertyValue(property))
      const bounds = element.getBoundingClientRect()
      Object.assign(mirror.style, {
        position: 'fixed',
        visibility: 'hidden',
        whiteSpace: 'pre-wrap',
        width: `${bounds.width}px`,
        left: `${bounds.left}px`,
        top: `${bounds.top - element.scrollTop}px`,
      })
      mirror.textContent = element.value
      document.body.append(mirror)
      measured = mirror
    }
    const boxes: CharacterBox[] = []
    const walker = document.createTreeWalker(measured, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      for (let index = 0; index < (text.textContent?.length ?? 0); index += 1) {
        const range = document.createRange()
        range.setStart(text, index)
        range.setEnd(text, index + 1)
        const { left, right, top, bottom } = range.getBoundingClientRect()
        boxes.push({ left, right, top, bottom })
      }
    }
    mirror?.remove()
    return boxes
  })
}

/** Double-click at one text boundary and drag word by word to another; the node-drag hold stays paused. */
export async function doubleClickDragText(window: Page, field: Locator, from: number, to: number): Promise<void> {
  const box = await field.boundingBox()
  if (box === null) throw new Error('The text field was not rendered.')
  const y = box.y + box.height / 2
  const start = await textX(field, from)
  const end = await textX(field, to)
  await window.mouse.move(start, y)
  await window.clock.install()
  await window.clock.pauseAt(Date.now() + 60_000)
  try {
    await window.mouse.down()
    await window.mouse.up()
    await window.mouse.down({ clickCount: 2 })
    await window.mouse.move(end, y, { steps: 8 })
    await window.mouse.up({ clickCount: 2 })
  } finally {
    await window.clock.resume()
  }
}

/** Drag-select from one text boundary to another, as a pointer gesture over the editor. */
export async function dragText(window: Page, field: Locator, from: number, to: number): Promise<void> {
  const box = await field.boundingBox()
  if (box === null) throw new Error('The text field was not rendered.')
  await dragSelectText(window, field, (await textX(field, from)) - box.x, (await textX(field, to)) - box.x)
}
