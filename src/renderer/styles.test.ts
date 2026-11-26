// @vitest-environment jsdom
import { expect, it } from 'vitest'
import styles from './styles.css?raw'
import grayStyles from './gray.css?raw'
import browserStyles from '../web/styles.css?raw'

// @requirement PRODUCT.md §2.2
it('keeps the location toolbar outside the scrolling content area, with an opaque background', () => {
  const bar = /\.location-bar\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''

  expect(bar).toMatch(/flex:\s*0 0 auto/)
  expect(bar).toMatch(/background:\s*var\(--color-background\)/)

  const app = /\.tree-app\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''

  expect(app).toMatch(/height:\s*100vh/)

  const sheet = document.createElement('style')
  const viewport = document.createElement('div')
  sheet.textContent = styles
  document.head.append(sheet)
  document.body.append(viewport)
  try {
    for (const className of ['scroll-viewport', 'vim-help-view']) {
      viewport.className = className
      const computed = getComputedStyle(viewport)
      expect(computed.overflowY).toBe('auto')
      expect(computed.minHeight).toMatch(/^0(?:px)?$/)
    }
  } finally {
    sheet.remove()
    viewport.remove()
  }

  const status = /\.status-bar\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''

  expect(status).toMatch(/flex:\s*0 0 auto/)
  expect(status).toMatch(/background:\s*var\(--color-background\)/)
  expect(/\.vim-mode\s*\{([^}]*)\}/.exec(styles)?.[1] ?? '').not.toMatch(/position:\s*fixed/)
})

// @requirement PRODUCT.md §20.5
it('draws the window title strip in the document background and lets it drag the window', () => {
  const strip = /\.title-bar\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''

  expect(strip).toMatch(/background:\s*var\(--color-background\)/)
  expect(strip).toMatch(/color:\s*var\(--color-secondary\)/)
  expect(strip).toMatch(/-webkit-app-region:\s*drag/)
  expect(strip).toMatch(/flex:\s*0 0 auto/)
})

// @requirement PRODUCT.md §20
it('limits the text pointer to focused node editors in text-entry modes', () => {
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

          if (/^(?:auto|text)$/.test(style.getPropertyValue('cursor')))
            textCursorSelectors.push(...selectorText.split(',').map((selector) => selector.trim()))
        }
        if ('cssRules' in rule) inspect((rule as CSSGroupingRule).cssRules)
      }
    }

    expect(sheet.sheet).not.toBeNull()

    inspect(sheet.sheet!.cssRules)

    expect(textCursorSelectors).toEqual(['.vim-state-insert .node-input:focus', '.vim-state-replace .node-input:focus'])
  } finally {
    sheet.remove()
  }
})

// docs/ARCHITECTURE.md: every color is a custom property declared once per appearance, so rules
// cannot drift apart by repeating a value.
function colorLiterals(source: string): string[] {
  const sheet = document.createElement('style')
  sheet.textContent = source
  document.head.append(sheet)
  try {
    const literals: string[] = []
    const colorProbe = document.createElement('span').style
    const references = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'])
    const inspect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if ('style' in rule) {
          const { selectorText, style } = rule as CSSStyleRule
          for (const property of Array.from(style)) {
            if (property.startsWith('--')) continue
            const value = style.getPropertyValue(property).replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, '')
            const hasNamedColor = Array.from(value.matchAll(/[a-z_-][\w-]*/gi), ([word]) => word).some((word) => {
              if (references.has(word.toLowerCase())) return false
              colorProbe.color = ''
              colorProbe.color = word
              return colorProbe.color !== ''
            })
            if (hasNamedColor || /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(value)) {
              literals.push(`${selectorText} { ${property}: ${value} }`)
            }
          }
        }
        if ('cssRules' in rule) inspect((rule as CSSGroupingRule).cssRules)
      }
    }

    expect(sheet.sheet).not.toBeNull()

    inspect(sheet.sheet!.cssRules)

    return literals
  } finally {
    sheet.remove()
  }
}

it.each([
  ['shared', styles],
  ['Gray', grayStyles],
  ['browser', browserStyles],
])('declares %s color values only as custom properties', (_, source) => {
  expect(colorLiterals(source)).toEqual([])
})

it('detects named and system colors without treating references or strings as colors', () => {
  expect(colorLiterals('.a { color: HighlightText; } .b { color: aliceblue; } .c { color: red; }')).toHaveLength(3)
  expect(
    colorLiterals(`
      :root { --red: red; --highlight: Highlight; }
      .a { color: currentColor; background: transparent; border-color: var(--red); }
      .b { color: inherit; background: var(--highlight); content: "red"; }
    `),
  ).toEqual([])
})

// @requirement PRODUCT.md §20.10
it('draws the date-like underline as a 1px wavy muted-red line that the caret rule can hide', () => {
  const light = /:root\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''

  expect(light).toMatch(/--color-date-like:\s*#b4554b/i)

  const dark = /@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?:root\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''

  expect(dark).toMatch(/--color-date-like:\s*#cc9393/i)

  const rule = /\.date-like-text:not\(\[data-caret\]\)\s*\{([^}]*)\}/.exec(styles)?.[1] ?? ''

  expect(rule).toMatch(/text-decoration:\s*underline wavy var\(--color-date-like\)/)
  expect(rule).toMatch(/text-decoration-thickness:\s*1px/)
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
