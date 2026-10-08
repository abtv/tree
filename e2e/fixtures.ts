import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireSystemClipboardLock, releaseSystemClipboardLock } from './clipboard-lock'
import { cleanupStaleElectronProcesses } from './electron-process'

export interface PersistedNode {
  id: string
  text: string
  attachment?: { id: string; mimeType: string }
  links?: { start: number; end: number; url: string }[]
  struckThrough?: true
  children: PersistedNode[]
}

export interface PersistedState {
  version: number
  document: { roots: PersistedNode[] }
  location: { currentParentId: string | null; selectedNodeId: string }
  view?: { expandedIds: string[]; selectedRowTop?: number }
}

export interface PersistedWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Launched {
  app: ElectronApplication
  window: Page
}

export type WindowMode = 'hidden' | 'visible'

export type ShortcutMode = 'real' | 'stub'

// Every launch uses a user-data prefix that identifies this Playwright worker. Stale-process cleanup
// then only ever addresses apps launched by this worker, so parallel workers cannot kill each
// other's applications. `e2e/global-setup.ts` cleans leftovers from earlier runs before workers start.
const userDataMarker = `tree-e2e-p${process.pid}-`

// Hidden windows are the default so the suite does not steal desktop focus. Set
// `TREE_E2E_VISIBLE=1` to watch the real UI, for example while product-verifying UI behavior.
function ambientWindowMode(): WindowMode {
  return process.env['TREE_E2E_VISIBLE'] === '1' ? 'visible' : 'hidden'
}

// Selected long-running suites distribute their independent tests across the configured workers
// during hidden runs. Visible runs remain serial so product verification observes one real window at
// a time, and the global config stays file-parallel by default for suites that have not opted in.
export function configureHiddenParallelTests(): void {
  test.describe.configure({ mode: ambientWindowMode() === 'hidden' ? 'parallel' : 'default' })
}

// The global `Cmd+0` accelerator is machine-global, so parallel workers must stub it. Serial runs
// (single worker, including visible product-verification runs) use the real registration.
function ambientShortcutMode(): ShortcutMode {
  return test.info().config.workers > 1 ? 'stub' : 'real'
}

// Playwright's Electron `env` option requires defined string values, which `process.env` does not
// model. Replacing the child environment is required here because Playwright uses the given object
// as the full child environment instead of merging it with `process.env`.
function launchEnvironment(mode: WindowMode, shortcutMode: ShortcutMode): Record<string, string> {
  return {
    ...process.env,
    TREE_E2E_HIDDEN: mode === 'hidden' ? '1' : '0',
    TREE_E2E_SHORTCUT_STUB: shortcutMode === 'stub' ? '1' : '0',
  } as Record<string, string>
}

const launchedApps: ElectronApplication[] = []
const observedSaveErrors = new Map<
  Page,
  { app: ElectronApplication; errors: string[]; timer: ReturnType<typeof setInterval>; collect: () => Promise<void> }
>()
const retainedSaveErrors: string[] = []
const closedApps = new WeakSet<ElectronApplication>()
const allowedRendererErrors: RegExp[] = []

export type EditingMode = 'vim' | 'standard'

export const EDITING_MODES: readonly EditingMode[] = ['vim', 'standard']

// The editing mode of the test that is running. A worker runs one test at a time, so a module-level
// value is safe; the `userDataDir` fixture sets it before the test body and clears it afterwards.
let activeEditingMode: EditingMode = 'vim'

