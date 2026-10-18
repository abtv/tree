// @editing-modes: independent
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  disposeSharedApplication,
  documentPath,
  expect,
  launchTree,
  node,
  resetSharedApplication,
  seedDocument,
  setMainWindowBounds,
  sharedApplicationAdopted,
  test,
  typeInto,
  type Launched,
  type SharedApplication,
} from './fixtures'
import { WINDOW_BOUNDS_SAVE_DELAY_MILLISECONDS } from '../../src/infrastructure/main/window-state'

test.describe.configure({ mode: 'default' })

function removeData(shared: SharedApplication): void {
  rmSync(join(shared.directory, 'data'), { recursive: true, force: true })
}

function exited(child: ReturnType<Launched['app']['process']>): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

test('adopted selector preserves visible and explicit fresh controls', () => {
  const previousVisible = process.env['TREE_E2E_VISIBLE']
  const previousReset = process.env['TREE_E2E_SHARED_RESET']
  try {
    for (const visible of ['0', '1']) {
      for (const reset of ['off', 'reload', 'window']) {
        process.env['TREE_E2E_VISIBLE'] = visible
        process.env['TREE_E2E_SHARED_RESET'] = reset
        expect(sharedApplicationAdopted()).toBe(visible === '1' || reset === 'off' ? 'off' : 'reload')
      }
    }
    delete process.env['TREE_E2E_VISIBLE']
    delete process.env['TREE_E2E_SHARED_RESET']
    expect(sharedApplicationAdopted()).toBe('reload')
  } finally {
    if (previousVisible === undefined) delete process.env['TREE_E2E_VISIBLE']
    else process.env['TREE_E2E_VISIBLE'] = previousVisible
    if (previousReset === undefined) delete process.env['TREE_E2E_SHARED_RESET']
    else process.env['TREE_E2E_SHARED_RESET'] = previousReset
  }
})

