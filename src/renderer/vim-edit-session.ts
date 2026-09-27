export interface VimTextDiff {
  insertedText: string
  insertOffset: number
  deleteCount: number
}

/** The minimal insert/delete diff between an Insert session's baseline and its final text. */
export function diffTypedText(baseline: string, finalText: string, position: number): VimTextDiff {
  let prefix = 0
  while (prefix < baseline.length && prefix < finalText.length && baseline[prefix] === finalText[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < baseline.length - prefix &&
    suffix < finalText.length - prefix &&
    baseline[baseline.length - 1 - suffix] === finalText[finalText.length - 1 - suffix]
  )
    suffix += 1
  return {
    insertedText: finalText.slice(prefix, finalText.length - suffix),
    insertOffset: prefix - position,
    deleteCount: baseline.length - prefix - suffix,
  }
}

export interface VimReplaceCommit {
  finalText: string
  replacedStart: number
  replacedEnd: number
  rawCursor: number
}

/** The text a pending Replace session commits, or undefined when nothing was typed. */
export function resolveReplaceCommit(session: {
  baseline: string
  position: number
  typed: string
}): VimReplaceCommit | undefined {
  if (session.typed === '') return undefined
  const replaced = Math.min(session.typed.length, session.baseline.length - session.position)
  const finalText =
    session.baseline.slice(0, session.position) + session.typed + session.baseline.slice(session.position + replaced)
  return {
    finalText,
    replacedStart: session.position,
    replacedEnd: session.position + replaced,
    rawCursor: session.position + session.typed.length,
  }
}
