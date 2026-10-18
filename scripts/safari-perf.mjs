/* global window, document, requestAnimationFrame, indexedDB */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron } from '@playwright/test'
import { createStaticServer } from './web/static-server.mjs'

// Local measurements only: no CI thresholds and no changes to the ordinary perf suite.
const output = resolve('.scratch/safari-perf')
await mkdir(output, { recursive: true })
await mkdir(resolve('test-results'), { recursive: true })
const resultsPath = resolve('test-results/safari-perf-results.json')
await writeFile(resultsPath, '[]')
const results = []
const repetitions = Number(process.argv.find((arg) => arg.startsWith('--repetitions='))?.split('=')[1] ?? 3)
assert(Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 10, 'Use --repetitions=1..10')
const server = createStaticServer()
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
let driver
let session
let app
let page
let browser
let profile

async function webdriver(path, body, method = 'POST') {
  const response = await fetch(`http://127.0.0.1:7056${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  })
  const { value } = await response.json()
  if (!response.ok || value?.error) throw new Error(JSON.stringify(value))
  return value
}

async function evaluate(fn, arg = null) {
  if (browser === 'electron') return page.evaluate(fn, arg)
  const result = await webdriver(`/session/${session}/execute/async`, {
    script: `const done = arguments[arguments.length - 1];
      Promise.resolve().then(() => (${fn.toString()})(arguments[0]))
        .then(value => done({ok: true, value: value ?? null}),
          error => done({ok: false, error: String(error)}));`,
    args: [arg],
  })
  if (!result.ok) throw new Error(result.error)
  return result.value
}

async function waitFor(fn, arg = null) {
  const deadline = Date.now() + 20_000
  do {
    if (await evaluate(fn, arg)) return
    await delay(50)
  } while (Date.now() < deadline)
  throw new Error(`Timed out: ${fn.toString()}`)
}

async function key(text) {
  if (browser === 'electron') await page.keyboard.type(text)
  else {
    await webdriver(`/session/${session}/actions`, {
      actions: [
        {
          type: 'key',
          id: 'keyboard',
          actions: [...text].flatMap((value) => [
            { type: 'keyDown', value },
            { type: 'keyUp', value },
          ]),
        },
      ],
    })
  }
}

async function waitForExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    await once(child, 'exit', { signal: AbortSignal.timeout(milliseconds) })
  } catch (error) {
    if (error.name !== 'AbortError') throw error
  }
}

async function close() {
  if (app) {
    const owned = app.process()
    const closing = app.close().catch(() => {})
    await Promise.race([closing, delay(7_000)])
    if (owned.exitCode === null && owned.signalCode === null) owned.kill('SIGTERM')
    await waitForExit(owned, 2_000)
    if (owned.exitCode === null && owned.signalCode === null) {
      owned.kill('SIGKILL')
      await waitForExit(owned, 2_000)
    }
    assert(owned.exitCode !== null || owned.signalCode !== null, 'The owned Electron process did not exit')
    app = undefined
  }
  if (session) {
    await webdriver(`/session/${session}`, undefined, 'DELETE')
    session = undefined
  }
}

function seed(kind) {
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const count = kind === 'agenda' ? 3000 : 10000
  return {
    version: 1,
    document: {
      roots: [
        {
          id: 'root',
          text: 'Synthetic performance document',
          children: Array.from({ length: count }, (_, index) => ({
            id: `n${index}`,
            text: kind === 'agenda' ? `${date} Item ${index} Review the synthetic rollout details.` : `Child ${index}`,
            children: [],
          })),
        },
      ],
    },
    location: { currentParentId: 'root', selectedNodeId: 'n0' },
  }
}

async function launch(state, insert) {
  if (browser === 'safari') {
    const value = await webdriver('/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })
    session = value.sessionId
    console.log(`Safari ${value.capabilities.browserVersion}`)
    await webdriver(`/session/${session}/timeouts`, { script: 30_000 })
    await webdriver(`/session/${session}/window/rect`, { width: 1000, height: 780 })
    await webdriver(`/session/${session}/url`, { url: origin })
    await waitFor(() => window.prototypeStore?.getSnapshot().status === 'ready')
    const frame = await evaluate(() => ({
      width: window.outerWidth - window.innerWidth,
      height: window.outerHeight - window.innerHeight,
    }))
    await webdriver(`/session/${session}/window/rect`, { width: 1000 + frame.width, height: 700 + frame.height })
    await evaluate(async (state) => {
      const request = indexedDB.open('tree-browser-prototype', 1)
      const db = await new Promise((done, fail) => {
        request.onsuccess = () => done(request.result)
        request.onerror = () => fail(request.error)
      })
      await new Promise((done, fail) => {
        const tx = db.transaction(['document', 'preferences'], 'readwrite')
        tx.objectStore('document').put(state, 'head')
        tx.objectStore('preferences').put(true, 'vim')
        tx.oncomplete = done
        tx.onabort = () => fail(tx.error)
      })
      db.close()
    }, state)
    await webdriver(`/session/${session}/refresh`, {})
  } else {
    profile = await mkdtemp(join(output, 'electron-'))
    await mkdir(join(profile, 'data'))
    await writeFile(join(profile, 'data/document.json'), JSON.stringify(state))
    await writeFile(join(profile, 'data/vim-enabled.json'), 'true')
    app = await _electron.launch({
      args: [`--user-data-dir=${profile}`, resolve('e2e/electron/electron-entry.cjs')],
      env: { ...process.env, TREE_E2E_HIDDEN: '0' },
    })
    page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 700))
  }
  await waitFor(() => !!document.querySelector('[aria-label="Node 1"]'))
  await evaluate(async () => {
    await document.fonts.ready
    if (document.visibilityState !== 'visible') throw new Error('The measured window must be visible')
  })
  await evaluate(() => {
    const input = document.querySelector('[aria-label="Node 1"]')
    input.focus()
    if (document.activeElement !== input) throw new Error('Target editor is not focused')
  })
  if (insert) {
    await key('i')
    await waitFor(() => document.querySelector('[aria-label="Vim mode"]')?.textContent === 'INSERT')
  }
}

async function probe() {
  return evaluate(() => {
    window.perfProbe = { input: [], open: [], motion: [] }
    document.addEventListener(
      'keydown',
      (event) => {
        const samples =
          event.metaKey && event.key === 'p'
            ? window.perfProbe.open
            : ['j', 'k'].includes(event.key) && document.querySelector('.agenda-list')
              ? window.perfProbe.motion
              : null
        if (!samples) return
        const start = performance.now()
        requestAnimationFrame(() => requestAnimationFrame(() => samples.push({ ms: performance.now() - start })))
      },
      true,
    )
    document.addEventListener(
      'input',
      (event) => {
        if (!event.isTrusted) return
        const start = performance.now()
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.perfProbe.input.push({ ms: performance.now() - start })
          }),
        )
      },
      true,
    )
    return { width: window.innerWidth, height: window.innerHeight, scale: window.devicePixelRatio }
  })
}

function summarize(samples) {
  assert(samples.length > 0, 'No measured input events')
  const sorted = samples.map((sample) => sample.ms).sort((a, b) => a - b)
  const at = (fraction) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(2)
  return { samples: sorted.length, medianMs: at(0.5), p95Ms: at(0.95), maxMs: at(1) }
}

async function typeMeasured(text) {
  for (const character of text) {
    await key(character)
    await delay(35)
  }
  await evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
  const input = await evaluate(() => document.querySelector('[aria-label="Node 1"]').value)
  assert(input.includes(text), `Typed text did not reach the target editor: ${JSON.stringify(input)}`)
  assert.equal(
    await evaluate(() => {
      const parent = document.querySelector('[aria-label="Current parent"]')
      return parent.value ?? parent.textContent
    }),
    'Synthetic performance document',
  )
  return summarize(await evaluate(() => window.perfProbe.input))
}

async function saveState() {
  return browser === 'electron'
    ? app.evaluate(() => globalThis.__localSaves)
    : evaluate(() => window.perfProbe.saveState)
}

async function run(kind) {
  await launch(seed(kind), kind !== 'agenda')
  const viewport = await probe()
  let metrics
  if (kind === 'typing') {
    metrics = await typeMeasured('abcdefghijklmnopqrstuvwxyz'.repeat(2))
  } else if (kind === 'agenda') {
    // The same native shortcut opens Agenda in both products.
    if (browser === 'electron') await page.keyboard.press('Meta+p')
    else
      await webdriver(`/session/${session}/actions`, {
        actions: [
          {
            type: 'key',
            id: 'keyboard',
            actions: [
              { type: 'keyDown', value: '\uE03D' },
              { type: 'keyDown', value: 'p' },
              { type: 'keyUp', value: 'p' },
              { type: 'keyUp', value: '\uE03D' },
            ],
          },
        ],
      })
    await waitFor(() => !!document.querySelector('[aria-label="Agenda timeline"]'))
    await waitFor(() => window.perfProbe.open.length > 0)
    const before = await evaluate(() =>
      document.querySelector('.agenda-row[aria-selected="true"]')?.getAttribute('data-agenda-key'),
    )
    for (let index = 0; index < 20; index++) {
      await key('j')
      await delay(35)
    }
    await waitFor(() => window.perfProbe.motion.length === 20)
    const after = await evaluate(() =>
      document.querySelector('.agenda-row[aria-selected="true"]')?.getAttribute('data-agenda-key'),
    )
    assert(before && after && before !== after, 'Agenda navigation did not change selected node')
    metrics = await evaluate(async () => {
      const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      await frame()
      const viewport = document.querySelector('.scroll-viewport')
      const samples = []
      for (let index = 0; index < 20; index++) {
        const start = performance.now()
        viewport.scrollTop = index % 2 === 0 ? viewport.scrollHeight / 2 : 0
        await frame()
        samples.push({ ms: performance.now() - start })
      }
      return {
        scroll: samples,
        mountedRows: document.querySelectorAll('.agenda-row').length,
        maxScroll: viewport.scrollHeight - viewport.clientHeight,
      }
    })
    assert(metrics.maxScroll > 0, 'Agenda did not scroll')
    assert(metrics.mountedRows < 100, 'Agenda rows are not windowed')
    metrics = {
      scroll: summarize(metrics.scroll),
      mountedRows: metrics.mountedRows,
      open: summarize(await evaluate(() => window.perfProbe.open)),
      motion: summarize(await evaluate(() => window.perfProbe.motion)),
    }
  } else {
    // Hold the save promise open in both adapters, as in perf/save-responsiveness.spec.ts.
    // The real file/IndexedDB write still runs; this is a slow-save responsiveness proxy.
    if (browser === 'electron') {
      await app.evaluate(() => {
        globalThis.__localSaves = { started: 0, completed: 0 }
        globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
          globalThis.__localSaves.started++
          await new Promise((done) => setTimeout(done, 750))
          const result = await original(...args)
          globalThis.__localSaves.completed++
          return result
        })
      })
    } else {
      await evaluate(() => {
        // The browser composition root already exposes this store. Instrument only
        // this isolated session's service object; do not add production test hooks.
        const services = window.prototypeStore.services
        const original = services.save.bind(services)
        window.perfProbe.saveState = { started: 0, completed: 0 }
        services.save = async (state) => {
          window.perfProbe.saveState.started++
          await new Promise((done) => setTimeout(done, 750))
          await original(state)
          window.perfProbe.saveState.completed++
        }
      })
    }
    const prefix = 'one two three four five six seven eight nine '
    await typeMeasured(prefix)
    await key('z')
    const deadline = Date.now() + 5000
    while ((await saveState()).started === 0 && Date.now() < deadline) await delay(20)
    const pending = await saveState()
    assert(pending.started > pending.completed, 'The save must remain pending before the next key')
    await key('x')
    const afterKey = await saveState()
    assert.equal(afterKey.completed, pending.completed, 'The save finished before the next input was exercised')
    await evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
    assert(
      (await evaluate(() => document.querySelector('[aria-label="Node 1"]').value)).includes(`${prefix}zx`),
      'Input was lost during the pending save',
    )
    const samples = await evaluate(() => window.perfProbe.input)
    metrics = { ...summarize(samples), nextKeyPaintMs: samples.at(-1).ms, artificialSaveDelayMs: 750 }
    while ((await saveState()).completed === pending.completed && Date.now() < deadline) {
      await delay(20)
    }
    assert((await saveState()).completed > pending.completed, 'The real save did not complete')
    metrics.savesCompleted = (await saveState()).completed
    const restored =
      browser === 'electron'
        ? JSON.parse(await readFile(join(profile, 'data/document.json'), 'utf8'))
        : await evaluate(() => window.treeApi.load())
    assert(
      restored.document.roots[0].children[0].text.includes('one two'),
      'Automatic save did not persist typed words',
    )
  }
  const result = {
    browser,
    scenario: kind,
    repetition: results.filter((result) => result.browser === browser && result.scenario === kind).length + 1,
    userAgent: await evaluate(() => navigator.userAgent),
    viewport,
    metrics,
  }
  results.push(result)
  console.log(JSON.stringify(result))
  await writeFile(resultsPath, JSON.stringify(results, null, 2))
  await close()
}

try {
  driver = spawn('/usr/bin/safaridriver', ['--port', '7056'], { stdio: 'inherit' })
  driver.on('error', (error) => console.error(error.message))
  await delay(1000)
  assert(driver.exitCode === null, 'SafariDriver could not start on port 7056')
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (browser of ['safari', 'electron']) {
      for (const scenario of ['typing', 'agenda', 'saving']) await run(scenario)
    }
  }
} finally {
  try {
    await close()
  } finally {
    if (driver && driver.exitCode === null && driver.signalCode === null) {
      driver.kill('SIGTERM')
      await waitForExit(driver, 2_000)
      if (driver.exitCode === null && driver.signalCode === null) {
        driver.kill('SIGKILL')
        await waitForExit(driver, 2_000)
      }
      assert(driver.exitCode !== null || driver.signalCode !== null, 'The owned SafariDriver process did not exit')
    }
    await new Promise((done) => server.close(done))
  }
}
