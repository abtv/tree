// @editing-modes: both
import type { Locator } from '@playwright/test'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  test,
  writeClipboardImage,
} from './fixtures'

async function highlight(row: Locator) {
  return row.evaluate((element) => {
    const style = getComputedStyle(element, '::after')
    const bounds = element.getBoundingClientRect()
    const viewport = element.closest('.scroll-viewport')!
    const list = viewport.getBoundingClientRect()
    return {
      content: style.content,
      left: bounds.left + Number.parseFloat(style.left),
      right: bounds.left + Number.parseFloat(style.left) + Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
      top: Number.parseFloat(style.top),
      rowHeight: bounds.height,
      listLeft: list.left,
      listRight: list.left + viewport.clientWidth,
    }
  })
}

async function expectTextLine(row: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const actual = await highlight(row)
      return actual.height
    })
    .toBe(20)
  const actual = await highlight(row)

  expect(Math.abs(actual.left - actual.listLeft)).toBeLessThan(1)
  expect(Math.abs(actual.right - actual.listRight)).toBeLessThan(1)
  expect(actual.rowHeight).toBeGreaterThan(actual.height)
}

async function expectFullRow(row: Locator): Promise<void> {
  const actual = await highlight(row)

  expect(actual.content).toBe('""')
  expect(Math.abs(actual.left - actual.listLeft)).toBeLessThan(1)
  expect(Math.abs(actual.right - actual.listRight)).toBeLessThan(1)
  expect(Math.abs(actual.height - actual.rowHeight)).toBeLessThan(1)
}

describeForEachEditingMode('active row', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §2.1
  test('highlights only the active full-width row through focus, wrapping and selection', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            children: [
              {
                id: 'child',
                text: 'A wrapped child with enough synthetic text to span several lines. '.repeat(5),
                children: [],
              },
            ],
          },
          { id: 'other', text: 'Other branch', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const parent = window.locator('[data-node-id="parent"]')
    const other = window.locator('[data-node-id="other"]')

    await expectFullRow(parent)

    await other.hover()

    expect((await highlight(other)).content).toBe('none')

    await parent.locator('.node-disclosure-triangle').click()
    const child = window.locator('[data-node-id="child"]')

    await child.locator('.node-input').click()

    await expectTextLine(child)
    expect((await highlight(parent)).content).toBe('none')
    expect((await highlight(other)).content).toBe('none')
    await expect(other.locator('.node-input')).toHaveCSS('opacity', '1')
    const input = child.locator('.node-input')
    if (mode === 'vim') {
      await setCursor(input, 0)
      await window.keyboard.press('j')
    } else await input.click({ position: { x: 40, y: 30 } })
    await expect.poll(async () => (await highlight(child)).top).toBe(20)

    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })

      await expect(window.locator('.node-list')).toHaveScreenshot(screenshotName(`active-row-${appearance}.png`), {
        threshold: 0.02,
      })
    }
    await window.keyboard.press('Meta+a')
    await expectTextLine(child)
    expect(
      await input.evaluate((element) =>
        element instanceof HTMLTextAreaElement
          ? element.selectionEnd - element.selectionStart
          : document.getSelection()!.toString().length,
      ),
    ).toBe(
      await input.evaluate((element) =>
        element instanceof HTMLTextAreaElement ? element.value.length : element.textContent!.length,
      ),
    )
    await window.locator('.always-on-top-toggle').focus()

    expect((await highlight(child)).content).toBe('none')

    await other.locator('.node-input').focus()

    await expectFullRow(other)
    expect((await highlight(child)).content).toBe('none')

    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('V')

      await expect(other).toHaveClass(/node-row-visual-selected/)
      expect((await highlight(other)).content).toBe('none')

      await window.keyboard.press('Escape')

      await expectFullRow(other)
    }
  })

  // @requirement PRODUCT.md §2.1
  // @requirement PRODUCT.md §23.4
  // @requirement PRODUCT.md §23.15
  test('follows Agenda selection between a day, a node and a focused-day heading', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: '2026-10-08 First item', children: [] },
          { id: 'b', text: '2026-10-08 Second item', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)

    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const day = window.locator('.agenda-row-day.agenda-today')

    await day.click()

    await expectFullRow(day)

    const item = window.locator('.agenda-row[data-node-id="a"]')

    await item.locator('.node-input').click()

    await expectFullRow(item)
    expect((await highlight(day)).content).toBe('none')
    expect((await highlight(window.locator('.agenda-row[data-node-id="b"]'))).content).toBe('none')

    await day.click()
    await window.keyboard.press('Meta+.')

    await expectFullRow(window.locator('.agenda-focused-heading'))
  })

  test('highlights the empty final insertion line in plain and decorated editors', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'plain', text: 'First\nSecond\n', children: [] },
          { id: 'rich', text: '2026-10-08 First\nSecond\n', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'plain' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'insert' })

    for (const id of ['plain', 'rich']) {
      const row = window.locator(`.node-row[data-node-id="${id}"]`)
      const input = row.locator('.node-input')
      await input.click()
      await expect(input).toBeFocused()
      await setCursor(
        input,
        await input.evaluate((element) =>
          element instanceof HTMLTextAreaElement ? element.value.length : element.textContent!.length,
        ),
      )

      await expectTextLine(row)
      await expect.poll(async () => (await highlight(row)).top).toBe(40)
    }
  })

  test('keeps line feedback aligned with intact emoji at soft-wrap boundaries', async ({ userDataDir }) => {
    const entries = ['😀', '👩‍💻'].flatMap((emoji, group) =>
      Array.from({ length: 41 }, (_, index) => ({
        id: `emoji-${group}-${index}`,
        text: `${'A'.repeat(90 + index)}${emoji}${'B'.repeat(150)}`,
        children: [],
      })),
    )
    seedDocument(userDataDir, {
      document: { roots: entries },
      location: { currentParentId: null, selectedNodeId: entries[0]!.id },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'insert' })

    for (const state of mode === 'vim' ? ['insert', 'normal'] : ['standard']) {
      if (state === 'normal') await window.keyboard.press('Escape')
      const lines = new Map<string, Set<number>>()

      for (const entry of entries) {
        const row = window.locator(`.node-row[data-node-id="${entry.id}"]`)
        const input = row.locator('textarea.node-input')
        const offset = entry.text.indexOf(entry.id.startsWith('emoji-0') ? '😀' : '👩‍💻')
        await input.focus()
        await setCursor(input, offset)
        const expected = await input.evaluate((element, offset) => {
          const style = getComputedStyle(element)
          const mirror = document.createElement('div')
          for (const property of [
            'font',
            'letter-spacing',
            'word-spacing',
            'padding',
            'border',
            'box-sizing',
            'word-break',
            'overflow-wrap',
            'tab-size',
            'text-indent',
          ])
            mirror.style.setProperty(property, style.getPropertyValue(property))
          Object.assign(mirror.style, {
            position: 'fixed',
            visibility: 'hidden',
            whiteSpace: 'pre-wrap',
            width: `${element.getBoundingClientRect().width}px`,
          })
          const text = document.createTextNode((element as HTMLTextAreaElement).value)
          mirror.append(text)
          document.body.append(mirror)
          const range = document.createRange()
          range.setStart(text, offset)
          range.setEnd(text, offset + (text.data.startsWith('😀', offset) ? 2 : 5))
          const top = Math.round((range.getClientRects()[0]!.top - mirror.getBoundingClientRect().top) / 20) * 20
          range.detach()
          mirror.remove()
          return top
        }, offset)
        const group = entry.id.split('-')[1]!
        const positions = lines.get(group) ?? new Set<number>()
        positions.add(expected)
        lines.set(group, positions)

        await expect.poll(async () => (await highlight(row)).top, { message: `${state}: ${entry.id}` }).toBe(expected)
      }

      expect([...lines.values()].every((positions) => positions.size > 1)).toBe(true)
    }
  })
})