export const test = base.extend<{ userDataDir: string; editingMode: EditingMode }>({
  // Specs written for Vim editing keep the default. `describeForEachEditingMode` overrides it per
  // describe block, and `launchTree` reads it when the test gives no explicit `vimPreference`.
  editingMode: ['vim', { option: true }],
  userDataDir: async ({ editingMode }, use) => {
    activeEditingMode = editingMode
    const directory = mkdtempSync(join(tmpdir(), userDataMarker))
    await use(directory)
    // Per-test teardown lives in this fixture rather than a module-level `test.afterEach`.
    // Playwright caches imported helper modules for the lifetime of the worker process, so a hook
    // declared here would attach only to the first test file's suite and silently stop running for
    // later files. Fixture teardown runs for every test in every file.
    try {
      const observations = [...observedSaveErrors.values()]
      await Promise.all(observations.map(({ collect }) => collect()))
      await closeTrackedApps()
      observations.forEach(({ timer }) => clearInterval(timer))
      observedSaveErrors.clear()
      const errors = [...retainedSaveErrors, ...observations.flatMap(({ errors: values }) => values)]
      retainedSaveErrors.length = 0
      const unexpectedErrors = errors.filter(
        (message) => !allowedRendererErrors.some((pattern) => pattern.test(message)),
      )
      allowedRendererErrors.length = 0
      if (unexpectedErrors.length > 0) {
        throw new Error(`Renderer reported save errors:\n${unexpectedErrors.join('\n')}`)
      }
    } finally {
      activeEditingMode = 'vim'
      releaseSystemClipboardLock()
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  },
})

export { expect }

/** Fix only Date; browser timers and animation frames keep running normally. */
export async function setAgendaToday(window: Page): Promise<void> {
  await window.clock.setFixedTime(new Date(2026, 9, 8, 12))
}

export interface EditingModeContext {
  mode: EditingMode
  /** Adds the mode suffix to a screenshot name so each mode keeps its own baseline. */
  screenshotName: (name: `${string}.png`) => `${string}.png`
}

/**
 * Runs `body` once per editing mode, each time in its own describe block whose title names the mode.
 * Tests declared inside launch with that mode unless they pass an explicit `vimPreference`. Tests whose
 * behavior exists only in Vim editing belong in a separate describe block that launches with Vim
 * explicitly (`e2e/AGENTS.md`).
 */
export function describeForEachEditingMode(title: string, body: (context: EditingModeContext) => void): void {
  for (const mode of EDITING_MODES) {
    test.describe(`${title} [${mode} editing]`, () => {
      test.use({ editingMode: mode })
      body({
        mode,
        screenshotName: (name) => `${name.slice(0, -'.png'.length)}-${mode}.png`,
      })
    })
  }
}

export function allowRendererError(pattern: RegExp): void {
  allowedRendererErrors.push(pattern)
}

export function exactMessage(message: string): RegExp {
  return new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

// Electron toggles a checkbox item's `checked` inside `click`, exactly as a real menu click does.
export async function clickApplicationMenuItem(app: ElectronApplication, menu: string, label: string): Promise<void> {
  await app.evaluate(
    ({ Menu }, target) => {
      const submenu = Menu.getApplicationMenu()?.items.find((entry) => entry.label === target.menu)?.submenu
      const item = submenu?.items.find((entry) => entry.label === target.label)
      if (item?.click === undefined) throw new Error(`The ${target.menu} > ${target.label} menu item is unavailable.`)
      item.click(item, undefined, {} as Electron.KeyboardEvent)
    },
    { menu, label },
  )
}

export async function applicationMenuItemChecked(
  app: ElectronApplication,
  menu: string,
  label: string,
): Promise<boolean | undefined> {
  return app.evaluate(
    ({ Menu }, target) => {
      const submenu = Menu.getApplicationMenu()?.items.find((entry) => entry.label === target.menu)?.submenu
      return submenu?.items.find((entry) => entry.label === target.label)?.checked
    },
    { menu, label },
  )
}

export async function clickApplicationSubmenuItem(
  app: ElectronApplication,
  path: { menu: string; submenu: string; label: string },
): Promise<void> {
  await app.evaluate(({ Menu }, target) => {
    const submenu = Menu.getApplicationMenu()?.items.find((entry) => entry.label === target.menu)?.submenu
    const nested = submenu?.items.find((entry) => entry.label === target.submenu)?.submenu
    const item = nested?.items.find((entry) => entry.label === target.label)
    if (item?.click === undefined) {
      throw new Error(`The ${target.menu} > ${target.submenu} > ${target.label} menu item is unavailable.`)
    }
    item.click(item, undefined, {} as Electron.KeyboardEvent)
  }, path)
}

export async function checkedApplicationSubmenuItems(
  app: ElectronApplication,
  path: { menu: string; submenu: string },
): Promise<string[]> {
  return app.evaluate(({ Menu }, target) => {
    const submenu = Menu.getApplicationMenu()?.items.find((entry) => entry.label === target.menu)?.submenu
    const nested = submenu?.items.find((entry) => entry.label === target.submenu)?.submenu
    return (nested?.items ?? []).filter((entry) => entry.checked).map((entry) => entry.label)
  }, path)
}

export async function clickApplicationMenuQuit(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.items[0]?.submenu?.items[0]
    if (item?.click === undefined) throw new Error('The application menu quit item is unavailable.')
    item.click(item, undefined, {} as Electron.KeyboardEvent)
  })
}

