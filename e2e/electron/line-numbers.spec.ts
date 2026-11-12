// @editing-modes: both
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator } from '@playwright/test'
import {
  closeApp,
  describeForEachEditingMode,
  expect,
  fireIdleSave,
  launchTree,
  node,
  readPersisted,
  seedDocument,
  setAgendaToday,
  setCursor,
  test,
} from './fixtures'

describeForEachEditingMode('line numbers', ({ screenshotName }) => {
  // @requirement PRODUCT.md §2.1
  // @requirement PRODUCT.md §20.2.28
  test('toggles through Control+L and the command panel, preserving selection and saved preference', async ({
    userDataDir,
  }) => {
    const date = '2026-10-08'
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
    const beforeNumbers = await outlineGeometry(window.locator('.node-row'))
    await setAgendaToday(window)

    await window.keyboard.press('Control+l')

    await expect(window.locator('.line-number')).toHaveText(['1', '2'])
    await expect(editor).toBeFocused()
    expect(await selection()).toEqual(before)
    expect(await outlineGeometry(window.locator('.node-row'))).toEqual(beforeNumbers)
    await expect.poll(() => JSON.parse(readFileSync(join(userDataDir, 'data', 'line-numbers.json'), 'utf8'))).toBe(true)

    await window.getByRole('button', { name: 'Expand node 1', exact: true }).click()

    await expect(window.locator('.line-number')).toHaveText(['1', '2', '3'])
    await expectCompactNumbering(window.locator('.node-row'))

    await expect(window.locator('.node-list')).toHaveScreenshot(screenshotName('line-numbers-tree-light.png'))
    await window.evaluate(() => globalThis.window.treeApi.setAppearance('dark'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(window.locator('.node-list')).toHaveScreenshot(screenshotName('line-numbers-tree-dark.png'))
    await editor.focus()
    await window.keyboard.press('Meta+p')

    await expect(window.locator('.agenda-list .line-number')).toHaveText(['1', '2'])
    await expect(window.locator('.agenda-row-day .line-number, .agenda-path-label .line-number')).toHaveCount(0)
    await expectCompactNumbering(window.locator('.agenda-row-node'))
    await expect(window.locator('.agenda-list')).toHaveScreenshot(screenshotName('line-numbers-agenda-dark.png'))
    const agendaGeometry = await outlineGeometry(window.locator('.agenda-row'))
    await window.keyboard.press('Control+l')

    await expect(window.locator('.line-number')).toHaveCount(0)
    expect(await outlineGeometry(window.locator('.agenda-row'))).toEqual(agendaGeometry)

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
        roots: Array.from({ length: 9000 }, (_, i) => ({ id: `n${i}`, text: `${date} Task ${i + 1}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n8500' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await node(window, 8501).focus()
    const treeGeometry = await outlineGeometry(window.locator('.node-row'))

    await window.keyboard.press('Control+l')

    await expect(window.locator('[data-node-id="n8500"] .line-number')).toHaveText('8501')
    expect(await outlineGeometry(window.locator('.node-row'))).toEqual(treeGeometry)
    expect(await window.locator('.line-number').count()).toBeLessThan(150)
    await expectCompactNumbering(window.locator('.node-row'))

    await window.keyboard.press('G')

    await expect(window.locator('[data-node-id="n8999"] .line-number')).toHaveText('9000')
    await window.keyboard.press('Meta+p')
    await window.keyboard.type('9000j')

    await expect(window.locator('.agenda-row[data-node-id="n8999"] .line-number')).toHaveText('9000')
    expect(await window.locator('.line-number').count()).toBeLessThan(150)
    await expectCompactNumbering(window.locator('.agenda-row-node'))
    const agendaGeometry = await outlineGeometry(window.locator('.agenda-row'))

    await window.keyboard.press('Control+l')

    await expect(window.locator('.line-number')).toHaveCount(0)
    expect(await outlineGeometry(window.locator('.agenda-row'))).toEqual(agendaGeometry)

    await window.keyboard.press('Control+l')

    await window.keyboard.press('g')
    await window.keyboard.press('g')

    await expect(window.locator('.agenda-row[data-node-id="n0"] .line-number')).toHaveText('1')
    expect(await window.locator('.line-number').count()).toBeLessThan(150)
  })
})

async function expectCompactNumbering(rows: Locator): Promise<void> {
  const geometry = await rows.evaluateAll((elements) =>
    elements.map((row) => {
      const number = row.querySelector('.line-number')!.getBoundingClientRect()
      const editor = row.querySelector('.node-input, .agenda-text')!
      const text = editor.getBoundingClientRect()
      const textLeft = text.left + Number.parseFloat(getComputedStyle(editor).paddingLeft)
      const bullet = row.querySelector('.node-enter-control')!.getBoundingClientRect()
      const disclosure = row.querySelector('.node-disclosure-triangle')?.getBoundingClientRect()

      return {
        numberLeft: number.left,
        numberRight: number.right,
        numberTop: number.top,
        textTop: text.top,
        textLeft,
        outlineGap:
          textLeft -
          number.right -
          (Number.parseFloat(getComputedStyle(row).getPropertyValue('--row-depth')) || 0) * 20,
        bulletLeft: bullet.left,
        bulletRight: bullet.right,
        disclosureLeft: disclosure?.left,
        disclosureRight: disclosure?.right,
      }
    }),
  )

  expect(new Set(geometry.map((row) => row.numberRight)).size).toBe(1)
  for (const row of geometry) {
    expect(row.numberLeft).toBeGreaterThanOrEqual(0)
    expect(row.numberRight).toBeLessThan(row.bulletLeft)
    expect(row.bulletRight).toBeLessThan(row.textLeft)
    expect(Math.abs(row.numberTop - row.textTop)).toBeLessThan(1)
    expect(row.outlineGap).toBe(40)
    if (row.disclosureLeft !== undefined) {
      expect(row.disclosureLeft).toBeGreaterThanOrEqual(row.numberRight)
      expect(row.disclosureRight).toBeLessThan(row.bulletLeft)
    }
  }
}

async function outlineGeometry(rows: Locator) {
  return rows.evaluateAll((elements) =>
    elements.map((row) => {
      const editor = row.querySelector('.node-input, .agenda-text') ?? row
      const text = editor.getBoundingClientRect()
      return {
        id: row.getAttribute('data-node-id') ?? row.getAttribute('data-agenda-key'),
        left: text.left,
        right: text.right,
        height: text.height,
      }
    }),
  )
}
