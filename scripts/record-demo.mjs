import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'reports/demo')
const windowSize = { width: 1000, height: 720 }
const size = { width: 1500, height: 1080 }

// Every demonstrated interaction uses the keyboard; numbering follows the synthetic fixture.
async function demonstrate(page) {
  const pause = (ms = 700) => page.waitForTimeout(ms)
  const command = async (...keys) => {
    for (const key of keys) await page.keyboard.press(key)
    await pause()
  }
  await expect(page.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveText(
    'Launch a neighborhood reading club',
  )
  await page.locator('main.tree-app').evaluate((element) => element.ownerDocument.fonts.ready)
  await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')
  await expect(page.getByRole('textbox', { name: 'Node 1', exact: true })).toBeFocused()
  await pause()
  await command('z', 'o')
  await expect(page.getByRole('button', { name: 'Collapse node 1', exact: true })).toBeVisible()
  await command('3', 'j')
  await expect(page.locator('[data-node-id="meeting"] .node-input')).toBeFocused()
  await command('z', 'Shift+O')
  await expect(page.locator('[data-node-id="finish"]')).toBeVisible()
  await page.screenshot({ path: join(output, 'overview.png') })
  await command('g', 'd')
  await expect(page.getByRole('textbox', { name: 'Current parent' })).toHaveText('Plan the first meetup')
  await command('3', 'j')
  const note = page.locator('[data-node-id="book"] .node-input')
  await expect(note).toBeFocused()
  await page.keyboard.press('Shift+A')
  await expect(page.getByLabel('Vim mode')).toHaveText('INSERT')
  await page.keyboard.type(' in a week', { delay: 65 })
  await expect(note).toHaveValue('Choose a short book everyone can finish in a week')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')
  await pause()
  await page.screenshot({ path: join(output, 'editing.png') })
  await command('0', 'v', 'w')
  await expect(page.getByLabel('Vim mode')).toHaveText('VISUAL')
  await page.screenshot({ path: join(output, 'visual-text.png') })
  await command('Escape')
  await command('3', 'j')
  const passage = page.locator('[data-node-id="passage"]')
  await expect(passage.locator('.node-input')).toBeFocused()
  const initialDepth = Number(await passage.getAttribute('data-depth'))
  await command('Shift+V', 'j')
  await expect(page.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
  await expect(page.locator('.node-row-visual-selected')).toHaveCount(2)
  await page.screenshot({ path: join(output, 'visual-nodes.png') })
  await command('>')
  await expect(passage).toHaveAttribute('data-depth', String(initialDepth + 1))
  await page.screenshot({ path: join(output, 'moved-nodes.png') })
  await command('<')
  await expect(passage).toHaveAttribute('data-depth', String(initialDepth))
  await command('Escape', 'u')
  await expect(passage).toHaveAttribute('data-depth', String(initialDepth + 1))
  await command('Control+r')
  await expect(passage).toHaveAttribute('data-depth', String(initialDepth))
  await command('g', 'v')
  await expect(page.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
  await expect(page.locator('.node-row-visual-selected')).toHaveCount(2)
  await command('d')
  await expect(passage).toHaveCount(0)
  await expect(page.locator('[data-node-id="discussion"]')).toHaveCount(0)
  await expect(page.locator('[data-node-id="finish"] .node-input')).toBeFocused()
  await page.screenshot({ path: join(output, 'cut-nodes.png') })
  await command('Control+o')
  await expect(page.locator('[data-node-id="meeting"] .node-input')).toBeFocused()
  await command('z', 'c')
  await command('2', 'j')
  await expect(page.locator('[data-node-id="later"] .node-input')).toBeFocused()
  await command('g', 'd')
  await expect(page.getByRole('textbox', { name: 'Current parent' })).toHaveText('Ideas for later')
  await expect(page.locator('[data-node-id="walk"] .node-input')).toBeFocused()
  await page.screenshot({ path: join(output, 'paste-destination.png') })
  await pause(1000)
  await command('Shift+P')
  const texts = await page.locator('.node-row .node-input').evaluateAll((inputs) => inputs.map((input) => input.value))
  expect(texts).toEqual([
    'Each person shares a favorite passage - 20 minutes',
    'Discuss what surprised us - 40 minutes',
    'Try a reading walk in the park',
    'Invite a local author',
  ])
  await expect(page.getByLabel('Vim mode')).toHaveText('NORMAL')
  await page.screenshot({ path: join(output, 'pasted-nodes.png') })
  await pause(1800)
  await page.screenshot({ path: join(output, 'vim-dark.png') })
}

// Read timing from the WebM Segment Info rather than estimating it from scripted pauses.
function videoDurationMs(bytes) {
  const vint = (offset, keepMarker = false) => {
    let length = 1
    while (length <= 8 && (bytes[offset] & (0x80 >> (length - 1))) === 0) length += 1
    if (length > 8 || offset + length > bytes.length) throw new Error('Invalid WebM element.')
    let value = keepMarker ? bytes[offset] : bytes[offset] & (0xff >> length)
    for (let index = 1; index < length; index += 1) value = value * 256 + bytes[offset + index]
    return { value, length }
  }
  const segment = bytes.subarray(0, 4096).indexOf(Buffer.from([0x18, 0x53, 0x80, 0x67]))
  if (segment < 0) throw new Error('Missing WebM Segment.')
  let offset = segment + 4 + vint(segment + 4).length
  let end
  while (offset < bytes.length) {
    const id = vint(offset, true)
    const size = vint(offset + id.length)
    const start = offset + id.length + size.length
    if (id.value === 0x1549a966) {
      offset = start
      end = start + size.value
      break
    }
    offset = start + size.value
  }
  if (end === undefined) throw new Error('Missing WebM Segment Info.')
  if (end > bytes.length) throw new Error('Truncated WebM Segment Info.')
  let scale = 1_000_000
  let duration
  while (offset < end) {
    const id = vint(offset, true)
    const size = vint(offset + id.length)
    const start = offset + id.length + size.length
    if (start + size.value > end) throw new Error('Truncated WebM timing element.')
    if (id.value === 0x2ad7b1) scale = bytes.readUIntBE(start, size.value)
    if (id.value === 0x4489) {
      if (size.value !== 4 && size.value !== 8) throw new Error('Invalid WebM duration.')
      duration = size.value === 4 ? bytes.readFloatBE(start) : bytes.readDoubleBE(start)
    }
    offset = start + size.value
  }
  return (duration * scale) / 1_000_000
}

async function record() {
  if (process.platform !== 'darwin') throw new Error('The Tree demo requires macOS.')
  const bytes = readFileSync(join(root, 'docs/images/demo-document.json'))
  const profile = mkdtempSync(join(tmpdir(), 'tree-demo-'))
  // Clean only this command's fixed, ignored output directory; never touch the normal app profile.
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  mkdirSync(join(profile, 'data'))
  writeFileSync(join(profile, 'data/document.json'), bytes)
  writeFileSync(join(profile, 'data/vim-enabled.json'), 'true')
  writeFileSync(join(profile, 'data/appearance.json'), JSON.stringify('dark'))
  let app
  let child
  let recordingPage
  const errors = []
  try {
    const env = { ...process.env, TREE_E2E_HIDDEN: '1', TREE_E2E_SHORTCUT_STUB: '1' }
    delete env.ELECTRON_RENDERER_URL
    app = await electron.launch({
      args: [
        '--force-device-scale-factor=1.5',
        `--user-data-dir=${profile}`,
        join(root, 'e2e/electron-entry.cjs'),
        '--tree-test-appearance=dark',
      ],
      cwd: root,
      env,
      timeout: 15_000,
      colorScheme: 'dark',
    })
    child = app.process()
    const page = await app.firstWindow()
    page.setDefaultTimeout(10_000)
    page.on('pageerror', (error) => errors.push(error.message))
    await expect
      .poll(() => page.evaluate(() => globalThis.matchMedia('(prefers-color-scheme: dark)').matches))
      .toBe(true)
    await app.evaluate(({ BrowserWindow }, bounds) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setSize(bounds.width, bounds.height)
      window.show()
      window.focus()
    }, windowSize)
    await page.locator('main.tree-app').evaluate((element) => element.ownerDocument.fonts.ready)
    await page.screencast.start({ path: join(output, 'tree-demo.webm'), size, quality: 100 })
    recordingPage = page
    await demonstrate(page)
    if (errors.length !== 0) throw new Error(`Renderer errors: ${errors.join('\n')}`)
  } finally {
    try {
      if (app !== undefined) {
        const timer = setTimeout(() => child?.kill('SIGKILL'), 5000)
        try {
          if (recordingPage !== undefined) await recordingPage.screencast.stop()
          await app.close()
        } finally {
          clearTimeout(timer)
          if (child?.exitCode === null) child.kill('SIGKILL')
        }
      }
    } finally {
      rmSync(profile, { recursive: true, force: true })
    }
  }
  if (recordingPage === undefined) throw new Error('No demo recording was produced.')
  const recording = join(output, 'tree-demo.webm')
  const recordingBytes = statSync(recording).size
  if (recordingBytes === 0 || recordingBytes >= 3_000_000) {
    throw new Error('The video must be nonempty and smaller than 3 MB.')
  }
  const durationMs = videoDurationMs(readFileSync(recording))
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs >= 30_000) {
    throw new Error(`The video must be shorter than 30 seconds; recorded ${durationMs} ms.`)
  }
  writeFileSync(
    join(output, 'metadata.json'),
    `${JSON.stringify(
      {
        sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        hasLocalChanges: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
        demoSha256: createHash('sha256').update(bytes).digest('hex'),
        capturedAt: new Date().toISOString(),
        size,
        captureQuality: 100,
        format: 'webm',
        appearance: 'dark',
        editingMode: 'vim',
        interaction: 'keyboard',
        durationMs,
        bytes: recordingBytes,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`Video: ${recording} (${(recordingBytes / 1024 / 1024).toFixed(2)} MiB)`)
}

record().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
