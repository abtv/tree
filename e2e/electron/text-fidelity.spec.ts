// @editing-modes: independent
import type { Locator, Page } from '@playwright/test'
import { expect, launchTree, node, seedDocument, test } from './fixtures'

// Character sequences that programming typefaces commonly draw as ligatures or contextual
// alternates. PRODUCT.md §20.3 requires every stored character to be drawn exactly as it is.
const RISKY_TEXT = [
  '://',
  'http://localhost:8080',
  'https://example.com/a//b///c',
  '->',
  '=>',
  '!=',
  '==',
  '===',
  '<=',
  '>=',
  '//',
  '///',
  '::',
  '...',
  'www.',
  '<!--',
  '|>',
  '<>',
  '&&',
  '||',
  '~=',
  '#{',
  '0xFF',
  'x*y',
  '--',
  '++',
  '</',
  '/>',
] as const

const ID_SHAPED = 'fidelity-shaped'
const ID_REFERENCE = 'fidelity-reference'

// Draws `text` twice in the real renderer with the source node's computed typography. The reference
// forces every font feature that joins or substitutes glyphs off, so any pixel difference between
// the two is a shaping effect that the application styles let through.
async function drawBoth(window: Page, source: Locator, text: string): Promise<void> {
  await source.evaluate(
    (element, { text: value, shapedId, referenceId }) => {
      const computed = getComputedStyle(element)
      const copy = [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'letterSpacing',
        'lineHeight',
        'fontKerning',
        'fontVariationSettings',
        'textRendering',
        'fontVariantLigatures',
        'fontFeatureSettings',
        'color',
      ] as const
      const make = (id: string, top: number, forceOff: boolean): void => {
        const box = element.ownerDocument.createElement('div')
        box.id = id
        box.textContent = value
        Object.assign(box.style, {
          position: 'fixed',
          zIndex: '2147483647',
          left: '20px',
          top: `${top}px`,
          width: '600px',
          whiteSpace: 'pre',
          background: getComputedStyle(element.ownerDocument.documentElement).backgroundColor,
        })
        for (const property of copy) box.style[property] = computed[property]
        if (forceOff) {
          box.style.fontVariantLigatures = 'none'
          box.style.fontFeatureSettings = '"liga" 0, "clig" 0, "calt" 0, "dlig" 0, "hlig" 0'
        }
        element.ownerDocument.body.append(box)
      }
      make(shapedId, 100, false)
      make(referenceId, 300, true)
    },
    { text, shapedId: ID_SHAPED, referenceId: ID_REFERENCE },
  )
  await window.evaluate(() => document.fonts.ready)
  const geometry = await window.evaluate(
    (ids) => {
      const boxes = ids.map((id) => document.getElementById(id)!)
      const [shaped, reference] = boxes.map((box) => box.getBoundingClientRect())
      return {
        separated: shaped!.bottom <= reference!.top,
        visible: boxes.every((box) => {
          const rect = box.getBoundingClientRect()
          return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
        }),
        unclipped: boxes.every((box) => box.scrollWidth <= box.clientWidth && box.scrollHeight <= box.clientHeight),
      }
    },
    [ID_SHAPED, ID_REFERENCE],
  )

  expect(geometry).toEqual({ separated: true, visible: true, unclipped: true })
}

async function removeBoth(window: Page): Promise<void> {
  await window.evaluate(
    (ids) => {
      for (const id of ids) document.getElementById(id)?.remove()
    },
    [ID_SHAPED, ID_REFERENCE],
  )
}

// Captures an element by its box instead of `locator.screenshot()`, which first waits for the element
// to be stable across animation frames. These boxes are fixed-position and never move, and that wait
// can stall for its whole timeout on a loaded CI runner while contributing nothing to a pixel comparison.
async function captureBox(window: Page, id: string): Promise<Buffer> {
  const box = await window.locator(`#${id}`).boundingBox()
  if (box === null) throw new Error(`#${id} was not rendered.`)
  return window.screenshot({ clip: box })
}

async function drawingsMatch(window: Page, source: Locator, text: string, evidenceName?: string): Promise<boolean> {
  try {
    await drawBoth(window, source, text)
    const shaped = await captureBox(window, ID_SHAPED)
    const reference = await captureBox(window, ID_REFERENCE)
    if (evidenceName !== undefined) {
      await test.info().attach(`${evidenceName}-shaped`, { body: shaped, contentType: 'image/png' })
      await test.info().attach(`${evidenceName}-reference`, { body: reference, contentType: 'image/png' })
    }
    return shaped.equals(reference)
  } finally {
    await removeBoth(window)
  }
}

async function expectDrawnCharacterByCharacter(window: Page, source: Locator, name: string): Promise<void> {
  for (let index = 0; index < RISKY_TEXT.length; index += 4) {
    const group = RISKY_TEXT.slice(index, index + 4)
    const matches = await drawingsMatch(window, source, group.join('\n'), index === 0 ? name : undefined)

    if (!matches) {
      // Keep the original per-string diagnosis without paying its capture cost on a passing run.
      for (const text of group) {
        expect(
          await drawingsMatch(window, source, text),
          `"${text}" is drawn differently from its character-by-character form`,
        ).toBe(true)
      }
    }
    expect(matches, `The ${name} group ${JSON.stringify(group)} differs from its character-by-character form`).toBe(
      true,
    )
  }
}

async function expectLigaturesDetected(window: Page, source: Locator, name: string): Promise<void> {
  const originalStyle = await source.getAttribute('style')
  try {
    await source.evaluate((element) => {
      const styled = element as HTMLElement
      styled.style.fontVariantLigatures = 'normal'
      styled.style.fontFeatureSettings = '"liga" 1, "clig" 1, "calt" 1, "dlig" 1, "hlig" 1'
    })

    expect(await drawingsMatch(window, source, RISKY_TEXT.slice(0, 4).join('\n'), `${name}-enabled-ligatures`)).toBe(
      false,
    )
  } finally {
    await source.evaluate((element, style) => {
      if (style === null) element.removeAttribute('style')
      else element.setAttribute('style', style)
    }, originalStyle)
  }
}

test.describe('text fidelity', () => {
  // @requirement PRODUCT.md §20.3
  test('draws risky character sequences exactly as stored, in plain and linked nodes', async ({ userDataDir }) => {
    const url = 'http://localhost:8080'
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'plain', text: '://', links: [], children: [] },
          { id: 'linked', text: url, links: [{ start: 0, end: url.length, url }], children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'plain' },
    })
    const { window } = await launchTree(userDataDir)

    await expect(node(window, 2)).toHaveAttribute('contenteditable', 'true')
    await expectDrawnCharacterByCharacter(window, node(window, 1), 'plain')
    await expectDrawnCharacterByCharacter(window, node(window, 2), 'linked')
    await expectLigaturesDetected(window, node(window, 1), 'plain')
    await expectLigaturesDetected(window, node(window, 2), 'linked')
  })
})