// The suite runs on a live desktop, so the application is not necessarily frontmost when a test
// addresses its window. BrowserWindow.getFocusedWindow() returns null in that case and a close through
// it would silently do nothing, even though closing the window must flush and quit while inactive
// (docs/PRODUCT.md §9.2). These helpers address the single application window directly.

export async function closeMainWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length !== 1) throw new Error(`Expected exactly one application window, found ${windows.length}.`)
    windows[0]!.close()
  })
}

export async function setMainWindowBounds(
  app: ElectronApplication,
  bounds: Partial<PersistedWindowBounds>,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, requested) => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length !== 1) throw new Error(`Expected exactly one application window, found ${windows.length}.`)
    const window = windows[0]!
    window.setBounds({ ...window.getBounds(), ...requested })
  }, bounds)
}

// A window-level screenshot depends on the window's content size. The default window is clamped to the
// display's visible frame, which differs between a developer's screen and a CI runner, and its title bar
// height differs between macOS versions. Pin the content size, small enough for a small CI display.
export const screenshotContentSize = { width: 1000, height: 600 } as const

// The window title strip (PRODUCT.md §20.5) is part of the content view because the system title bar is
// hidden. The requested height is the area below the strip, so layout tests keep the same room for the
// toolbar, the list, and the status bar.
export const titleStripHeight = 28

export async function setMainWindowContentSize(
  app: ElectronApplication,
  size: { width: number; height: number },
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, requested) => {
      const windows = BrowserWindow.getAllWindows()
      if (windows.length !== 1) throw new Error(`Expected exactly one application window, found ${windows.length}.`)
      windows[0]!.setContentSize(requested.width, requested.height + requested.strip)
    },
    { ...size, strip: titleStripHeight },
  )
}

export async function readMainWindowBounds(app: ElectronApplication): Promise<PersistedWindowBounds> {
  return app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length !== 1) throw new Error(`Expected exactly one application window, found ${windows.length}.`)
    return windows[0]!.getBounds()
  })
}

export async function delaySaveIpc(app: ElectronApplication, milliseconds: number): Promise<void> {
  await app.evaluate(({}, delay) => {
    const control = globalThis as typeof globalThis & { __delayedSaveResolved?: boolean }
    control.__delayedSaveResolved = false
    globalThis.__treeIpc.wrap(
      'tree:save',
      () =>
        new Promise<void>((resolve) => {
          globalThis.setTimeout(() => {
            control.__delayedSaveResolved = true
            resolve()
          }, delay)
        }),
    )
  }, milliseconds)
}

export async function waitForDelayedSave(app: ElectronApplication): Promise<void> {
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as typeof globalThis & { __delayedSaveResolved?: boolean }).__delayedSaveResolved),
    )
    .toBe(true)
}

export async function blockSaves(app: ElectronApplication, options: { countAttempts?: boolean } = {}): Promise<void> {
  await app.evaluate(({ ipcMain }, counting) => {
    const control = globalThis as typeof globalThis & { saveAttempts?: number; restoreSave?: () => void }
    const save = globalThis.__treeIpc.get('tree:save')
    if (save === undefined) throw new Error('Save handler is unavailable.')
    control.restoreSave = () => {
      ipcMain.removeHandler('tree:save')
      ipcMain.handle('tree:save', save)
    }
    control.saveAttempts = 0
    globalThis.__treeIpc.wrap('tree:save', () => {
      if (counting) control.saveAttempts = (control.saveAttempts ?? 0) + 1
      throw new Error('save blocked')
    })
  }, options.countAttempts ?? false)
}

export async function restoreSaves(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => (globalThis as typeof globalThis & { restoreSave?: () => void }).restoreSave?.())
}

export function readSaveAttempts(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => (globalThis as typeof globalThis & { saveAttempts?: number }).saveAttempts ?? 0)
}

const RENDER_FAILURE_MARKER = 'tree-e2e-force-render-failure'
const RENDER_FAILURE_CONSUMED = `${RENDER_FAILURE_MARKER}-consumed`

