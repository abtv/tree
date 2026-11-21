// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { attachmentPath, expect, launchTree, seedDocument, test } from './fixtures'
import { solidPng } from './solid-png'

const ROWS = 600

interface Sample {
  readonly top: number | null
  /** Animation frames in which the value was on screen; zero means it was never painted. */
  frames: number
}

/**
 * Records every distinct top of a row at each DOM mutation, image load and animation frame, as in the
 * TD-002 survey. The first sample is the position before the command.
 */
async function startProbe(window: Page, rowId: string): Promise<void> {
  await window.evaluate((id) => {
    const probe = { samples: [] as Sample[], stopped: false }
    const sample = (frame: boolean): void => {
      const top = document.querySelector(`[data-node-id="${id}"]`)?.getBoundingClientRect().top
      const value = top === undefined ? null : Math.round(top)
      const last = probe.samples[probe.samples.length - 1]
      if (last === undefined || last.top !== value) probe.samples.push({ top: value, frames: frame ? 1 : 0 })
      else if (frame) last.frames += 1
    }
    sample(false)
    new MutationObserver(() => sample(false)).observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    document.addEventListener('load', () => sample(false), true)
    const frame = (): void => {
      if (probe.stopped) return
      sample(true)
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    ;(globalThis as unknown as { __rowProbe: typeof probe }).__rowProbe = probe
  }, rowId)
}

/** The painted positions after the command, in order. */
async function paintedTops(window: Page): Promise<number[]> {
  const samples = await window.evaluate(() => {
    const probe = (globalThis as unknown as { __rowProbe: { samples: Sample[]; stopped: boolean } }).__rowProbe
    probe.stopped = true
    return probe.samples
  })
  return samples
    .slice(1)
    .filter((sample) => sample.top !== null && sample.frames > 0)
    .map((sample) => sample.top!)
}

function rows(image: { index: number; id: string; parent?: boolean }) {
  return Array.from({ length: ROWS }, (_, index) => {
    const row = { id: `row-${index}`, text: `Row ${index}`, children: [] as unknown[] }
    if (index !== image.index) return row
    const node = {
      id: image.id,
      text: 'Picture',
      attachment: { id: 'picture', mimeType: 'image/png', width: 160, height: 160 },
      children: [],
    }
    return image.parent === true ? { ...row, children: [node] } : node
  })
}

function seedPicture(userDataDir: string): void {
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(attachmentPath(userDataDir, 'picture'), solidPng(160, 160))
}

async function settledImage(window: Page, nodeId: string): Promise<void> {
  const image = window.locator(`[data-node-id="${nodeId}"] img.attachment-image`)
  await expect(image).toHaveJSProperty('complete', true)
  await expect(image).toHaveJSProperty('naturalWidth', 160)
  // Let several animation frames paint the loaded image.
  await window.waitForTimeout(300)
}

test.describe('Image space reserved from the stored size', () => {
  // @requirement PRODUCT.md §17.1
  test('zo opens a branch whose image never displayed without moving the row below it again', async ({
    userDataDir,
  }) => {
    seedPicture(userDataDir)
    seedDocument(userDataDir, {
      document: { roots: rows({ index: 2, id: 'picture-node', parent: true }) },
      location: { currentParentId: null, selectedNodeId: 'row-2' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await expect(window.locator('[data-node-id="row-3"]')).toBeVisible()

    await startProbe(window, 'row-3')
    await window.keyboard.press('z')
    await window.keyboard.press('o')
    await settledImage(window, 'picture-node')

    const tops = await paintedTops(window)

    expect(tops.length).toBeGreaterThan(0)
    expect(tops).toEqual([tops[0]])
  })

  // @requirement PRODUCT.md §17.1
  test('G to the last of 600 rows keeps it in place while an image nine rows above loads', async ({ userDataDir }) => {
    seedPicture(userDataDir)
    seedDocument(userDataDir, {
      document: { roots: rows({ index: ROWS - 10, id: 'picture-node' }) },
      location: { currentParentId: null, selectedNodeId: 'row-0' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await expect(window.locator('[data-node-id="row-0"]')).toBeVisible()
    await expect(window.locator('[data-node-id="picture-node"]')).toHaveCount(0)

    await startProbe(window, `row-${ROWS - 1}`)
    await window.keyboard.press('G')
    await settledImage(window, 'picture-node')

    const tops = await paintedTops(window)

    expect(tops.length).toBeGreaterThan(0)
    expect(tops).toEqual([tops[0]])
  })
})