test.describe('Active visual line in Vim', () => {
  test('follows decorated multiline text through resize, image entry and view switching', async ({
    userDataDir,
  }, testInfo) => {
    const text = `2026-10-08 ${'Wrapped shared text. '.repeat(20)}2026-10-09`
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'wrapped', text, children: [] },
          { id: 'other', text: 'Other', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'wrapped' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const treeRow = window.locator('.node-row[data-node-id="wrapped"]')
    const editor = treeRow.locator('.node-input')
    await expect(editor).toHaveAttribute('contenteditable', 'true')
    await window.keyboard.press('j')

    await expectTextLine(treeRow)
    await expect.poll(async () => (await highlight(treeRow)).top).toBe(20)

    await writeClipboardImage(app)
    await window.keyboard.press('Meta+v')
    await expect(treeRow.locator('.attachment-button')).toBeVisible()
    await window.keyboard.press('$')
    await window.keyboard.press('l')

    await expect(editor).toHaveClass(/node-input-image-caret/)
    await expectFullRow(treeRow)

    await window.keyboard.press('h')

    await expectTextLine(treeRow)

    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const item = window.locator('.agenda-row[data-node-id="wrapped"]').first()
    await item.click()
    await expect(item.locator('.node-input')).toHaveCount(1)
    const readonly = window.locator('.agenda-row[data-node-id="wrapped"]').last()
    await expect(readonly.locator('.node-input')).toHaveCount(0)

    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.keyboard.press('0')
      await window.keyboard.press('j')
      await expectTextLine(item)
      await expect.poll(async () => (await highlight(item)).top).toBe(20)
      expect((await highlight(readonly)).content).toBe('none')
      await window.screenshot({ path: testInfo.outputPath(`active-line-agenda-${appearance}.png`) })
    }
    await window.setViewportSize({ width: 700, height: 700 })
    await expectTextLine(item)
    await window.keyboard.press('Meta+p')
    await expectTextLine(treeRow)
  })
})