// The renderer has no test hook (ADR 0002). `NodeList` reads `globalThis.innerWidth` in a `useRef`
// initializer during its mount render, so arming a throwing getter before a reload raises a real render
// error that the root `ErrorBoundary` catches. The `window.name` marker makes the injection one-shot:
// the failing load consumes it, so the fallback's Reload action starts a clean document.
export async function forceRenderFailure(window: Page, message = 'forced renderer failure'): Promise<void> {
  await window.addInitScript(
    ({ marker, consumed, errorMessage }) => {
      const markerHost = globalThis as typeof globalThis & { name?: string }
      if (markerHost.name !== marker) return
      markerHost.name = consumed
      Object.defineProperty(globalThis, 'innerWidth', {
        configurable: true,
        get() {
          throw new Error(errorMessage)
        },
      })
    },
    { marker: RENDER_FAILURE_MARKER, consumed: RENDER_FAILURE_CONSUMED, errorMessage: message },
  )
  await window.evaluate((marker) => {
    ;(globalThis as typeof globalThis & { name?: string }).name = marker
  }, RENDER_FAILURE_MARKER)
  await window.reload()
  await expect(window.getByRole('alert')).toContainText('Tree encountered an unexpected error')
}

async function closeTrackedApps(): Promise<void> {
  await Promise.all(launchedApps.splice(0).map((app) => closeApp(app)))
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  forgetObservations(app)
  const trackedIndex = launchedApps.indexOf(app)
  if (trackedIndex >= 0) launchedApps.splice(trackedIndex, 1)

  let electronProcess: ReturnType<ElectronApplication['process']>
  try {
    electronProcess = app.process()
  } catch {
    await app.close().catch(() => undefined)
    return
  }
  if (closedApps.has(app) || electronProcess.exitCode !== null || electronProcess.signalCode !== null) {
    await terminateProcess(electronProcess)
    return
  }
  const closePromise = app.close().catch(() => undefined)
  await Promise.race([closePromise, waitForProcessExit(electronProcess, 7_000)])
  await terminateProcess(electronProcess)
  await closePromise
}

async function terminateProcess(electronProcess: ReturnType<ElectronApplication['process']>): Promise<void> {
  await waitForProcessExit(electronProcess, 1_000)
  if (electronProcess.exitCode === null && electronProcess.signalCode === null) electronProcess.kill('SIGTERM')
  await waitForProcessExit(electronProcess, 1_000)
  if (electronProcess.exitCode === null && electronProcess.signalCode === null) electronProcess.kill('SIGKILL')
  await waitForProcessExit(electronProcess, 1_000)
  if (electronProcess.exitCode === null && electronProcess.signalCode === null) {
    throw new Error('The Electron worker process did not exit during bounded teardown.')
  }
}

async function waitForProcessExit(
  electronProcess: ReturnType<ElectronApplication['process']>,
  timeoutMilliseconds: number,
): Promise<void> {
  if (electronProcess.exitCode !== null || electronProcess.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, timeoutMilliseconds)
    electronProcess.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

export async function launchTree(
  userDataDir: string,
  options: {
    /** Simulates a display scale before the canonical E2E scale is applied, for stability coverage. */
    initialDeviceScaleFactor?: 1 | 2
    expectReady?: boolean
    windows?: WindowMode
    shortcut?: ShortcutMode
    initialMode?: 'normal' | 'insert'
    appearance?: 'light' | 'dark'
    /**
     * The Vim editing preference written before launch. It defaults to the test's `editingMode`
     * (Vim editing unless `describeForEachEditingMode` selected standard editing); `'saved'` leaves
     * whatever an earlier launch (or nothing) persisted.
     */
    vimPreference?: boolean | 'saved'
  } = {},
): Promise<Launched> {
  await closeTrackedApps()
  await cleanupStaleElectronProcesses(userDataMarker)
  const vimPreference = options.vimPreference ?? activeEditingMode === 'vim'
  if (vimPreference !== 'saved') writeVimPreference(userDataDir, vimPreference)
  const windowMode = options.windows ?? ambientWindowMode()
  const shortcutMode = options.shortcut ?? ambientShortcutMode()
  let app: ElectronApplication
  try {
    app = await electron.launch({
      args: [
        ...(options.initialDeviceScaleFactor === undefined
          ? []
          : [`--force-device-scale-factor=${options.initialDeviceScaleFactor}`]),
        // Set the backing scale before Electron initializes Chromium. CSS-sized screenshots still
        // rasterize text differently at native scales 1 and 2; setting this in the entry is too late.
        '--force-device-scale-factor=1',
        `--user-data-dir=${userDataDir}`,
        join(process.cwd(), 'e2e', 'electron-entry.cjs'),
        // Overlay scrollbars reserve no width, while classic ones narrow the centered outline. macOS
        // picks classic scrollbars when no trackpad is attached, as on CI runners, so fix the style
        // through the user-defaults argument domain. It follows the entry, or Electron would take the
        // value for the application path.
        '-AppleShowScrollBars',
        'WhenScrolling',
        ...(options.appearance === undefined ? [] : [`--tree-test-appearance=${options.appearance}`]),
      ],
      cwd: process.cwd(),
      env: launchEnvironment(windowMode, shortcutMode),
    })
  } catch (error) {
    await cleanupStaleElectronProcesses(userDataMarker)
    throw new Error(`Electron failed to launch for E2E test: ${formatLaunchError(error)}`, { cause: error })
  }
  launchedApps.push(app)
  app.once('close', () => {
    closedApps.add(app)
    const trackedIndex = launchedApps.indexOf(app)
    if (trackedIndex >= 0) launchedApps.splice(trackedIndex, 1)
    forgetObservations(app)
  })
  try {
    const window = await app.firstWindow()
    await observeSaveErrors(window)
    await assertWindowMode(app, windowMode)
    await assertShortcutMode(app, shortcutMode)
    if (options.expectReady !== false) await expect(window.locator('main.tree-app')).toBeVisible()
    const scale = await window.evaluate(() => devicePixelRatio)
    if (scale !== 1) {
      throw new Error(`Expected E2E devicePixelRatio 1, got ${scale}. The launch-time rendering scale did not apply.`)
    }
    const scrollbarWidth = await window.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;visibility:hidden;width:100px;height:100px;overflow:scroll'
      document.body.append(probe)
      const width = probe.offsetWidth - probe.clientWidth
      probe.remove()
      return width
    })
    if (scrollbarWidth !== 0) {
      throw new Error(`Expected E2E overlay scrollbars, got a ${scrollbarWidth}px classic scrollbar.`)
    }
    // Most non-Vim E2E tests exercise editing commands and explicitly start an Insert session.
    // Vim tests opt into the real Normal-mode startup state. Standard editing has no modes.
    if (
      options.expectReady !== false &&
      options.initialMode !== 'normal' &&
      (await window.getByLabel('Vim mode').count()) > 0
    ) {
      await window.keyboard.press('i')
      await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    }
    return { app, window }
  } catch (error) {
    await closeApp(app)
    throw error
  }
}

