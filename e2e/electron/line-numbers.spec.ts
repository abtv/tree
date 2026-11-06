// @editing-modes: both
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  closeApp,
  describeForEachEditingMode,
  expect,
  fireIdleSave,
  launchTree,
  node,
  readPersisted,
  seedDocument,
  setCursor,
  test,
} from './fixtures'

describeForEachEditingMode('line numbers', ({ screenshotName }) => {
  // @requirement PRODUCT.md §2.1
  // @requirement PRODUCT.md §20.2.28
  test('toggles through Control+L and the command panel, preserving selection and saved preference', async ({
    userDataDir,
  }, testInfo) => {
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'parent',
            text: 'A synthetic project with a wrapped description. '.repeat(7),
            children: [{ id: 'child', text: `${date} Review the draft`, children: [] }],
          },
          { id: 'second', text: `${date} Send the draft`, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
    })
    const original = readPersisted(userDataDir).document
    const first = await launchTree(userDataDir)
    const { window } = first
    const editor = node(window, 1)
    await editor.focus()
    await setCursor(editor, 4)
    const selection = () =>
      editor.evaluate((element) => {
        const input = element as HTMLTextAreaElement
        return [input.selectionStart, input.selectionEnd]
      })
    const before = await selection()
    await window.clock.install()

    await window.keyboard.press('Control+l')

    await expect(window.locator('.line-number')).toHaveText(['1', '2'])
    await expect(editor).toBeFocused()
    expect(await selection()).toEqual(before)
    await expect.poll(() => JSON.parse(readFileSync(join(userDataDir, 'data', 'line-numbers.json'), 'utf8'))).toBe(true)

    await window.getByRole('button', { name: 'Expand node 1', exact: true }).click()

    await expect(window.locator('.line-number')).toHaveText(['1', '2', '3'])
    const geometry = await window.locator('.node-row').evaluateAll((rows) =>
      rows.map((row) => {
        const number = row.querySelector('.line-number')!.getBoundingClientRect()
        const text = row.querySelector('.node-input')!.getBoundingClientRect()
        const bullet = row.querySelector('.node-enter-control')!.getBoundingClientRect()
        return { x: number.right, top: number.top, textTop: text.top, bulletLeft: bullet.left }
      }),
    )

    expect(new Set(geometry.map((row) => row.x)).size).toBe(1)
    for (const row of geometry) {
      expect(row.x).toBeLessThan(row.bulletLeft)
      expect(Math.abs(row.top - row.textTop)).toBeLessThan(1)
    }

    await window.screenshot({ path: testInfo.outputPath(screenshotName('tree-light.png')) })
    await window.evaluate(() => globalThis.window.treeApi.setAppearance('dark'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await window.screenshot({ path: testInfo.outputPath(screenshotName('tree-dark.png')) })
    await editor.focus()
    await window.keyboard.press('Meta+p')

    await expect(window.locator('.agenda-list .line-number')).toHaveText(['1', '2', '3'])
    await expect(window.locator('.agenda-row-day .line-number, .agenda-row-gap .line-number')).toHaveCount(0)
    await window.screenshot({ path: testInfo.outputPath(screenshotName('agenda-dark.png')) })
    await window.keyboard.press('Control+l')

    await expect(window.locator('.line-number')).toHaveCount(0)

    await window.keyboard.press('Control+l')
    await fireIdleSave(window)
    await window.evaluate(() => globalThis.window.treeApi.load())

    expect(readPersisted(userDataDir).document).toEqual(original)

    await closeApp(first.app)
    const second = await launchTree(userDataDir)

    await expect(second.window.locator('.line-number')).not.toHaveCount(0)

    await node(second.window, 1).focus()
    await second.window.keyboard.press('Meta+Shift+p')
    await second.window.getByRole('combobox', { name: 'Command' }).fill('toggle-line-numbers')

    await expect(second.window.locator('#command-toggle-line-numbers .command-state')).toHaveText('✓')
    await expect(second.window.locator('#command-toggle-line-numbers .command-shortcut')).toHaveText('⌃L')

    await second.window.keyboard.press('Enter')

    await expect(second.window.locator('.line-number')).toHaveCount(0)
    await expect(node(second.window, 1)).toBeFocused()
    await expect.poll(() => second.window.evaluate(() => globalThis.window.treeApi.getLineNumbers())).toBe(false)

    await closeApp(second.app)
    const third = await launchTree(userDataDir)

    await expect(third.window.locator('.line-number')).toHaveCount(0)
  })
})

test.describe('windowed line numbers', () => {
  test.use({ editingMode: 'vim' })
  // @requirement PRODUCT.md §2.1
  // @requirement PRODUCT.md §22.1
  test('keeps full-list indices while mounting a bounded Tree and Agenda window', async ({ userDataDir }) => {
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 2000 }, (_, i) => ({ id: `n${i}`, text: `${date} Task ${i + 1}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n1500' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await node(window, 1501).focus()

    await window.keyboard.press('Control+l')

    await expect(window.locator('[data-node-id="n1500"] .line-number')).toHaveText('1501')
    expect(await window.locator('.line-number').count()).toBeLessThan(150)

    await window.keyboard.press('G')

    await expect(window.locator('[data-node-id="n1999"] .line-number')).toHaveText('2000')
    await window.keyboard.press('Meta+p')
    await window.keyboard.type('2000j')

    await expect(window.locator('.agenda-row[data-node-id="n1999"] .line-number')).toHaveText('2000')
    expect(await window.locator('.line-number').count()).toBeLessThan(150)

    await window.keyboard.press('g')
    await window.keyboard.press('g')

    await expect(window.locator('.agenda-row[data-node-id="n0"] .line-number')).toHaveText('1')
    expect(await window.locator('.line-number').count()).toBeLessThan(150)
  })
})
