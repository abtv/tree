import { beforeEach, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { containerArguments, containerSourceFiles, run, runSmoke, runElectron, runMemory } from './chromium.mts'
import { dependencyImage } from './chromium-image.mts'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))
const spawn = vi.mocked(spawnSync)
beforeEach(() => {
  spawn.mockReset()
  vi.mocked(mkdirSync).mockClear()
  vi.mocked(writeFileSync).mockClear()
})

it('rejects all supplied arguments before accessing Docker', () => {
  for (const arg of ['--privileged', '--network=host', '--help', 'sh', '--config=other.ts']) {
    expect(() => run([arg])).toThrow('accepts no arguments')
    expect(() => runSmoke([arg])).toThrow('accepts no arguments')
    expect(() => runElectron([arg])).toThrow('accepts no arguments')
    expect(() => runMemory([arg])).toThrow('accepts no arguments')
  }
  expect(spawn).not.toHaveBeenCalled()
})

it.each([
  ['electron', runElectron],
  ['memory', runMemory],
] as const)('runs the fixed %s suite without copying macOS baselines or weakening isolation', (mode, runSuite) => {
  const id = `sha256:${'d'.repeat(64)}`
  spawn
    .mockReturnValueOnce({ status: 0, stdout: `${id}\n` } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 0, stdout: Buffer.from('archive') } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 8 } as ReturnType<typeof spawnSync>)

  expect(runSuite([])).toBe(8)
  expect(spawn.mock.calls[2]).toEqual([
    'docker',
    [...containerArguments(id), mode],
    mode === 'memory'
      ? { input: Buffer.from('archive'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
      : { input: Buffer.from('archive'), stdio: ['pipe', 'inherit', 'inherit'] },
  ])
  const files = spawn.mock.calls[1]![1]!

  expect(files).toContain('config/testing/playwright.linux.config.ts')
  expect(files).toContain('config/testing/playwright.memory.config.ts')
  expect(files).toContain('e2e/electron/shared-application-memory.spec.ts')
  expect(files).toContain('config/testing/electron-platforms.ts')
  expect(files).toContain('e2e/electron/shared-application.spec.ts')
  if (mode === 'memory') {
    expect(files).toContain('perf/electron/memory-probe.ts')
    expect(files).toContain('perf/electron/memory-processes.ts')
    expect(files).toContain('perf/electron/state.spec.ts')
    expect(files).toContain('perf/memory-budget.ts')
    expect(files).not.toContain('perf/electron/typing.spec.ts')
  }
  expect(files.some((path) => path.includes('-snapshots/'))).toBe(false)
  expect(files.some((path) => /^(?:\.git|\.scratch|\.aws|\.codex|node_modules|out)(?:\/|$)/.test(path))).toBe(false)
})

it.each([false, true])('preserves partial memory output on failure (launch error=%s)', (launchError) => {
  spawn
    .mockReturnValueOnce({ status: 0, stdout: `sha256:${'d'.repeat(64)}\n` } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 0, stdout: Buffer.from('archive') } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({
      status: launchError ? null : 7,
      stdout: 'MEMORY partial sample\n',
      stderr: 'failed boundary\n',
      ...(launchError ? { error: new Error('test timeout') } : {}),
    } as ReturnType<typeof spawnSync>)

  if (launchError) expect(() => runMemory([])).toThrow('test timeout')
  else expect(runMemory([])).toBe(7)

  expect(writeFileSync).toHaveBeenCalledWith(
    expect.stringMatching(/reports\/electron-memory\/[^/]+\.log$/),
    expect.stringContaining('MEMORY partial sample\n\nfailed boundary\n'),
    { flag: 'wx' },
  )
})

it('selects only the fixed smoke mode with the same offline container restrictions', () => {
  const id = `sha256:${'c'.repeat(64)}`
  spawn
    .mockReturnValueOnce({ status: 0, stdout: `${id}\n` } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 0, stdout: Buffer.from('archive') } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 9 } as ReturnType<typeof spawnSync>)

  expect(runSmoke([])).toBe(9)
  expect(spawn.mock.calls[2]).toEqual([
    'docker',
    [...containerArguments(id), 'smoke'],
    { input: Buffer.from('archive'), stdio: ['pipe', 'inherit', 'inherit'] },
  ])
  expect(spawn.mock.calls[1]![1]).toEqual(expect.arrayContaining(containerSourceFiles(true)))
})

it('streams smoke launch dependencies without baseline images, host output or credentials', () => {
  const files = containerSourceFiles(true)

  expect(files).toEqual(
    expect.arrayContaining([
      'config/build/electron.vite.config.ts',
      'scripts/rename-dev-app.mts',
      'config/testing/playwright.smoke.config.ts',
      'config/testing/playwright.smoke-electron.config.ts',
      'e2e/smoke/happy-path.spec.mts',
      'e2e/smoke/scenario.mts',
      'e2e/electron/fixtures.ts',
      'e2e/electron/platform-expect.ts',
      'e2e/electron/electron-entry.cjs',
      'e2e/electron/hidden-windows.cjs',
      'e2e/electron/shortcut-stub.cjs',
      'e2e/electron/electron-process.ts',
      'e2e/electron/clipboard-lock.ts',
      'scripts/web/container-entry.mts',
      'scripts/web/static-server.mts',
    ]),
  )
  expect(files.some((path) => /^(?:\.git|\.scratch|\.aws|\.codex|node_modules|out)(?:\/|$)/.test(path))).toBe(false)
  expect(
    files.some((path) => path.startsWith('e2e/electron/') && (path.includes('-snapshots/') || path.endsWith('.png'))),
  ).toBe(false)
  expect(containerSourceFiles().some((path) => path.startsWith('e2e/electron/') || path.startsWith('e2e/smoke/'))).toBe(
    false,
  )
})

