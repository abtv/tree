import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'reports/readme')

async function capture() {
  if (process.platform !== 'darwin') throw new Error('README capture requires macOS.')
  const demoBytes = readFileSync(join(root, 'docs/images/demo-document.json'))
  const demo = JSON.parse(demoBytes)
  const dataDirectory = mkdtempSync(join(tmpdir(), 'tree-readme-capture-'))
  const staging = join(dataDirectory, 'screenshots')
  mkdirSync(join(dataDirectory, 'data'))
  mkdirSync(staging)
  writeFileSync(join(dataDirectory, 'data/document.json'), demoBytes)
  writeFileSync(join(dataDirectory, 'data/vim-enabled.json'), 'false')
  let app
  let child
  try {
    app = await electron.launch({
      args: [
        '--force-device-scale-factor=1',
        `--user-data-dir=${dataDirectory}`,
        join(root, 'e2e/electron-entry.cjs'),
        // CI runners have no trackpad, so macOS would draw classic scrollbars that narrow the outline.
        // The user-defaults argument follows the entry, or Electron takes it for the application path.
        '-AppleShowScrollBars',
        'WhenScrolling',
        '--tree-test-appearance=light',
      ],
      cwd: root,
      env: { ...process.env, TREE_E2E_HIDDEN: '1', TREE_E2E_SHORTCUT_STUB: '1' },
      timeout: 15_000,
    })
    child = app.process()
    const page = await app.firstWindow()
    page.setDefaultTimeout(10_000)
    await expect(page.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveText(demo.document.roots[0].text)
    await expect(page.getByRole('button', { name: 'Enable Vim editing', exact: true })).toBeVisible()
    // Expand only synthetic branches; their numbering follows the fixed demo resource.
    for (const index of [1, 4, 11, 5, 9]) {
      await page.getByRole('button', { name: `Expand node ${index}`, exact: true }).click()
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 680))
    await page.emulateMedia({ colorScheme: 'light' })
    await page.locator('main.tree-app').evaluate((element) => element.ownerDocument.fonts.ready)
    const overviewText = await page.locator('[aria-label^="Node "]').allTextContents()
    await page.screenshot({ path: join(staging, 'tree-overview.png'), animations: 'disabled' })
    await page.getByRole('button', { name: 'Enter node 4', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Current parent' })).toHaveText('Plan the first meetup')
    const focusedText = await page.locator('[aria-label^="Node "]').allTextContents()
    const first = overviewText.indexOf(focusedText[0])
    if (
      first < 0 ||
      JSON.stringify(overviewText.slice(first, first + focusedText.length)) !== JSON.stringify(focusedText)
    ) {
      throw new Error('Focused nodes differ from the overview; refusing to publish inconsistent images.')
    }
    await page.getByRole('button', { name: 'Enable Vim editing', exact: true }).click()
    await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 520))
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(staging, 'tree-focus-dark.png'), animations: 'disabled' })
    // Fix only Date so the demo's dated nodes fall around a stable Today (Thursday 2026-10-08).
    await page.clock.setFixedTime(new Date(2026, 9, 8, 12))
    await page.emulateMedia({ colorScheme: 'light' })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 680))
    // The pointer still rests on the Vim toggle from the earlier click and would show its tooltip.
    await page.mouse.move(0, 0)
    await page.keyboard.press('Meta+p')
    await expect(page.locator('.agenda-row').first()).toBeVisible()
    await page.locator('main.tree-app').evaluate((element) => element.ownerDocument.fonts.ready)
    await page.screenshot({ path: join(staging, 'agenda-light.png'), animations: 'disabled' })
    const persisted = JSON.parse(readFileSync(join(dataDirectory, 'data/document.json'), 'utf8'))
    if (JSON.stringify(persisted.document) !== JSON.stringify(demo.document)) {
      throw new Error('Capture changed the synthetic document; refusing to publish images.')
    }
    // Clean only this command's fixed, ignored output directory, and only after both captures succeed.
    rmSync(output, { recursive: true, force: true })
    mkdirSync(output, { recursive: true })
    for (const name of ['tree-overview.png', 'tree-focus-dark.png', 'agenda-light.png']) {
      writeFileSync(join(output, name), readFileSync(join(staging, name)))
    }
    console.log(`Captured the README screenshots from isolated synthetic data into ${output}.`)
  } finally {
    try {
      if (app !== undefined) {
        const timer = setTimeout(() => child?.kill('SIGKILL'), 5_000)
        try {
          await app.close()
        } finally {
          clearTimeout(timer)
          if (child?.exitCode === null) child.kill('SIGKILL')
        }
      }
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
    }
  }
}

try {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/readme-screenshots.mjs')
  await capture()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
