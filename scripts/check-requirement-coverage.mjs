import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { productOwnText, scanProductSections } from './product-sections.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const EXEMPTIONS = new Map([
  ['1', 'Product overview; executable rules are specified in the detailed sections.'],
  ['1.1', 'Product priorities and conflict governance; their behavior is owned by the referenced requirements.'],
  ['1.2', 'Product Owner governance for exploratory sections, rather than application behavior.'],
  [
    '1.3',
    'Standing convention applied while checking every change; its behavior is owned by the requirements it governs.',
  ],
])

// AGENTS.md §9: native shell/shortcuts, persistence, attachments, clipboard, and drag-and-drop.
export const BOUNDARY_SECTIONS = new Set([
  '2.2',
  '2.3',
  '2.4',
  '2.5',
  '3',
  '9',
  '9.1',
  '9.2',
  '9.3',
  '11',
  '12',
  '13',
  '13.1',
  '13.2',
  '14',
  '15',
  '16',
  '16.1',
  '16.2',
  '17',
  '17.1',
  '18',
  '20.1',
  '20.2',
  '21',
  '23.9',
  '23.10',
  '23.12',
])

export function parseSections(content) {
  const sections = scanProductSections(content)
  return sections.map((section, index) => {
    const hasChildren = sections[index + 1]?.level > section.level
    const ownText = productOwnText(section.lines)
    return { id: section.id, title: section.title, required: !hasChildren || ownText.length > 0 }
  })
}

export function checkCoverage({ product, files, exemptions = EXEMPTIONS, boundarySections = BOUNDARY_SECTIONS }) {
  const sections = parseSections(product)
  const ids = new Set(sections.map((section) => section.id))
  const issues = []
  for (const section of scanProductSections(product)) {
    if (section.level !== section.id.split('.').length + 1) {
      issues.push(`PRODUCT.md §${section.id}: heading level does not match its number depth`)
    }
  }
  if (sections.length === 0) issues.push('PRODUCT.md: no numbered sections found')
  if (ids.size !== sections.length) issues.push('PRODUCT.md: duplicate numbered sections')
  for (const [id, reason] of exemptions) {
    if (!ids.has(id)) issues.push(`Exemption names missing PRODUCT.md §${id}`)
    if (typeof reason !== 'string' || reason.trim() === '') issues.push(`PRODUCT.md §${id}: exemption needs a reason`)
  }
  for (const id of boundarySections) {
    if (!ids.has(id)) issues.push(`Boundary list names missing PRODUCT.md §${id}`)
  }
  const marked = new Set()
  const e2eMarked = new Set()
  for (const { path, content } of files) {
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true)
    const comments = new Map()
    const visit = (node) => {
      for (const range of ts.getLeadingCommentRanges(content, node.pos) ?? []) {
        if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) comments.set(range.pos, range.end)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const [start, end] of comments) {
      const line = content.slice(start, end)
      if (!/^\/\/\s*@requirement\b/.test(line)) continue
      const lineStart = content.lastIndexOf('\n', start - 1) + 1
      const lineNumber = source.getLineAndCharacterOfPosition(start).line + 1
      const marker = /^\/\/\s*@requirement PRODUCT\.md §(\d+(?:\.\d+)*)\s*$/.exec(line)
      const standalone = /^\s*$/.test(content.slice(lineStart, start))
      if (!marker || !standalone) {
        issues.push(`${path}:${lineNumber}: malformed requirement marker`)
        continue
      }
      const id = marker[1]
      if (!ids.has(id)) issues.push(`${path}:${lineNumber}: unknown PRODUCT.md §${id}`)
      else if (!sections.find((section) => section.id === id).required) {
        issues.push(
          `${path}:${lineNumber}: PRODUCT.md §${id} has numbered subsections and no text of its own; cite a subsection`,
        )
      }
      marked.add(id)
      if (path.startsWith('e2e/')) e2eMarked.add(id)
    }
  }
  for (const { id, required } of sections) {
    if (!required || exemptions.has(id)) continue
    if (!marked.has(id)) issues.push(`PRODUCT.md §${id}: missing test marker`)
    if (boundarySections.has(id) && !e2eMarked.has(id)) issues.push(`PRODUCT.md §${id}: missing E2E marker`)
  }
  return { issues, requirementCount: sections.filter(({ id, required }) => required && !exemptions.has(id)).length }
}

export function runChecks({
  rootDirectory = ROOT,
  exemptions = EXEMPTIONS,
  boundarySections = BOUNDARY_SECTIONS,
} = {}) {
  const files = []
  const walk = (directory, kind) => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path, kind)
      else if (
        entry.isFile() &&
        (kind === 'src' ? /\.test\.[cm]?[jt]sx?$/.test(entry.name) : /\.ts$/.test(entry.name))
      ) {
        files.push({ path: relative(rootDirectory, path).split('\\').join('/'), content: readFileSync(path, 'utf8') })
      }
    }
  }
  for (const kind of ['src', 'e2e', 'perf']) walk(join(rootDirectory, kind), kind)
  return checkCoverage({
    product: readFileSync(join(rootDirectory, 'docs/PRODUCT.md'), 'utf8'),
    files,
    exemptions,
    boundarySections,
  })
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { issues, requirementCount } = runChecks()
  if (issues.length > 0) {
    console.error(`Requirement coverage checks failed (${issues.length} issues):`)
    for (const issue of issues) console.error(`  - ${issue}`)
    process.exitCode = 1
  } else console.log(`Requirement coverage checks passed (${requirementCount} numbered requirements).`)
}
