// @editing-modes: vim
import type { Locator, Page } from '@playwright/test'
import type { TreeNode } from '../../src/domain/document'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  expect,
  launchTree,
  readPersisted,
  seedDocument,
  setAgendaToday,
  test,
  attachmentPath,
  setCursor,
} from './fixtures'

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const dayNumber = (month: number, day: number): number => Math.round(Date.UTC(2026, month - 1, day) / 86_400_000)
const dayKey = (month: number, day: number): string => `day:${dayNumber(month, day)}`
const nodeKey = (month: number, day: number, id: string): string => `node:${dayNumber(month, day)}:${id}`
const row = (window: Page, key: string) => window.locator(`.agenda-row[data-agenda-key="${key}"]`)
const caretOffset = (field: Locator): Promise<number> =>
  field.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) return element.selectionStart
    const selection = document.getSelection()!
    const prefix = document.createRange()
    prefix.selectNodeContents(element)
    prefix.setEnd(selection.anchorNode!, selection.anchorOffset)
    return prefix.toString().length
  })

// @requirement PRODUCT.md §23.4
test('walks wrapped visual lines with j and k before crossing Agenda nodes', async ({ userDataDir }, testInfo) => {
  const text = `2026-10-15 ${'Wrapped navigation words. '.repeat(150)}`
  seedDocument(userDataDir, {
    document: { roots: [node('wrapped', text), node('next', '2026-10-15 Next')] },
    location: { currentParentId: null, selectedNodeId: 'wrapped' },
  })
  const { window } = await launchTree(userDataDir)

  await openAndSelect(window, nodeKey(10, 15, 'wrapped'))
  const input = window.getByRole('textbox', { name: 'Agenda node wrapped', exact: true })
  await window.keyboard.press('0')
  await window.keyboard.press('j')

  await expect(input).toBeFocused()
  const secondLine = await caretOffset(input)
  expect(secondLine).toBeGreaterThan(0)

  await window.keyboard.press('k')

  await expect(input).toBeFocused()
  await expect.poll(() => caretOffset(input)).toBe(0)

  await window.keyboard.press('ArrowDown')

  await expect.poll(() => caretOffset(input)).toBe(secondLine)

  await window.keyboard.press('ArrowUp')

  await expect.poll(() => caretOffset(input)).toBe(0)

  await window.keyboard.type('10j')
  const counted = await caretOffset(window.locator('.node-input:focus'))
  await input.click()
  await window.keyboard.press('0')
  for (let index = 0; index < 10; index++) await window.keyboard.press('j')

  await expect.poll(() => caretOffset(window.locator('.node-input:focus'))).toBe(counted)

  await input.click()

  await window.keyboard.press('$')
  await window.keyboard.press('j')
  const next = window.getByRole('textbox', { name: 'Agenda node next', exact: true })

  await expect(next).toBeFocused()

  await window.keyboard.press('0')
  await window.keyboard.press('k')

  await expect(input).toBeFocused()
  expect(await caretOffset(input)).toBeGreaterThan(secondLine)
  const visible = await input.evaluate((element) => {
    const caret = document.getSelection()!.getRangeAt(0).getBoundingClientRect()
    const viewport = element.closest('.scroll-viewport')!.getBoundingClientRect()
    return caret.top >= viewport.top && caret.bottom <= viewport.bottom
  })

  expect(visible).toBe(true)
  await window.screenshot({ path: testInfo.outputPath('agenda-wrapped-vertical-arrival.png') })
  await window.emulateMedia({ colorScheme: 'dark' })
  await window.screenshot({ path: testInfo.outputPath('agenda-wrapped-vertical-arrival-dark.png') })
})

// @requirement PRODUCT.md §23.4
test('counted wrapped motion measures windowed Agenda destinations like repeated motion', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 150 }, (_, index) =>
        node(`row-${index}`, `2026-10-15 Row ${index} ${'Windowed wrapped text. '.repeat(24)}`),
      ),
    },
    location: { currentParentId: null, selectedNodeId: 'row-0' },
  })
  const { window } = await launchTree(userDataDir)

  await openAndSelect(window, nodeKey(10, 15, 'row-0'))
  await window.keyboard.press('0')
  await window.keyboard.type('100j')
  const countedKey = await window.locator('.agenda-row[aria-selected="true"]').getAttribute('data-agenda-key')
  const countedCursor = await caretOffset(window.locator('.node-input:focus'))

  await window.keyboard.type('gg')
  await row(window, nodeKey(10, 15, 'row-0')).click()
  await window.keyboard.press('0')
  for (let index = 0; index < 100; index++) await window.keyboard.press('j')

  await expect(window.locator('.agenda-row[aria-selected="true"]')).toHaveAttribute('data-agenda-key', countedKey!)
  await expect.poll(() => caretOffset(window.locator('.node-input:focus'))).toBe(countedCursor)
  await expect(window.locator('.agenda-row[aria-hidden="true"]')).toHaveCount(0)
})

