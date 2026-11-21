// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { attachmentPath, expect, launchTree, seedDocument, test } from './fixtures'
import { solidPng } from './solid-png'

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

  // @requirement PRODUCT.md §17.1
  test('shows a previously displayed image in the first render after Agenda closes', async ({ userDataDir }) => {
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(attachmentPath(userDataDir, 'img1'), solidPng(1600, 1000))
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'first', text: 'First', children: [] },
          { id: 'image', text: '', attachment: { id: 'img1', mimeType: 'image/png' }, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'first' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await expect(window.getByAltText('Attached image')).toBeVisible()

    await window.keyboard.press('Meta+p')

    await expect(window.locator('[data-node-id="image"]')).toHaveCount(0)

    // Mutation callbacks run before the browser paints the remounted row, so a decoded image here
    // is already part of its first frame.
    await window.evaluate(() => {
      const observed = globalThis as unknown as { __imageFirstRender: string | undefined }
      observed.__imageFirstRender = undefined
      const observer = new MutationObserver(() => {
        const row = document.querySelector('[data-node-id="image"]')
        if (row === null) return
        const image = row.querySelector<HTMLImageElement>('img.attachment-image')
        observed.__imageFirstRender =
          image === null ? 'missing' : image.complete && image.naturalWidth > 0 ? 'decoded' : 'loading'
        observer.disconnect()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await window.keyboard.press('Meta+p')

    await expect(window.getByAltText('Attached image')).toBeVisible()

    expect(
      await window.evaluate(() => (globalThis as unknown as { __imageFirstRender?: string }).__imageFirstRender),
    ).toBe('decoded')
  })
})
