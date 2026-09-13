import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function cleanupStaleElectronProcesses(marker: string): Promise<void> {
  if (process.platform !== 'darwin') return

  const processes = await listProcesses()
  const currentPid = process.pid
  const stalePids = processes
    .filter(({ pid, command }) => pid !== currentPid && command.includes(marker) && command.includes('Electron'))
    .map(({ pid }) => pid)

  for (const pid of stalePids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      continue
    }
  }

  await waitForProcessesToExit(stalePids)
}

async function listProcesses(): Promise<Array<{ pid: number; command: string }>> {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command='])
    return stdout
      .split('\n')
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.*)$/)
        return match === null ? undefined : { pid: Number(match[1]), command: match[2] }
      })
      .filter((value): value is { pid: number; command: string } => value !== undefined)
  } catch {
    return []
  }
}

async function waitForProcessesToExit(pids: number[]): Promise<void> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline && pids.some(isRunning)) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  for (const pid of pids) {
    if (!isRunning(pid)) continue
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // The process exited between the check and the kill.
    }
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
