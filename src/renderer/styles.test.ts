// @vitest-environment jsdom
import { expect, it } from 'vitest'
import styles from './styles.css?raw'

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