for (const interruption of ['pointer', 'focus'] as const) {
  // @requirement PRODUCT.md §23.4
  test(`resets the desired column after ${interruption} interrupts a selected day`, async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [node('before', `2026-10-14 ${'a'.repeat(50)}`), node('after', `2026-10-15 ${'b'.repeat(70)}`)],
      },
      location: { currentParentId: null, selectedNodeId: 'before' },
    })
    const { window } = await launchTree(userDataDir)

    await openAndSelect(window, nodeKey(10, 14, 'before'))
    await window.keyboard.press('$')
    await window.keyboard.press('j')
    const day = row(window, dayKey(10, 15))

    await expect(day).toHaveAttribute('aria-selected', 'true')

    if (interruption === 'pointer') await day.click()
    else {
      await window.getByRole('button', { name: 'Pin window on top' }).focus()
      await day.focus()
    }
    await window.keyboard.press('j')
    const after = window.getByRole('textbox', { name: 'Agenda node after', exact: true })

    await expect(after).toBeFocused()
    expect(await caretOffset(after)).toBeLessThan(20)
  })
}

// @requirement PRODUCT.md §23.4
test('keeps horizontal image carets separate across repeated Agenda occurrences and a focused-day heading', async ({
  userDataDir,
}, testInfo) => {
  const text = '2026-10-14 2026-10-15 Shared'
  seedDocument(userDataDir, {
    document: { roots: [{ ...node('shared', text), attachment: { id: 'image', mimeType: 'image/png' } }] },
    location: { currentParentId: null, selectedNodeId: 'shared' },
  })

  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(
    attachmentPath(userDataDir, 'image'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    ),
  )
  const { window } = await launchTree(userDataDir)

  await openAndSelect(window, nodeKey(10, 14, 'shared'))
  const firstRow = row(window, nodeKey(10, 14, 'shared'))
  const secondRow = row(window, nodeKey(10, 15, 'shared'))

  await window.keyboard.type('0l')
  await window.keyboard.press('j')

  await expect(firstRow.locator('.node-input')).toHaveClass(/node-input-image-caret/)

  await window.keyboard.press('l')
  const day = row(window, dayKey(10, 15))

  await expect(day).toHaveAttribute('aria-selected', 'true')
  await expect(firstRow.locator('.node-input-image-caret')).toHaveCount(0)

  const headerLength = (await day.locator('.agenda-label').innerText()).length

  await window.keyboard.type(`${headerLength}l`)
  const second = secondRow.locator('.node-input')

  await expect(second).toBeFocused()
  await expect.poll(() => caretOffset(second)).toBe(0)

  await window.keyboard.type('$l')

  await expect(second).toHaveClass(/node-input-image-caret/)

  await window.keyboard.press('h')

  await expect.poll(() => caretOffset(second)).toBe(text.length - 1)

  await window.keyboard.press('l')
  await window.keyboard.press('l')

  await expect(second).toHaveClass(/node-input-image-caret/)

  await window.screenshot({ path: testInfo.outputPath('agenda-horizontal-mirror-image.png') })
  await day.click()
  await window.keyboard.press('Meta+.')
  const heading = window.locator('.agenda-focused-heading')

  await window.keyboard.type('$l')

  await expect(second).toBeFocused()
  await expect.poll(() => caretOffset(second)).toBe(0)

  await window.keyboard.press('h')

  await expect(heading.locator('.agenda-caret')).toHaveCount(1)

  const label = await heading.innerText()

  await expect(heading.locator('.agenda-caret')).toHaveText(label.at(-1)!)
})

