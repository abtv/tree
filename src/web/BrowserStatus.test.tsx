// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserStatus } from './BrowserStatus'

let root: Root | undefined

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)

  act(() => root!.render(<BrowserStatus />))

  return host
}

// @requirement PRODUCT.md §24.3
// @requirement PRODUCT.md §24.4
it('retains controller-owned messages and actions and restores their original positions on unmount', () => {
  document.body.innerHTML = `
    <div id="status-origin"><div id="browser-status" hidden><button>Cancel</button></div><span id="status-next"></span></div>
    <div id="problem-origin"><p id="prototype-problem">Save failed</p><span id="problem-next"></span></div>
  `
  const status = document.getElementById('browser-status')!
  const problem = document.getElementById('prototype-problem')!
  const button = status.querySelector('button')!
  const cancel = vi.fn()
  button.onclick = cancel

  const host = mount()

  expect(status.parentElement).toBe(host.querySelector('.browser-status-slot'))
  expect(status.hidden).toBe(false)
  expect(status.firstElementChild).toBe(problem)
  expect(problem.textContent).toBe('Save failed')
  expect(status.querySelector('button')).toBe(button)

  button.click()
  problem.textContent = 'Retry failed'
  act(() => root!.unmount())
  root = undefined

  expect(cancel).toHaveBeenCalledOnce()
  expect(status.parentElement).toBe(document.getElementById('status-origin'))
  expect(status.nextSibling).toBe(document.getElementById('status-next'))
  expect(status.hidden).toBe(true)
  expect(problem.parentElement).toBe(document.getElementById('problem-origin'))
  expect(problem.nextSibling).toBe(document.getElementById('problem-next'))
  expect(problem.textContent).toBe('Retry failed')
})

it('restores a final problem node and can mount the same status nodes again', () => {
  document.body.innerHTML =
    '<div id="browser-status" hidden></div><section id="problem-origin"><div id="prototype-problem">Problem</div></section>'
  const status = document.getElementById('browser-status')!
  const problem = document.getElementById('prototype-problem')!

  mount()
  act(() => root!.unmount())
  root = undefined

  expect(problem.parentElement).toBe(document.getElementById('problem-origin'))
  expect(problem.nextSibling).toBeNull()

  const host = mount()

  expect(status.parentElement).toBe(host.querySelector('.browser-status-slot'))
  expect(status.hidden).toBe(false)
  expect(status.firstChild).toBe(problem)
})

it('moves and restores status when there is no problem node', () => {
  document.body.innerHTML = '<div id="browser-status" hidden>Ready to work offline</div>'
  const status = document.getElementById('browser-status')!

  const host = mount()

  expect(host.textContent).toBe('Ready to work offline')
  expect(status.hidden).toBe(false)

  act(() => root!.unmount())
  root = undefined

  expect(status.parentElement).toBe(document.body)
  expect(status.hidden).toBe(true)
})

it('renders an empty slot without moving an unrelated problem when status is absent', () => {
  document.body.innerHTML = '<div id="prototype-problem">Startup failed</div>'
  const problem = document.getElementById('prototype-problem')!

  const host = mount()

  expect(host.querySelector('.browser-status-slot')?.childNodes).toHaveLength(0)
  expect(problem.parentElement).toBe(document.body)
})
