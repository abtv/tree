import { beforeEach, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { containerArguments, run } from './chromium.mts'
import { dependencyImage } from './chromium-image.mts'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
const spawn = vi.mocked(spawnSync)
beforeEach(() => spawn.mockReset())

it('rejects all supplied arguments before accessing Docker', () => {
  for (const arg of ['--privileged', '--network=host', '--help', 'sh', '--config=other.ts']) {
    expect(() => run([arg])).toThrow('accepts no arguments')
  }
  expect(spawn).not.toHaveBeenCalled()
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
    '512',
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
  const name = (value: unknown, lock = 'lock', recipe = 'recipe', ignore = 'ignore', makefile = 'makefile') =>
    dependencyImage(bytes(JSON.stringify(value)), bytes(lock), bytes(recipe), bytes(ignore), bytes(makefile))
  const image = name(manifest)
  expect(name({ ...manifest, scripts: { test: 'new' }, description: 'new' })).toBe(image)
  expect(name({ ...manifest, dependencies: { react: '20.0.0' } })).not.toBe(image)
  expect(name(manifest, 'changed')).not.toBe(image)
  expect(name(manifest, 'lock', 'changed')).not.toBe(image)
  expect(name(manifest, 'lock', 'recipe', 'changed')).not.toBe(image)
  expect(name(manifest, 'lock', 'recipe', 'ignore', 'changed')).not.toBe(image)
})

it('stops at a missing image without building, pulling, archiving, or running anything', () => {
  spawn.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'No such image' } as ReturnType<typeof spawnSync>)
  expect(() => run([])).toThrow('make chromium-image')
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
      'playwright.web.config.ts',
      'scripts/web/build.mts',
      'src/web/index.html',
      'e2e/web/fixtures.mjs',
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
