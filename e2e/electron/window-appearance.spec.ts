// @editing-modes: independent
import { writeFileSync } from 'node:fs'
import { test, expect, launchTree, closeApp, seedDocument, setMainWindowContentSize } from './fixtures'

for (const appearance of ['dark', 'light'] as const) {
  test(`uses the ${appearance} document background from window creation through close`, async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir, { appearance })
    const color = appearance === 'dark' ? '#3f3f3f' : '#fbf8f1'
    const created = await app.evaluate(() => {
      return (globalThis as unknown as { __treeWindowBackgrounds: Array<{ phase: string; color: string }> })
        .__treeWindowBackgrounds
    })

    expect(created).toEqual([{ phase: 'created', color }])

    // Playwright's browser context defaults to light media independently of nativeTheme.
    await window.emulateMedia({ colorScheme: appearance })

    await expect(window.locator('html')).toHaveCSS(
      'background-color',
      appearance === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)',
    )

    const gridImage = await window
      .locator('.scroll-viewport')
      .evaluate((element) => getComputedStyle(element).backgroundImage)

    if (appearance === 'light') expect(gridImage).toContain('rgb(230, 223, 208)')
    else expect(gridImage).not.toContain('rgb(230, 223, 208)')

    await window.screenshot({ path: test.info().outputPath(`${appearance}-window.png`) })

    const opposite = appearance === 'dark' ? 'light' : 'dark'

    await app.evaluate(({ nativeTheme }, value) => {
      nativeTheme.themeSource = value as 'light' | 'dark'
    }, opposite)

    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor().toLowerCase()),
      )
      .toBe(opposite === 'dark' ? '#3f3f3f' : '#fbf8f1')

    let output = ''

    app.process().stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    await closeApp(app)

    expect(output).toContain(`[tree-test-close-background] ${opposite === 'dark' ? '#3f3f3f' : '#fbf8f1'}`)
  })

  // @requirement PRODUCT.md §20.5
  test(`keeps the ${appearance} surface in sampled frames during a delayed renderer reload`, async ({
    userDataDir,
  }, info) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'note', text: 'Synthetic note survives reload', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'note' },
    })
    const { app, window } = await launchTree(userDataDir, { appearance })
    // The Playwright page's color-scheme default is independent of Electron's nativeTheme.
    await window.emulateMedia({ colorScheme: appearance })
    const editor = window.locator('[data-node-id="note"] .node-input')
    const expected = appearance === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(251, 248, 241)'
    await expect(editor).toBeFocused()
    await expect(window.locator('html')).toHaveCSS('background-color', expected)
    await app.evaluate(() => {
      globalThis.__treeIpc.wrap('tree:load', async (forward, ...args) => {
        await new Promise((resolve) => setTimeout(resolve, 140))
        return forward(...args)
      })
    })
    const cdp = await window.context().newCDPSession(window)
    const frames: string[] = []
    const acknowledgements: Promise<unknown>[] = []
    let overflow = false
    cdp.on('Page.screencastFrame', (event: { data: string; sessionId: number }) => {
      if (frames.length < 32) frames.push(event.data)
      else overflow = true
      acknowledgements.push(cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }))
    })
    try {
      await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
      await expect.poll(() => frames.length).toBeGreaterThan(0)
      const before = frames.length

      await window.reload()

      await expect(editor).toBeFocused()
      await expect(editor).toHaveValue('Synthetic note survives reload')
      await expect.poll(() => frames.length).toBeGreaterThan(before)
      await cdp.send('Page.stopScreencast')
      await Promise.all(acknowledgements)
      expect(overflow).toBe(false)
      const tones = await app.evaluate(
        ({ nativeImage }, data) =>
          data.map((frame) => {
            const image = nativeImage.createFromBuffer(Buffer.from(frame, 'base64'))
            const { width } = image.getSize()
            // The right side of the title strip has no glyphs or controls. Sample the green channel.
            return image.toBitmap()[(12 * width + width - 20) * 4 + 1]
          }),
        frames,
      )
      for (const [index, frame] of frames.entries()) {
        writeFileSync(info.outputPath(`reload-${index}.png`), Buffer.from(frame, 'base64'))
      }
      writeFileSync(info.outputPath('reload-tones.json'), JSON.stringify({ before, tones }))
      const expectedTone = appearance === 'dark' ? 63 : 248
      expect(tones).toEqual(tones.map(() => expectedTone))
    } finally {
      await cdp.detach()
    }
  })
}

// @requirement PRODUCT.md §20.5
test('does not show the desktop outline before its bundled font can paint', async ({ userDataDir }, info) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'note', text: 'Synthetic text in the first editor', children: [] },
        { id: 'wrapped', text: 'Wiiiiiiiiii wide narrow '.repeat(8), children: [] },
        { id: 'neighbor', text: 'Neighbor after the wrapped line', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'note' },
  })
  const { app, window } = await launchTree(userDataDir, { appearance: 'light' })
  await setMainWindowContentSize(app, { width: 640, height: 560 })
  const editor = window.locator('[data-node-id="note"] .node-input')
  const neighbor = window.locator('[data-node-id="neighbor"]')
  await window.evaluate(() => document.fonts.ready)
  const originalTop = (await neighbor.boundingBox())!.y
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await window.route('**/*JetBrainsMono*.ttf', async (route) => {
    requested = true
    await gate
    await route.continue()
  })
  const cdp = await window.context().newCDPSession(window)
  try {
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

    await window.reload({ waitUntil: 'domcontentloaded' })

    await expect.poll(() => requested).toBe(true)
    await window.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    const before = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(info.outputPath('loading-font.png'), Buffer.from(before.data, 'base64'))
    expect.soft(await editor.count()).toBe(0)

    release()

    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue('Synthetic text in the first editor')
    expect(await window.evaluate(() => document.fonts.check('15px "JetBrains Mono"'))).toBe(true)
    expect((await neighbor.boundingBox())!.y).toBe(originalTop)
    await window.screenshot({ path: info.outputPath('ready-with-font.png') })
  } finally {
    release()
    await cdp.detach()
  }
})

// @requirement PRODUCT.md §20.5
test('keeps the desktop usable when its bundled font fails to load', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'note', text: 'Synthetic note with a fallback font', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'note' },
  })
  const { window } = await launchTree(userDataDir)
  let requested = false
  await window.route('**/*JetBrainsMono*.ttf', (route) => {
    requested = true
    return route.abort('failed')
  })
  const cdp = await window.context().newCDPSession(window)
  try {
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

    await window.reload()

    const editor = window.locator('[data-node-id="note"] .node-input')
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue('Synthetic note with a fallback font')
    expect(requested).toBe(true)
    expect(
      await window.evaluate(async () => {
        await document.fonts.ready
        return [...document.fonts].map((font) => font.status)
      }),
    ).toContain('error')
  } finally {
    await cdp.detach()
  }
})
