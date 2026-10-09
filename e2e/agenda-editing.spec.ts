// @editing-modes: both
import type { TreeNode } from '../src/domain/document'
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  readPersisted,
  writeClipboardText,
  writeClipboardImageSized,
  firePaste,
  lockSystemClipboard,
  screenshotContentSize,
  setMainWindowContentSize,
  test,
} from './fixtures'

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const dayNumber = (month: number, day: number): number => Math.round(Date.UTC(2026, month - 1, day) / 86_400_000)
const dayKey = (month: number, day: number): string => `day:${dayNumber(month, day)}`
function seed(userDataDir: string): void {
  seedDocument(userDataDir, {
    document: {
      roots: [
        node('context', 'Context', [
          node('first', '2026-10-14 Prepare 2026-10-20'),
          node('second', '2026-10-14 Review', [node('child', '2026-10-20 Child')]),
        ]),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'context' },
  })
}

describeForEachEditingMode('Agenda editing', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §23.9
  test('retains hyperlinks on inactive direct matches and opens them with Cmd-click', async ({ userDataDir }) => {
    const url = 'https://example.com'
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'context',
            text: url,
            links: [{ start: 0, end: url.length, url }],
            children: [
              {
                id: 'first',
                text: `2026-10-14 ${url} 2026-10-20`,
                children: [],
                links: [{ start: 11, end: 11 + url.length, url }],
              },
            ],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'context' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await app.evaluate(({ shell }) => {
      const control = globalThis as typeof globalThis & { openedAgendaUrls?: string[] }
      control.openedAgendaUrls = []
      shell.openExternal = async (url: string): Promise<void> => {
        control.openedAgendaUrls!.push(url)
      }
    })
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const links = window.locator('.agenda-role-match a')
    await expect(links).toHaveCount(2)
    await expect(window.locator('.agenda-role-context a')).toHaveCount(0)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.mouse.move(600, 20)
      await expect(window).toHaveScreenshot(screenshotName(`agenda-links-${appearance}.png`))
    }
    const initialUrl = window.url()
    await links.last().click({ modifiers: ['Meta'] })
    await expect
      .poll(() => app.evaluate(() => (globalThis as { openedAgendaUrls?: string[] }).openedAgendaUrls ?? []))
      .toEqual(['https://example.com/'])
    expect(window.url()).toBe(initialUrl)
    await links.first().click()
    await expect(window.getByRole('textbox', { name: 'Agenda node first', exact: true })).toBeFocused()
    expect(await app.evaluate(() => (globalThis as { openedAgendaUrls?: string[] }).openedAgendaUrls ?? [])).toEqual([
      'https://example.com/',
    ])
  })
  // @requirement PRODUCT.md §23.9
  test('pastes multiline text and a real image through the shared clipboard boundary', async ({ userDataDir }) => {
    seed(userDataDir)
    await lockSystemClipboard()
    const { window, app } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    await setCursor(input, await input.evaluate((element) => element.textContent!.length))
    await writeClipboardText(app, ' alpha\nbeta')
    await firePaste(input)
    await expect(input).toHaveText('2026-10-14 Prepare 2026-10-20 alpha')
    await expect(input).toBeFocused()
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children.map((child) => child.text), {
        timeout: 20000,
      })
      .toEqual(['2026-10-14 Prepare 2026-10-20 alpha', 'beta', '2026-10-14 Review'])
    await writeClipboardImageSized(app, 80, 80)
    await firePaste(input)
    await expect(window.locator('.agenda-row[data-node-id="first"] img')).toHaveCount(2)
    const image = window.locator('.agenda-row[data-node-id="first"] img').first()
    await expect(image).toBeVisible()
    expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children[0]!.attachment, {
        timeout: 20000,
      })
      .toBeDefined()
    await app.close()
    const restarted = await launchTree(userDataDir)
    await setMainWindowContentSize(restarted.app, screenshotContentSize)
    await setAgendaToday(restarted.window)
    await restarted.window.keyboard.press('Meta+p')
    const restoredImages = restarted.window.locator('.agenda-row[data-node-id="first"] img')
    await expect(restoredImages).toHaveCount(2)
    await expect(restoredImages.first()).toBeVisible()
    for (const appearance of ['light', 'dark'] as const) {
      await restarted.window.emulateMedia({ colorScheme: appearance })
      await restarted.window.mouse.move(600, 20)
      await expect(restarted.window).toHaveScreenshot(screenshotName(`agenda-clipboard-${appearance}.png`))
    }
  })
  // @requirement PRODUCT.md §23.9
  test('keeps Chromium composition and repeated key input continuous in decorated text', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await setCursor(input, 11)
    await input.evaluate((element) => {
      ;(globalThis as unknown as { composingDateSpan: Element }).composingDateSpan =
        element.querySelector('.agenda-date-active')!
    })
    const session = await window.context().newCDPSession(window)
    await session.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
    await expect(input).toHaveText('2026-10-14 にPrepare 2026-10-20')
    expect(
      await input.evaluate(
        (element) =>
          element.querySelector('.agenda-date-active') ===
          (globalThis as unknown as { composingDateSpan: Element }).composingDateSpan,
      ),
    ).toBe(true)
    await session.send('Input.insertText', { text: '日本' })
    await expect(input).toHaveText('2026-10-14 日本Prepare 2026-10-20')
    await expect(input).toBeFocused()
    await window.keyboard.down('a')
    await window.keyboard.down('a')
    await window.keyboard.down('a')
    await window.keyboard.up('a')
    await expect(input).toHaveText('2026-10-14 日本aaaPrepare 2026-10-20')
    await session.detach()
  })
  // @requirement PRODUCT.md §23.9
  // @requirement PRODUCT.md §23.7
  test('edits emphasized text and preserves the editor and caret when its active day changes', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    await expect(input).toBeFocused()
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await setCursor(input, 10)
    await input.evaluate((element) => {
      ;(globalThis as unknown as { originalAgendaInput: Element }).originalAgendaInput = element
    })
    await window.keyboard.press('Backspace')
    await window.keyboard.type('5')
    await expect(input).toHaveText('2026-10-15 Prepare 2026-10-20')
    await expect(input).toBeFocused()
    expect(
      await input.evaluate(
        (element) => element === (globalThis as unknown as { originalAgendaInput: Element }).originalAgendaInput,
      ),
    ).toBe(true)
    await expect(input.locator('.agenda-date-active')).toHaveText('2026-10-20')
    // Once the original date becomes incomplete, Oct 20 is nearest; completing Oct 15 adds a mirror.
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await window.keyboard.type('!')
    await expect(input).toHaveText('2026-10-15! Prepare 2026-10-20')
    await window.keyboard.press('Meta+Enter')
    await expect(input).toHaveClass(/node-input-struck/u)
    await expect(input).toBeFocused()
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.mouse.move(600, 20)
      await expect(window).toHaveScreenshot(screenshotName(`agenda-editing-${appearance}.png`))
    }
    const geometry = await input.evaluate((element) => ({
      text: element.textContent,
      height: element.getBoundingClientRect().height,
      activeHeight: element.querySelector('.agenda-date-active')!.getBoundingClientRect().height,
    }))
    expect(geometry.text).toBe('2026-10-15! Prepare 2026-10-20')
    expect(geometry.height).toBeGreaterThanOrEqual(geometry.activeHeight)
  })

  // @requirement PRODUCT.md §23.10
  test('blocks structural commands and contextual editing while retaining direct text editing', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const context = window.locator('.agenda-row[data-node-id="context"]').first()
    await context.click()
    for (const key of ['Tab', 'Shift+Tab', 'Meta+Backspace', 'Meta+Enter', 'Enter', 'Backspace', 'i', 'o', 'R'])
      await window.keyboard.press(key)
    await expect(context).toBeFocused()
    await expect(context).toHaveText('Context')
    await expect(context.locator('.node-input')).toHaveCount(0)
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    await setCursor(input, 12)
    for (const key of ['Tab', 'Shift+Tab', 'Meta+Backspace', 'Meta+,']) await window.keyboard.press(key)
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      for (const command of ['>', '<', 'dd', 'dj', 'dk', 'cj', 'ck', 'yj', 'yk', 'gp', 'gP', 'gJ', 'p', 'P', 'V', 'J'])
        await window.keyboard.type(command)
    }
    await expect(input).toHaveText('2026-10-14 Prepare 2026-10-20')
    await expect(input).toBeFocused()
    await window.keyboard.press('Meta+p')
    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Context')
    expect(readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.id)).toEqual(['first', 'second'])
  })

  // @requirement PRODUCT.md §23.9
  // @requirement PRODUCT.md §23.8
  test('uses ordinary Cut and Paste and history, and persists edits across restart', async ({ userDataDir }) => {
    seed(userDataDir)
    await lockSystemClipboard()
    const { window, app } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    await window.evaluate(() => {
      for (const name of ['cut', 'copy', 'paste'])
        document.addEventListener(name, (event) => event.preventDefault(), true)
    })
    await writeClipboardText(app, 'READY ')
    await setCursor(input, 11)
    await window.keyboard.press('Meta+v')
    await expect(input).toHaveText('2026-10-14 READY Prepare 2026-10-20')
    await window.keyboard.press('Meta+z')
    await expect(input).toHaveText('2026-10-14 Prepare 2026-10-20')
    await window.keyboard.press('Meta+Shift+z')
    await expect(input).toHaveText('2026-10-14 READY Prepare 2026-10-20')
    await setCursor(input, 11)
    await window.keyboard.down('Shift')
    await window.keyboard.press('ArrowRight')
    await window.keyboard.up('Shift')
    await window.keyboard.press('Meta+x')
    await expect(input).toHaveText('2026-10-14 EADY Prepare 2026-10-20')
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('R')
    await window.keyboard.press('Meta+z')
    await expect(input).toHaveText('2026-10-14 READY Prepare 2026-10-20')
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children[0]!.text, { timeout: 20000 })
      .toBe('2026-10-14 READY Prepare 2026-10-20')
    await app.close()
    const restarted = await launchTree(userDataDir)
    await setAgendaToday(restarted.window)
    await restarted.window.keyboard.press('Meta+p')
    await expect(restarted.window.locator('.agenda-row[data-node-id="first"]').first()).toHaveText(
      '2026-10-14 READY Prepare 2026-10-20',
    )
  })

  // @requirement PRODUCT.md §23.11
  test('creates a dated last root from a day container in Insert and persists it', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await expect(window.locator(`[data-agenda-key="${dayKey(10, 8)}"]`)).toBeFocused()
    if (mode === 'vim') await window.keyboard.press('Escape')
    await window.keyboard.press(mode === 'vim' ? 'o' : 'Enter')
    const created = window.locator('.agenda-row[aria-selected="true"] .node-input')
    await expect(created).toBeFocused()
    await expect(created).toHaveText('2026-10-08 ')
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await window.keyboard.type('Plan')
    await expect(created).toHaveText('2026-10-08 Plan')
    await expect(window.locator(`[data-agenda-key^="node:${dayNumber(10, 8)}:"]`)).toHaveCount(1)
    await expect
      .poll(() => readPersisted(userDataDir).document.roots.map((entry) => entry.text), { timeout: 20000 })
      .toEqual(['Context', '2026-10-08 Plan'])
    expect(readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.id)).toEqual(['first', 'second'])
  })

  // @requirement PRODUCT.md §23.11
  test('creates for the preceding day from a gap, one Undo removes it, and gaps ignore creation keys', async ({
    userDataDir,
  }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator(`[data-agenda-key="${dayKey(10, 20)}"]`).click()
    await expect(window.locator(`[data-agenda-key="${dayKey(10, 19)}"]`)).toHaveCount(0)
    if (mode === 'vim') await window.keyboard.press('Escape')
    const day = mode === 'vim' ? 19 : 20
    const rowsBefore = await window.locator(`[data-agenda-key^="node:${dayNumber(10, day)}:"]`).count()
    await window.keyboard.press(mode === 'vim' ? 'O' : 'Enter')
    const created = window.locator('.agenda-row[aria-selected="true"] .node-input')
    await expect(created).toBeFocused()
    await expect(created).toHaveText(`2026-10-${day} `)
    await expect(window.locator(`[data-agenda-key="${dayKey(10, day)}"]`)).toHaveCount(1)
    await expect
      .poll(() => readPersisted(userDataDir).document.roots.map((entry) => entry.text), { timeout: 20000 })
      .toEqual(['Context', `2026-10-${day} `])
    await window.keyboard.press('Meta+z')
    await expect(window.locator(`[data-agenda-key^="node:${dayNumber(10, day)}:"]`)).toHaveCount(rowsBefore)
    await expect
      .poll(() => readPersisted(userDataDir).document.roots.map((entry) => entry.text), { timeout: 20000 })
      .toEqual(['Context'])
    const gap = window.locator('[data-agenda-key^="gap:"]').first()
    await gap.click()
    for (const key of mode === 'vim' ? ['Enter', 'o', 'O'] : ['Enter']) await window.keyboard.press(key)
    await expect(gap).toBeFocused()
    await expect(window.locator('.agenda-row[aria-selected="true"] .node-input')).toHaveCount(0)
    expect(readPersisted(userDataDir).document.roots.map((entry) => entry.text)).toEqual(['Context'])
  })

  // @requirement PRODUCT.md §23.11
  test('splits a dated node at the caret with the displayed date and one Undo restores it', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [node('context', 'Context', [node('plan', '2026-10-14 Prepare release')])] },
      location: { currentParentId: null, selectedNodeId: 'context' },
    })
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="plan"]').first().click()
    const plan = window.getByRole('textbox', { name: 'Agenda node plan', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await setCursor(plan, '2026-10-14 Prepare'.length)
    await window.keyboard.press('Enter')
    const created = window.locator('.agenda-row[aria-selected="true"] .node-input')
    await expect(created).toBeFocused()
    await expect(created).toHaveText('2026-10-14 release')
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    // The contextual `Context` row plus the two dated nodes.
    await expect(window.locator(`[data-agenda-key^="node:${dayNumber(10, 14)}:"]`)).toHaveCount(3)
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.text), {
        timeout: 20000,
      })
      .toEqual(['2026-10-14 Prepare', '2026-10-14 release'])
    await window.keyboard.press('Meta+z')
    await expect(window.locator(`[data-agenda-key^="node:${dayNumber(10, 14)}:"]`)).toHaveCount(2)
    await expect(window.getByRole('textbox', { name: 'Agenda node plan', exact: true })).toHaveText(
      '2026-10-14 Prepare release',
    )
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.text), {
        timeout: 20000,
      })
      .toEqual(['2026-10-14 Prepare release'])
  })

  // @requirement PRODUCT.md §23.11
  test('places the caret after the inherited date and ignores Enter on a contextual ancestor', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [node('context', 'Context', [node('plan', '2026-10-14 Prepare release')])] },
      location: { currentParentId: null, selectedNodeId: 'context' },
    })
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="plan"]').first().click()
    const plan = window.getByRole('textbox', { name: 'Agenda node plan', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await setCursor(plan, '2026-10-14 Prepare'.length)
    await window.keyboard.press('Enter')
    const created = window.locator('.agenda-row[aria-selected="true"] .node-input')
    await expect(created).toBeFocused()
    await window.keyboard.type('X')
    await expect(created).toHaveText('2026-10-14 Xrelease')
    await expect
      .poll(() => readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.text), {
        timeout: 20000,
      })
      .toEqual(['2026-10-14 Prepare', '2026-10-14 Xrelease'])
    const context = window.locator('.agenda-row[data-node-id="context"]').first()
    await context.click()
    await window.keyboard.press('Enter')
    await expect(context).toBeFocused()
    await expect(window.locator('.agenda-row[aria-selected="true"] .node-input')).toHaveCount(0)
    expect(readPersisted(userDataDir).document.roots[0]!.children).toHaveLength(2)
  })

  // @requirement PRODUCT.md §23.10
  test('deletes an empty childless match but preserves an empty match with children', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="second"]').first().click()
    const second = window.getByRole('textbox', { name: 'Agenda node second', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Backspace')
    await expect(second).toHaveText('')
    await window.keyboard.press('Backspace')
    await expect(second).toBeFocused()
    await window.keyboard.press('Meta+z')
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const first = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Backspace')
    await expect(first).toHaveText('')
    await window.keyboard.press('Backspace')
    await expect(window.locator('.agenda-row[data-node-id="first"]')).toHaveCount(0)
    await expect(window.locator('.agenda-row[data-node-id="context"]').first()).toBeFocused()
    await window.keyboard.press('Meta+z')
    await window.keyboard.press('Meta+z')
    await expect(window.locator('.agenda-row[data-node-id="first"]')).toHaveCount(2)
  })
})
