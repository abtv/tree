// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { attachmentPath, expect, launchTree, seedDocument, test } from './fixtures'

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function solidPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

test.describe('Layout stability when leaving a node', () => {
  // @requirement PRODUCT.md §7.1
  test('keeps the rows below an image in place while Ctrl+o restores the parent level', async ({ userDataDir }) => {
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(attachmentPath(userDataDir, 'img1'), solidPng(200, 120))
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'inbox', text: 'Inbox', children: [{ id: 'item', text: 'Item', children: [] }] },
          { id: 'image', text: '', attachment: { id: 'img1', mimeType: 'image/png' }, children: [] },
          { id: 'last', text: 'Last row', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'inbox' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const lastRow = window.locator('[data-node-id="last"]')
    await expect(window.getByAltText('Attached image')).toBeVisible()
    const settledTop = (await lastRow.boundingBox())?.y

    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(window.locator('.node-row')).toHaveCount(1)
    // A hidden window on a loaded CI runner can go without animation frames, so the layout is
    // sampled at every DOM mutation and image load instead; reading the rectangle forces layout.
    await window.evaluate(() => {
      const observed = globalThis as unknown as { __lastRowTops: number[]; __sampleLastRowTop: () => void }
      observed.__lastRowTops = []
      observed.__sampleLastRowTop = (): void => {
        const top = document.querySelector('[data-node-id="last"]')?.getBoundingClientRect().top
        const tops = observed.__lastRowTops
        if (top !== undefined && tops[tops.length - 1] !== Math.round(top)) tops.push(Math.round(top))
      }
      new MutationObserver(observed.__sampleLastRowTop).observe(document.body, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      })
      document.addEventListener('load', observed.__sampleLastRowTop, true)
    })
    await window.keyboard.press('Control+o')
    await expect(window.getByAltText('Attached image')).toBeVisible()
    await window.waitForTimeout(300)

    const tops = await window.evaluate(() => {
      const observed = globalThis as unknown as { __lastRowTops: number[]; __sampleLastRowTop: () => void }
      observed.__sampleLastRowTop()
      return observed.__lastRowTops
    })
    expect(tops).toEqual([Math.round(settledTop ?? -1)])
  })
})
