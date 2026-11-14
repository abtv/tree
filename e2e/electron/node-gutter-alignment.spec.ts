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

// Layout relationships supplement the painted regression images below. Equal DOM centers alone
// do not establish optical alignment or correct subpixel rasterization (PRODUCT.md §2.1).
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
  // @requirement PRODUCT.md §2.1.1
  test('preserves painted markers with emoji, nesting and focus at both pixel densities', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'parent', text: 'Feature Ideas', children: [{ id: 'child', text: 'Search', children: [] }] },
          { id: 'emoji', text: '📥 Inbox — Meetings', children: [{ id: 'nested', text: 'Roadmap', children: [] }] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.locator('[data-node-id="parent"] .node-disclosure-triangle').click()
    await window.keyboard.press('Control+l')
    await window.locator('.node-input').evaluateAll((inputs) => {
      for (const input of inputs) (input as HTMLElement).style.setProperty('caret-animation', 'manual')
    })
    const session = await window.context().newCDPSession(window)
    const size = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }))

    try {
      for (const scale of [1, 2]) {
        await session.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: scale, mobile: false })
        await expect.poll(() => window.evaluate(() => devicePixelRatio)).toBe(scale)
        for (const appearance of ['light', 'dark'] as const) {
          await window.emulateMedia({ colorScheme: appearance })
          for (const selected of ['parent', 'child']) {
            await window.locator(`[data-node-id="${selected}"] .node-input`).focus()
            await window.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

            if (selected === 'parent') {
              const region = await window.locator('[data-node-id="parent"]').evaluate((row) => {
                const circle = row.querySelector('.node-enter-control')!
                const bounds = circle.getBoundingClientRect()
                return {
                  clip: { x: bounds.left - 1, y: row.getBoundingClientRect().top, width: 19, height: 20 },
                  color: getComputedStyle(circle)
                    .backgroundColor.match(/[\d.]+/g)!
                    .slice(0, 3)
                    .map(Number),
                  pointColor: getComputedStyle(row.querySelector('.node-focus-marker')!)
                    .backgroundColor.match(/[\d.]+/g)!
                    .slice(0, 3)
                    .map(Number),
                }
              })
              const pixels = await session.send('Page.captureScreenshot', {
                format: 'png',
                clip: { ...region.clip, scale: 1 },
                fromSurface: true,
                captureBeyondViewport: true,
              })
              const painted = await app.evaluate(
                ({ nativeImage }, { encoded, color, pointColor }) => {
                  const image = nativeImage.createFromBuffer(Buffer.from(encoded, 'base64'))
                  const { width, height } = image.getSize()
                  const bitmap = image.toBitmap()
                  const background = [bitmap[2]!, bitmap[1]!, bitmap[0]!]
                  const center = (foreground: number[], background: number[]) => {
                    const direction = foreground.map((value, index) => value - background[index]!)
                    const norm = direction.reduce((sum, value) => sum + value * value, 0)
                    let mass = 0
                    let moment = 0
                    // Sample the circle's vertical axis, excluding the notebook grid near its sides.
                    const radius = width / 19
                    for (let y = 0; y < height; y++)
                      for (let x = Math.floor(width / 2 - radius); x <= Math.floor(width / 2 + radius); x++) {
                        const offset = (y * width + x) * 4
                        const rgb = [bitmap[offset + 2]!, bitmap[offset + 1]!, bitmap[offset]!]
                        const alpha = Math.max(
                          0,
                          Math.min(
                            1,
                            rgb.reduce(
                              (sum, value, index) => sum + (value - background[index]!) * direction[index]!,
                              0,
                            ) / norm,
                          ),
                        )
                        mass += alpha
                        moment += alpha * (y + 0.5)
                      }
                    return moment / mass
                  }
                  return { center: center(color, background), pointCenter: center(pointColor, color), height, width }
                },
                { encoded: pixels.data, color: region.color, pointColor: region.pointColor },
              )

              expect(painted.width).toBe(19 * scale)
              expect(painted.height).toBe(20 * scale)
              expect(Math.abs(painted.center - painted.height / 2)).toBeLessThan(0.12 * scale)
              expect(Math.abs(painted.pointCenter - painted.height / 2)).toBeLessThan(0.12 * scale)
            }

            const bounds = await window.locator('.node-list').boundingBox()
            const screenshot = await session.send('Page.captureScreenshot', {
              format: 'png',
              clip: { ...bounds!, scale: 1 },
              fromSurface: true,
              captureBeyondViewport: true,
            })
            expect(Buffer.from(screenshot.data, 'base64')).toMatchSnapshot(
              screenshotName(`painted-gutter-${scale}x-${appearance}-${selected}.png`),
              { threshold: 0.02, maxDiffPixels: 0 },
            )
          }
        }
      }
    } finally {
      await session.send('Emulation.clearDeviceMetricsOverride')
      await session.detach()
    }
  })

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
