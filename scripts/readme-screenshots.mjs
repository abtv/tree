import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const marker = 'docs/images/refresh.json'
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

function status() {
  const revision = git('log', '-1', '--format=%H', '--', marker)
  const pending = git('status', '--porcelain', '--', marker)
  if (revision === '') {
    console.log('No committed README screenshot refresh. Initial capture and review are required.')
  } else {
    const count = Number(git('rev-list', '--count', `${revision}..HEAD`))
    console.log(
      `${count} commits since the last README screenshot refresh; ${count >= 100 ? 'refresh due' : 'refresh not due'}.`,
    )
  }
  if (pending !== '') console.log('A refresh marker is pending review/commit; it has not reset the interval.')
}

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
    const persisted = JSON.parse(readFileSync(join(dataDirectory, 'data/document.json'), 'utf8'))
    if (JSON.stringify(persisted.document) !== JSON.stringify(demo.document)) {
      throw new Error('Capture changed the synthetic document; refusing to publish images.')
    }
    for (const name of ['tree-overview.png', 'tree-focus-dark.png']) {
      writeFileSync(join(root, 'docs/images', name), readFileSync(join(staging, name)))
    }
    writeFileSync(
      join(root, marker),
      `${JSON.stringify({ capturedAt: new Date().toISOString(), sourceRevision: git('rev-parse', 'HEAD'), demoSha256: createHash('sha256').update(demoBytes).digest('hex') }, null, 2)}\n`,
    )
    console.log('Captured both README screenshots from isolated synthetic data. Inspect images before committing.')
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
  if (process.argv.slice(2).length === 0) await capture()
  else if (process.argv.length === 3 && process.argv[2] === '--status') status()
  else throw new Error('Usage: node scripts/readme-screenshots.mjs [--status]')
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