// The hidden-window override lives in the test-owned entry (`e2e/hidden-windows.cjs`) and depends
// on a Node module-load patch that an Electron or Node upgrade could invalidate. Fail the launch
// immediately when the requested mode did not take effect instead of silently showing windows
// during a hidden run or hiding windows during a visible one.
async function assertWindowMode(app: ElectronApplication, mode: WindowMode): Promise<void> {
  const visibility = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => window.isVisible()),
  )
  if (visibility.length !== 1) {
    throw new Error(`Expected exactly one application window, found ${visibility.length}.`)
  }
  if (mode === 'hidden' && visibility[0] === true) {
    throw new Error(
      'The e2e window mode is hidden, but the application window is visible. The hidden-window override in e2e/hidden-windows.cjs is not applying.',
    )
  }
  if (mode === 'visible' && visibility[0] === false) {
    throw new Error('The e2e window mode is visible, but the application window is hidden.')
  }
}

// The shortcut mode is applied by the test-owned entry (`e2e/shortcut-stub.cjs`) and, like the
// hidden-window override, depends on a Node module-load patch that an Electron or Node upgrade
// could invalidate. Fail the launch immediately when the requested mode did not take effect instead
// of silently registering the real machine-global accelerator in a parallel run.
async function assertShortcutMode(app: ElectronApplication, mode: ShortcutMode): Promise<void> {
  const registered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+0'))
  if (mode === 'stub' && registered) {
    throw new Error(
      'The e2e shortcut mode is stub, but the real global Cmd+0 shortcut is registered. The shortcut stub in e2e/shortcut-stub.cjs is not applying.',
    )
  }
  if (mode === 'real' && !registered) {
    throw new Error(
      'The e2e shortcut mode is real, but the global Cmd+0 shortcut is not registered. The accelerator may be held by another process, or startup registration failed.',
    )
  }
}

