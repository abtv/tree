import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Keep the outer command stable for Codex rules. Only these diagnostic settings
// become environment variables; all other arguments go directly to Playwright.
export function diagnosticOptions(args: string[], inheritedEnv: NodeJS.ProcessEnv = process.env) {
  const env = { ...inheritedEnv }
  const forwarded = []
  for (const arg of args) {
    if (arg.startsWith('--shared-reset=')) {
      const value = arg.slice('--shared-reset='.length)
      if (!['fresh', 'reload', 'window'].includes(value)) throw new Error('Expected --shared-reset=fresh|reload|window')
      env.TREE_E2E_SHARED_RESET = value === 'fresh' ? 'off' : value
    } else if (arg.startsWith('--memory-burst-size=')) {
      const value = arg.slice('--memory-burst-size='.length)
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new Error('Expected a positive integer for --memory-burst-size')
      env.TREE_E2E_MEMORY_BURST_SIZE = value
    } else if (arg.startsWith('--json-output=')) {
      const value = arg.slice('--json-output='.length)
      if (!value) throw new Error('Expected a path for --json-output')
      env.PLAYWRIGHT_JSON_OUTPUT_NAME = resolve(value)
    } else {
      if (['--shared-reset', '--memory-burst-size', '--json-output'].includes(arg)) throw new Error(`Use ${arg}=VALUE`)
      forwarded.push(arg)
    }
  }
  return { env, args: ['run', 'test:e2e', '--', ...forwarded] }
}

export function runDiagnostics(
  args: string[],
  run: (
    command: string,
    args: string[],
    options: import('node:child_process').SpawnSyncOptions,
  ) => { status?: number | null; signal?: NodeJS.Signals | null; error?: Error } = spawnSync,
) {
  const options = diagnosticOptions(args)
  const result = run('npm', options.args, { env: options.env, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runDiagnostics(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
