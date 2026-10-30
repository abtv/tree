import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { mutationOptions, runMutation } from './run-mutation.mts'

afterEach(() => vi.unstubAllEnvs())

it('keeps the full scope by default and forwards Stryker arguments literally', () => {
  const args = ['--mutate', 'src/application/a file.ts', '--concurrency', '4', '--incrementalFile', 'report.json']

  const result = mutationOptions(args, { PATH: 'original' })

  expect(result).toEqual({
    env: { PATH: 'original' },
    args: ['run', 'config/testing/stryker.config.mjs', ...args],
  })
})

it.each(['domain', 'application', 'renderer'])('supports both spellings of the %s shard', (shard) => {
  for (const args of [['--shard', shard], [`--shard=${shard}`]]) {
    const result = mutationOptions([...args, '--concurrency', '4'], {})

    expect(result.env.TREE_MUTATION_SHARD).toBe(shard)
    expect(result.args).toEqual(['run', 'config/testing/stryker.config.mjs', '--concurrency', '4'])
  }
})

it.each(['domain', 'application', 'renderer', ''])(
  'preserves the CI selector %j without mutating the parent',
  (shard) => {
    const env = { TREE_MUTATION_SHARD: shard, PATH: 'original' }

    const result = mutationOptions([], env)

    expect(result.env).toEqual(env)
    expect(result.env).not.toBe(env)
    expect(env).toEqual({ TREE_MUTATION_SHARD: shard, PATH: 'original' })
  },
)

it('accepts matching CLI and CI selectors but rejects a conflict', () => {
  expect(mutationOptions(['--shard', 'domain'], { TREE_MUTATION_SHARD: 'domain' }).env.TREE_MUTATION_SHARD).toBe(
    'domain',
  )
  expect(() => mutationOptions(['--shard', 'application'], { TREE_MUTATION_SHARD: 'domain' })).toThrow('conflicts')
})

it.each([
  ['--shard'],
  ['--shard='],
  ['--shard', '--concurrency', '4'],
  ['--shard', 'unknown'],
  ['--shard', 'domain', '--shard=renderer'],
  ['--shard=domain', '--shard', 'domain'],
])('rejects invalid shard arguments %j', (...args) => {
  expect(() => mutationOptions(args, {})).toThrow()
})

it('rejects an invalid inherited selector and preserves arguments after the terminator', () => {
  expect(() => mutationOptions([], { TREE_MUTATION_SHARD: 'unknown' })).toThrow('Unknown mutation shard')
  expect(mutationOptions(['--', '--shard', 'application'], {}).args).toEqual([
    'run',
    'config/testing/stryker.config.mjs',
    '--',
    '--shard',
    'application',
  ])
})

it.each([0, 1, 7])('preserves real child exit status %s, including a failed threshold', (status) => {
  vi.stubEnv('TREE_MUTATION_SHARD', '')
  const run = vi.fn<NonNullable<Parameters<typeof runMutation>[1]>>((command, args, options) => {
    expect(command).toBe('stryker')
    expect(args).toEqual(['run', 'config/testing/stryker.config.mjs', '--concurrency', '2'])
    expect(options).toMatchObject({ env: { TREE_MUTATION_SHARD: 'application' }, stdio: 'inherit' })
    return spawnSync(process.execPath, ['-e', `process.exit(${status})`])
  })

  expect(runMutation(['--shard', 'application', '--concurrency', '2'], run)).toBe(status)
})

it('reports a failure when the child cannot launch or is interrupted', () => {
  const error = new Error('Cannot launch Stryker')

  expect(() => runMutation([], () => ({ error, status: null }))).toThrow(error)
  expect(runMutation([], () => ({ status: null }))).toBe(1)
})

it('rejects invalid CLI input before launching Stryker', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./run-mutation.mts', import.meta.url)), '--shard', 'unknown'],
    { encoding: 'utf8' },
  )

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Unknown mutation shard: unknown')
  expect(result.stdout).toBe('')
})
