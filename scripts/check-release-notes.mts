import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOT } from './check-attribution.mts'
import { validateReleaseNote } from './release-note.mts'

// Existing history remains valid; every later feat/fix/perf must carry a note.
const LEGACY_HEAD = '667781e4d66f3a1c4e2f7caa180740ce7afcdfde'

export function checkReleaseNoteRange(base: string, head: string, cwd = ROOT, legacyHead = LEGACY_HEAD) {
  if (![base, head, legacyHead].every((sha) => /^[a-f0-9]{40}$/.test(sha)))
    throw new Error('Release-note checks require full base and head SHAs')

  const output = execFileSync(
    'git',
    ['log', '--no-merges', '--reverse', '--format=%H%x00%B%x00', head, '--not', legacyHead, base],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const fields = output.split('\0')
  const violations: string[] = []
  for (let i = 0; i + 1 < fields.length; i += 2) {
    try {
      validateReleaseNote(fields[i + 1]!)
    } catch (error) {
      violations.push(`${fields[i]!.trim().slice(0, 7)}: ${(error as Error).message}`)
    }
  }
  return violations
}

function main() {
  try {
    if (process.argv[2] === '--message-file' && process.argv.length === 4) {
      const message = readFileSync(process.argv[3]!, 'utf8')
        .split(/\r?\n/)
        .filter((line) => !line.startsWith('#'))
        .join('\n')
      validateReleaseNote(message)
    } else if (process.argv.length === 2) {
      const base = process.env.BASE_SHA
      const head = process.env.HEAD_SHA
      if (!base || !head) throw new Error('BASE_SHA and HEAD_SHA are required')
      const violations = checkReleaseNoteRange(/^0+$/.test(base) ? LEGACY_HEAD : base, head)
      if (violations.length) throw new Error(violations.join('\n'))
    } else throw new Error('Usage: check-release-notes.mts [--message-file <path>]')

    console.log('Release-note policy passed.')
  } catch (error) {
    console.error(`Release-note policy failed: ${(error as Error).message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
