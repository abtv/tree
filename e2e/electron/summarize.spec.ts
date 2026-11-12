// @editing-modes: vim
import {
  test,
  expect,
  launchTree,
  closeApp,
  seedDocument,
  lockSystemClipboard,
  fireIdleSave,
  readPersisted,
} from './fixtures'

test.use({ editingMode: 'vim' })

const seed = (directory: string) =>
  seedDocument(directory, {
    document: {
      roots: [
        {
          id: 'project',
          text: '2026-11-12 Reading club',
          children: [
            { id: 'alice', text: 'Alice will bring the books on Friday.', children: [] },
            { id: 'bob', text: 'Bob will reserve the room. The budget is 50 dollars.', children: [] },
          ],
        },
        { id: 'other', text: 'Other notes', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'project' },
  })

// @requirement PRODUCT.md §15.2
// @requirement PRODUCT.md §20.2.7
test('summarizes with the actual local model and copies once without editing notes', async ({ userDataDir }) => {
  test.skip(
    process.platform !== 'darwin' || process.arch !== 'arm64',
    'Real on-device Apple model requires Apple Silicon macOS',
  )
  test.setTimeout(120_000)
  seed(userDataDir)
  const before = readPersisted(userDataDir).document
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.clock.install()
  await lockSystemClipboard()
  const available = await window.evaluate(() => globalThis.window.treeApi.summarization!.available())
  test.skip(!available, 'Local model is not ready; this run does not establish real inference validation')

  await window.keyboard.press(':')
  await window.getByRole('combobox', { name: 'Command' }).fill('summarize')
  await expect(window.getByRole('option', { selected: true })).not.toHaveAttribute('aria-disabled', 'true')
  await window.keyboard.press('Enter')
  await expect(window.locator('.status-bar')).toContainText('Summary copied.', { timeout: 90_000 })

  const text = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(text).toMatch(/Alice/i)
  expect(text).toMatch(/Bob/i)
  expect(text).toMatch(/Friday/i)
  await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toBeFocused()
  await fireIdleSave(window)
  await window.evaluate(() => globalThis.window.treeApi.load())
  expect(readPersisted(userDataDir).document).toEqual(before)
  await window.screenshot({ path: '.scratch/summarize/complete.png' })
  await closeApp(app)
})

// @requirement PRODUCT.md §15.2
// @requirement PRODUCT.md §20.2.7
test('keeps inference in the background, shows disabled commands, and cancels without late clipboard writes', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await lockSystemClipboard()
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText('Preserve clipboard')
    globalThis.__treeIpc.wrap('tree:summary-available', async () => true)
    globalThis.__treeIpc.wrap(
      'tree:summary-reduce',
      () =>
        new Promise<string>((resolve) => {
          ;(globalThis as typeof globalThis & { finishSummary?: (text: string) => void }).finishSummary = resolve
        }),
    )
  })
  await window.keyboard.press(':')
  await window.getByRole('combobox', { name: 'Command' }).fill('summarize')
  await expect(window.getByRole('option', { selected: true })).not.toHaveAttribute('aria-disabled', 'true')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('button', { name: 'Cancel summarization' })).toBeVisible()
  await window.getByRole('textbox', { name: 'Node 2', exact: true }).click()
  await window.keyboard.press('A')
  await window.keyboard.type(' while summarizing')
  await window.keyboard.press('Escape')
  await window.keyboard.press(':')
  await window.getByRole('combobox', { name: 'Command' }).fill('summarize')
  await expect(window.getByRole('option', { selected: true })).toHaveAttribute('aria-disabled', 'true')
  await window.screenshot({ path: '.scratch/summarize/running-light.png' })
  await window.keyboard.press('Escape')
  await window.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => window.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
  await window.screenshot({ path: '.scratch/summarize/running-dark.png' })
  await window.getByRole('button', { name: 'Cancel summarization' }).click()
  await app.evaluate(() =>
    (globalThis as typeof globalThis & { finishSummary: (text: string) => void }).finishSummary('Late summary'),
  )

  await expect(window.locator('.status-bar')).toContainText('Summarization canceled.')
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Preserve clipboard')
  await expect(window.getByRole('textbox', { name: 'Node 2', exact: true })).toHaveValue(
    'Other notes while summarizing',
  )
  await closeApp(app)
})

// @requirement PRODUCT.md §15.2
test('shows summarize disabled when the system model is unavailable', async ({ userDataDir }) => {
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await app.evaluate(() => {
    globalThis.__treeIpc.wrap('tree:summary-available', async () => false)
  })
  await window.keyboard.press(':')
  await window.getByRole('combobox', { name: 'Command' }).fill('summarize')

  await expect(window.getByRole('option', { selected: true })).toHaveAttribute('aria-disabled', 'true')
  await window.keyboard.press('Enter')
  await expect(window.locator('.command-panel')).toBeVisible()
  await closeApp(app)
})

// @requirement PRODUCT.md §15.2
test('summarizes whole-node selection and Agenda descendants through the production clipboard bridge', async ({
  userDataDir,
}) => {
  test.skip(process.platform !== 'darwin' || process.arch !== 'arm64', 'Native job port requires Apple Silicon macOS')
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.clock.setFixedTime(new Date(2026, 10, 12, 12))
  await lockSystemClipboard()
  await app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { summaryInputs: string[] }
    runtime.summaryInputs = []
    globalThis.__treeIpc.wrap('tree:summary-available', async () => true)
    globalThis.__treeIpc.wrap('tree:summary-reduce', async (_original, _event, _id, text) => {
      runtime.summaryInputs.push(text as string)
      return 'A concise summary.'
    })
  })
  await window.keyboard.press('V')
  await window.keyboard.press('j')
  await window.keyboard.press('Meta+Shift+p')
  await window.getByRole('combobox', { name: 'Command' }).fill('summarize')
  await window.keyboard.press('Enter')
  await expect(window.locator('.summary-status')).toHaveText('Summary copied.')
  const first = await app.evaluate(
    () => (globalThis as typeof globalThis & { summaryInputs: string[] }).summaryInputs[0],
  )
  expect(first).toContain('Alice will bring')
  expect(first).toContain('Other notes')
  expect(first!.match(/Alice will bring/g)).toHaveLength(1)
  await window.keyboard.press('Escape')
  await window.keyboard.press('Meta+p')
  await window.keyboard.press('Meta+Shift+p')
  await window.getByRole('combobox', { name: 'Command' }).fill('summarize')
  await expect(window.getByRole('option', { selected: true })).toHaveAttribute('aria-disabled', 'true')
  await window.keyboard.press('Escape')
  await window.locator('.agenda-row[data-node-id="project"]').click()
  await window.keyboard.press('Meta+Shift+p')
  await window.getByRole('combobox', { name: 'Command' }).fill('summarize')
  await window.keyboard.press('Enter')
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as typeof globalThis & { summaryInputs: string[] }).summaryInputs.length),
    )
    .toBe(2)
  await expect(window.locator('.summary-status')).toHaveText('Summary copied.')
  const second = await app.evaluate(
    () => (globalThis as typeof globalThis & { summaryInputs: string[] }).summaryInputs[1],
  )
  expect(second).toContain('Bob will reserve')
  expect(second).not.toContain('Other notes')
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('A concise summary.')
  await closeApp(app)
})
