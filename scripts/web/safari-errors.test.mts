// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { observeSafariErrors, readSafariErrors } from './safari-errors.mts'

it('records errors and rejected promises without swallowing them, retaining earlier-document errors', () => {
  window.localStorage.setItem('tree-smoke-errors', JSON.stringify(['Earlier document failure']))
  window.eval(`(${observeSafariErrors.toString()})()`)
  const error = new ErrorEvent('error', { message: 'Synthetic runtime failure', cancelable: true })
  const rejection = new Event('unhandledrejection', { cancelable: true })
  Object.defineProperty(rejection, 'reason', { value: new Error('Synthetic rejected promise') })

  window.dispatchEvent(error)
  window.dispatchEvent(rejection)

  expect(window.eval(`(${readSafariErrors.toString()})()`)).toEqual([
    'Earlier document failure',
    'Synthetic runtime failure',
    'Error: Synthetic rejected promise',
  ])
  expect(error.defaultPrevented).toBe(false)
  expect(rejection.defaultPrevented).toBe(false)
})
