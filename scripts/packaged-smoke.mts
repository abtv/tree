import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { chromium } from '@playwright/test'

const app = process.argv[2]
if (!app) throw new Error('Provide a packaged .app path')
const profile = await mkdtemp(join(tmpdir(), 'tree-packaged-smoke-'))
await mkdir(join(profile, 'data'))
await writeFile(join(profile, 'data/vim-enabled.json'), 'false')
const child = spawn(resolve(app, 'Contents/MacOS/Tree'), [`--user-data-dir=${profile}`, '--remote-debugging-port=0'], {
  stdio: ['ignore', 'ignore', 'pipe'],
})
const exited = new Promise<void>((done) => child.once('exit', () => done()))
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
try {
  const endpoint = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Packaged renderer startup timed out')), 15000)
    let output = ''
    child.once('error', fail)
    child.once('exit', () => {
      clearTimeout(timer)
      fail(new Error(`Packaged app exited before startup: ${output.slice(-4000)}`))
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output)
      if (match?.[1]) {
        clearTimeout(timer)
        done(match[1])
      }
    })
  })
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]!
  context.setDefaultTimeout(10000)
  const page = context.pages()[0] ?? (await context.waitForEvent('page'))
  await page.waitForURL('app://tree/**')
  const editor = page.locator('.node-row .node-input').first()
  await editor.fill('Packaged smoke one two three four five six seven eight nine ten')
  await editor.press('Enter')
  await page.reload()
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.node-input')).some(
      (element) =>
        (element instanceof HTMLTextAreaElement ? element.value : element.textContent) ===
        'Packaged smoke one two three four five six seven eight nine ten',
    ),
  )
  assert.equal(await page.locator('.save-error, .error-boundary').count(), 0)
  console.log('Packaged renderer editing and reload smoke passed')
} finally {
  try {
    await browser?.close()
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT')
    await Promise.race([
      exited,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`Packaged app did not exit; retained ${profile}`)), 5000)
        timer.unref()
      }),
    ])
    await rm(profile, { recursive: true, force: true })
  }
}
