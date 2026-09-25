import { isHttpUrl, type LinkRange } from '../domain/document'
import type { ClipboardPayload } from '../shared/ipc'

interface NodeContent {
  text: string
  links: LinkRange[]
}

export function nodeContent(node: { text: string; links?: readonly LinkRange[] }): NodeContent {
  return { text: node.text, links: (node.links ?? []).map((link) => ({ ...link })) }
}

export function sameNodeContent(node: { text: string; links?: readonly LinkRange[] }, expected: NodeContent): boolean {
  if (node.text !== expected.text) return false
  const links = node.links ?? []
  return (
    links.length === expected.links.length &&
    links.every((link, index) => {
      const other = expected.links[index]
      return other !== undefined && link.start === other.start && link.end === other.end && link.url === other.url
    })
  )
}

export function clipboardIntroducesLink(clipboard: Extract<ClipboardPayload, { kind: 'text' }>): boolean {
  if (clipboard.links !== undefined && clipboard.links.length > 0) return true
  return clipboard.text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .some((line) => isHttpUrl(line))
}
