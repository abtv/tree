/** Scan the simple inline-link syntax used by documentation checks in one forward pass. */
export function* markdownLinks(content: string, plansOnly = false): Generator<{ label: string; target: string }> {
  let cursor = 0
  let targetEnd = -1
  let anchor = -1
  while (cursor < content.length) {
    const opening = content.indexOf('[', cursor)
    if (opening < 0) return
    const closing = content.indexOf(']', opening + 1)
    if (closing < 0) return
    cursor = closing + 1
    if (content[cursor] !== '(') continue
    if (targetEnd < cursor + 1) targetEnd = content.indexOf(')', cursor + 1)
    if (targetEnd < 0) return
    if (targetEnd === cursor + 1) continue
    if (plansOnly) {
      if (closing === opening + 1) continue
      if (anchor < cursor + 1) {
        const nextAnchor = content.indexOf('#', cursor + 1)
        anchor = nextAnchor < 0 ? content.length : nextAnchor
      }
      const pathEnd = Math.min(anchor, targetEnd)
      if (pathEnd - cursor - 1 <= 3 || content.slice(pathEnd - 3, pathEnd) !== '.md') continue
    }
    const label = content.slice(opening + 1, closing)
    const target = content.slice(cursor + 1, targetEnd)
    yield { label, target }
    cursor = targetEnd + 1
  }
}
