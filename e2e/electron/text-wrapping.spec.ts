// @editing-modes: independent
import { expect, launchTree, node, parent, setMainWindowContentSize, test } from './fixtures'

function metrics(locator: ReturnType<typeof node>) {
  return locator.evaluate((element) => {
    const field = element as HTMLTextAreaElement
    return {
      value: field.value,
      height: field.getBoundingClientRect().height,
      clientWidth: field.clientWidth,
      scrollWidth: field.scrollWidth,
    }
  })
}

test.describe('long text wrapping', () => {
  // @requirement PRODUCT.md §2.1
  test('caps text at 120 character cells in a wide window and wraps earlier in a narrow one', async ({
    userDataDir,
  }) => {
    const { app, window } = await launchTree(userDataDir)

    await setMainWindowContentSize(app, { width: 1600, height: 800 })
    await node(window, 1).fill('x'.repeat(120))

    const wide = await metrics(node(window, 1))

    expect(wide.height).toBe(20)
    const width = await node(window, 1).evaluate((element) => {
      const style = getComputedStyle(element)
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      context.font = `${style.fontSize} ${style.fontFamily}`
      return {
        text:
          element.getBoundingClientRect().width -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight),
        limit: context.measureText('x'.repeat(120)).width,
        viewport: innerWidth,
      }
    })

    expect(width.viewport).toBeGreaterThan(width.limit + 100)
    expect(width.text).toBeCloseTo(width.limit, 0)

    await node(window, 1).fill('x'.repeat(121))

    expect((await metrics(node(window, 1))).height).toBe(40)

    await setMainWindowContentSize(app, { width: 640, height: 800 })

    await expect.poll(async () => (await metrics(node(window, 1))).clientWidth).toBeLessThan(wide.clientWidth)
    expect((await metrics(node(window, 1))).height).toBeGreaterThan(40)
    await expect(node(window, 1)).toHaveValue('x'.repeat(121))
  })

  test('wraps a long node so the whole text is shown without horizontal overflow', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(6).trim()

    await node(window, 1).fill(text)

    const box = await metrics(node(window, 1))

    expect(box.value).toBe(text)
    expect(box.height).toBeGreaterThan(30)
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1)
  })

  test('breaks a long unbroken string instead of overflowing', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await node(window, 1).fill('x'.repeat(400))

    const box = await metrics(node(window, 1))

    expect(box.height).toBeGreaterThan(30)
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1)
  })

  test('wraps the current parent heading', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await node(window, 1).fill('Heading '.repeat(20).trim())
    await window.keyboard.press('Meta+.')

    const box = await metrics(parent(window))

    expect(box.height).toBeGreaterThan(40)
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1)
  })

  test('wrapped text still creates a sibling on Enter', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await node(window, 1).fill('line '.repeat(40).trim())
    await window.keyboard.press('Enter')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
  })
})
