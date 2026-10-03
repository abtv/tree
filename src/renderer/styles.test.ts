// @vitest-environment jsdom
import { expect, it } from 'vitest'
import styles from './styles.css?raw'

// @requirement PRODUCT.md §2.2
it('keeps the location toolbar outside the scrolling content area, with an opaque background', () => {
  const bar = /\.location-bar\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''
  expect(bar).toMatch(/flex:\s*0 0 auto/)
  expect(bar).toMatch(/background:\s*var\(--color-background\)/)
  const app = /\.tree-app\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''
  expect(app).toMatch(/height:\s*100vh/)
  const viewport = /\.scroll-viewport\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''
  expect(viewport).toMatch(/overflow-y:\s*auto/)
  expect(viewport).toMatch(/min-height:\s*0/)
  const status = /\.status-bar\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''
  expect(status).toMatch(/flex:\s*0 0 auto/)
  expect(status).toMatch(/background:\s*var\(--color-background\)/)
  expect(/\.vim-mode\s*\{([^}]*)\}/.exec(styles)?.[1] ?? '').not.toMatch(/position:\s*fixed/)
})

// @requirement PRODUCT.md §20
it('shows the text-editing cursor only over a focused node editor', () => {
  const sheet = document.createElement('style')
  sheet.textContent = styles
  document.head.append(sheet)
  try {
    const textCursorSelectors: string[] = []
    const inspect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if ('style' in rule) {
          const { selectorText, style } = rule as CSSStyleRule
          if (selectorText === 'body') expect(style.getPropertyValue('cursor')).toBe('default')
          if (/^(?:auto|text)$/.test(style.getPropertyValue('cursor'))) textCursorSelectors.push(selectorText)
        }
        if ('cssRules' in rule) inspect((rule as CSSGroupingRule).cssRules)
      }
    }
    expect(sheet.sheet).not.toBeNull()
    inspect(sheet.sheet!.cssRules)
    expect(textCursorSelectors).toEqual(['.node-input:focus'])
  } finally {
    sheet.remove()
  }
})

// docs/ARCHITECTURE.md: every color is a custom property declared once per appearance, so rules
// cannot drift apart by repeating a value.
it('declares color values only as custom properties', () => {
  const sheet = document.createElement('style')
  sheet.textContent = styles
  document.head.append(sheet)
  try {
    const literals: string[] = []
    const inspect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if ('style' in rule) {
          const { selectorText, style } = rule as CSSStyleRule
          for (const property of Array.from(style)) {
            if (property.startsWith('--')) continue
            const value = style.getPropertyValue(property)
            if (/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(value)) {
              literals.push(`${selectorText} { ${property}: ${value} }`)
            }
          }
        }
        if ('cssRules' in rule) inspect((rule as CSSGroupingRule).cssRules)
      }
    }
    expect(sheet.sheet).not.toBeNull()
    inspect(sheet.sheet!.cssRules)
    expect(literals).toEqual([])
  } finally {
    sheet.remove()
  }
})

// @requirement PRODUCT.md §20.4
// @requirement PRODUCT.md §20.6
it('keeps application styles free of time-based animations and transitions that delay interaction feedback', () => {
  // The raw source is parsed because the jsdom CSSOM drops scroll-driven animation properties.
  const source = styles.replace(/\/\*[\s\S]*?\*\//g, '')
  const scrollTimelines = new Set(Array.from(source.matchAll(/scroll-timeline:\s*(--[\w-]+)/g), (match) => match[1]))
  const scrollDrivenAnimations = new Set<string>()
  // Innermost blocks are style rules and keyframe steps; grouping rules contain only those.
  for (const [, selector = '', body = ''] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map(
      body
        .split(';')
        .map((declaration) => {
          const colon = declaration.indexOf(':')
          return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()] as const
        })
        .filter(([property]) => property !== ''),
    )
    const where = selector.trim()
    for (const [property, value] of declarations) {
      // caret-animation controls blinking; it does not animate application transitions.
      if (/^(?:-webkit-)?transition(?:-|$)/.test(property)) {
        expect(value, `${where}: ${property}`).toMatch(/^(?:none|0s|0ms)$/)
      }
      // The shorthand resets the timeline to time, so only longhands may declare an animation.
      if (/^(?:-webkit-)?animation$/.test(property)) expect(value, `${where}: ${property}`).toBe('none')
    }
    const name = declarations.get('animation-name')
    if (name === undefined || name === 'none') continue
    // An animation is allowed only when the scroll position drives it, so it has no duration.
    expect(scrollTimelines, `${where}: animation-timeline`).toContain(declarations.get('animation-timeline'))
    scrollDrivenAnimations.add(name)
  }
  for (const [, name] of source.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)) {
    expect(scrollDrivenAnimations, `@keyframes ${name}`).toContain(name)
  }
  expect(scrollDrivenAnimations).toEqual(new Set(['scroll-edge-fade-in', 'scroll-edge-fade-out']))
})
