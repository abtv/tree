// @editing-modes: vim
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clickApplicationMenuItem,
  closeApp,
  expect,
  fireIdleSave,
  launchTree,
  lockSystemClipboard,
  node,
  pressShifted,
  seedDocument,
  setAgendaToday,
  setMainWindowContentSize,
  screenshotContentSize,
  test,
} from './fixtures'

test('keeps draft feedback out of persistence and forgets confirmed recall after restart', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'one', text: 'apple apple', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const first = await launchTree(userDataDir, { initialMode: 'normal' })

  await first.window.clock.install()
  await first.app.evaluate(() => {
    const probe = globalThis as typeof globalThis & { searchSaves: number }
    probe.searchSaves = 0
    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      probe.searchSaves++
      return original(...args)
    })
  })
  const before = await first.window.evaluate(() =>
    (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
  )

  await first.window.keyboard.press('/')
  const prompt = first.window.getByRole('textbox', { name: 'Search', exact: true })

  await prompt.fill('apple')

  await expect(first.window.locator('.search-count')).toHaveText('2')
  await expect(first.window.locator('.search-match')).toHaveCount(2)

  await fireIdleSave(first.window)

  expect(
    await first.window.evaluate(() =>
      (globalThis as typeof globalThis & { treeApi: { load(): Promise<unknown> } }).treeApi.load(),
    ),
  ).toEqual(before)
  expect(await first.app.evaluate(() => (globalThis as typeof globalThis & { searchSaves: number }).searchSaves)).toBe(
    0,
  )

  await first.window.keyboard.press('Enter')

  await expect(first.window.locator('.search-count')).toHaveText('2 / 2')

  await closeApp(first.app)
  const second = await launchTree(userDataDir, { initialMode: 'normal', vimPreference: 'saved' })

  await second.window.keyboard.press('/')

  await expect(second.window.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('')

  await closeApp(second.app)
})

test('refreshes active search through subtree deletion and Vim Undo and Redo commands', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: 'apple apple', children: [{ id: 'child', text: 'apple', children: [] }] },
        { id: 'two', text: 'apple', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })

  await window.keyboard.press('/')
  await window.getByRole('textbox', { name: 'Search', exact: true }).fill('apple')
  await window.keyboard.press('Enter')

  await expect(window.locator('.search-count')).toHaveText('2 / 4')

  await lockSystemClipboard()
  await window.keyboard.press('d')
  await window.keyboard.press('d')

  await expect(window.locator('.search-count')).toHaveText('1')
  await expect(window.locator('[data-node-id="two"] .node-input')).toBeFocused()

  await window.keyboard.press('u')

  await expect(window.locator('.search-count')).toHaveText('4')

  await window.keyboard.press('Control+r')

  await expect(window.locator('.search-count')).toHaveText('1')

  await window.keyboard.press('u')

  await expect(window.locator('.search-count')).toHaveText('4')

  await window.keyboard.press('n')

  await expect(window.locator('.search-count')).toHaveText('2 / 4')

  await window.keyboard.press('n')

  await expect(window.locator('.search-count')).toHaveText('3 / 4')
  await expect(window.locator('[data-node-id="child"] .node-input')).toBeFocused()

  await closeApp(app)
})

test('lets newer Insert and pointer actions cancel a pending search destination', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: 'apple apple', children: [] },
        { id: 'two', text: 'next apple', children: [] },
        { id: 'three', text: 'manual destination', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })

  await window.clock.install()
  await window.clock.pauseAt(new Date())
  await window.keyboard.press('/')
  await window.getByRole('textbox', { name: 'Search', exact: true }).fill('apple')
  await window.keyboard.press('Enter')
  await window.keyboard.press('i')
  await window.clock.runFor(1000)

  await expect(node(window, 1)).toBeFocused()
  await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')

  await window.keyboard.type('X')

  await expect(node(window, 1)).toHaveText('Xapple apple')

  await window.keyboard.press('Escape')
  await window.keyboard.press('n')
  await node(window, 3).click()
  await window.clock.runFor(1000)

  await expect(node(window, 3)).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('3')

  await window.keyboard.press('n')
  await window.keyboard.press('Meta+Shift+p')
  await window.clock.runFor(1000)

  await expect(window.getByRole('combobox', { name: 'Command' })).toBeFocused()

  await closeApp(app)
})

