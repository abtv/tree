// @editing-modes: independent
import type { ElectronApplication, Page, TestInfo } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, launchTree, seedDocument, setAgendaToday, setMainWindowContentSize, test } from './fixtures'

// Pixel checks deliberately use dense synthetic text in light appearance. Every 48px band in
// the central viewport must contain ink; the toolbar, fades, scrollbar and end padding are excluded.
// Screencast is sampled compositor output, not a guarantee of observing every displayed frame.
async function capture(
  app: ElectronApplication,
  page: Page,
  info: TestInfo,
  stage: string,
  action: () => Promise<void>,
): Promise<void> {
  const session = await page.context().newCDPSession(page)
  const frames: string[] = []
  const acknowledgements: Promise<unknown>[] = []
  let overflow = false
  session.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
    if (frames.length < 180) frames.push(frame.data)
    else overflow = true
    acknowledgements.push(session.send('Page.screencastFrameAck', { sessionId: frame.sessionId }))
  })
  try {
    await session.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
    await expect.poll(() => frames.length).toBeGreaterThan(0)
    const before = frames.length

    await action()

    await expect.poll(() => frames.length).toBeGreaterThan(before)
    await session.send('Page.stopScreencast')
    await Promise.all(acknowledgements)
    expect(overflow, 'Capture must remain bounded without silently discarding frames').toBe(false)

    const failures = await app.evaluate(({ nativeImage }, images) => {
      return images.flatMap((data, index) => {
        const image = nativeImage.createFromBuffer(Buffer.from(data, 'base64'))
        const { width, height } = image.getSize()
        if (width < 600 || height < 400) return [{ index, band: -1 }]
        const bitmap = image.toBitmap()
        const missing: { index: number; band: number }[] = []
        for (let top = 120; top < 312; top += 48) {
          let ink = 0
          for (let y = top; y < top + 48; y++) {
            for (let x = 100; x < 480; x++) {
              const offset = (y * width + x) * 4
              if (Math.min(bitmap[offset]!, bitmap[offset + 1]!, bitmap[offset + 2]!) < 150) ink++
            }
          }
          if (ink < 30) missing.push({ index, band: top })
        }
        return missing
      })
    }, frames)
    const reportPath = info.outputPath(`${stage}-frames.json`)
    writeFileSync(reportPath, JSON.stringify({ captured: frames.length, failures }))
    await info.attach(`${stage}-frames`, { path: reportPath, contentType: 'application/json' })
    for (const index of new Set([0, frames.length - 1, ...failures.map((failure) => failure.index)])) {
      const path = info.outputPath(`${stage}-${index}.png`)
      writeFileSync(path, Buffer.from(frames[index]!, 'base64'))
      await info.attach(`${stage}-${index}`, { path, contentType: 'image/png' })
    }
    expect(failures, `${stage}: every captured central band must contain painted content`).toEqual([])
  } finally {
    await session.detach()
  }
}

for (const view of ['Tree', 'Agenda'] as const) {
  // @requirement PRODUCT.md §20.1
  // @requirement PRODUCT.md §23.6
  test(`${view} paints continuous content during wheel reversal, resize and delayed image growth`, async ({
    userDataDir,
  }, info) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 1000 }, (_, index) => ({
          id: `n${index}`,
          text: `2026-10-08 Synthetic row ${index} ${'Readable wrapped content. '.repeat(3 + (index % 4))}`,
          ...(index === 999 ? { attachment: { id: 'late', mimeType: 'image/png' } } : {}),
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', appearance: 'light' })
    await window.emulateMedia({ colorScheme: 'light' })
    await setMainWindowContentSize(app, { width: 640, height: 500 })
    const image = await app.evaluate(({ nativeImage }) => {
      let release!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      ;(globalThis as unknown as { releaseScrollImage: () => void }).releaseScrollImage = release
      globalThis.__treeIpc.wrap('tree:read-attachment', async (invoke, ...args) => {
        await pending
        return invoke(...args)
      })
      return nativeImage
        .createFromBitmap(Buffer.alloc(200 * 150 * 4, 80), { width: 200, height: 150 })
        .toPNG()
        .toString('base64')
    })
    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(join(userDataDir, 'data', 'attachments', 'late.png'), Buffer.from(image, 'base64'))
    if (view === 'Agenda') {
      await setAgendaToday(window)
      await window.keyboard.press('Meta+p')
      await window.keyboard.press('Escape')
      await window.keyboard.press('j')
    }
    const editor = window.locator('.node-input:focus')
    await expect(editor).toContainText('Synthetic row 0')
    await window.mouse.move(400, 250)

    await capture(app, window, info, 'wheel', async () => {
      for (const delta of [600, 600, 600, 600, -600, -600, 600, -600]) {
        const scrollTop = () => window.locator('.scroll-viewport').evaluate((element) => element.scrollTop)
        const before = await scrollTop()
        await window.mouse.wheel(0, delta)
        // Sustain the gesture across compositor updates rather than checking only its final state.
        await window.waitForTimeout(35)
        if (delta > 0) await expect.poll(scrollTop).toBeGreaterThan(before)
        else await expect.poll(scrollTop).toBeLessThan(before)
      }
    })
    await expect(editor).toContainText('Synthetic row 0')

    await capture(app, window, info, 'resize', async () => {
      await setMainWindowContentSize(app, { width: 800, height: 600 })
      await window.mouse.wheel(0, 800)
      await setMainWindowContentSize(app, { width: 640, height: 500 })
      await window.mouse.wheel(0, -800)
    })
    await expect(editor).toContainText('Synthetic row 0')

    await window.keyboard.press('G')
    if (view === 'Agenda') await window.getByRole('textbox', { name: 'Agenda node n999', exact: true }).focus()
    await expect(editor).toContainText('Synthetic row 999')
    const row = window.locator(view === 'Tree' ? '.node-row[data-node-id="n999"]' : '.agenda-row[data-node-id="n999"]')
    const beforeImage = await row.evaluate((element) => element.getBoundingClientRect().height)
    await capture(app, window, info, 'image', async () => {
      await app.evaluate(() => (globalThis as unknown as { releaseScrollImage: () => void }).releaseScrollImage())
      await expect(window.getByAltText('Attached image')).toBeVisible()
      await expect
        .poll(() => row.evaluate((element) => element.getBoundingClientRect().height))
        .toBeGreaterThan(beforeImage + 100)
      await window.mouse.wheel(0, -150)
    })
    await expect(editor).toContainText('Synthetic row 999')

    // This painted obstruction leaves row geometry intact. The pixel detector must reject an
    // internal blank band even though both the topmost and bottommost rows remain visible.
    await expect(
      capture(app, window, info, 'negative-control', async () => {
        await window.evaluate(() => {
          const mask = document.createElement('div')
          mask.id = 'scroll-test-mask'
          mask.style.cssText =
            'position:fixed;left:100px;top:168px;width:380px;height:48px;background:white;z-index:99999'
          document.body.append(mask)
        })
      }),
    ).rejects.toThrow('every captured central band must contain painted content')
    await window.evaluate(() => document.getElementById('scroll-test-mask')?.remove())
  })
}
