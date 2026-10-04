// @editing-modes: both
import type { Page } from '@playwright/test'
import {
  describeForEachEditingMode,
  expect,
  firePaste,
  launchTree,
  node,
  seedDocument,
  test,
  writeClipboardImageSized,
} from './fixtures'

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
  rowTop: number
  imageTop: number | null
  imageCenter: number | null
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

      const image = row.querySelector('img')
      const imageRect = image instanceof HTMLElement ? image.getBoundingClientRect() : null

      return {
        rowTop: row.getBoundingClientRect().top,
        imageTop: imageRect === null ? null : imageRect.top,
        imageCenter: imageRect === null ? null : imageRect.top + imageRect.height / 2,
        textCenter,
        enterControlCenter,
        triangleCenter,
        focusMarkerCenter,
      }
    })
}

describeForEachEditingMode('node gutter alignment', ({ screenshotName }) => {
  // @requirement PRODUCT.md §2.1
  test('centers the bullet and disclosure triangle on the first line of node text', async ({ userDataDir }) => {
    seedDocument(userDataDir, seed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    const leaf = await gutterAlignment(window, 0)
    expect(leaf.triangleCenter).toBeNull()
    expect(Math.abs(leaf.enterControlCenter - leaf.textCenter)).toBeLessThanOrEqual(1)
    expect(leaf.focusMarkerCenter).not.toBeNull()
    expect(Math.abs((leaf.focusMarkerCenter as number) - leaf.enterControlCenter)).toBeLessThanOrEqual(1)
    await expect(window.locator('.node-list')).toHaveScreenshot(screenshotName('node-focus-marker-alignment.png'))

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

    // An inline-expanded child row is indented by depth; its gutter and focus marker must stay on
    // the first text line there too.
    await window.locator('.node-row').nth(1).locator('.node-disclosure-triangle').click()
    await expect(window.locator('.node-row').nth(2).locator('.node-input')).toHaveText('Child')
    const child = await gutterAlignment(window, 2)
    expect(child.triangleCenter).toBeNull()
    expect(child.focusMarkerCenter).toBeNull()
    expect(Math.abs(child.enterControlCenter - child.textCenter)).toBeLessThanOrEqual(1)

    await window.locator('.node-row').nth(2).click()
    const focusedChild = await gutterAlignment(window, 2)
    expect(focusedChild.focusMarkerCenter).not.toBeNull()
    expect(Math.abs((focusedChild.focusMarkerCenter as number) - focusedChild.enterControlCenter)).toBeLessThanOrEqual(
      1,
    )
    expect((await gutterAlignment(window, 1)).focusMarkerCenter).toBeNull()
  })

  // @requirement PRODUCT.md §2.1
  test('draws the selected-node bullet in the text color on top of the muted bullet', async ({ userDataDir }) => {
    seedDocument(userDataDir, seed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    const selected = await window
      .locator('.node-row')
      .nth(0)
      .evaluate((row) => {
        const marker = row.querySelector('.node-focus-marker')
        const control = row.querySelector('.node-enter-control')
        if (!marker || !control) throw new Error('Expected the focus marker and enter control')
        const markerRect = marker.getBoundingClientRect()
        const controlRect = control.getBoundingClientRect()
        return {
          color: getComputedStyle(marker).backgroundColor,
          width: markerRect.width,
          dx: markerRect.left + markerRect.width / 2 - (controlRect.left + controlRect.width / 2),
          dy: markerRect.top + markerRect.height / 2 - (controlRect.top + controlRect.height / 2),
          bulletColor: getComputedStyle(control, '::before').backgroundColor,
          textColor: getComputedStyle(row.querySelector('.node-input') as Element).color,
        }
      })

    expect(selected.color).toBe(selected.textColor)
    expect(selected.color).not.toBe(selected.bulletColor)
    expect(selected.width).toBe(7)
    expect(Math.abs(selected.dx)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(selected.dy)).toBeLessThanOrEqual(0.5)
  })
})

test.describe('node gutter alignment (Vim editing only)', () => {
  // @requirement PRODUCT.md §2.1
  test('keeps the gutter of an image-only row at the single-line text position', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'text', text: 'Text', children: [] },
          { id: 'image', text: '', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'text' },
    })
    // Normal mode collapses the focused image-only editor to its single line, which is the state
    // whose gutter must sit beside the image's top edge. In Insert mode or standard editing the
    // focused empty editor shows a normal-height insertion line above the image (PRODUCT.md §2.1),
    // so that relationship does not apply there.
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', vimPreference: true })
    const editor = node(window, 2)
    await editor.focus()
    await writeClipboardImageSized(app, 80, 80)
    await firePaste(editor)
    await expect(window.locator('.node-row').nth(1)).toHaveClass(/node-row-image-only/)

    await editor.focus()
    const text = await gutterAlignment(window, 0)
    const imageOnly = await gutterAlignment(window, 1)
    expect(text.focusMarkerCenter).toBeNull()
    expect(imageOnly.focusMarkerCenter).not.toBeNull()

    // Same offset from the row top as a single-line text row, for the bullet and the focus marker.
    const textOffset = text.enterControlCenter - text.rowTop
    expect(Math.abs(imageOnly.enterControlCenter - imageOnly.rowTop - textOffset)).toBeLessThanOrEqual(1)
    expect(Math.abs((imageOnly.focusMarkerCenter as number) - imageOnly.enterControlCenter)).toBeLessThanOrEqual(1)

    // That position sits beside the image's top edge: within the image, above its middle.
    const imageTop = imageOnly.imageTop as number
    expect(imageOnly.enterControlCenter).toBeGreaterThanOrEqual(imageTop)
    expect(imageOnly.enterControlCenter).toBeLessThan(imageOnly.imageCenter as number)
  })
})