function formatLaunchError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function observeSaveErrors(window: Page): Promise<void> {
  const errors: string[] = []
  await window.evaluate(() => {
    const browserWindow = globalThis as unknown as Window & {
      __treeObservedSaveErrors?: string[]
    }
    const observed = (browserWindow.__treeObservedSaveErrors ??= [])
    const scan = (): void => {
      document.querySelectorAll('.save-error').forEach((element) => {
        const message = element.textContent ?? ''
        if (!observed.includes(message)) observed.push(message)
      })
    }
    scan()
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  const timer = setInterval(() => {
    void window
      .locator('.save-error')
      .allTextContents()
      .then((messages) => {
        messages.forEach((message) => {
          if (!errors.includes(message)) errors.push(message)
        })
      })
      .catch(() => undefined)
  }, 25)
  const collect = async (): Promise<void> => {
    if (window.isClosed()) return
    await window
      .evaluate(() => {
        const browserWindow = globalThis as unknown as Window & { __treeObservedSaveErrors?: string[] }
        return browserWindow.__treeObservedSaveErrors ?? []
      })
      .then((messages) => messages.forEach((message) => !errors.includes(message) && errors.push(message)))
      .catch(() => undefined)
    await window
      .locator('.save-error')
      .allTextContents()
      .then((messages) => messages.forEach((message) => !errors.includes(message) && errors.push(message)))
      .catch(() => undefined)
  }
  const app = [...launchedApps].find((candidate) => candidate.windows().includes(window))
  if (app === undefined) throw new Error('The Electron app was not registered before error observation.')
  observedSaveErrors.set(window, { app, errors, timer, collect })
}

function forgetObservations(app: ElectronApplication): void {
  for (const [page, observation] of observedSaveErrors) {
    if (observation.app !== app) continue
    clearInterval(observation.timer)
    retainedSaveErrors.push(...observation.errors)
    observedSaveErrors.delete(page)
  }
}

export function node(window: Page, index: number) {
  return window.getByRole('textbox', { name: `Node ${index}` })
}

export function parent(window: Page) {
  return window.getByRole('textbox', { name: 'Current parent' })
}

export function nodeCount(window: Page): Promise<number> {
  return window.locator('[aria-label^="Node "]').count()
}

export function nodeTexts(window: Page): Promise<string[]> {
  return window
    .locator('[aria-label^="Node "]')
    .evaluateAll((inputs) =>
      inputs.map((input) => (input instanceof HTMLTextAreaElement ? input.value : (input.textContent ?? ''))),
    )
}

export async function setCursor(input: ReturnType<Page['locator']>, position: number): Promise<void> {
  await input.evaluate((element, cursor) => {
    if (element instanceof HTMLTextAreaElement) {
      element.focus()
      element.setSelectionRange(cursor, cursor)
      return
    }
    const field = element as HTMLElement
    field.focus()
    const selection = field.ownerDocument.defaultView?.getSelection()
    if (!selection) return
    const range = field.ownerDocument.createRange()
    const walker = field.ownerDocument.createTreeWalker(field, NodeFilter.SHOW_TEXT)
    let remaining = cursor
    let current = walker.nextNode()
    while (current !== null) {
      const length = current.textContent?.length ?? 0
      const link = current.parentElement?.closest('a[contenteditable="false"]')
      if (link !== null && link !== undefined && remaining <= length) {
        const parent = link.parentNode ?? field
        const linkIndex = Array.from(parent.childNodes).indexOf(link)
        const beforeLink = remaining <= length / 2
        range.setStart(parent, beforeLink ? linkIndex : linkIndex + 1)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      if (remaining < length) {
        range.setStart(current, remaining)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      remaining -= length
      current = walker.nextNode()
    }
    range.selectNodeContents(field)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }, position)
}

export function documentPath(userDataDir: string): string {
  return join(userDataDir, 'data', 'document.json')
}

export function windowBoundsPath(userDataDir: string): string {
  return join(userDataDir, 'data', 'window-bounds.json')
}

export function vimPreferencePath(userDataDir: string): string {
  return join(userDataDir, 'data', 'vim-enabled.json')
}

export function writeVimPreference(userDataDir: string, enabled: boolean): void {
  mkdirSync(join(userDataDir, 'data'), { recursive: true })
  writeFileSync(vimPreferencePath(userDataDir), JSON.stringify(enabled))
}

export function readVimPreference(userDataDir: string): unknown {
  return existsSync(vimPreferencePath(userDataDir))
    ? JSON.parse(readFileSync(vimPreferencePath(userDataDir), 'utf8'))
    : undefined
}

export function readWindowBounds(userDataDir: string): PersistedWindowBounds {
  return JSON.parse(readFileSync(windowBoundsPath(userDataDir), 'utf8')) as PersistedWindowBounds
}

export function tryReadWindowBounds(userDataDir: string): PersistedWindowBounds | null {
  try {
    return readWindowBounds(userDataDir)
  } catch {
    return null
  }
}

export function seedDocument(userDataDir: string, seed: { document: unknown; location: unknown }): void {
  const directory = join(userDataDir, 'data')
  mkdirSync(directory, { recursive: true })
  writeFileSync(documentPath(userDataDir), JSON.stringify({ version: 1, ...seed }))
}

export function readPersisted(userDataDir: string): PersistedState {
  return JSON.parse(readFileSync(documentPath(userDataDir), 'utf8')) as PersistedState
}

/**
 * Reads the persisted document for polling, treating a transiently absent primary as "not ready".
 *
 * A save renames the replaced primary to a generation before renaming the new document into place,
 * so the primary is briefly missing while a save is in flight. `expect.poll` does not retry a
 * callback that throws, so pollers must return a value instead of letting the read fail.
 */
export function tryReadPersisted(userDataDir: string): PersistedState | null {
  try {
    return readPersisted(userDataDir)
  } catch (error) {
    if (isFileNotFound(error)) return null
    throw error
  }
}

function isFileNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  return error.code === 'ENOENT'
}

export function attachmentFiles(userDataDir: string): string[] {
  const directory = join(userDataDir, 'data', 'attachments')
  return existsSync(directory) ? readdirSync(directory) : []
}

export function attachmentPath(userDataDir: string, attachmentId: string): string {
  return join(userDataDir, 'data', 'attachments', `${attachmentId}.png`)
}

export function documentGenerations(userDataDir: string): string[] {
  const directory = join(userDataDir, 'data')
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((name) => /^document\.\d+\.json$/.test(name))
    .sort((left, right) => Number(left.slice(9, -5)) - Number(right.slice(9, -5)))
}

// Tests that make the application read or write the system clipboard outside these helpers (for
// example by pressing Cmd+C, Cmd+X, or a context-menu Copy item) must hold the clipboard lock for
// the whole test. The helpers below acquire it automatically, and the fixture teardown releases it
// after every test.
export async function lockSystemClipboard(): Promise<void> {
  await acquireSystemClipboardLock()
}

export async function writeClipboardText(app: ElectronApplication, text: string): Promise<void> {
  await acquireSystemClipboardLock()
  await app.evaluate(async ({ clipboard }, value) => {
    clipboard.clear()
    await clipboard.writeText(value)
  }, text)
}

export async function writeClipboardTextAndHtml(app: ElectronApplication, text: string, html: string): Promise<void> {
  await acquireSystemClipboardLock()
  await app.evaluate(
    async ({ clipboard, ClipboardItem }, value) => {
      clipboard.clear()
      await clipboard.write([new ClipboardItem({ 'text/plain': value.text, 'text/html': value.html })])
    },
    { text, html },
  )
}

export async function writeClipboardImage(app: ElectronApplication): Promise<void> {
  await acquireSystemClipboardLock()
  await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
    const png = nativeImage.createFromBitmap(Buffer.from([40, 90, 200, 255]), { width: 1, height: 1 }).toPNG()
    const item = new ClipboardItem({ 'public.png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })
    clipboard.clear()
    await clipboard.write([item])
  })
}

export async function writeClipboardImageAndText(app: ElectronApplication): Promise<void> {
  await acquireSystemClipboardLock()
  await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
    const png = nativeImage.createFromBitmap(Buffer.from([40, 90, 200, 255]), { width: 1, height: 1 }).toPNG()
    const item = new ClipboardItem({
      'public.png': new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'text/plain': 'text representation',
    })
    clipboard.clear()
    await clipboard.write([item])
  })
}

export async function writeClipboardImageSized(app: ElectronApplication, width: number, height: number): Promise<void> {
  await acquireSystemClipboardLock()
  await app.evaluate(
    async ({ clipboard, ClipboardItem, nativeImage }, size) => {
      const pixels = Buffer.alloc(size.width * size.height * 4)
      for (let offset = 0; offset < pixels.length; offset += 4) {
        pixels[offset] = 40
        pixels[offset + 1] = 90
        pixels[offset + 2] = 200
        pixels[offset + 3] = 255
      }
      const png = nativeImage.createFromBitmap(pixels, { width: size.width, height: size.height }).toPNG()
      const item = new ClipboardItem({ 'public.png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })
      clipboard.clear()
      await clipboard.write([item])
    },
    { width, height },
  )
}

export async function firePaste(input: ReturnType<Page['locator']>): Promise<void> {
  await acquireSystemClipboardLock()
  await input.evaluate((element) => {
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true }))
  })
}