it('runs only a local immutable image with the fixed isolation settings', () => {
  const id = `sha256:${'a'.repeat(64)}`

  expect(containerArguments(id)).toEqual([
    'run',
    '--rm',
    '--pull=never',
    '--platform',
    'linux/arm64',
    '--network',
    'none',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '2048',
    '--memory',
    '4g',
    '--cpus',
    '4',
    '-i',
    id,
  ])
  for (const value of ['image:latest', '--privileged', `${id} sh`]) {
    expect(() => containerArguments(value)).toThrow('immutable image ID')
  }
})

it('reuses dependencies for script edits but invalidates changed install inputs', () => {
  const bytes = (value: string) => Buffer.from(value)
  const manifest = { dependencies: { react: '19.3.0' }, scripts: { test: 'old' } }
  const name = (value: unknown, lock = '{}', recipe = 'recipe', ignore = 'ignore', buildRecipe = 'buildRecipe') =>
    dependencyImage(bytes(JSON.stringify(value)), bytes(lock), bytes(recipe), bytes(ignore), bytes(buildRecipe))
  const image = name(manifest)

  expect(name({ ...manifest, scripts: { test: 'new' }, description: 'new' })).toBe(image)
  expect(name({ ...manifest, dependencies: { react: '20.0.0' } })).not.toBe(image)
  expect(name(manifest, '{"lockfileVersion":3}')).not.toBe(image)
  expect(name(manifest, '{}', 'changed')).not.toBe(image)
  expect(name(manifest, '{}', 'recipe', 'changed')).not.toBe(image)
  expect(name(manifest, '{}', 'recipe', 'ignore', 'changed')).not.toBe(image)
})

it('stops at a missing image without building, pulling, archiving, or running anything', () => {
  spawn.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'No such image' } as ReturnType<typeof spawnSync>)

  expect(() => run([])).toThrow('make setup')
  expect(spawn).toHaveBeenCalledTimes(1)
  expect(spawn.mock.calls[0]![0]).toBe('docker')
  expect(spawn.mock.calls[0]![1]).toEqual([
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    expect.stringMatching(/^tree-chromium-tests:[a-f0-9]{64}$/),
  ])
})

it('passes current source over stdin to the fixed container and propagates test failure', () => {
  const id = `sha256:${'b'.repeat(64)}`
  const archive = Buffer.from('source archive')
  spawn
    .mockReturnValueOnce({ status: 0, stdout: `${id}\n` } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 0, stdout: archive } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 7 } as ReturnType<typeof spawnSync>)

  expect(run([])).toBe(7)

  const [command, args] = spawn.mock.calls[1]!

  expect(command).toBe('tar')
  expect(args).toEqual(
    expect.arrayContaining([
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'config/typescript/tsconfig.node.json',
      'config/typescript/tsconfig.web.json',
      'config/typescript/tsconfig.e2e.json',
      'config/typescript/tsconfig.scripts.json',
      'config/testing/playwright.web.config.ts',
      'scripts/web/build.mts',
      'scripts/release-version.mts',
      'scripts/build-info.mts',
      'assets/icons/tree-icon-source.png',
      'src/web/index.html',
      'e2e/web/fixtures.mts',
      'e2e/external-drop.ts',
    ]),
  )
  expect(args!.some((path) => /^(\.git|\.scratch|node_modules)(\/|$)/.test(path))).toBe(false)
  expect(spawn.mock.calls[2]).toEqual([
    'docker',
    containerArguments(id),
    { input: archive, stdio: ['pipe', 'inherit', 'inherit'] },
  ])
  expect(spawn).toHaveBeenCalledTimes(3)
})

it('does not start a container when source archiving fails', () => {
  spawn
    .mockReturnValueOnce({ status: 0, stdout: `sha256:${'b'.repeat(64)}` } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 1, stderr: Buffer.from('archive failure') } as ReturnType<typeof spawnSync>)

  expect(() => run([])).toThrow('Source archive failed: archive failure')
  expect(spawn).toHaveBeenCalledTimes(2)
})

it('creates a source archive with container ownership and no macOS metadata', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  spawn
    .mockReturnValueOnce({ status: 0, stdout: `sha256:${'b'.repeat(64)}` } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 0, stdout: Buffer.from('archive') } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)

  run([])
  const [, args, options] = spawn.mock.calls[1]!
  // Exercise the real host tar using the runner's options and one source file.
  const archive = actual.spawnSync('tar', [...args!.slice(0, args!.indexOf('--') + 1), 'package.json'], options)

  expect(archive.status, archive.stderr.toString()).toBe(0)

  const listing = actual.spawnSync('tar', ['-tvf', '-'], { input: archive.stdout, encoding: 'utf8' })

  expect(listing.status, listing.stderr).toBe(0)
  expect(listing.stdout.trim().split('\n')).toHaveLength(1)
  expect(listing.stdout).toMatch(/\sroot(?:\/|\s+)root\s/)

  if (!Buffer.isBuffer(archive.stdout)) throw new Error('Expected a binary source archive')

  expect(Number.parseInt(archive.stdout.subarray(108, 116).toString(), 8)).toBe(0)
  expect(Number.parseInt(archive.stdout.subarray(116, 124).toString(), 8)).toBe(0)
  expect(listing.stdout).not.toContain('._')
})
