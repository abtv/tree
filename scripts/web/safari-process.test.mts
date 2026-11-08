import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { chmod, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readSafariProcesses, stopOwnedSafari } from './safari-startup.mts'

it.skipIf(process.platform !== 'darwin')(
  'finds and terminates an owned real process before allowing recovery',
  async () => {
    // Exercise macOS ps and real signals without launching or closing a personal Safari instance.
    // The copied executable has Safari's path shape but only idles, using a suite-owned temporary directory.
    const directory = await mkdtemp(join(tmpdir(), 'tree-safari-process-'))
    const executableDirectory = join(directory, 'Safari.app', 'Contents', 'MacOS')
    const executable = join(executableDirectory, 'Safari')
    let child: ChildProcess | undefined

    try {
      await mkdir(executableDirectory, { recursive: true })
      // Use the user-installed Node executable: relocated Apple system executables may fail launch constraints.
      await copyFile(process.execPath, executable)
      await chmod(executable, 0o700)
      child = spawn(executable, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
      const exited = once(child, 'exit')
      await once(child, 'spawn')
      const pid = child.pid!
      const owned = async () => (await readSafariProcesses()).filter((entry) => entry.pid === pid)

      const before = await owned()

      expect(before).toEqual([{ pid, identity: expect.stringContaining(executable), browser: true }])

      await stopOwnedSafari(owned)
      const [, signal] = await exited

      expect(signal).toBe('SIGTERM')
      expect(await owned()).toEqual([])
    } finally {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit', { signal: AbortSignal.timeout(2000) })
        child.kill('SIGKILL')
        await exited
      }
      await rm(directory, { recursive: true, force: true })
    }
  },
)
