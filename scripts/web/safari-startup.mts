import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export class SafariSessionTimeoutError extends Error {}

export function isSafariSessionTimeout(path: string, cause: unknown, signal: AbortSignal) {
  return path === '/session' && !signal.aborted && cause instanceof Error && cause.name === 'TimeoutError'
}

export async function createSafariSession<T>(
  attempt: (number: number) => Promise<T>,
  retry: boolean,
  signal: AbortSignal,
  log: (message: string) => void,
): Promise<T> {
  try {
    return await attempt(1)
  } catch (error) {
    if (!retry || signal.aborted || !(error instanceof SafariSessionTimeoutError)) throw error
    log('Session creation timed out; cleanup completed. Retrying once with a fresh SafariDriver and Safari.')
    return attempt(2)
  }
}

export interface SafariProcess {
  pid: number
  identity: string
  browser: boolean
}

export function parseSafariProcesses(output: string): SafariProcess[] {
  return output.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(.+?)\s+(\/.*)$/.exec(line)
    if (!match) return []
    const [, pid, started, command] = match
    const browser = command!.endsWith('/Safari.app/Contents/MacOS/Safari')
    if (!browser && command !== '/usr/bin/safaridriver') return []
    return [{ pid: Number(pid), identity: `${started} ${command}`, browser }]
  })
}

export async function readSafariProcesses() {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,lstart=,comm='], { timeout: 5000 })
  return parseSafariProcesses(stdout)
}

// Only call after an empty-process preflight on an exclusively owned disposable CI runner.
export async function stopOwnedSafari(
  read = readSafariProcesses,
  kill: (pid: number, signal: NodeJS.Signals) => unknown = process.kill,
) {
  const owned = (await read()).filter((entry) => entry.browser)
  const remaining = async () =>
    (await read()).filter((entry) =>
      owned.some((owner) => owner.pid === entry.pid && owner.identity === entry.identity),
    )

  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    for (const entry of await remaining()) {
      // Recheck PID and start time immediately before signaling; never target a reused PID.
      if (!(await remaining()).some((current) => current.pid === entry.pid)) continue
      try {
        kill(entry.pid, signal)
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error
      }
    }
    const deadline = Date.now() + 2000
    while ((await remaining()).length > 0 && Date.now() < deadline) await delay(50)
    if ((await remaining()).length === 0) return
  }
  assert.fail('Owned Safari did not exit; refusing to retry')
}
