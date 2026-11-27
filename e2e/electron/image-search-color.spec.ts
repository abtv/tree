// @editing-modes: independent
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chunk } from '../../src/shared/png-test-utils'
import { attachmentPath, expect, launchTree, seedDocument, test } from './fixtures'

function withChromaticities(bytes: Buffer): Buffer {
  const result = [bytes.subarray(0, 8)]
  const values = Buffer.alloc(32)
  const displayP3 = [31270, 32900, 68000, 32000, 26500, 69000, 15000, 6000]
  displayP3.forEach((value, index) => values.writeUInt32BE(value, index * 4))
  const gamma = Buffer.alloc(4)
  gamma.writeUInt32BE(45455)

  for (let offset = 8; offset + 12 <= bytes.length;) {
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const next = offset + bytes.readUInt32BE(offset) + 12
    if (type === 'iCCP') {
      result.push(Buffer.from(chunk('cHRM', [...values])), Buffer.from(chunk('gAMA', [...gamma])))
    } else if (!['cHRM', 'gAMA', 'sRGB', 'cICP'].includes(type)) {
      result.push(bytes.subarray(offset, next))
    }
    offset = next
  }
  return Buffer.concat(result)
}

for (const metadata of ['ICC profile', 'chromaticities and gamma'] as const) {
  // @requirement PRODUCT.md §20.14.2
  test(`preserves Display P3 color in a reduced Search thumbnail (${metadata})`, async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'branch',
            text: 'Synthetic attachments',
            children: [
              {
                id: 'picture',
                text: 'Wide gamut screenshot',
                children: [],
                attachment: { id: 'image', mimeType: 'image/png', width: 800, height: 240 },
              },
            ],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'branch' },
    })
    const { window } = await launchTree(userDataDir)
    const encoded = await window.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 240
      const context = canvas.getContext('2d', { colorSpace: 'display-p3' })!
      if (context.getContextAttributes().colorSpace !== 'display-p3') throw new Error('Test platform has no P3 canvas')
      context.fillStyle = 'color(display-p3 0 1 0)'
      context.fillRect(0, 0, 800, 240)
      return canvas.toDataURL().split(',')[1]!
    })
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    const bytes = Buffer.from(encoded, 'base64')
    writeFileSync(attachmentPath(userDataDir, 'image'), metadata === 'ICC profile' ? bytes : withChromaticities(bytes))
    const popup = window.getByRole('dialog', { name: 'Search' })
    const input = popup.getByRole('searchbox')
    const thumbnail = popup.getByRole('img', { name: 'Attached image' })
    await window.keyboard.press('Meta+;')
    await input.fill('Wide gamut screenshot')
    await expect(thumbnail).toBeVisible()
    await expect(thumbnail).toHaveJSProperty('width', 240)

    const sample = (source: Element): number[] => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d', { colorSpace: 'display-p3' })!
      context.drawImage(source as HTMLImageElement | HTMLCanvasElement, 0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const reduced = await thumbnail.evaluate(sample)
    await input.press('Enter')
    const original = window.locator('[data-node-id="picture"] img.attachment-image')
    await expect(original).toHaveJSProperty('naturalWidth', 800)
    const full = await original.evaluate(sample)

    expect(full).toEqual([0, 255, 0, 255])
    expect(reduced.every((channel, index) => Math.abs(channel - full[index]!) <= 2)).toBe(true)
  })
}
