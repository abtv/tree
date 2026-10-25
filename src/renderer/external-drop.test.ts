// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { blockExternalDrops } from './external-drop'

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  document.body.replaceChildren()
})

it('rejects native drops across the window before target listeners and releases its listeners', () => {
  const input = document.createElement('textarea')
  document.body.append(input)
  dispose = blockExternalDrops(window)
  for (const type of ['dragover', 'drop']) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    const dataTransfer = { dropEffect: 'copy' }
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
    let canceledAtTarget = false
    input.addEventListener(
      type,
      (received) => {
        canceledAtTarget = received.defaultPrevented
      },
      { once: true },
    )

    expect(input.dispatchEvent(event)).toBe(false)
    expect(canceledAtTarget).toBe(true)
    expect(dataTransfer.dropEffect).toBe('none')
  }

  dispose()

  expect(input.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))).toBe(true)
  expect(
    input.dispatchEvent(
      new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromDrop' }),
    ),
  ).toBe(true)
})

it('blocks drop insertion without intercepting paste, typing, or internal node pointer movement', () => {
  dispose = blockExternalDrops(window)
  for (const inputType of ['insertFromDrop', 'insertFromPaste', 'insertText']) {
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType })
    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(inputType === 'insertFromDrop')
  }

  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'paste']) {
    expect(document.body.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))).toBe(true)
  }

  const event = new Event('drop', { cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: null })

  expect(window.dispatchEvent(event)).toBe(false)
})
