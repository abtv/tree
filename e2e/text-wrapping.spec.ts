import { expect, launchTree, node, parent, test } from './fixtures'

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
