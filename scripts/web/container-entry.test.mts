import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { beforeEach, expect, it, vi } from 'vitest'
import { run } from './container-entry.mts'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
const spawn = vi.mocked(spawnSync)
beforeEach(() => {
  vi.restoreAllMocks()
  spawn.mockReset()
  spawn.mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

it('rejects arbitrary container commands before starting a child', () => {
  for (const args of [
    [],
    ['sh'],
    ['smoke', '--config=other.ts'],
    ['web', 'smoke'],
    ['electron', 'sh'],
    ['memory', 'sh'],
  ])
    expect(() => run(args)).toThrow('only web, smoke, electron or memory')
  expect(spawn).not.toHaveBeenCalled()
})

it.each([
  ['electron', 'linux'],
  ['memory', 'memory'],
])('builds Electron and runs only the %s config under bounded Xvfb', (mode, config) => {
  expect(run([mode])).toBe(0)
  expect(spawn.mock.calls[0]).toEqual(['npm', ['run', 'build'], { stdio: 'inherit' }])
  expect(spawn.mock.calls[1]).toEqual([
    'xvfb-run',
    [
      '--auto-servernum',
      'npx',
      '--no-install',
      'playwright',
      'test',
      '-c',
      `config/testing/playwright.${config}.config.ts`,
    ],
    expect.objectContaining({ env: expect.objectContaining({ CI: '1' }), timeout: 900_000, killSignal: 'SIGKILL' }),
  ])
})

it.each(['electron', 'memory'])('propagates Linux %s build, test and timeout failures', (mode) => {
  spawn.mockReturnValueOnce({ status: 4 } as ReturnType<typeof spawnSync>)

  expect(run([mode])).toBe(4)
  expect(spawn).toHaveBeenCalledTimes(1)

  spawn.mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
  spawn.mockReturnValueOnce({ status: 5 } as ReturnType<typeof spawnSync>)

  expect(run([mode])).toBe(5)

  spawn.mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
  spawn.mockReturnValueOnce({ status: null, error: new Error('timeout') } as ReturnType<typeof spawnSync>)

  expect(run([mode])).toBe(1)
})

it('keeps the existing full browser command as the web mode', () => {
  spawn.mockReturnValueOnce({ status: 7 } as ReturnType<typeof spawnSync>)

  expect(run(['web'])).toBe(7)
  expect(spawn).toHaveBeenCalledExactlyOnceWith('npm', ['run', 'test:web:built'], { stdio: 'inherit' })
})

it('builds both production targets before checking Electron under Xvfb and Chromium', () => {
  expect(run(['smoke'])).toBe(0)
  expect(spawn.mock.calls.map(([command, args]) => [command, args])).toEqual([
    ['npm', ['run', 'build']],
    ['npm', ['run', 'build:web']],
    ['xvfb-run', ['--auto-servernum', 'npm', 'run', 'test:smoke:electron']],
    ['npm', ['run', 'test:smoke:chromium']],
  ])

  for (const index of [2, 3]) {
    const options = spawn.mock.calls[index]![2]!

    expect(options).toMatchObject({ env: { CI: '1' }, timeout: 25_000, killSignal: 'SIGKILL', stdio: 'inherit' })
  }
})

it('stops before smoke execution if a production build fails', () => {
  spawn.mockReturnValueOnce({ status: 4 } as ReturnType<typeof spawnSync>)

  expect(run(['smoke'])).toBe(4)
  expect(spawn).toHaveBeenCalledTimes(1)
})

it.each([0, 1])('does not accept a failed smoke and still executes both targets (failed target %i)', (failed) => {
  spawn
    .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: failed === 0 ? 3 : 0 } as ReturnType<typeof spawnSync>)
    .mockReturnValueOnce({ status: failed === 1 ? 3 : 0 } as ReturnType<typeof spawnSync>)

  expect(run(['smoke'])).toBe(3)
  expect(spawn).toHaveBeenCalledTimes(4)
})

it.each(['missing Xvfb', 'timed out'])(
  'reports a failed Electron command (%s) and continues with Chromium',
  (message) => {
    spawn
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: null, error: new Error(message) } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)

    expect(run(['smoke'])).toBe(1)
    expect(spawn).toHaveBeenCalledTimes(4)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(message))
  },
)

it('fails a successful child that exceeds the complete 20-second smoke budget', () => {
  vi.spyOn(performance, 'now')
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(20_001)
    .mockReturnValueOnce(20_001)
    .mockReturnValueOnce(20_002)

  expect(run(['smoke'])).toBe(1)
  expect(console.error).toHaveBeenCalledWith('Linux smoke exceeded the 20-second budget')
})

it('prepares the locked Electron binary in the owner-built dependency image', () => {
  const dockerfile = readFileSync(new URL('./chromium.Dockerfile', import.meta.url), 'utf8')

  expect(dockerfile).toContain('RUN npm ci --ignore-scripts --no-audit --no-fund')
  expect(dockerfile).toContain('RUN node node_modules/electron/install.js')
  expect(dockerfile).toContain('apt-get install -y --no-install-recommends xauth')
  expect(dockerfile).not.toContain('ELECTRON_SKIP_BINARY_DOWNLOAD=1')
  expect(dockerfile).toContain('scripts/web/container-entry.mts')
  expect(dockerfile).toContain('CMD ["web"]')
})
