// @editing-modes: both
import {
  closeApp,
  configureHiddenParallelTests,
  describeForEachEditingMode,
  expect,
  launchTree,
  node,
  seedDocument,
  test,
} from './fixtures'

configureHiddenParallelTests()

describeForEachEditingMode('screenshot rasterization stability', () => {
  test('captures CSS and image colors in sRGB', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const colors = [
      [251, 248, 241],
      [200, 90, 40],
    ]
    await window.evaluate((colors) => {
      const swatches = document.createElement('div')
      swatches.id = 'screenshot-color-swatches'
      Object.assign(swatches.style, { position: 'fixed', inset: '0 auto auto 0', display: 'flex', zIndex: '9999' })
      for (const color of colors) {
        const css = document.createElement('div')
        Object.assign(css.style, { width: '20px', height: '20px', background: `rgb(${color.join(',')})` })
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 20
        const context = canvas.getContext('2d')!
        context.fillStyle = `rgb(${color.join(',')})`
        context.fillRect(0, 0, 20, 20)
        const image = document.createElement('img')
        image.src = canvas.toDataURL()
        swatches.append(css, image)
      }
      document.body.append(swatches)
    }, colors)
    const screenshot = await window.locator('#screenshot-color-swatches').screenshot()
    // Compare encoded channel values, as Playwright's PNG comparator does. NativeImage would
    // otherwise apply an embedded display profile and conceal a non-sRGB screenshot.
    const chunks = [screenshot.subarray(0, 8)]
    for (let offset = 8; offset < screenshot.length;) {
      const end = offset + screenshot.readUInt32BE(offset) + 12
      const kind = screenshot.toString('ascii', offset + 4, offset + 8)
      if (['IHDR', 'IDAT', 'IEND'].includes(kind)) chunks.push(screenshot.subarray(offset, end))
      offset = end
    }
    const actual = await app.evaluate(({ nativeImage }, encoded) => {
      const image = nativeImage.createFromBuffer(Buffer.from(encoded, 'base64'))
      const pixels = image.toBitmap()
      const width = image.getSize().width
      return [10, 30, 50, 70].map((x) => {
        const offset = (10 * width + x) * 4
        return [pixels[offset + 2], pixels[offset + 1], pixels[offset]]
      })
    }, Buffer.concat(chunks).toString('base64'))

    expect(actual).toEqual(colors.flatMap((color) => [color, color]))
  })

  test('keeps repeated screenshots identical across startup display scales', async ({ userDataDir }) => {
    const references = new Map<string, Buffer>()
    const scales: number[] = []
    for (const initialDeviceScaleFactor of [2, 1, 2] as const) {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'a', text: 'a -> b => c != d == e <= f >= g :: h // i', children: [] },
            {
              id: 'b',
              text: 'Read https://example.com',
              links: [{ start: 5, end: 24, url: 'https://example.com' }],
              children: [],
            },
            { id: 'c', text: 'Write the report', struckThrough: true, children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'a' },
      })
      const { app, window } = await launchTree(userDataDir, { initialDeviceScaleFactor })

      expect(await app.evaluate(({ app }) => app.commandLine.getSwitchValue('force-device-scale-factor'))).toBe('1')

      scales.push(await window.evaluate(() => devicePixelRatio))
      const list = window.locator('.node-list')
      for (const appearance of ['light', 'dark'] as const) {
        await window.emulateMedia({ colorScheme: appearance })
        for (let sample = 0; sample < 3; sample += 1) {
          const actual = await list.screenshot({ caret: 'hide', animations: 'disabled', scale: 'css' })
          references.set(appearance, references.get(appearance) ?? actual)
          if (sample === 0)
            await test
              .info()
              .attach(`scale-${initialDeviceScaleFactor}-${appearance}`, { body: actual, contentType: 'image/png' })

          expect(
            actual.equals(references.get(appearance)!),
            `${appearance}, startup scale ${initialDeviceScaleFactor}, capture ${sample}`,
          ).toBe(true)
        }
      }

      // The exact image guard must still detect a real glyph-placement change.
      await node(window, 1).evaluate((element) => {
        ;(element as HTMLElement).style.translate = '1px 0'
      })
      const shifted = await list.screenshot({ caret: 'hide', animations: 'disabled', scale: 'css' })

      expect(shifted.equals(references.get('dark')!)).toBe(false)

      await closeApp(app)
    }

    expect(scales).toEqual([1, 1, 1])
  })
})