/**
 * Presses a shifted key the way a physical keyboard produces it: with Shift held down, so Shift's
 * own keydown arrives before the key. Playwright's plain `press('O')`/`press('$')` omits that
 * keydown, which can hide a defect in Normal-mode command assembly (`zO`, `rA`, `d$`, `ys{`,
 * `3G`). Callers pass the character the key produces, such as `$`, `(` or `Z`.
 */
export async function pressShifted(window: Page, key: string): Promise<void> {
  await window.keyboard.down('Shift')
  await window.keyboard.press(key)
  await window.keyboard.up('Shift')
}

export async function typeInto(input: ReturnType<Page['locator']>, text: string): Promise<void> {
  await input.focus()
  const normalMode = await input.evaluate(
    (element) => element.ownerDocument.querySelector('[aria-label="Vim mode"]')?.textContent?.trim() === 'NORMAL',
  )
  if (normalMode) {
    const position = await input.evaluate((element) =>
      element instanceof HTMLTextAreaElement ? element.selectionStart : undefined,
    )
    await input.press('i')
    if (position !== undefined) await setCursor(input, position)
  }
  await input.pressSequentially(text)
}

const DRAG_HOLD_MS = 500
const DRAG_SETTLE_MS = 250
const DRAG_ATTEMPTS = 3

