import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

function command(executable: string, args: string[], smoke = false) {
  const started = performance.now()
  const result = spawnSync(executable, args, {
    stdio: 'inherit',
    ...(smoke ? { env: { ...process.env, CI: '1' }, timeout: 25_000, killSignal: 'SIGKILL' as const } : {}),
  })
  if (result.error) console.error(`${executable} ${args.join(' ')}: ${result.error.message}`)
  if (smoke) {
    const elapsed = performance.now() - started
    console.log(`${args.at(-1)} including runner startup and cleanup: ${(elapsed / 1000).toFixed(2)}s`)
    if (elapsed > 20_000) {
      console.error('Linux smoke exceeded the 20-second budget')
      return 1
    }
  }
  return result.error ? 1 : (result.status ?? 1)
}

export function run(args: string[]) {
  if (args.length !== 1 || !['web', 'smoke'].includes(args[0]!))
    throw new Error('The Linux test container accepts only web or smoke')
  if (args[0] === 'web') return command('npm', ['run', 'test:web:built'])

  for (const build of ['build', 'build:web']) {
    const result = command('npm', ['run', build])
    if (result !== 0) return result
  }
  const electron = command('xvfb-run', ['--auto-servernum', 'npm', 'run', 'test:smoke:electron'], true)
  // Both targets report their result even when Electron fails.
  // On a hard timeout descendants remain isolated here; exiting this container's PID 1
  // after the second bounded invocation destroys all remaining processes before --rm.
  const chromium = command('npm', ['run', 'test:smoke:chromium'], true)
  return electron || chromium
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
