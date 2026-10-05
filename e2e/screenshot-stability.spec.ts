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