// ADR 0021 makes visible execution fresh. Declare shared fault probes only in hidden runs.
const hiddenInfrastructure = process.env['TREE_E2E_VISIBLE'] !== '1'
if (hiddenInfrastructure) {
  test.describe('shared reset and recovery infrastructure', () => {
    // Infrastructure fault injection is deliberately outside adopted editing tests.
    test.use({ sharedApplicationReset: 'reload' })

    test('disposes the renderer, drains IPC and restores native state before deleting data', async ({
      userDataDir,
      sharedApplication,
    }) => {
      const first = await launchTree(userDataDir)
      await typeInto(node(first.window, 1), 'Discarded edits')
      await first.window.getByRole('button', { name: 'Pin window on top' }).click()
      await setMainWindowBounds(first.app, { width: 800, height: 550 })
      await first.app.evaluate(({ nativeTheme }) => {
        nativeTheme.themeSource = 'dark'
      })
      await resetSharedApplication(sharedApplication)
      expect(first.window.url()).toBe('about:blank')
      expect(exited(first.app.process())).toBe(false)
      removeData(sharedApplication)
      const second = await launchTree(userDataDir, { initialMode: 'normal', vimPreference: false })
      expect(second.app).toBe(first.app)
      await expect(node(second.window, 1)).toHaveValue('')
      await expect(second.window.getByLabel('Vim mode')).toHaveCount(0)
    })

    test('a rejected drain exits the owned process before data removal and relaunches cleanly', async ({
      userDataDir,
      sharedApplication,
    }) => {
      const first = await launchTree(userDataDir)
      const originalBounds = sharedApplication.bounds
      const child = first.app.process()
      await first.app.evaluate(() => {
        globalThis.__treeSharedTest!.rejectDrain = true
      })
      await expect(resetSharedApplication(sharedApplication)).rejects.toThrow('Injected shared drain rejection')
      expect(exited(child)).toBe(true)
      expect(existsSync(documentPath(userDataDir))).toBe(true)
      expect(sharedApplication).toEqual({ directory: userDataDir, launched: undefined })
      removeData(sharedApplication)
      const second = await launchTree(userDataDir)
      expect(second.app).not.toBe(first.app)
      expect(sharedApplication.bounds).toEqual(originalBounds)
    })

    test('drains native debounce after bounds move away and back to the initial value', async ({
      userDataDir,
      sharedApplication,
    }) => {
      const launched = await launchTree(userDataDir)
      const initial = { ...sharedApplication.bounds! }
      await setMainWindowBounds(launched.app, { width: 800, height: 550 })
      await setMainWindowBounds(launched.app, initial)
      await resetSharedApplication(sharedApplication)
      removeData(sharedApplication)
      await new Promise((resolve) => setTimeout(resolve, WINDOW_BOUNDS_SAVE_DELAY_MILLISECONDS + 50))
      expect(existsSync(join(userDataDir, 'data'))).toBe(false)
      await launchTree(userDataDir)
    })

    test('a renderer load failure clears metadata and permits a subsequent clean launch', async ({
      userDataDir,
      sharedApplication,
    }) => {
      const first = await launchTree(userDataDir)
      const child = first.app.process()
      await resetSharedApplication(sharedApplication)
      removeData(sharedApplication)
      sharedApplication.rendererUrl = 'unsupported-tree-test://invalid'
      await expect(launchTree(userDataDir)).rejects.toThrow('Electron failed to launch')
      expect(exited(child)).toBe(true)
      expect(sharedApplication.rendererUrl).toBeUndefined()
      expect(sharedApplication.bounds).toBeUndefined()
      removeData(sharedApplication)
      const second = await launchTree(userDataDir)
      await expect(node(second.window, 1)).toHaveValue('')
    })

    test('production IPC rejection prevents reuse and is drained through original handlers', async ({
      userDataDir,
      sharedApplication,
    }) => {
      const first = await launchTree(userDataDir)
      const child = first.app.process()
      await first.window.evaluate(async () => {
        const api = (globalThis as typeof globalThis & { treeApi: { save(value: unknown): Promise<void> } }).treeApi
        await api.save({ invalid: true }).catch(() => undefined)
      })
      await expect(resetSharedApplication(sharedApplication)).rejects.toThrow('Shared application IPC failed')
      expect(exited(child)).toBe(true)
      removeData(sharedApplication)
      await launchTree(userDataDir)
    })

    test('a stalled reset has a bounded failure and exits before deleting data', async ({
      userDataDir,
      sharedApplication,
    }) => {
      const first = await launchTree(userDataDir)
      const child = first.app.process()
      await first.app.evaluate(() => {
        globalThis.__treeSharedTest!.stallDrain = true
      })
      await expect(resetSharedApplication(sharedApplication, 500)).rejects.toThrow('timed out')
      expect(exited(child)).toBe(true)
      expect(existsSync(documentPath(userDataDir))).toBe(true)
      removeData(sharedApplication)
      await launchTree(userDataDir)
    })

    test('readiness failure disposes the process and clears captured state', async ({
      userDataDir,
      sharedApplication,
    }) => {
      await launchTree(userDataDir)
      await resetSharedApplication(sharedApplication)
      removeData(sharedApplication)
      // This seed deliberately violates the existing collapsed/top-level contract.
      seedDocument(userDataDir, {
        document: {
          roots: [{ id: 'parent', text: 'Parent', children: [{ id: 'child', text: 'Child', children: [] }] }],
        },
        location: { currentParentId: 'parent', selectedNodeId: 'child' },
      })
      const child = sharedApplication.launched!.app.process()
      await expect(launchTree(userDataDir)).rejects.toThrow()
      expect(exited(child)).toBe(true)
      expect(sharedApplication.bounds).toBeUndefined()
      expect(sharedApplication.rendererUrl).toBeUndefined()
      removeData(sharedApplication)
      await launchTree(userDataDir)
    })

    test('an invalid seed fails before loading and disposes the retained process', async ({
      userDataDir,
      sharedApplication,
    }) => {
      const first = await launchTree(userDataDir)
      const child = first.app.process()
      await resetSharedApplication(sharedApplication)
      removeData(sharedApplication)
      mkdirSync(join(userDataDir, 'data'), { recursive: true })
      writeFileSync(documentPath(userDataDir), 'invalid JSON')
      await expect(launchTree(userDataDir)).rejects.toThrow()
      expect(exited(child)).toBe(true)
      expect(sharedApplication.bounds).toBeUndefined()
      expect(sharedApplication.rendererUrl).toBeUndefined()
      removeData(sharedApplication)
      await launchTree(userDataDir)
    })

    test('unexpected process exit clears all retained metadata', async ({ userDataDir, sharedApplication }) => {
      const first = await launchTree(userDataDir)
      const child = first.app.process()
      await first.app
        .evaluate(({ app }) => {
          app.exit(0)
        })
        .catch(() => undefined)
      await expect.poll(() => exited(child)).toBe(true)
      await expect.poll(() => sharedApplication.launched).toBeUndefined()
      expect(sharedApplication.bounds).toBeUndefined()
      expect(sharedApplication.rendererUrl).toBeUndefined()
      removeData(sharedApplication)
      await launchTree(userDataDir)
    })

    test('worker disposal clears process metadata and is idempotent', async ({ userDataDir, sharedApplication }) => {
      const first = await launchTree(userDataDir)
      const child = first.app.process()
      await resetSharedApplication(sharedApplication)
      await disposeSharedApplication(sharedApplication)
      expect(exited(child)).toBe(true)
      expect(sharedApplication.rendererUrl).toBeUndefined()
      expect(sharedApplication.bounds).toBeUndefined()
      await disposeSharedApplication(sharedApplication)
    })

    test('leaves a shared process for the following fresh case', async ({ userDataDir, sharedApplication }) => {
      await launchTree(userDataDir)
      expect(sharedApplication.launched).toBeDefined()
    })
  })

  test('fresh execution disposes a retained shared owner before launching', async ({
    userDataDir,
    sharedApplication,
  }) => {
    const prior = sharedApplication.launched
    expect(prior, 'The preceding shared case must leave a retained owner for this transition.').toBeDefined()
    const priorChild = prior?.app.process()
    const fresh = await launchTree(userDataDir)
    if (priorChild !== undefined) expect(exited(priorChild)).toBe(true)
    expect(sharedApplication.launched).toBeUndefined()
    expect(sharedApplication.rendererUrl).toBeUndefined()
    expect(sharedApplication.bounds).toBeUndefined()
    expect(fresh.window.url()).not.toBe('about:blank')
  })

  test.describe('subsequent shared owner', () => {
    test.use({ sharedApplicationReset: 'reload' })
    test('relaunches after fresh execution without stale worker metadata', async ({ userDataDir }) => {
      const launched = await launchTree(userDataDir)
      await expect(node(launched.window, 1)).toHaveValue('')
    })
  })
}

// Keep these last so hidden execution leaves a blank shared process for actual worker teardown.
test.describe('adopted selector real launch', () => {
  test.use({ sharedApplicationReset: sharedApplicationAdopted() })
  for (const sequence of [1, 2]) {
    test(`honors the selected isolation in launch ${sequence}`, async ({
      userDataDir,
      sharedApplication,
      sharedApplicationReset,
    }) => {
      const launched = await launchTree(userDataDir)
      expect(sharedApplication.launched?.app).toBe(sharedApplicationReset === 'off' ? undefined : launched.app)
      test.info().annotations.push({
        type: 'tree-worker-ownership',
        description: JSON.stringify({ pid: launched.app.process().pid, directory: userDataDir }),
      })
      await expect(node(launched.window, 1)).toHaveValue('')
    })
  }
})
