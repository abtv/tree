import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mutationShard } from '../config/testing/mutation-shards.mts'

export function mutationOptions(args: string[], inheritedEnv: NodeJS.ProcessEnv = process.env) {
  const env = { ...inheritedEnv }
  const inheritedShard = mutationShard(env.TREE_MUTATION_SHARD)
  let selected: string | undefined
  const forwarded: string[] = []

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '--') {
      forwarded.push(...args.slice(index))
      break
    }
    if (arg !== '--shard' && !arg.startsWith('--shard=')) {
      forwarded.push(arg)
      continue
    }
    if (selected !== undefined) throw new Error('Specify --shard only once')
    const value = arg === '--shard' ? args[++index] : arg.slice('--shard='.length)
    if (!value || value.startsWith('-')) throw new Error('Expected a value for --shard')
    selected = mutationShard(value)
  }

  if (selected !== undefined) {
    if (inheritedShard !== undefined && inheritedShard !== selected) {
      throw new Error('--shard conflicts with TREE_MUTATION_SHARD')
    }
    env.TREE_MUTATION_SHARD = selected
  }
  return { env, args: ['run', 'config/testing/stryker.config.mjs', ...forwarded] }
}

export function runMutation(
  args: string[],
  run: (
    command: string,
    args: string[],
    options: import('node:child_process').SpawnSyncOptions,
  ) => {
    status: number | null
    error?: Error
  } = spawnSync,
) {
  const options = mutationOptions(args)
  const result = run('stryker', options.args, { env: options.env, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runMutation(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
