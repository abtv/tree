// @editing-modes: both
import type { TreeNode } from '../../src/domain/document'
import {
  describeForEachEditingMode,
  closeApp,
  expect,
  fireIdleSave,
  idleSavePoll,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  readPersisted,
  tryReadPersisted,
  writeClipboardText,
  writeClipboardImageSized,
  firePaste,
  unlockSystemClipboard,
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
          node('first', '2026-10-09 Prepare 2026-10-11'),
          node('second', '2026-10-09 Review', [node('child', '2026-10-11 Child')]),
        ]),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'context' },
  })
}

test.describe('Agenda concurrent clipboard writes', () => {
  test.use({ editingMode: 'standard' })

  // @requirement PRODUCT.md §23.9
  // @requirement PRODUCT.md §16.1
  test('finishes two pending image pastes on quit without creating an Agenda sibling', async ({ userDataDir }) => {
    seed(userDataDir)
    const original = readPersisted(userDataDir).document
    const { app, window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    await app.evaluate(() => {
      const control = globalThis as typeof globalThis & { agendaImageWrites: (() => void)[] }
      control.agendaImageWrites = []
      globalThis.__treeIpc.wrap('tree:write-attachment', async (original, ...args) => {
        await original(...args)
        await new Promise<void>((resolve) => control.agendaImageWrites.push(resolve))
      })
    })
    await writeClipboardImageSized(app, 80, 80)

    await firePaste(input)
    await firePaste(input)
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as typeof globalThis & { agendaImageWrites: unknown[] }).agendaImageWrites.length,
        ),
      )
      .toBe(2)
    unlockSystemClipboard()
    await app.evaluate(() => {
      ;(globalThis as typeof globalThis & { agendaImageWrites: (() => void)[] }).agendaImageWrites[0]!()
    })
    await expect(window.locator('.agenda-row[data-node-id="first"] img')).toHaveCount(2)
    await app.evaluate(() => {
      ;(globalThis as typeof globalThis & { agendaImageWrites: (() => void)[] }).agendaImageWrites[1]!()
    })
    await closeApp(app)

    const persisted = readPersisted(userDataDir).document
    const attachment = persisted.roots[0]!.children[0]!.attachment
    expect(attachment).toBeDefined()
    expect(persisted).toEqual({
      roots: [
        {
          ...original.roots[0],
          children: [{ ...original.roots[0]!.children[0], attachment }, original.roots[0]!.children[1]],
        },
      ],
    })
  })
})

