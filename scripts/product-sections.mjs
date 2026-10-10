// Shared Markdown scanning for PRODUCT requirement coverage and size checks.
export function stripProductComments(content) {
  return content.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment.replace(/[^\r\n]/g, ''))
}

export function productOwnText(lines) {
  return stripProductComments(lines.map(({ text }) => text).join('\n'))
    .replace(/^\s*---\s*$/gm, '')
    .trim()
}

export function scanProductSections(content) {
  const sections = []
  let current
  let fence
  const cleanLines = stripProductComments(content).split(/\r?\n/)
  const originalLines = content.split(/\r?\n/)
  for (const [index, line] of cleanLines.entries()) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      if (!fence) fence = { character: fenceMatch[1][0], length: fenceMatch[1].length }
      else if (fenceMatch[1][0] === fence.character && fenceMatch[1].length >= fence.length) fence = undefined
    }
    const heading = !fenceMatch && !fence && /^(#{2,4})\s+(\d+(?:\.\d+)*)\.?\s+(.+)$/.exec(line)
    if (heading) {
      current = { id: heading[2], title: heading[3], level: heading[1].length, startLine: index + 1, lines: [] }
      sections.push(current)
    } else if (current) current.lines.push({ number: index + 1, text: originalLines[index] })
  }
  return sections
}

export function scanProductBlocks(lines) {
  const blocks = []
  let current
  let fence
  const cleanLines = stripProductComments(lines.map(({ text }) => text).join('\n')).split('\n')
  const flush = () => {
    if (current) blocks.push(current)
    current = undefined
  }
  for (const [index, line] of cleanLines.entries()) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      flush()
      if (!fence) fence = { character: fenceMatch[1][0], length: fenceMatch[1].length }
      else if (fenceMatch[1][0] === fence.character && fenceMatch[1].length >= fence.length) fence = undefined
      continue
    }
    if (fence) continue
    const trimmed = line.trim()
    if (!trimmed || /^#{1,6}\s/.test(trimmed) || trimmed === '---') {
      flush()
      continue
    }
    const item = /^\s*(?:[*-]|\d+\.)\s+(.+)$/.exec(line)
    const table = trimmed.startsWith('|')
    if (item || table) {
      flush()
      current = {
        kind: item ? 'list item' : 'table row',
        startLine: lines[index].number,
        text: item ? item[1].trim() : trimmed,
      }
      if (table) flush()
    } else if (current && (current.kind === 'paragraph' || /^\s+/.test(line))) {
      current.text += ` ${trimmed}`
    } else {
      flush()
      current = { kind: 'paragraph', startLine: lines[index].number, text: trimmed }
    }
  }
  flush()
  return blocks
}
