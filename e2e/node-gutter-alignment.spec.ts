import type { Page } from '@playwright/test'
import { expect, launchTree, seedDocument, test } from './fixtures'

function seed(): { document: unknown; location: unknown } {
  return {
    document: {
      roots: [
        { id: 'solo', text: 'Solo', children: [] },
        {
          id: 'parent',
          text: 'Parent',
          children: [{ id: 'child', text: 'Child', children: [] }],
        },
        {
          id: 'wrapped',
          text: 'A much longer node text that is expected to wrap across two or three visual lines in the outline',
          children: [{ id: 'wrapped-child', text: 'Child', children: [] }],
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'solo' },
  }
}

interface GutterAlignment {
  textCenter: number
  enterControlCenter: number
  triangleCenter: number | null
  focusMarkerCenter: number | null
}

// Reads real layout geometry from the Electron renderer rather than asserting on fixed pixel
// values, so the check survives future spacing tweaks and only fails when the bullet or triangle
// actually drifts off the first text line (docs/PRODUCT.md §2.1).
function gutterAlignment(window: Page, rowIndex: number): Promise<GutterAlignment> {
  return window
    .locator('.node-row')
    .nth(rowIndex)
    .evaluate((row) => {
      const input = row.querySelector('.node-input')
      if (!(input instanceof HTMLElement)) throw new Error('Row has no .node-input')
      const inputRect = input.getBoundingClientRect()
      const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight)
      const textCenter = inputRect.top + lineHeight / 2

      const enterControl = row.querySelector('.node-enter-control')
      if (!(enterControl instanceof HTMLElement)) throw new Error('Row has no .node-enter-control')
      const enterRect = enterControl.getBoundingClientRect()
      const enterControlCenter = enterRect.top + enterRect.height / 2

      const triangle = row.querySelector('.node-disclosure-triangle')
      const triangleRect = triangle instanceof HTMLElement ? triangle.getBoundingClientRect() : null
      const triangleCenter = triangleRect === null ? null : triangleRect.top + triangleRect.height / 2

      const focusMarker = row.querySelector('.node-focus-marker')
      const focusMarkerRect = focusMarker instanceof HTMLElement ? focusMarker.getBoundingClientRect() : null
      const focusMarkerCenter = focusMarkerRect === null ? null : focusMarkerRect.top + focusMarkerRect.height / 2

      return { textCenter, enterControlCenter, triangleCenter, focusMarkerCenter }
    })
}

test.describe('node gutter alignment', () => {
  // @requirement PRODUCT.md §2.1
  test('centers the bullet and disclosure triangle on the first line of node text', async ({ userDataDir }) => {
    seedDocument(userDataDir, seed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    const leaf = await gutterAlignment(window, 0)
    expect(leaf.triangleCenter).toBeNull()
    expect(Math.abs(leaf.enterControlCenter - leaf.textCenter)).toBeLessThanOrEqual(1)
    expect(leaf.focusMarkerCenter).not.toBeNull()
    expect(Math.abs((leaf.focusMarkerCenter as number) - leaf.enterControlCenter)).toBeLessThanOrEqual(1)
    await expect(window.locator('.node-list')).toHaveScreenshot('node-focus-marker-alignment.png')

    await window.locator('.node-row').nth(1).click()
    const unfocused = await gutterAlignment(window, 0)
    expect(unfocused.focusMarkerCenter).toBeNull()
    const newlyFocused = await gutterAlignment(window, 1)
    expect(newlyFocused.focusMarkerCenter).not.toBeNull()
    expect(Math.abs((newlyFocused.focusMarkerCenter as number) - newlyFocused.enterControlCenter)).toBeLessThanOrEqual(
      1,
    )

    const parent = await gutterAlignment(window, 1)
    expect(parent.triangleCenter).not.toBeNull()
    expect(Math.abs(parent.enterControlCenter - parent.textCenter)).toBeLessThanOrEqual(1)
    expect(Math.abs((parent.triangleCenter as number) - parent.textCenter)).toBeLessThanOrEqual(1)

    // The wrapped node's row grows taller than its first line, so this also proves the gutter
    // tracks the first line rather than centering on the whole multi-line text block.
    const wrapped = await gutterAlignment(window, 2)
    expect(Math.abs(wrapped.enterControlCenter - wrapped.textCenter)).toBeLessThanOrEqual(1)
    expect(Math.abs((wrapped.triangleCenter as number) - wrapped.textCenter)).toBeLessThanOrEqual(1)
  })
})