describeForEachEditingMode('Agenda editing', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §23.4
  // @requirement PRODUCT.md §23.9
  // @requirement PRODUCT.md §23.10
  // @requirement PRODUCT.md §23.13
  test('native no-ops preserve each selected non-editable row and direct-match caret', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)

    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const original = readPersisted(userDataDir).document
    if (mode === 'vim') await window.keyboard.press('Escape')
    const day = window.locator(`.agenda-row[data-agenda-key="${dayKey(10, 9)}"]`)
    for (const target of [day]) {
      await target.click()
      // App.agenda-policy.test.tsx owns the full command matrix with the real App/store.
      // Retain native Tab focus suppression and a prohibited editing key for every row role.
      for (const key of ['Tab', mode === 'vim' ? 'i' : 'Backspace']) {
        await window.keyboard.press(key)

        await expect(target).toBeFocused()
        await expect(target).toHaveAttribute('aria-selected', 'true')
        if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      }

      await fireIdleSave(window)
      await window.evaluate(() =>
        (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
      )

      expect(readPersisted(userDataDir).document).toEqual(original)
    }

    await window.locator('.agenda-role-match').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })
    if (mode === 'vim') await window.keyboard.press('Escape')

    await setCursor(input, 12)
    const cursor = () =>
      input.evaluate((element) => {
        const selection = document.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(element)
        range.setEnd(selection.anchorNode!, selection.anchorOffset)
        return range.toString().length
      })
    const before = await cursor()
    for (const key of ['Tab', 'Shift+Tab']) {
      await window.keyboard.press(key)

      await expect(input).toBeFocused()
      expect(await cursor()).toBe(before)
      if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    }

    await fireIdleSave(window)
    // A queued load waits for preceding saves; an immediate disk read could observe stale data.
    await window.evaluate(() =>
      (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
    )

    expect(readPersisted(userDataDir).document).toEqual(original)
  })

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
                text: `2026-10-09 ${url} 2026-10-11`,
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

      if (mode === 'standard') await expect(window).toHaveScreenshot(screenshotName(`agenda-links-${appearance}.png`))
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
    const { window, app } = await launchTree(userDataDir)

    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })

    await setCursor(input, await input.evaluate((element) => element.textContent!.length))
    await writeClipboardText(app, ' alpha\r\nbeta')
    await firePaste(input)

    await expect(input).toHaveText('2026-10-09 Prepare 2026-10-11 alpha\nbeta')

    unlockSystemClipboard()

    await expect(input).toBeFocused()

    await fireIdleSave(window)

    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]!.children.map((child) => child.text), idleSavePoll)
      .toEqual(['2026-10-09 Prepare 2026-10-11 alpha\nbeta', '2026-10-09 Review'])

    await writeClipboardImageSized(app, 80, 80)
    await firePaste(input)

    await expect(window.locator('.agenda-row[data-node-id="first"] img')).toHaveCount(2)

    unlockSystemClipboard()
    const image = window.locator('.agenda-row[data-node-id="first"] img').first()

    await expect(image).toBeVisible()
    expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]!.children[0]!.attachment, {
        timeout: 20000,
      })
      .toBeDefined()

    // Finish the first image's background metadata write before testing a no-op paste.
    await expect(image.locator('..')).not.toHaveAttribute('data-recognition-incomplete', 'true')
    await fireIdleSave(window)
    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]!.children[0]!.attachment?.searchText, idleSavePoll)
      .toBe('')
    const withImage = readPersisted(userDataDir).document
    await writeClipboardImageSized(app, 40, 40)
    await firePaste(input)
    unlockSystemClipboard()
    await fireIdleSave(window)
    await window.evaluate(() =>
      (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
    )

    expect(readPersisted(userDataDir).document).toEqual(withImage)
    await expect(window.locator('.agenda-row[data-node-id="first"] img')).toHaveCount(2)

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

      if (mode === 'standard')
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

    await expect(input).toHaveText('2026-10-09 にPrepare 2026-10-11')
    expect(
      await input.evaluate(
        (element) =>
          element.querySelector('.agenda-date-active') ===
          (globalThis as unknown as { composingDateSpan: Element }).composingDateSpan,
      ),
    ).toBe(true)

    await session.send('Input.insertText', { text: '日本' })

    await expect(input).toHaveText('2026-10-09 日本Prepare 2026-10-11')
    await expect(input).toBeFocused()

    await window.keyboard.down('a')
    await window.keyboard.down('a')
    await window.keyboard.down('a')
    await window.keyboard.up('a')

    await expect(input).toHaveText('2026-10-09 日本aaaPrepare 2026-10-11')

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
    await window.keyboard.press('Backspace')
    await window.keyboard.type('10')

    await expect(input).toHaveText('2026-10-10 Prepare 2026-10-11')
    await expect(input).toBeFocused()
    expect(
      await input.evaluate(
        (element) => element === (globalThis as unknown as { originalAgendaInput: Element }).originalAgendaInput,
      ),
    ).toBe(true)
    await expect(input.locator('.agenda-date-active')).toHaveText('2026-10-11')
    // Once the original date becomes incomplete, Oct 11 is nearest; completing Oct 10 adds a mirror.
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')

    await window.keyboard.type('!')

    await expect(input).toHaveText('2026-10-10! Prepare 2026-10-11')

    await window.keyboard.press('Meta+Enter')

    await expect(input).toHaveClass(/node-input-struck/u)
    await expect(input).toBeFocused()

    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await window.mouse.move(600, 20)
      // Native macOS scrollbars fade independently of CSS animations. Exclude only their edge.
      const clip = await window.evaluate(() => ({ x: 0, y: 0, width: innerWidth - 12, height: innerHeight }))

      if (mode === 'standard')
        await expect(window).toHaveScreenshot(screenshotName(`agenda-editing-${appearance}.png`), { clip })
    }
    const geometry = await input.evaluate((element) => ({
      text: element.textContent,
      height: element.getBoundingClientRect().height,
      activeHeight: element.querySelector('.agenda-date-active')!.getBoundingClientRect().height,
    }))

    expect(geometry.text).toBe('2026-10-10! Prepare 2026-10-11')
    expect(geometry.height).toBeGreaterThanOrEqual(geometry.activeHeight)
  })

  // @requirement PRODUCT.md §23.10
  test('blocks structural commands and day editing while retaining direct text editing', async ({ userDataDir }) => {
    seed(userDataDir)
    const { window } = await launchTree(userDataDir)

    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    const context = window.locator(`.agenda-row[data-agenda-key="${dayKey(10, 9)}"]`)

    await context.click()
    for (const key of ['Tab', 'Shift+Tab', 'Meta+Backspace', 'Meta+Enter', 'Enter', 'Backspace', 'i', 'o', 'R'])
      await window.keyboard.press(key)

    await expect(context).toBeFocused()
    await expect(context).toContainText('Fri Oct 9')
    await expect(context.locator('.node-input')).toHaveCount(0)

    await window.locator('.agenda-row[data-node-id="first"]').first().click()
    const input = window.getByRole('textbox', { name: 'Agenda node first', exact: true })

    await setCursor(input, 12)
    for (const key of ['Tab', 'Shift+Tab', 'Meta+Backspace', 'Meta+,']) await window.keyboard.press(key)
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      for (const command of ['>', '<', 'dd', 'dj', 'dk', 'cj', 'ck', 'yj', 'yk', 'gp', 'gP', 'gJ', 'p', 'P', 'V'])
        await window.keyboard.type(command)
    }

    await expect(input).toHaveText('2026-10-09 Prepare 2026-10-11')
    await expect(input).toBeFocused()

    await window.keyboard.press('Meta+p')

    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue('Context')
    expect(readPersisted(userDataDir).document.roots[0]!.children.map((entry) => entry.id)).toEqual(['first', 'second'])
  })

  // @requirement PRODUCT.md §23.9
  // @requirement PRODUCT.md §23.8
  test('uses ordinary Cut and Paste and history, and persists edits across restart', async ({ userDataDir }) => {
    seed(userDataDir)
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

    await expect(input).toHaveText('2026-10-09 READY Prepare 2026-10-11')

    await window.keyboard.press('Meta+z')

    await expect(input).toHaveText('2026-10-09 Prepare 2026-10-11')

    await window.keyboard.press('Meta+Shift+z')

    await expect(input).toHaveText('2026-10-09 READY Prepare 2026-10-11')

    await setCursor(input, 11)
    await window.keyboard.down('Shift')
    await window.keyboard.press('ArrowRight')
    await window.keyboard.up('Shift')
    await window.keyboard.press('Meta+x')

    await expect(input).toHaveText('2026-10-09 EADY Prepare 2026-10-11')
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('R')

    unlockSystemClipboard()
    await window.keyboard.press('Meta+z')

    await expect(input).toHaveText('2026-10-09 READY Prepare 2026-10-11')

    await fireIdleSave(window)

    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]!.children[0]!.text, idleSavePoll)
      .toBe('2026-10-09 READY Prepare 2026-10-11')

    await app.close()
    const restarted = await launchTree(userDataDir)

    await setAgendaToday(restarted.window)
    await restarted.window.keyboard.press('Meta+p')

    await expect(restarted.window.locator('.agenda-row[data-node-id="first"]').first()).toHaveText(
      '2026-10-09 READY Prepare 2026-10-11',
    )
  })

  // @requirement PRODUCT.md §23.11

  // @requirement PRODUCT.md §23.11

  // @requirement PRODUCT.md §23.11

  // @requirement PRODUCT.md §23.11

  // @requirement PRODUCT.md §23.10
})
