// @editing-modes: independent
import { expect, launchTree, seedDocument, test } from './fixtures'
import { appearanceCommands } from '../../src/application/command-registry'

const appearances = appearanceCommands.map(([, value]) => value).filter((value) => value !== 'system')

// @requirement PRODUCT.md §20.14
test('styles query markers while preserving native selection, scrolling, completion and clear', async ({
  userDataDir,
}, testInfo) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'a', text: '@me #work &review local', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'a' },
  })
  const { window, app } = await launchTree(userDataDir)
  await window.keyboard.press('Meta+;')
  const input = window.getByRole('searchbox')
  const mirror = window.locator('.node-search-input-mirror')
  await input.fill('@me #work &review local')

  for (const appearance of appearances) {
    await window.evaluate((value) => globalThis.window.treeApi.setAppearance(value), appearance)
    const dark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
    await window.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
    await expect(window.locator('html')).toHaveAttribute('data-appearance', appearance)
    await expect(mirror.locator('.node-search-match')).toHaveText(['@me', '#work', '&review'])
    await expect(mirror.locator('.node-search-match').first()).toHaveCSS(
      'color',
      await window
        .locator('.recent-node-text .node-search-match')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    )
    await expect(input).toBeFocused()
    await window.screenshot({ path: testInfo.outputPath(`query-${appearance}.png`) })
  }

  await input.press('Home')
  await input.press('Shift+ArrowRight')
  await input.press('Shift+ArrowRight')
  await input.press('Shift+ArrowRight')
  await expect
    .poll(() => input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]))
    .toEqual([0, 3])
  await window.screenshot({ path: testInfo.outputPath('query-selection.png') })
  await input.press('Backspace')
  await expect(input).toHaveValue(' #work &review local')
  await expect(mirror.locator('.node-search-match')).toHaveText(['#work', '&review'])

  await input.fill('@m local')
  await input.press('Home')
  await input.press('ArrowRight')
  await input.press('ArrowRight')
  await input.press('Tab')
  await expect(input).toHaveValue('@me local')
  await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(3)

  await input.fill(`@me ${'long-query '.repeat(80)}&review`)
  await input.press('End')
  await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.scrollLeft)).toBeGreaterThan(0)
  await expect
    .poll(() =>
      input.evaluate((el: HTMLInputElement) => {
        const text = el.parentElement!.querySelector('.node-search-input-mirror > span')!
        return Math.abs(new DOMMatrixReadOnly(getComputedStyle(text).transform).m41 + el.scrollLeft)
      }),
    )
    .toBeLessThan(1)
  await window.screenshot({ path: testInfo.outputPath('query-scrolled.png') })
  const visibleRight = (await mirror.boundingBox())!.x + (await mirror.boundingBox())!.width
  const markerBox = (await mirror.locator('.node-search-match').last().boundingBox())!
  expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(visibleRight + 1)

  await input.press('Home')
  await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.scrollLeft)).toBe(0)
  const box = (await input.boundingBox())!
  await input.click({ position: { x: box.width - 14, y: box.height / 2 } })
  await expect(input).toHaveValue('')
  await expect(mirror).toHaveCount(0)
  await expect(input).toBeFocused()
})

// @requirement PRODUCT.md §20.14
// @requirement PRODUCT.md §20.5
test('uses shared search emphasis for query markers, suggestions and result matches in every appearance', async ({
  userDataDir,
}, testInfo) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'a', text: '@me #team &review', children: [] },
        { id: 'b', text: '@me-too #team-a &review-more', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'a' },
  })
  const { window, app } = await launchTree(userDataDir)
  await window.keyboard.press('Meta+;')
  const input = window.getByRole('searchbox')

  for (const appearance of appearances) {
    await window.evaluate((value) => globalThis.window.treeApi.setAppearance(value), appearance)
    const dark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
    await window.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
    await expect(window.locator('html')).toHaveAttribute('data-appearance', appearance)

    for (const marker of ['@me', '#team', '&review']) {
      await input.fill(marker)
      const queryMatch = window.locator('.node-search-input-mirror .node-search-match')
      const suggestionMatch = window.locator('.node-search-tag .node-search-match').first()
      const resultMatch = window.locator('.recent-node-text .node-search-match').first()
      await expect(queryMatch).toHaveText(marker)
      await expect(suggestionMatch).toHaveText(marker)
      await expect(resultMatch).toHaveText(marker)

      for (const property of ['color', 'font-weight', 'background-color']) {
        const expected = await suggestionMatch.evaluate(
          (el, name) => getComputedStyle(el).getPropertyValue(name),
          property,
        )
        await expect(queryMatch).toHaveCSS(property, expected)
        await expect(resultMatch).toHaveCSS(property, expected)
      }
      await expect(resultMatch).toHaveCSS('text-decoration-line', 'underline')
      await window.screenshot({ path: testInfo.outputPath(`shared-${appearance}-${marker.slice(1)}.png`) })
    }
  }
})
