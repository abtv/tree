export type ReleaseNote = { text: string } | { reason: string }

/** One explicit, single-line note; undefined preserves legacy subject-based notes. */
export function parseReleaseNote(body: string): ReleaseNote | undefined {
  const lines = body.split(/\r?\n/).filter((line) => /^Release-Note:/i.test(line))
  if (lines.length === 0) return undefined
  if (lines.length !== 1) throw new Error('Use exactly one Release-Note field')

  const value = lines[0]!.slice('Release-Note:'.length).trim()
  if (!value) throw new Error('Release-Note must contain user-facing text or none: <reason>')
  if (/^none\b/i.test(value)) {
    const reason = /^none:\s*(\S.*)$/i.exec(value)?.[1]
    if (!reason) throw new Error('Release-Note: none requires a reason: none: <reason>')
    return { reason }
  }
  return { text: value }
}

export function validateReleaseNote(message: string): void {
  const [subject = '', ...lines] = message.split(/\r?\n/)
  const body = lines.join('\n')
  const note = parseReleaseNote(body)
  if (/^(feat|fix|perf)(?:\([^)]+\))?!?:/.test(subject) && note === undefined)
    throw new Error('feat, fix and perf commits require Release-Note: <text> or Release-Note: none: <reason>')
  if (note && 'reason' in note && (/^\w+(?:\([^)]+\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(body)))
    throw new Error('Breaking changes cannot use Release-Note: none')
}
