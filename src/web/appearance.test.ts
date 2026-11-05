// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { applyAppearance } from './appearance'

it('switches the dark palette and browser chrome and restores their original media queries', () => {
  const style = document.createElement('style')
  style.textContent =
    '.base { color: red; } @media (prefers-color-scheme: dark) { .base { color: white; } } @media print { .base { color: black; } }'
  const light = document.createElement('meta')
  light.name = 'theme-color'
  light.media = '(prefers-color-scheme: light)'
  const dark = document.createElement('meta')
  dark.name = 'theme-color'
  dark.media = '(prefers-color-scheme: dark)'
  const unrelated = document.createElement('meta')
  unrelated.name = 'viewport'
  unrelated.media = 'screen'
  document.head.append(style, light, dark, unrelated)
  try {
    const palette = style.sheet!.cssRules[1] as CSSMediaRule
    const print = style.sheet!.cssRules[2] as CSSMediaRule

    applyAppearance('dark')

    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(palette.media.mediaText).toBe('all')
    expect([light.media, dark.media]).toEqual(['not all', 'all'])
    expect(print.media.mediaText).toBe('print')
    expect(unrelated.media).toBe('screen')

    applyAppearance('light')

    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(palette.media.mediaText).toBe('not all')
    expect([light.media, dark.media]).toEqual(['all', 'not all'])

    applyAppearance('system')

    expect(document.documentElement.style.colorScheme).toBe('light dark')
    expect(palette.media.mediaText).toBe('(prefers-color-scheme: dark)')
    expect([light.media, dark.media]).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'])
  } finally {
    style.remove()
    light.remove()
    dark.remove()
    unrelated.remove()
    document.documentElement.style.removeProperty('color-scheme')
  }
})
