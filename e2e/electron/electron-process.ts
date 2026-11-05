import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'

const execFileAsync = promisify(execFile)

export function isOwnedElectronCommand(command: string, marker: string, executable: string): boolean {
  if (!/^tree-e2e-(?:p\d+-)?$/.test(marker)) return false
  const executables = [executable]
  const mainSuffix = '/Contents/MacOS/Electron'
  if (executable.endsWith(mainSuffix)) {
    const bundle = executable.slice(0, -mainSuffix.length)
    for (const suffix of ['', ' (Renderer)', ' (GPU)', ' (Plugin)']) {
      executables.push(
        `${bundle}/Contents/Frameworks/Electron Helper${suffix}.app/Contents/MacOS/Electron Helper${suffix}`,
      )
    }
  }
  if (!executables.some((path) => command.startsWith(`${path} `))) return false
  const directory = command.match(/(?:^|\s)--user-data-dir=(\S+)(?:\s|$)/)?.[1]
  return directory !== undefined && basename(directory).startsWith(marker)
}

export async function cleanupStaleElectronProcesses(marker: string): Promise<void> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return

  const processes = await listProcesses()
  const executable = createRequire(join(process.cwd(), 'package.json'))('electron') as string
  const currentPid = process.pid
  const stalePids = processes
    .filter(({ pid, command }) => pid !== currentPid && isOwnedElectronCommand(command, marker, executable))
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
