// @editing-modes: independent
import { test, expect, capture, pressPaste } from './fixtures.mts'
import type { Locator, Page } from '@playwright/test'

const ready = (page: Page) => page.waitForFunction(() => window.prototypeStore?.getSnapshot().status === 'ready')
const rowInput = (page: Page, id: string) => page.locator(`.node-row[data-node-id="${id}"] .node-input`)
const text = (input: Locator) =>
  input.evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value : element.textContent))

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!)
  await ready(page)
  await page.evaluate(async () => {
    await window.treeApi.save({
      version: 1,
      document: {
        roots: [
          { id: 'parent', text: '2026-10-18 Parent', children: [{ id: 'child', text: 'Child', children: [] }] },
          {
            id: 'link',
            text: 'https://example.com',
            links: [{ start: 0, end: 19, url: 'https://example.com' }],
            children: [],
          },
          ...Array.from({ length: 40 }, (_, i) => ({ id: `row-${i}`, text: `Row ${i}`, children: [] })),
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
    })
    await window.treeApi.setCommandHistory(['toggle-always-on-top'])
  })
  await page.reload()
  await ready(page)
  await page.evaluate(() => {
    window.shortcutEvents = []
    // Window capture runs before the command panel's document capture listener.
    window.addEventListener(
      'keydown',
      (event) => {
        if (!event.metaKey && !event.ctrlKey) return
        setTimeout(() =>
          window.shortcutEvents.push({ key: event.key.toLowerCase(), prevented: event.defaultPrevented }),
        )
      },
      true,
    )
    window.addEventListener(
      'paste',
      (event) => {
        setTimeout(() => {
          window.pastePrevented = event.defaultPrevented
        })
      },
      true,
    )
  })
}

// @requirement PRODUCT.md §1.5
for (const [profile, modifier, otherModifier, label] of [
  ['apple', 'Meta', 'Control', '⌘Q'],
  ['other', 'Control', 'Meta', 'Ctrl+Q'],
] as const) {
  test(`${profile}: routes application shortcuts and formats the command panel`, async ({ newContext, baseURL }) => {
    const context = await newContext({ shortcutPlatform: profile })
    const page = await context.newPage()
    await seed(page, baseURL)
    const press = (key: string) => page.keyboard.press(`${modifier}+${key}`)
    const state = () =>
      page.evaluate(() => {
        const s = window.prototypeStore.getSnapshot() as ReadyEditorSnapshot
        return { location: s.location, agenda: !!s.agenda, parent: s.document.roots[0]! }
      })
    await rowInput(page, 'parent').focus()

    await page.keyboard.press(`${otherModifier}+p`)

    expect((await state()).agenda).toBe(false)

    await press('p')

    await expect.poll(async () => (await state()).agenda).toBe(true)

    await press('p')

    await expect.poll(async () => (await state()).agenda).toBe(false)

    await press('e')

    await expect(rowInput(page, 'child')).toBeVisible()

    await press('e')

    await expect(rowInput(page, 'child')).toHaveCount(0)

    await press('.')

    await expect.poll(async () => (await state()).location.currentParentId).toBe('parent')

    await press(',')

    await expect.poll(async () => (await state()).location.currentParentId).toBe(null)

    await press('Enter')

    await expect.poll(async () => (await state()).parent.struckThrough).toBe(true)

    await press('z')

    await expect.poll(async () => !!(await state()).parent.struckThrough).toBe(false)

    await press('Shift+z')

    await expect.poll(async () => (await state()).parent.struckThrough).toBe(true)

    await press('0')
    await press('y')
    await press('Backspace')

    await expect(rowInput(page, 'parent')).toHaveCount(0)

    await press('z')

    await expect(rowInput(page, 'parent')).toBeVisible()

    await press('Shift+p')
    const panel = page.getByRole('listbox', { name: 'Application commands' })

    await expect(panel).toBeVisible()
    await expect(panel.locator('.command-name')).toHaveText([
      'back-up-to-folder',
      'export-notes',
      'find',
      'find-next',
      'find-previous',
      'import-notes',
      'quit',
      'restore-from-folder',
      'search-all-nodes',
      'set-theme-auto',
      'set-theme-dark',
      'set-theme-light',
      'show-agenda',
      'show-tree',
      'toggle-vim-mode',
    ])
    await expect(page.locator('.command-count')).toHaveText('15 of 15')

    await capture(page, `${profile}-available-commands.png`)
    const selected = () => panel.locator('[aria-selected="true"]').getAttribute('id')
    const first = await selected()

    await page.keyboard.press('Control+n')

    expect(await selected()).not.toBe(first)

    await page.keyboard.press('Control+p')

    expect(await selected()).toBe(first)

    await page.getByRole('combobox', { name: 'Command', exact: true }).fill('quit')

    await expect(page.locator('#command-quit .command-shortcut')).toHaveText(label)

    await capture(page, `${profile}-shortcut-label.png`)
    await page.setViewportSize({ width: 390, height: 760 })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

    await expect(page.locator('#command-quit .command-shortcut')).toBeInViewport()

    await capture(page, `${profile}-shortcut-label-narrow.png`)
    const geometry = (await page.locator('#command-quit .command-shortcut').boundingBox())!

    expect(geometry.x).toBeGreaterThanOrEqual(0)
    expect(geometry.x + geometry.width).toBeLessThanOrEqual(390)

    await page.keyboard.press('Escape')
    await page.evaluate(() => window.treeApi.setVimEnabled(true))
    await rowInput(page, 'parent').focus()

    await page.keyboard.press('Escape')
    await page.keyboard.press(':')

    await expect(panel.locator('.command-name')).toHaveCount(15)

    await page.getByRole('combobox', { name: 'Command', exact: true }).fill('toggle-always-on-top')

    await expect(panel.getByRole('option')).toHaveCount(0)
    await expect(page.locator('.command-count')).toHaveText('0 of 15')

    await page.keyboard.press('Enter')

    await expect(page.locator('.command-error')).toHaveText('Not a command: toggle-always-on-top')
    expect(await page.evaluate(() => window.treeApi.getCommandHistory())).toEqual(['toggle-always-on-top'])
    for (const key of ['p', 'e', '.', ',', 'enter', 'z', '0', 'y', 'backspace'] as const) {
      await expect
        .poll(
          () =>
            page.evaluate(
              (key) => window.shortcutEvents.filter((event) => event.key === key && event.prevented).length,
              key,
            ),
          `Application must prevent ${modifier}+${key}`,
        )
        .toBeGreaterThan(0)
    }
  })

  test(`${profile}: owns clipboard commands, Vim precedence and buffered quit`, async ({ newContext, baseURL }) => {
    const context = await newContext({ shortcutPlatform: profile })

    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const page = await context.newPage()
    await seed(page, baseURL)
    const press = (key: string) => page.keyboard.press(`${modifier}+${key}`)
    const input = rowInput(page, 'parent')

    await input.fill('Clipboard text')
    await press('a')

    expect(await page.evaluate(() => getSelection()!.toString())).toBe('Clipboard text')

    await press('c')

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Clipboard text')

    await press('x')

    await expect(input).toHaveText('')

    await press('z')

    await expect(input).toHaveText('Clipboard text')

    await press('Shift+z')

    await expect(input).toHaveText('')

    await pressPaste(page, modifier)

    await expect(input).toHaveText('Clipboard text')
    await expect.poll(() => page.evaluate(() => window.pastePrevented)).toBe(true)
    for (const key of ['a', 'c', 'x', 'z'] as const) {
      expect(await page.evaluate((key) => window.shortcutEvents.some((e) => e.key === key && e.prevented), key)).toBe(
        true,
      )
    }

    await page.evaluate(() => window.treeApi.setVimEnabled(true))
    await input.focus()

    await page.keyboard.press('Escape')

    await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')

    const selectedNode = () =>
      page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).location.selectedNodeId)

    await page.keyboard.press('Control+d')

    await expect.poll(selectedNode).not.toBe('parent')

    await page.keyboard.press('Control+u')

    await expect.poll(selectedNode).toBe('parent')

    await press('.')
    await page.keyboard.press('Control+o')

    await expect
      .poll(() =>
        page.evaluate(() => (window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).location.currentParentId),
      )
      .toBe(null)

    await input.focus()

    await page.keyboard.type('0x')

    await expect(input).toHaveText('lipboard text')

    await page.keyboard.press('u')

    await expect(input).toHaveText('Clipboard text')

    await page.keyboard.press('Control+r')

    await expect(input).toHaveText('lipboard text')

    await page.evaluate(() => navigator.clipboard.writeText('PASTE'))
    for (const mode of ['normal', 'visual'] as const) {
      await page.keyboard.press('Escape')
      await page.keyboard.press('0')
      if (mode === 'visual') await page.keyboard.press('v')
      const before = await text(input)

      await pressPaste(page, modifier)

      await expect(input).toHaveText('PASTE' + before)

      await page.keyboard.press('Escape')
      await page.keyboard.press('u')

      await expect(input).toHaveText(before)
    }

    // Link opening uses the injected modifier rather than the host OS convention.
    await page.evaluate(() => {
      window.openedLinks = []
      window.open = (url) => {
        window.openedLinks.push(url)
        return null
      }
    })
    const link = page.locator('.node-row[data-node-id="link"] a')
    // macOS reserves native Ctrl+click for its context menu even under a navigator override.
    // Linux exercises the actual Control pointer sequence; Mac checks the renderer click contract.
    if (process.platform === 'darwin' && profile === 'other') await link.dispatchEvent('click', { ctrlKey: true })
    else await link.click({ modifiers: [modifier] })

    expect(await page.evaluate(() => window.openedLinks)).toEqual(['https://example.com'])

    await input.focus()

    await press('Shift+p')
    const panel = page.getByRole('listbox', { name: 'Application commands' })
    const firstCommand = await panel.locator('[aria-selected="true"]').getAttribute('id')

    await page.keyboard.press('Control+n')

    expect(await panel.locator('[aria-selected="true"]').getAttribute('id')).not.toBe(firstCommand)

    await page.keyboard.press('Control+p')

    expect(await panel.locator('[aria-selected="true"]').getAttribute('id')).toBe(firstCommand)

    await page.keyboard.press('Escape')
    await page.keyboard.press('i')
    await press('a')
    await page.keyboard.type('Friday')
    const popup = page.locator('.date-popup')

    await expect(popup.getByRole('option')).toHaveCount(2)

    const initialSuggestion = (await popup.locator('[aria-selected="true"]').textContent())!

    await page.keyboard.press('Control+n')

    await expect(popup.locator('[aria-selected="true"]')).not.toHaveText(initialSuggestion)

    await page.keyboard.press('Control+p')

    await expect(popup.locator('[aria-selected="true"]')).toHaveText(initialSuggestion)
    expect(await page.evaluate(() => !!(window.prototypeStore.getSnapshot() as ReadyEditorSnapshot).agenda)).toBe(false)

    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.keyboard.type('0RZ')
    const buffered = await text(input)

    await page.evaluate(() => {
      window.closeCalls = 0
      window.close = () => window.closeCalls++
    })
    await press('q')

    await expect.poll(() => page.evaluate(() => window.closeCalls)).toBe(1)

    await page.reload()
    await ready(page)

    await expect.poll(() => text(input)).toBe(buffered)
  })
}