// @requirement PRODUCT.md §23.4
test('continues h and l through Agenda editors and dates while skipping passive paths', async ({
  userDataDir,
}, testInfo) => {
  seedPending(userDataDir)
  const { window } = await launchTree(userDataDir)

  await openAndSelect(window, nodeKey(10, 14, 'plan'))
  const plan = row(window, nodeKey(10, 14, 'plan')).locator('.node-input')
  const other = row(window, nodeKey(10, 14, 'other')).locator('.node-input')

  await window.keyboard.type('$l')

  await expect(other).toBeFocused()
  await expect.poll(() => caretOffset(other)).toBe(0)

  await window.keyboard.press('h')

  await expect(plan).toBeFocused()
  await expect.poll(() => caretOffset(plan)).toBe('2026-10-14 Prepare'.length - 1)

  await window.keyboard.type('0h')
  const day = row(window, dayKey(10, 14))

  await expect(day).toHaveAttribute('aria-selected', 'true')
  await expect(day.locator('.agenda-caret')).toHaveText('4')

  await window.keyboard.press('l')

  await expect(plan).toBeFocused()
  await expect.poll(() => caretOffset(plan)).toBe(0)

  await window.keyboard.type('2l2h')
  await expect.poll(() => caretOffset(plan)).toBe(0)

  await window.keyboard.press('h')
  await expect(day).toHaveAttribute('aria-selected', 'true')
  await window.screenshot({ path: testInfo.outputPath('agenda-horizontal-day.png') })

  await window.keyboard.type('$vl')
  await expect(day).toHaveAttribute('aria-selected', 'true')
  await window.keyboard.press('Escape')
  await window.keyboard.type('dl')
  await expect(day).toHaveAttribute('aria-selected', 'true')
  await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
})

// @requirement PRODUCT.md §23.4
// @requirement PRODUCT.md §23.14
test('J and K navigate Agenda labels and matches by ten while V stays inactive', async ({ userDataDir }, testInfo) => {
  seedDocument(userDataDir, {
    document: { roots: Array.from({ length: 26 }, (_, i) => node(`n${i}`, `2026-10-14 Row ${i}`)) },
    location: { currentParentId: null, selectedNodeId: 'n0' },
  })
  const { window } = await launchTree(userDataDir)

  await openAndSelect(window, nodeKey(10, 14, 'n0'))
  await window.keyboard.press('Shift+J')

  await expect(row(window, nodeKey(10, 14, 'n10')).locator('.node-input')).toBeFocused()

  await window.keyboard.press('Shift+K')

  await expect(row(window, nodeKey(10, 14, 'n0')).locator('.node-input')).toBeFocused()

  await row(window, dayKey(10, 14)).locator('.agenda-label').click()
  await window.keyboard.press('Shift+J')

  await expect(row(window, nodeKey(10, 14, 'n9')).locator('.node-input')).toBeFocused()

  await window.keyboard.press('Shift+K')

  await expect(row(window, dayKey(10, 14))).toHaveAttribute('aria-selected', 'true')

  await row(window, nodeKey(10, 14, 'n0'))
    .locator('.node-input')
    .click()
  await window.keyboard.press('Escape')
  await window.keyboard.press('Shift+V')
  await window.keyboard.press('2')
  await window.keyboard.press('Shift+J')

  await expect(row(window, nodeKey(10, 14, 'n20')).locator('.node-input')).toBeFocused()
  await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(0)

  await window.keyboard.press('Shift+K')

  await expect(window.locator('.agenda-row-visual-selected')).toHaveCount(0)
  await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')

  await window.screenshot({ path: testInfo.outputPath('fast-agenda-normal.png') })
})
const message = (window: Page) => window.locator('.status-bar-message')
const persistedTexts = (userDataDir: string): string[] =>
  readPersisted(userDataDir).document.roots[0]!.children.map((child) => child.text)

function seedPending(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        node('context', 'Context', [
          node('plan', '2026-10-14 Prepare', [node('step', 'Step')]),
          node('other', '2026-10-14 Other'),
          node('later', '2026-10-16 Later'),
        ]),
        node('far', '2026-12-01 Far'),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'context' },
  })
}

/** Open Agenda, put the focus in a direct match's editor and return to Normal. */
async function openAndSelect(window: Page, key: string): Promise<void> {
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await row(window, key).click()
  await row(window, key).locator('.node-input').click()
  await window.keyboard.press('Escape')
}

