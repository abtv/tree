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
it('keeps application styles free of animations and transitions that delay interaction feedback', () => {
  const sheet = document.createElement('style')
  sheet.textContent = styles
  document.head.append(sheet)
  try {
    const inspect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        expect(rule.cssText).not.toMatch(/@(?:-webkit-)?keyframes\b/i)
        if ('style' in rule) {
          const style = (rule as CSSStyleRule).style
          for (const property of Array.from(style)) {
            // caret-animation controls blinking; it does not animate application transitions.
            if (/^(?:-webkit-)?(?:animation|transition)(?:-|$)/.test(property)) {
              expect(style.getPropertyValue(property), `${rule.cssText}: ${property}`).toMatch(/^(?:none|0s|0ms)$/)
            }
          }
        }
        if ('cssRules' in rule) inspect((rule as CSSGroupingRule).cssRules)
      }
    }
    expect(sheet.sheet).not.toBeNull()
    inspect(sheet.sheet!.cssRules)
  } finally {
    sheet.remove()
  }
})