test('searches folded text without moving during entry and recalls confirmed queries', async ({
  userDataDir,
}, testInfo) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: 'apple apple', children: [{ id: 'child', text: 'hidden apple', children: [] }] },
        { id: 'two', text: 'last apple', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })

  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })

  await expect(prompt).toBeFocused()

  await prompt.pressSequentially('apple')

  await expect(window.locator('.search-count')).toHaveText('4')
  await expect(prompt).toBeFocused()
  await expect(window.locator('.search-match')).toHaveCount(3)

  await window.keyboard.press('Enter')

  await expect(window.locator('.search-count')).toHaveText('2 / 4')

  await window.keyboard.press('n')

  await expect(window.locator('.search-count')).toHaveText('3 / 4')
  await expect(window.getByRole('textbox', { name: 'Node 2', exact: true })).toBeFocused()

  await window.screenshot({ path: testInfo.outputPath('search-folded-result.png') })
  await window.keyboard.press('Escape')

  await expect(window.locator('.search-match')).toHaveCount(0)

  await window.keyboard.press('/')

  await expect(prompt).toHaveValue('apple')
  expect(await prompt.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, 5])

  await prompt.pressSequentially('n:N/')

  await expect(prompt).toHaveValue('n:N/')
  await expect(window.locator('.command-panel')).toHaveCount(0)

  await window.keyboard.press('Escape')
  await window.keyboard.press('/')

  await expect(prompt).toHaveValue('apple')

  await window.keyboard.press('Escape')

  await expect(node(window, 2)).toBeFocused()

  await closeApp(app)
})

test('keeps a hidden logical origin through manual folding and cancels on text clicks and command entry', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'one', text: 'parent apple', children: [{ id: 'child', text: 'child apple', children: [] }] },
        { id: 'two', text: 'last apple', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })

  await window.getByRole('button', { name: 'Expand node 1', exact: true }).click()
  await window.locator('[data-node-id="child"] .node-input').click()
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })

  await prompt.pressSequentially('apple')
  await window.getByRole('button', { name: 'Collapse node 1', exact: true }).click()

  await expect(prompt).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('3')

  await window.keyboard.press('Enter')

  await expect(window.locator('[data-node-id="child"] .node-input')).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('2 / 3')

  await window.keyboard.press('/')
  await prompt.pressSequentially('discard')
  await node(window, 1).click()

  await expect(prompt).toHaveCount(0)
  await expect(node(window, 1)).toBeFocused()

  await window.keyboard.press('/')

  await expect(prompt).toHaveValue('apple')

  await window.keyboard.press('Meta+Shift+p')

  await expect(window.getByRole('combobox', { name: 'Command' })).toBeFocused()
  await expect(prompt).toHaveCount(0)

  await window.keyboard.press('Escape')
  await node(window, 1).click()
  await clickApplicationMenuItem(app, 'Edit', 'Vim Editing')

  await expect(window.locator('.search-count')).toHaveCount(0)

  await clickApplicationMenuItem(app, 'Edit', 'Vim Editing')

  await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')

  await window.keyboard.press('/')

  await expect(prompt).toHaveValue('apple')

  await prompt.fill('discard on view change')
  await window.keyboard.press('Meta+p')

  await expect(window.locator('.agenda-list')).toHaveCount(1)
  await expect(prompt).toHaveCount(0)
  await expect(window.locator('.search-count')).toHaveCount(0)

  await window.keyboard.press('Meta+p')
  await window.keyboard.press('/')

  await expect(prompt).toHaveValue('apple')

  await closeApp(app)
})