test.describe('Agenda Vim commands', () => {
  for (const command of ['ArrowDown', 'ArrowUp', 'Meta+p', 'Meta+.', 'Meta+z', 'Meta+Shift+z', 'Meta+,']) {
    test(`ends read-only Replace before keyboard command ${command}`, async ({ userDataDir }) => {
      seedPending(userDataDir)
      const { window } = await launchTree(userDataDir)

      await openAndSelect(window, nodeKey(10, 14, 'plan'))
      if (command === 'Meta+,') {
        await row(window, dayKey(10, 14)).click()
        await window.keyboard.press('Meta+.')
        await row(window, nodeKey(10, 14, 'plan')).click()
        await row(window, nodeKey(10, 14, 'plan'))
          .locator('.node-input')
          .focus()
      }

      await window.keyboard.press('R')
      await row(window, dayKey(10, 14)).click()

      await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')

      await window.keyboard.press(command)

      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')

      if (command === 'ArrowDown') {
        await expect(row(window, nodeKey(10, 14, 'plan')).locator('.node-input')).toBeFocused()

        await window.keyboard.press('i')
        await window.keyboard.type('Q')

        await expect(row(window, nodeKey(10, 14, 'plan')).locator('.node-input')).toContainText('Q')
      }
    })
  }

  for (const pending of [false, true]) {
    test(`preserves Replace through Agenda row clicks and read-only rows (pending ${pending})`, async ({
      userDataDir,
    }) => {
      seedPending(userDataDir)
      const { window } = await launchTree(userDataDir)

      await openAndSelect(window, nodeKey(10, 14, 'plan'))
      const editor = row(window, nodeKey(10, 14, 'plan')).locator('.node-input')

      await setCursor(editor, 11)
      await window.keyboard.press('R')
      if (pending) await window.keyboard.type('X')

      await row(window, dayKey(10, 14)).locator('.agenda-label').click()

      await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
      await expect(row(window, dayKey(10, 14))).toBeFocused()

      await window.keyboard.type('ZY')

      await expect(row(window, dayKey(10, 14))).toHaveAttribute('aria-selected', 'true')

      if (pending) await expect(window.locator('.agenda-list')).toHaveScreenshot('agenda-replace-readonly-row.png')

      const destination = row(window, nodeKey(10, 14, 'other'))

      await destination.locator('.node-enter-control').click()

      await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')

      const nextInput = destination.locator('.node-input')

      await expect(nextInput).toBeFocused()
      if (pending) await expect(window.locator('.agenda-list')).toHaveScreenshot('agenda-replace-editable-row.png')

      await window.keyboard.type('Y')

      await expect(nextInput).toHaveText('Y026-10-14 Other')

      await window.keyboard.press('Escape')
      await window.keyboard.press('Meta+z')

      await expect(destination.locator('.node-input')).toHaveText('2026-10-14 Other')

      await row(window, nodeKey(10, 14, 'plan')).click()

      await expect(row(window, nodeKey(10, 14, 'plan')).locator('.node-input')).toHaveText(
        `2026-10-14 ${pending ? 'X' : 'P'}repare`,
      )
    })
  }

  test('keeps Replace through an inactive occurrence and a focused-day heading, then resumes editing', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [node('multi', '2026-10-14 2026-10-16 Shared'), node('other', '2026-10-14 Other')] },
      location: { currentParentId: null, selectedNodeId: 'multi' },
    })
    const { window } = await launchTree(userDataDir)

    await openAndSelect(window, nodeKey(10, 14, 'multi'))
    await window.keyboard.press('R')
    await row(window, nodeKey(10, 16, 'multi'))
      .locator('.node-enter-control')
      .click()

    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')

    const active = row(window, nodeKey(10, 16, 'multi')).locator('.node-input')

    await expect(active).toBeFocused()

    await window.keyboard.type('X')

    await expect(active).toHaveText('X026-10-14 2026-10-16 Shared')

    await window.keyboard.press('Escape')
    await window.keyboard.press('Meta+z')
    await row(window, dayKey(10, 14)).click()
    await window.keyboard.press('Meta+.')
    const editor = row(window, nodeKey(10, 14, 'other')).locator('.node-input')

    await row(window, nodeKey(10, 14, 'other')).click()
    await editor.focus()

    await window.keyboard.press('R')
    await row(window, dayKey(10, 14)).click()

    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')

    await window.keyboard.type('Z')

    await expect(row(window, dayKey(10, 14))).toHaveAttribute('aria-selected', 'true')

    await row(window, nodeKey(10, 14, 'other'))
      .locator('.node-enter-control')
      .click()

    await expect(editor).toBeFocused()

    await window.keyboard.type('Y')

    await expect(editor).toHaveText('Y026-10-14 Other')

    await window.keyboard.press('Escape')

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')

    await window.keyboard.press('R')
    await row(window, dayKey(10, 14)).click()

    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')

    await window.getByLabel('Vim mode').click()

    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('lands boundary and viewport motions on destination text before its image', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [{ ...node('image', '  2026-10-14 Image'), attachment: { id: 'image', mimeType: 'image/png' } }],
      },
      location: { currentParentId: null, selectedNodeId: 'image' },
    })

    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(
      attachmentPath(userDataDir, 'image'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64',
      ),
    )
    const { window } = await launchTree(userDataDir)

    await openAndSelect(window, nodeKey(10, 14, 'image'))
    await row(window, dayKey(10, 14)).click()
    await window.keyboard.press('Meta+.')
    const editor = row(window, nodeKey(10, 14, 'image')).locator('.node-input')

    await editor.click()
    await window.keyboard.press('Escape')
    const cursor = () =>
      editor.evaluate((element) => {
        const selection = document.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(element)
        range.setEnd(selection.anchorNode!, selection.anchorOffset)
        return range.toString().length
      })
    for (const keys of [['G'], ['L'], ['Control+d']]) {
      await setCursor(editor, 8)
      for (const key of keys) await window.keyboard.press(key)

      await expect(editor).toBeFocused()
      await expect.poll(cursor).toBe(2)
      await expect(editor).not.toHaveClass(/node-input-image-caret/)
    }

    await window.keyboard.press('g')
    await window.keyboard.press('g')

    await expect(row(window, dayKey(10, 14))).toHaveAttribute('aria-selected', 'true')

    await window.keyboard.press('Control+d')

    await expect(editor).toBeFocused()
    await expect.poll(cursor).toBe(2)
  })

  // @requirement PRODUCT.md §23.4
  test('vertical navigation enters and leaves images and preserves a clamped image return position', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          node('before', '2026-10-14 Before'),
          { ...node('image', '2026-10-14 Image'), attachment: { id: 'image', mimeType: 'image/png' } },
          node('after', '2026-10-14 After'),
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'before' },
    })

    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(
      attachmentPath(userDataDir, 'image'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64',
      ),
    )
    const { window } = await launchTree(userDataDir)

    const treeInput = window.locator('.node-row[data-node-id="image"] .node-input')
    await treeInput.click()
    await window.keyboard.press('Escape')
    await window.keyboard.type('05l')
    await window.keyboard.press('j')
    await window.keyboard.press('k')
    await window.keyboard.type('2j')
    await window.keyboard.press('k')
    await window.keyboard.press('k')

    const returnedColumn = await caretOffset(treeInput)

    expect(returnedColumn).toBe('2026-10-14 Image'.length - 1)

    await openAndSelect(window, nodeKey(10, 14, 'image'))
    const imageRow = row(window, nodeKey(10, 14, 'image'))
    const input = imageRow.locator('.node-input')
    const image = imageRow.getByRole('button', { name: 'Open image preview' })
    const offset = async (): Promise<number> =>
      input.evaluate((element) => {
        if (element instanceof HTMLTextAreaElement) return element.selectionStart
        const selection = document.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(element)
        range.setEnd(selection.anchorNode!, selection.anchorOffset)
        return range.toString().length
      })

    await window.keyboard.type('05l')

    expect(await offset()).toBe(5)

    await window.keyboard.press('j')

    await expect(image).toHaveClass(/attachment-image-caret/)
    await expect(imageRow).toHaveAttribute('aria-selected', 'true')

    await window.keyboard.press('k')

    await expect(image).not.toHaveClass(/attachment-image-caret/)
    expect(await offset()).toBe(5)

    await window.keyboard.type('2j')

    await expect(row(window, nodeKey(10, 14, 'after'))).toHaveAttribute('aria-selected', 'true')

    await window.keyboard.press('k')

    await expect(image).toHaveClass(/attachment-image-caret/)

    await window.keyboard.press('k')

    await expect(image).not.toHaveClass(/attachment-image-caret/)
    expect(await offset()).toBe(returnedColumn)

    await window.keyboard.press('G')

    await expect(row(window, nodeKey(10, 14, 'after'))).toHaveAttribute('aria-selected', 'true')

    await window.keyboard.type('07l')
    await window.keyboard.press('j')
    await window.keyboard.press('j')
    const afterInput = row(window, nodeKey(10, 14, 'after')).locator('.node-input')

    expect(
      await afterInput.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const selection = document.getSelection()!
        range.setEnd(selection.anchorNode!, selection.anchorOffset)
        return range.toString().length
      }),
    ).toBe(7)

    await window.keyboard.type('2k')

    await expect(row(window, nodeKey(10, 14, 'before'))).toHaveAttribute('aria-selected', 'true')

    await window.keyboard.type('2j')

    await expect(row(window, nodeKey(10, 14, 'after'))).toHaveAttribute('aria-selected', 'true')

    const imageIndex = await imageRow.evaluate((element) =>
      [...document.querySelectorAll('.agenda-row')].indexOf(element),
    )

    await window.keyboard.type(`${imageIndex + 1}G`)

    await expect(image).not.toHaveClass(/attachment-image-caret/)
    expect(await offset()).toBe(0)

    await window.keyboard.press('j')

    await expect(image).toHaveClass(/attachment-image-caret/)

    await window.keyboard.press('L')

    await expect(row(window, nodeKey(10, 14, 'after'))).toHaveAttribute('aria-selected', 'true')
  })

  // @requirement PRODUCT.md §23.9
  // @requirement PRODUCT.md §23.10
  test('Normal Enter opens links and images without splitting or leaving Agenda', async ({ userDataDir }) => {
    const url = 'https://example.com'
    const text = `2026-10-14 ${url}`
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'linked',
            text,
            children: [],
            links: [{ start: 11, end: text.length, url }],
            attachment: { id: 'image', mimeType: 'image/png' },
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'linked' },
    })

    mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
    writeFileSync(
      attachmentPath(userDataDir, 'image'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        'base64',
      ),
    )
    const { window, app } = await launchTree(userDataDir)

    await app.evaluate(({ shell }) => {
      const state = globalThis as typeof globalThis & { agendaOpenedUrls?: string[] }
      state.agendaOpenedUrls = []
      shell.openExternal = async (url) => {
        state.agendaOpenedUrls!.push(url)
      }
    })
    await openAndSelect(window, nodeKey(10, 14, 'linked'))
    const input = row(window, nodeKey(10, 14, 'linked')).locator('.node-input')

    await setCursor(input, 12)
    await window.keyboard.press('Enter')

    await expect
      .poll(() => app.evaluate(() => (globalThis as { agendaOpenedUrls?: string[] }).agendaOpenedUrls))
      .toEqual(['https://example.com/'])
    await expect(input).toBeFocused()

    await window.keyboard.press('2')
    await window.keyboard.press('Enter')

    expect(await app.evaluate(() => (globalThis as { agendaOpenedUrls?: string[] }).agendaOpenedUrls)).toHaveLength(1)

    await window.keyboard.press('$')
    await window.keyboard.press('l')

    await expect(
      row(window, nodeKey(10, 14, 'linked')).getByRole('button', { name: 'Open image preview' }),
    ).toHaveClass(/attachment-image-caret/)

    await window.keyboard.press('Enter')

    await expect(window.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
    await expect(window.getByRole('img', { name: 'Attached image preview' })).toBeVisible()

    await window.keyboard.press('Escape')

    await expect(input).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.agenda-list')).toBeVisible()
    expect(readPersisted(userDataDir).document.roots).toHaveLength(1)
    expect(readPersisted(userDataDir).document.roots[0]!.text).toBe(text)
  })

  // @requirement PRODUCT.md §23.14

  // @requirement PRODUCT.md §23.14

  // @requirement PRODUCT.md §23.14

  // @requirement PRODUCT.md §23.11

  // @requirement PRODUCT.md §23.11

  // @requirement PRODUCT.md §23.13

  // @requirement PRODUCT.md §23.13

  // @requirement PRODUCT.md §23.13

  // @requirement PRODUCT.md §23.13
  test('p without a pending move changes nothing on a day and with a node register', async ({ userDataDir }) => {
    seedPending(userDataDir)
    const { window } = await launchTree(userDataDir)

    await openAndSelect(window, nodeKey(10, 14, 'plan'))
    await window.keyboard.press('p')
    await window.keyboard.press('P')
    await row(window, dayKey(10, 16)).locator('.agenda-label').click()
    await window.keyboard.press('p')

    await expect(message(window)).toHaveCount(0)
    expect(persistedTexts(userDataDir)).toEqual(['2026-10-14 Prepare', '2026-10-14 Other', '2026-10-16 Later'])
    await expect(row(window, nodeKey(10, 14, 'plan'))).toHaveCount(1)
  })

  // @requirement PRODUCT.md §23.13
})
