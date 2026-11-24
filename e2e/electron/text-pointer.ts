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
