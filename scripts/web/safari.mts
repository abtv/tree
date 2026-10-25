import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { createStaticServer } from './static-server.mts'
import { happyPath, type SmokeDriver } from '../../e2e/smoke/scenario.mts'

export const SAFARI_SMOKE_TIMEOUT_MS = 30_000

export function validateArguments(args: string[]) {
  if (args.length === 1 && args[0] === '--help') return 'help'
  assert.equal(args.length, 0, 'Use npm run test:safari with no arguments, or -- --help')
  return 'run'
}

async function listen(server: Server) {
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', done)
  })
  const address = server.address()
  assert(address && typeof address !== 'string')
  return address.port
}

async function closeServer(server: Server) {
  server.closeAllConnections()
  if (server.listening) await new Promise<void>((done) => server.close(() => done()))
}

async function stopDriver(child: ChildProcess) {
  const exited = () => child.exitCode !== null || child.signalCode !== null
  if (exited() || !child.pid) return
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    child.kill(signal)
    try {
      await once(child, 'exit', { signal: AbortSignal.timeout(2000) })
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') throw error
    }
    if (exited()) return
  }
  throw new Error('The owned SafariDriver process did not exit')
}

export async function runSafari(smoke = false) {
  assert.equal(process.platform, 'darwin', 'Safari checks require macOS')
  const server = createStaticServer()
  const reservation = createServer()
  const controller = new AbortController()
  const interrupt = () => controller.abort(new Error('Safari checks interrupted'))
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)
  const budget = smoke ? SAFARI_SMOKE_TIMEOUT_MS : 120_000
  const timeout = setTimeout(() => controller.abort(new Error(`Safari checks exceeded ${budget}ms`)), budget)
  let driver: ChildProcess | undefined
  let session: string | undefined
  let driverError: Error | undefined
  let driverOrigin = ''

  async function request(path: string, body?: unknown, method = 'POST', cleanup = false) {
    const response = await fetch(`${driverOrigin}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: cleanup ? AbortSignal.timeout(5000) : AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    })
    const { value } = await response.json()
    assert(response.ok && !value?.error, `SafariDriver: ${JSON.stringify(value)}`)
    return value
  }

  async function evaluate(script: string, args: unknown[] = []) {
    return request(`/session/${session}/execute/sync`, { script, args })
  }

  async function waitFor(script: string) {
    const deadline = Date.now() + 15_000
    do {
      if (await evaluate(script)) return
      await delay(100, undefined, { signal: controller.signal })
    } while (Date.now() < deadline)
    const page = await evaluate('return {url: location.href, text: document.body.innerText}')
    throw new Error(`Safari condition timed out: ${script}\n${JSON.stringify(page)}`)
  }

  try {
    const origin = `http://localhost:${await listen(server)}`
    const driverPort = await listen(reservation)
    await closeServer(reservation)
    driverOrigin = `http://127.0.0.1:${driverPort}`
    driver = spawn('/usr/bin/safaridriver', ['--port', String(driverPort)], { stdio: 'inherit' })
    driver.on('error', (error) => {
      driverError = error
    })
    const deadline = Date.now() + 10_000
    while (true) {
      if (driverError) throw driverError
      assert(driver.exitCode === null && driver.signalCode === null, 'The owned SafariDriver exited during startup')
      try {
        await request('/status', undefined, 'GET')
        break
      } catch (error) {
        if (controller.signal.aborted || Date.now() >= deadline) throw error
        await delay(100, undefined, { signal: controller.signal })
      }
    }
    const created = await request('/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })
    session = created.sessionId
    assert(session, 'SafariDriver did not create an isolated session')
    await request(`/session/${session}/url`, { url: origin })
    const ready = 'return window.prototypeStore?.getSnapshot().status === "ready"'
    await waitFor(ready)
    await request(`/session/${session}/execute/async`, {
      script:
        'const done = arguments[arguments.length - 1]; window.treeApi.setVimEnabled(false).then(() => done(true), error => done(String(error)));',
      args: [],
    }).then((result) => assert.equal(result, true))
    await request(`/session/${session}/refresh`, {})
    await waitFor(ready)
    if (smoke) {
      async function elementId(selector: string) {
        const element = await request(`/session/${session}/element`, { using: 'css selector', value: selector })
        const id = element['element-6066-11e4-a52e-4f735466cecf']
        assert(id, `Missing smoke editor: ${selector}`)
        return id
      }
      const smokeDriver: SmokeDriver = {
        countRows: () => evaluate("return document.querySelectorAll('.node-row').length"),
        waitFor: async (script) => {
          const deadline = Date.now() + 5000
          while (!controller.signal.aborted) {
            const result = await request(`/session/${session}/execute/async`, {
              script: `const done = arguments[arguments.length - 1];
                (async () => { ${script} })().then(value => done({value}), error => done({error: String(error)}));`,
              args: [],
            })
            assert(!result.error, result.error)
            if (result.value) return
            if (Date.now() >= deadline) {
              const state = await evaluate(
                `return {text: document.body.innerText, active: document.activeElement?.outerHTML}`,
              )
              throw new Error(`Safari smoke condition timed out: ${script}\n${JSON.stringify(state)}`)
            }
            await delay(50, undefined, { signal: controller.signal })
          }
          controller.signal.throwIfAborted()
        },
        fill: async (selector, text) => {
          const id = await elementId(selector)
          const tag = await request(`/session/${session}/element/${id}/name`, undefined, 'GET')
          if (String(tag).toLowerCase() === 'input') {
            // Element clear/send-keys can refocus the input and cancel this transient prompt.
            // Keep its existing focus and replace the recalled query with native key actions.
            await request(`/session/${session}/actions`, {
              actions: [
                {
                  type: 'key',
                  id: 'smoke-keyboard',
                  actions: [
                    { type: 'keyDown', value: '\uE03D' },
                    { type: 'keyDown', value: 'a' },
                    { type: 'keyUp', value: 'a' },
                    { type: 'keyUp', value: '\uE03D' },
                    ...Array.from(text).flatMap((value) => [
                      { type: 'keyDown', value },
                      { type: 'keyUp', value },
                    ]),
                  ],
                },
              ],
            })
          } else {
            await request(`/session/${session}/element/${id}/clear`, {})
            await request(`/session/${session}/element/${id}/value`, { text })
          }
        },
        press: async (selector, key) => {
          await elementId(selector)
          const specialKeys: Record<string, string> = {
            Enter: '\uE007',
            Tab: '\uE004',
            Escape: '\uE00C',
            Backspace: '\uE003',
            ArrowUp: '\uE013',
            ArrowDown: '\uE015',
            Shift: '\uE008',
            Control: '\uE009',
            Primary: '\uE03D',
          }
          const values = key.split('+').map((part) => specialKeys[part] ?? part)
          await request(`/session/${session}/actions`, {
            actions: [
              {
                type: 'key',
                id: 'smoke-keyboard',
                actions: [
                  ...values.map((value) => ({ type: 'keyDown', value })),
                  ...values.toReversed().map((value) => ({ type: 'keyUp', value })),
                ],
              },
            ],
          })
        },
        type: async (selector, text) => {
          const id = await elementId(selector)
          await request(`/session/${session}/element/${id}/value`, { text })
        },
        enableVim: async () => {
          for (const selector of ['#tree-menu-button', '#prototype-vim']) {
            const id = await elementId(selector)
            await request(`/session/${session}/element/${id}/click`, {})
          }
        },
        showView: async (view) => {
          for (const selector of ['#tree-menu-button', `#prototype-${view}`]) {
            const id = await elementId(selector)
            await request(`/session/${session}/element/${id}/click`, {})
          }
        },
        reload: async () => {
          await request(`/session/${session}/refresh`, {})
          return smokeDriver
        },
      }
      await happyPath(smokeDriver)
      console.log(`Safari ${created.capabilities.browserVersion}: happy path passed`)
      return
    }
    const selector = '.node-row[data-node-id="welcome"] .node-input'
    const element = await request(`/session/${session}/element`, { using: 'css selector', value: selector })
    const id = element['element-6066-11e4-a52e-4f735466cecf']
    assert(id, 'The synthetic welcome editor is missing')
    await request(`/session/${session}/element/${id}/clear`, {})
    await request(`/session/${session}/element/${id}/value`, { text: 'Safari synthetic check ' })
    await waitFor(
      `return document.querySelector(${JSON.stringify(selector)})?.textContent.includes('Safari synthetic check')`,
    )

    // A synthetic paste event exercises the application handler without touching the OS clipboard.
    const url = 'https://example.com/settings/data-controls'
    await evaluate(
      `
      const input = document.querySelector(arguments[0]);
      input.focus();
      const range = document.createRange();
      range.selectNodeContents(input); range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const data = new DataTransfer(); data.setData('text/plain', arguments[1]);
      input.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: data}));
    `,
      [selector, url],
    )
    await waitFor(
      `return document.querySelector(${JSON.stringify(selector)})?.querySelector('a')?.getAttribute('href') === ${JSON.stringify(url)}`,
    )
    await waitFor(
      'return document.getElementById("prototype-save-status")?.textContent === "Saved locally in this browser"',
    )
    await request(`/session/${session}/refresh`, {})
    await waitFor(ready)
    await waitFor(
      `return document.querySelector(${JSON.stringify(selector)})?.textContent.includes('Safari synthetic check') && document.querySelector(${JSON.stringify(selector)})?.querySelector('a')?.getAttribute('href') === ${JSON.stringify(url)}`,
    )
    assert.equal(await evaluate('return document.querySelector(".save-error") !== null'), false)
    const output = resolve('test-results/safari')
    await mkdir(output, { recursive: true })
    const screenshot = await request(`/session/${session}/screenshot`, undefined, 'GET')
    await writeFile(resolve(output, 'smoke.png'), Buffer.from(screenshot, 'base64'))
    console.log(`Safari ${created.capabilities.browserVersion}: typing, synthetic URL paste and reload passed`)
    console.log('Screenshot: test-results/safari/smoke.png')
  } finally {
    clearTimeout(timeout)
    try {
      if (session) await request(`/session/${session}`, undefined, 'DELETE', true)
    } finally {
      try {
        if (driver) await stopDriver(driver)
      } finally {
        await closeServer(reservation)
        await closeServer(server)
        process.off('SIGINT', interrupt)
        process.off('SIGTERM', interrupt)
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (validateArguments(process.argv.slice(2)) === 'help') {
    console.log('npm run test:safari: isolated real-Safari typing, synthetic URL paste and reload checks')
    console.log('Requires macOS and Safari Remote Automation enabled by the owner. No arguments are accepted.')
  } else {
    await runSafari()
  }
}
