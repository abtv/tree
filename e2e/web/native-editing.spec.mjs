// @editing-modes: independent
import { test, expect, capture } from './fixtures.mjs'

// @requirement PRODUCT.md §1.4
// Real browser events exercise the browser-only App policy, including all three rich-input sites.
test('preserves native editing across modes and input scopes', async ({ newContext, baseURL }) => {
  const context = await newContext({ viewport: { width: 1100, height: 760 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL)
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  await page.evaluate(async () => {
    await window.treeApi.save({
      version: 1,
      document: {
        roots: [
          {
            id: 'parent',
            text: '2026-10-18 Parent',
            children: [
              { id: 'first', text: '2026-10-18 Alpha café 😀', children: [] },
              { id: 'second', text: '2026-10-18 Beta', children: [] },
            ],
          },
        ],
      },
      location: { currentParentId: 'parent', selectedNodeId: 'first' },
    })
    await window.treeApi.setVimEnabled(true)
  })
  await page.reload()
  await page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
  const field = (scope) =>
    scope === 'parent'
      ? page.getByRole('textbox', { name: 'Current parent', exact: true })
      : page.locator(`.${scope === 'agenda' ? 'agenda' : 'node'}-row[data-node-id="first"] .node-input`)
  const mode = async (label, editable) => {
    await expect(page.getByLabel('Vim mode')).toHaveText(label)
    expect(await page.evaluate(() => document.activeElement.isContentEditable)).toBe(editable)
    expect(
      await page.evaluate(() => document.activeElement === window.nativeEditingField),
      'Mode change replaced focus',
    ).toBeTruthy()
  }
  for (const scope of ['tree', 'parent', 'agenda']) {
    if (scope === 'agenda') await page.keyboard.press('Meta+p')
    const input = field(scope)
    await input.click()
    await input.evaluate((element) => {
      window.nativeEditingField = element
    })
    await mode('NORMAL', false)
    const original = await input.innerText()
    await page.keyboard.press('0')
    await page.keyboard.press('i')
    await mode('INSERT', true)
    await page.keyboard.type('Probe ')
    await page.keyboard.press('Escape')
    await mode('NORMAL', false)
    await expect(input).toHaveText('Probe ' + original)
    await page.keyboard.press('u')
    await expect(input).toHaveText(original)
    await page.keyboard.press('0')
    await page.keyboard.press('R')
    await mode('REPLACE', true)
    await page.keyboard.type('Z')
    await page.keyboard.press('Escape')
    await mode('NORMAL', false)
    await expect(input).not.toHaveText(original)
    await page.keyboard.press('u')
    await expect(input).toHaveText(original)
    await page.keyboard.type('0vl')
    await mode('VISUAL', false)
    expect(await page.evaluate(() => getSelection().toString())).toBe(original.slice(0, 2))
    await page.keyboard.press('Escape')
    await mode('NORMAL', false)
  }
  // Return to Tree; whole-node Visual does not need a native editing host either.
  await page.keyboard.press('Meta+p')
  const input = field('tree')
  await input.click()
  await page.keyboard.press('V')
  await page.keyboard.press('j')
  await expect(page.locator('.node-row-visual-selected')).toHaveCount(2)
  expect(await page.evaluate(() => document.activeElement.isContentEditable)).toBe(false)
  await page.keyboard.press('Escape')
  await input.click()
  // Double-click selection and a held drag both start on the non-editable field.
  await input.dblclick({ position: { x: 120, y: 10 } })
  expect((await page.evaluate(() => getSelection().toString())).length > 1).toBeTruthy()
  await page.keyboard.press('Escape')
  const box = await input.boundingBox()
  await page.mouse.move(box.x + 15, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.locator('body')).toHaveClass(/node-drag-active/)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('body')).not.toHaveClass(/node-drag-active/)
  await expect(input).toBeFocused()
  // Disabling Vim completes a buffered Replace session and makes the same field natively editable.
  const beforeReplace = await input.innerText()
  await page.keyboard.type('0RZ')
  await page.evaluate(() => window.treeApi.setVimEnabled(false))
  await expect(page.getByLabel('Vim mode')).toHaveCount(0)
  await expect(input).toHaveAttribute('contenteditable', 'true')
  await expect(input).toBeFocused()
  await page.keyboard.press('Meta+z')
  await expect(input).toHaveText(beforeReplace)
  await input.fill('2026-10-18 Typed é 😀 after switching')
  await test.step('copies, cuts and pastes through headless Chrome virtual clipboard', async () => {
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Meta+c')
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('2026-10-18 Typed é 😀 after switching')
    await page.keyboard.press('Meta+x')
    await expect(input).toHaveText('')
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('2026-10-18 Typed é 😀 after switching')
    await page.keyboard.press('Meta+v')
    await expect(input).toHaveText('2026-10-18 Typed é 😀 after switching')
  })
  await page.evaluate(() => window.prototypeStore.flushPersistence())
  await page.reload()
  await expect(field('tree')).toHaveText('2026-10-18 Typed é 😀 after switching')
  await expect(field('tree')).toHaveAttribute('contenteditable', 'true')
  await capture(page, 'chrome-standard.png')
  expect(errors).toEqual([])
})