export interface DragSourceBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Presses and holds a node row until drag mode is active and stable.
 *
 * A visible run happens on a live desktop, so the window can lose focus mid-gesture. Chromium then
 * releases pointer capture and the renderer cancels the drag, which is the intended application
 * behavior for a lost pointer. Retry the gesture a bounded number of times so an environmental
 * focus change does not fail a test, and require the active drag to survive a short settling
 * window before returning.
 */
export async function startRowDrag(
  window: Page,
  target: ReturnType<Page['locator']>,
  options: { xOffset?: number; duringHold?: (box: DragSourceBox) => Promise<void> } = {},
): Promise<void> {
  const xOffset = options.xOffset ?? 8
  for (let attempt = 1; attempt <= DRAG_ATTEMPTS; attempt += 1) {
    const box = await target.boundingBox()
    if (box === null) throw new Error('The drag source was not rendered.')
    await window.mouse.move(box.x + xOffset, box.y + box.height / 2)
    await window.mouse.down()
    if (options.duringHold !== undefined) await options.duringHold(box)
    await window.waitForTimeout(DRAG_HOLD_MS)
    if (await rowDragIsActive(window)) {
      await window.waitForTimeout(DRAG_SETTLE_MS)
      if (await rowDragIsActive(window)) return
    }
    await window.mouse.up()
  }
  throw new Error('The press-and-hold gesture did not start a stable node drag.')
}

async function rowDragIsActive(window: Page): Promise<boolean> {
  return (await window.locator('.node-row-dragging').count()) > 0
}

/**
 * Drags a text selection across a node field from `fromX` to `toX` pixels (relative to the field),
 * along its vertical center, optionally keeping the press still for `stillMs` before moving.
 *
 * A slow runner can deliver the first move long after the press, which would let the node-drag hold
 * elapse and turn the gesture into a node drag; the hold therefore runs on a paused page clock, and
 * `stillMs` only spends wall-clock time.
 */
export async function dragSelectText(
  window: Page,
  field: ReturnType<Page['locator']>,
  fromX: number,
  toX: number,
  stillMs = 0,
): Promise<void> {
  const box = await field.boundingBox()
  if (box === null) throw new Error('The text field was not rendered.')
  const y = box.y + box.height / 2
  await window.mouse.move(box.x + fromX, y)
  await window.clock.install()
  await window.clock.pauseAt(Date.now() + 60_000)
  try {
    await window.mouse.down()
    if (stillMs > 0) await window.waitForTimeout(stillMs)
    await window.mouse.move(box.x + toX, y, { steps: 8 })
    await window.mouse.up()
  } finally {
    await window.clock.resume()
  }
}

export async function dragRow(window: Page, fromIndex: number, toIndex: number): Promise<void> {
  const source = window.locator('.node-row').nth(fromIndex)
  await startRowDrag(window, source.locator('.node-input'))
  const targetBox = await window.locator('.node-row').nth(toIndex).boundingBox()
  if (targetBox === null) throw new Error(`Node row ${toIndex + 1} was not rendered.`)
  await window.mouse.move(targetBox.x + 8, targetBox.y + 4, { steps: 5 })
  await window.mouse.up()
}