test('navigates beyond capped counts and mounts highlights after scrolling', async ({ userDataDir }, testInfo) => {
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 150 }, (_, index) => ({ id: `n${index}`, text: `apple ${index}`, children: [] })),
    },
    location: { currentParentId: null, selectedNodeId: 'n0' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })

  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })

  await prompt.pressSequentially('apple')

  await expect(window.locator('.search-count')).toHaveText('100+')

  await window.locator('.scroll-viewport').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })

  await expect(prompt).toBeFocused()
  await expect(window.locator('[data-node-id="n149"] .search-match')).toHaveText('apple')

  await window.screenshot({ path: testInfo.outputPath('search-windowed-draft.png') })
  await window.keyboard.press('Enter')

  await expect(window.locator('[data-node-id="n1"] .node-input')).toBeFocused()

  await window.keyboard.press('1')
  await window.keyboard.press('2')
  await window.keyboard.press('0')
  await window.keyboard.press('n')

  await expect(window.locator('[data-node-id="n121"] .node-input')).toBeFocused()

  await pressShifted(window, 'N')

  await expect(window.locator('[data-node-id="n120"] .node-input')).toBeFocused()

  await closeApp(app)
})

test('composes match, link and date rendering without moving rows or losing Insert text', async ({ userDataDir }) => {
  const url = 'https://example.test/apple'
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'parent',
          text: 'apple heading',
          children: [
            {
              id: 'one',
              text: `apple 2026-10-23 ${url} apple`,
              links: [{ start: 17, end: 17 + url.length, url }],
              children: [],
            },
            {
              id: 'two',
              text: 'next apple in a long synthetic note. This text wraps onto another display line so the search highlight and ordinary caret retain their original character positions while the row height stays unchanged.',
              children: [],
            },
          ],
        },
      ],
    },
    location: { currentParentId: 'parent', selectedNodeId: 'one' },
  })
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })

  await setMainWindowContentSize(app, screenshotContentSize)
  const row = window.locator('[data-node-id="one"]')

  await setAgendaToday(window)
  const before = await row.boundingBox()
  for (const appearance of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: appearance })
    await window.keyboard.press('/')
    await window.getByRole('textbox', { name: 'Search', exact: true }).fill('apple')

    await expect(window.locator('.search-count')).toHaveText('5')
    await expect(row.locator('a .search-match')).toHaveText('apple')
    expect(await row.boundingBox()).toEqual(before)
    await expect(window).toHaveScreenshot(`search-prompt-${appearance}.png`)

    await window.keyboard.press('Enter')

    await expect(row.locator('.node-input')).toBeFocused()
    await expect(row.locator('.search-match-current')).toHaveText('apple')
    await expect(window).toHaveScreenshot(`search-current-${appearance}.png`)

    await window.keyboard.press('Escape')
    await window.keyboard.press('0')
  }

  await window.keyboard.press('n')

  await expect(window.locator('.search-match-current')).toHaveCount(1)

  await window.keyboard.press('i')
  await window.keyboard.type('XYZ')

  await expect(row.locator('.node-input')).toContainText('XYZapple')

  await window.keyboard.press('Escape')
  await closeApp(app)
})

test('preserves the image caret on canceled and absent searches and replaces it on a same-node match', async ({
  userDataDir,
}) => {
  seedDocument(userDataDir, {
    document: {
      roots: [{ id: 'one', text: 'apple text', attachment: { id: 'image', mimeType: 'image/png' }, children: [] }],
    },
    location: { currentParentId: null, selectedNodeId: 'one' },
  })
  const directory = join(userDataDir, 'data', 'attachments')

  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'image.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAABmklEQVR4nO3TMRHAIADAQOSgqYpxBQZ6WWH44fcsGfNbG/g3bgfAywwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAOQJHaVsxH0sYAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const editor = node(window, 1)

  await window.keyboard.press('l')
  await window.keyboard.press('j')

  await expect(editor).toHaveClass(/node-input-image-caret/u)

  await window.keyboard.press('/')
  await window.keyboard.press('Escape')

  await expect(editor).toHaveClass(/node-input-image-caret/u)

  await window.keyboard.press('/')
  await window.getByRole('textbox', { name: 'Search', exact: true }).fill('absent')
  await window.keyboard.press('Enter')

  await expect(window.locator('.search-count')).toHaveText('0')
  await expect(editor).toHaveClass(/node-input-image-caret/u)

  await window.keyboard.press('/')
  await window.getByRole('textbox', { name: 'Search', exact: true }).fill('apple')
  await window.keyboard.press('Enter')

  await expect(editor).not.toHaveClass(/node-input-image-caret/u)
  await expect(editor).toBeFocused()
  await expect(window.locator('.search-count')).toContainText('1 / 1')

  await closeApp(app)
})
