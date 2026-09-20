// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import styles from './styles.css?raw'

const STYLE_ID = 'drop-zone-spacing-styles'

function computed(selector: string): { height: number; marginTop: number; marginBottom: number } {
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`${selector} was not rendered.`)
  const style = getComputedStyle(element)
  return {
    height: Number.parseFloat(style.height),
    marginTop: Number.parseFloat(style.marginTop),
    marginBottom: Number.parseFloat(style.marginBottom),
  }
}

describe('drop-zone spacing', () => {
  beforeEach(() => {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = styles
    document.head.append(style)
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="node-list">
        <div class="drop-zone drop-zone-start drop-zone-edge"></div>
        <div class="node-row"></div>
        <div class="drop-zone drop-zone-end drop-zone-edge"></div>
      </div>`,
    )
  })

  afterEach(() => {
    document.body.classList.remove('node-drag-active')
    document.querySelector('.node-list')?.remove()
    document.getElementById(STYLE_ID)?.remove()
  })

  it('keeps edge drop targets out of the normal flow', () => {
    expect(computed('.drop-zone-start')).toEqual({ height: 0, marginTop: 0, marginBottom: 0 })
    expect(computed('.drop-zone-end')).toEqual({ height: 0, marginTop: 0, marginBottom: 0 })
  })

  it('expands edge drop targets during a drag without shifting rows', () => {
    document.body.classList.add('node-drag-active')

    const start = computed('.drop-zone-start')
    const end = computed('.drop-zone-end')
    expect(start).toEqual({ height: 40, marginTop: -40, marginBottom: 0 })
    expect(end).toEqual({ height: 64, marginTop: 0, marginBottom: -64 })
    expect(start.height + start.marginTop).toBe(0)
    expect(end.height + end.marginBottom).toBe(0)
  })

  it('returns edge drop targets to zero spacing after the drag ends', () => {
    document.body.classList.add('node-drag-active')
    document.body.classList.remove('node-drag-active')

    expect(computed('.drop-zone-start').height).toBe(0)
    expect(computed('.drop-zone-end').height).toBe(0)
  })
})
