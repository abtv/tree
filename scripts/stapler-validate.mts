import { spawnSync } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

type Result = { status: number; output: string }

function runStapler(path: string, operation: 'validate' | 'staple' = 'validate'): Result {
  const result = spawnSync('xcrun', ['stapler', operation, path], { encoding: 'utf8' })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` }
}

export async function validateTicket(
  path: string,
  run: (path: string) => Result = runStapler,
  wait: (milliseconds: number) => Promise<unknown> = setTimeout,
): Promise<number> {
  const delays = [15000, 30000]
  for (let attempt = 0; ; attempt++) {
    const result = run(path)
    const delay = delays[attempt]
    const transient = /\bError Domain=NSURLErrorDomain Code=-(?:1001|1005)\b/.test(result.output)
    if (result.status !== 68 || !transient || delay === undefined) return result.status

    console.error(`Apple ticket operation encountered a temporary network error; retrying in ${delay / 1000}s`)
    await wait(delay)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const staple = process.argv[2] === '--staple'
  if (process.argv.length !== (staple ? 4 : 3)) throw new Error('Provide [--staple] and exactly one bundle or DMG path')
  process.exitCode = await validateTicket(process.argv[staple ? 3 : 2]!, (path) =>
    runStapler(path, staple ? 'staple' : 'validate'),
  )
}
