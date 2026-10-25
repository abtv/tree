// @editing-modes: vim
import { expect, launchTree, seedDocument, setMainWindowContentSize, test } from './fixtures'
import { caretGeometry } from './caret-line-geometry'

for (const rich of [false, true]) {
  // @requirement PRODUCT.md §20.2.9
  // @requirement PRODUCT.md §20.8
  test(`repeated j/k reveals one text line through wrapped and oversized ${rich ? 'rich' : 'plain'} nodes`, async ({
    userDataDir,
  }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 1000 }, (_, index) => {
          const text =
            index === 12
              ? 'Tall synthetic note with readable words. '.repeat(100)
              : index % 4 === 2
                ? 'Wrapped synthetic note. '.repeat(12)
                : `Row ${index}`
          return {
            id: `n${index}`,
            text,
            children: [],
            ...(rich ? { links: [{ start: 0, end: 3, url: 'https://example.test' }] } : {}),
          }
        }),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })

    await setMainWindowContentSize(app, { width: 680, height: 520 })
    let previous = await caretGeometry(window)
    let captured = false
    for (const key of ['j', 'k']) {
      for (let index = 0; index < 130; index++) {
        await window.keyboard.down(key)
        await window.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
        const current = await caretGeometry(window)

        expect(current.top >= 24 || current.scroll === 0, JSON.stringify(current)).toBe(true)
        expect(current.bottom >= 24 || current.scroll >= current.max - 1, JSON.stringify(current)).toBe(true)

        const delta = current.scroll - previous.scroll

        expect(key === 'j' ? delta : -delta).toBeGreaterThanOrEqual(-1)
        // One display line or a single-line row; document-edge snapping may add two contexts.
        expect(Math.abs(delta)).toBeLessThanOrEqual(76)

        if (!captured && key === 'j' && current.id === 'n12' && current.offset > 2000) {
          await window.screenshot({ path: testInfo.outputPath('oversized-caret-visible.png') })
          captured = true
        }
        previous = current
      }
      await window.keyboard.up(key)
    }

    expect(captured).toBe(true)
    expect(previous.id).toBe('n0')
    expect(previous.offset).toBe(0)

    await window.keyboard.press('8')
    await window.keyboard.press('0')
    await window.keyboard.press('0')
    await window.keyboard.press('j')
    await window.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    const counted = await caretGeometry(window)

    expect(counted.id).not.toBe('n0')
    expect(counted.top).toBeGreaterThanOrEqual(24)
    expect(counted.bottom).toBeGreaterThanOrEqual(24)

    await setMainWindowContentSize(app, { width: 600, height: 460 })

    await expect
      .poll(async () => {
        const resized = await caretGeometry(window)
        return resized.top >= 24 && resized.bottom >= 24
      })
      .toBe(true)

    for (const key of ['J', 'K']) {
      await window.keyboard.press(key)

      await expect
        .poll(async () => {
          const moved = await caretGeometry(window)
          return moved.top >= 24 && moved.bottom >= 24
        })
        .toBe(true)
    }

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })
}
