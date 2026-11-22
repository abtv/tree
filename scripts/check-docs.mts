import type { ProductLine } from './product-sections.mts'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { productOwnText, scanProductBlocks, scanProductSections, stripProductComments } from './product-sections.mts'
import { markdownLinks } from './markdown-links.mts'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const PRODUCT_LIMITS = { block: 700, section: 8000 }

// An architecture paragraph describes one mechanism, not one rule, so only the section limit applies.
export const ARCHITECTURE_LIMITS = { block: Number.POSITIVE_INFINITY, section: PRODUCT_LIMITS.section }

export const PRODUCT_INDEX = 'docs/PRODUCT.md'
export const PRODUCT_DIRECTORY = 'docs/product'

// The documents stored as an index plus per-area files with stable section numbers.
export const SPECIFICATIONS = {
  product: { index: PRODUCT_INDEX, directory: PRODUCT_DIRECTORY },
  architecture: { index: 'docs/ARCHITECTURE.md', directory: 'docs/architecture' },
} as const
export type SpecificationName = keyof typeof SPECIFICATIONS
type Specification = (typeof SPECIFICATIONS)[SpecificationName]

const isProductFile = (displayPath: string) => displayPath.startsWith(`${PRODUCT_DIRECTORY}/`)
const isArchitectureFile = (displayPath: string) => displayPath.startsWith(`${SPECIFICATIONS.architecture.directory}/`)

// A specification file may hold only its title before the first numbered heading, so that every
// requirement sits inside a numbered section.
export function findTextBeforeFirstSection({ content, displayPath }: { content: string; displayPath: string }) {
  const issues: string[] = []
  const first = scanProductSections(content)[0]
  const lines = stripProductComments(content).split(/\r?\n/u)
  let titles = 0
  for (const [index, line] of lines.slice(0, first ? first.startLine - 1 : lines.length).entries()) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed === '---') continue
    if (titles === 0 && /^#\s+\S/u.test(trimmed)) {
      titles += 1
      continue
    }
    issues.push(
      `${displayPath}:${index + 1}: text before the first numbered heading; every requirement belongs to a numbered section`,
    )
  }
  if (titles === 0) issues.push(`${displayPath}: missing the level-one title before the first numbered heading`)
  return issues
}

const SECTION_NUMBER = /\d+(?:\.\d+)*/gu

// The index maps every section number to the file that holds its heading. Retired numbers stay listed
// in a second table and never reappear as headings. The index lists numbers and no titles.
export function validateSpecificationIndex({
  index,
  files,
  specification = SPECIFICATIONS.product,
}: {
  index: string
  files: { path: string; content: string }[]
  specification?: Specification
}) {
  const displayPath = specification.index
  const parent = dirname(specification.directory)
  const fileLink = new RegExp(
    String.raw`\]\((${specification.directory.slice(parent.length + 1)}\/[A-Za-z0-9_.-]+\.md)\)`,
    'u',
  )
  const issues: string[] = []
  const listed = new Map<string, string>()
  const retired = new Set<string>()
  const indexedFiles = new Set<string>()
  let inRetired = false
  let fence = false
  for (const line of stripProductComments(index).split(/\r?\n/u)) {
    if (/^\s*(?:`{3,}|~{3,})/u.test(line)) fence = !fence
    if (fence) continue
    if (/^#{1,6}\s/u.test(line)) inRetired = /^#{1,6}\s+Retired\b/iu.test(line)
    if (!line.trim().startsWith('|')) continue
    const cells = line.trim().split('|').slice(1, -1)
    const numbers = [...(cells[0] ?? '').matchAll(SECTION_NUMBER)].map((match) => match[0])
    if (inRetired) {
      for (const number of numbers) retired.add(number)
      continue
    }
    const target = fileLink.exec(cells[1] ?? '')?.[1]
    if (target === undefined) continue
    const path = `${parent}/${target}`
    indexedFiles.add(path)
    for (const number of numbers) {
      if (listed.has(number)) issues.push(`${displayPath}: the index lists §${number} more than once`)
      else listed.set(number, path)
    }
  }
  const owners = new Map<string, string[]>()
  for (const { path, content } of files) {
    for (const { id } of scanProductSections(content)) owners.set(id, [...(owners.get(id) ?? []), path])
  }
  const filePaths = new Set(files.map(({ path }) => path))
  for (const path of indexedFiles) {
    if (!filePaths.has(path)) issues.push(`${displayPath}: the index names ${path}, which does not exist`)
  }
  for (const path of filePaths) {
    if (!indexedFiles.has(path)) issues.push(`${displayPath}: the index does not list ${path}`)
  }
  for (const [number, paths] of owners) {
    if (paths.length > 1) issues.push(`${displayPath}: §${number} has a heading in more than one file`)
    if (retired.has(number))
      issues.push(`${displayPath}: §${number} is retired but a heading in ${paths[0]} defines it`)
    const mapped = listed.get(number)
    if (mapped === undefined) {
      if (!retired.has(number)) issues.push(`${displayPath}: the index does not list §${number} (${paths[0]})`)
    } else if (!paths.includes(mapped)) {
      issues.push(`${displayPath}: the index maps §${number} to ${mapped}, but its heading is in ${paths[0]}`)
    }
  }
  for (const number of listed.keys()) {
    if (!owners.has(number)) issues.push(`${displayPath}: the index lists §${number}, which no file defines`)
    if (retired.has(number)) issues.push(`${displayPath}: §${number} is both listed and retired`)
  }
  return issues
}

export function findOversizedProductText({
  content,
  limits = PRODUCT_LIMITS,
  displayPath = 'docs/PRODUCT.md',
}: {
  content: string
  limits?: typeof PRODUCT_LIMITS
  displayPath?: string
}) {
  const issues: string[] = []
  for (const section of scanProductSections(content)) {
    for (const block of scanProductBlocks(section.lines)) {
      if (block.text.length <= limits.block) continue
      issues.push(
        `${displayPath}:${block.startLine} (§${section.id}): ${block.kind} has ${block.text.length} characters; the limit is ${limits.block}. Split it into one rule per list item without rewording (docs/DEVELOPMENT.md §12).`,
      )
    }
    const size = productOwnText(section.lines).length
    if (size <= limits.section) continue
    issues.push(
      `${displayPath} §${section.id}: ${size} characters of own text; the limit is ${limits.section}. Split it into numbered subsections (docs/DEVELOPMENT.md §12).`,
    )
  }
  return issues
}

// The directories whose files the architecture may name as owners.
export const SOURCE_DIRECTORIES = ['src', 'scripts', 'perf', 'e2e', 'config'] as const

const SOURCE_FILE_NAME = /^(?:[\w@.-]+\/)*[\w@.-]+\.(?:ts|tsx|mts|css)$/u

// The architecture names its owners by source file, as a file name or as a path that ends a repository
// path. A name that matches no source file describes a module that was renamed or removed.
export function findMissingSourceFiles({
  content,
  displayPath,
  sourcePaths,
}: {
  content: string
  displayPath: string
  sourcePaths: readonly string[]
}) {
  const issues: string[] = []
  const reported = new Set<string>()
  let fence = false
  for (const [index, line] of stripProductComments(content).split(/\r?\n/u).entries()) {
    if (/^\s*(?:`{3,}|~{3,})/u.test(line)) {
      fence = !fence
      continue
    }
    if (fence) continue

    for (const match of line.matchAll(/`([^`]+)`/gu)) {
      const name = match[1]!
      if (!SOURCE_FILE_NAME.test(name) || reported.has(name)) continue
      if (sourcePaths.some((path) => path === name || path.endsWith(`/${name}`))) continue

      reported.add(name)
      issues.push(
        `${displayPath}:${index + 1}: names the source file \`${name}\`, which does not exist under ${SOURCE_DIRECTORIES.join(', ')}. Correct the name or remove the statement (docs/DEVELOPMENT.md §12).`,
      )
    }
  }
  return issues
}

const ADR_FILE_PATTERN = /^(\d{4})-[a-z0-9-]+\.md$/

export const PRODUCT_QUANTITY_PATTERNS = [
  { pattern: /\blevel 20\b/i, description: 'the node-depth value' },
  { pattern: /\b20 levels\b/i, description: 'the node-depth value' },
  { pattern: /\b200 entries\b/i, description: 'the undo-history bound' },
  { pattern: /\b200-entry\b/i, description: 'the undo-history bound' },
  { pattern: /\bten words\b/i, description: 'the autosave word trigger' },
  { pattern: /\bten seconds\b/i, description: 'the autosave idle trigger' },
  { pattern: /\bten-second\b/i, description: 'the autosave idle trigger' },
  { pattern: /200\s*[×x]\s*200/i, description: 'the inline image bound' },
]

const WORKFLOW_POLICY_MARKER = '<!-- workflow-policy-owner -->'
const VALIDATION_MECHANICS_MARKER = '<!-- validation-mechanics-owner -->'
const WORKFLOW_POLICY_REFERENCE = '<!-- workflow-policy-reference: AGENTS.md -->'
const VALIDATION_MECHANICS_REFERENCE = '<!-- validation-mechanics-reference: docs/DEVELOPMENT.md -->'
const OPEN_QUESTIONS_DECLARATION = '> This document is non-normative.'
export const AGENT_CORE_MAX_BYTES = 24 * 1024
// The binding agent rules share one budget, so that growth cannot move from a capped file to an
// uncapped one. A new rule replaces or shortens existing text; raising the budget is an owner decision.
export const AGENT_RULE_DOCUMENTS = ['AGENTS.md', 'docs/AGENT_WORKFLOW.md', 'docs/AGENT_ROLES.md'] as const
export const AGENT_RULES_MAX_BYTES = 104_935
const WORKFLOW_PROCEDURES = 'docs/AGENT_WORKFLOW.md'
const REQUIRED_WORKFLOW_ROUTES = [
  '1. Project Role',
  '4. General Working Rules',
  '5. Product Changes',
  '8. Plans and Architecture Decisions',
  '9. Tests',
  '10. Validation',
  '11. Documentation',
  '12. Git',
  '13. Completion Criteria',
  '14. When to Ask the Product Owner',
]

export function validateAgentCore({
  agentContent,
  procedureContent,
}: {
  agentContent: string
  procedureContent?: string | undefined
}) {
  const issues: string[] = []
  const bytes = Buffer.byteLength(agentContent, 'utf8')
  if (bytes > AGENT_CORE_MAX_BYTES) {
    issues.push(`AGENTS.md: ${bytes} UTF-8 bytes exceeds the ${AGENT_CORE_MAX_BYTES}-byte core limit`)
  }
  if (procedureContent === undefined) {
    issues.push(`${WORKFLOW_PROCEDURES}: binding workflow procedures are missing`)
    return issues
  }
  for (const title of REQUIRED_WORKFLOW_ROUTES) {
    const anchor = title.toLowerCase().replaceAll('.', '').replaceAll(' ', '-')
    if (!agentContent.includes(`](${WORKFLOW_PROCEDURES}#${anchor})`)) {
      issues.push(`AGENTS.md: missing required procedure route to ${WORKFLOW_PROCEDURES}#${anchor}`)
    }
    if (!procedureContent.split(/\r?\n/u).includes(`## ${title}`)) {
      issues.push(`${WORKFLOW_PROCEDURES}: missing routed heading ${title}`)
    }
  }
  return issues
}

export function validateAgentRuleBudget({
  sizes,
  limit = AGENT_RULES_MAX_BYTES,
}: {
  sizes: Readonly<Record<string, number>>
  limit?: number
}) {
  const total = Object.values(sizes).reduce((sum, size) => sum + size, 0)
  if (total <= limit) return []
  const parts = Object.entries(sizes)
    .map(([path, size]) => `${path} ${size}`)
    .join(', ')
  return [
    `agent rules: ${total} UTF-8 bytes (${parts}) exceed the ${limit}-byte budget; replace or shorten existing rules instead of adding text`,
  ]
}

export function validateAdr({
  fileName,
  content,
  adrNumbers,
}: {
  fileName: string
  content: string
  adrNumbers: Set<number>
}) {
  const issues: string[] = []
  const match = ADR_FILE_PATTERN.exec(fileName)
  if (!match) {
    return { issues: [`${fileName}: ADR filename must match NNNN-short-description.md`], number: undefined }
  }
  const number = Number(match[1])
  const status = content.match(/^Status:\s*(.+)$/m)?.[1]?.trim()
  if (!status) {
    issues.push(`${fileName}: missing Status metadata`)
  } else if (status !== 'Accepted') {
    const superseded = /^Superseded by ADR (\d{4})$/.exec(status)
    if (!superseded) {
      issues.push(`${fileName}: Status must be "Accepted" or "Superseded by ADR NNNN"`)
    } else if (!adrNumbers.has(Number(superseded[1]))) {
      issues.push(`${fileName}: superseded by missing ADR ${superseded[1]}`)
    }
  }
  return { issues, number }
}

export function validateAdrIndex({ content, adrNumbers }: { content: string; adrNumbers: Set<number> }) {
  const issues: string[] = []
  for (const number of [...adrNumbers].sort((left, right) => left - right)) {
    const padded = String(number).padStart(4, '0')
    if (!content.includes(`](${padded}-`)) {
      issues.push(`docs/decisions/README.md: missing an index entry for ADR ${padded}`)
    }
  }
  return issues
}

export function findBrokenLinks({
  content,
  filePath,
  displayPath = filePath,
  exists = existsSync,
}: {
  content: string
  filePath: string
  displayPath?: string
  exists?: (path: string) => boolean
}) {
  const issues: string[] = []
  const baseDirectory = dirname(filePath)
  for (const link of markdownLinks(content)) {
    const target = link.target.trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    const withoutAnchor = target.split('#')[0]!
    if (withoutAnchor === '') continue
    if (!exists(resolve(baseDirectory, withoutAnchor))) {
      issues.push(`${displayPath}: link target not found: ${target}`)
    }
  }
  return issues
}

export function findBrokenReferences({
  content,
  displayPath,
  adrNumbers,
}: {
  content: string
  displayPath: string
  adrNumbers: Set<number>
}) {
  const issues: string[] = []
  const requireAdr = (label: string, number: number) => {
    if (!adrNumbers.has(number)) {
      issues.push(`${displayPath}: ${label} references missing ADR ${String(number).padStart(4, '0')}`)
    }
  }
  for (const match of content.matchAll(/docs\/decisions\/(\d{4})-[a-z0-9-]+\.md/g)) {
    requireAdr('path', Number(match[1]))
  }
  for (const match of content.matchAll(/\bADR\s+(\d{4})\b/g)) {
    requireAdr('prose', Number(match[1]))
  }
  return issues
}

// Commands and fenced examples describe reproducible operations, not retained evidence.
export function findScratchDependencies({
  content,
  displayPath,
  allowTemporary = false,
}: {
  content: string
  displayPath: string
  allowTemporary?: boolean
}) {
  if (allowTemporary) return []
  const issues: string[] = []
  let fence: string | undefined
  const lines = content.split(/\r?\n/u)
  for (const [index, line] of lines.entries()) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (delimiter !== undefined && delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = undefined
      continue
    }
    if (delimiter) {
      fence = delimiter
      continue
    }
    const prose = line
      .replace(/(`+)(.*?)\1/g, (span: string, _delimiter: string, code: string) =>
        /^(?:node|npm|npx|git|bash|sh|zsh|python3?|curl)\s/u.test(code.trim()) ? '' : span,
      )
      .replace(/\bhttps?:\/\/[^\s<>`]+/giu, '')
      .replace(/%([\da-f]{2})/giu, (_encoded: string, byte: string) => String.fromCharCode(Number.parseInt(byte, 16)))
    for (const match of prose.matchAll(/\.scratch\/[^\s`<>"')\]]+/giu)) {
      const path = match[0].split(/[?#]/u)[0]!.replace(/[.,;:!]+$/u, '')
      const leaf = path.split('/').at(-1)
      if (!leaf || (!leaf.includes('.') && path.split('/').length < 3) || /[${}*]/u.test(path)) continue
      issues.push(
        `${displayPath}:${index + 1}: permanent document depends on temporary scratch file ${path}; record the conclusion here or retain reusable tooling in Git (AGENTS.md §11)`,
      )
    }
  }
  return issues
}

export function findProductQuantityRestatements({ content, displayPath }: { content: string; displayPath: string }) {
  const issues: string[] = []
  for (const { pattern, description } of PRODUCT_QUANTITY_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      issues.push(`${displayPath}: restates ${description} ("${match[0]}"); the owner is docs/PRODUCT.md`)
    }
  }
  return issues
}

const CONFORMANCE_DOCUMENT = 'docs/VIM_CONFORMANCE.md'
const CONFORMANCE_CITED_PATH = /^(?:src|e2e)\/[A-Za-z0-9_./-]+\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/
const CONFORMANCE_PLACEHOLDER = /\$[A-Za-z_]\w*|%[a-zA-Z]/g
const TEST_KEYWORD = /(?<![\w$.])(describe|it|test)\b/g

function normalizeConformanceText(value: string) {
  return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
}

function tokenizeConformancePattern(value: string) {
  const units: (string | null)[] = []
  let lastIndex = 0
  CONFORMANCE_PLACEHOLDER.lastIndex = 0
  let match
  const pushLiteral = (text: string) => {
    for (const char of text) units.push(char)
  }
  while ((match = CONFORMANCE_PLACEHOLDER.exec(value)) !== null) {
    pushLiteral(value.slice(lastIndex, match.index))
    units.push(null)
    lastIndex = match.index + match[0].length
  }
  pushLiteral(value.slice(lastIndex))
  return units
}

function matchConformanceUnits(
  nameUnits: (string | null)[],
  titleUnits: (string | null)[],
  nameIndex = 0,
  titleIndex = 0,
): boolean {
  if (nameIndex === nameUnits.length) return true
  if (titleIndex === titleUnits.length) return false
  const nameUnit = nameUnits[nameIndex]
  const titleUnit = titleUnits[titleIndex]
  if (nameUnit !== null && titleUnit !== null) {
    return nameUnit === titleUnit && matchConformanceUnits(nameUnits, titleUnits, nameIndex + 1, titleIndex + 1)
  }
  if (nameUnit === null) {
    for (let take = 1; titleIndex + take <= titleUnits.length; take += 1) {
      if (matchConformanceUnits(nameUnits, titleUnits, nameIndex + 1, titleIndex + take)) return true
    }
    if (titleUnit !== null) return false
  }
  if (titleUnit === null) {
    for (let take = 1; nameIndex + take <= nameUnits.length; take += 1) {
      if (matchConformanceUnits(nameUnits, titleUnits, nameIndex + take, titleIndex + 1)) return true
    }
  }
  return false
}

export function conformanceCitationMatches(name: string, title: string) {
  return matchConformanceUnits(
    tokenizeConformancePattern(normalizeConformanceText(name)),
    tokenizeConformancePattern(normalizeConformanceText(title)),
  )
}

export function parseConformanceCitations(content: string) {
  const citedPaths: string[] = []
  const citations = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    for (const cell of trimmed.split('|')) {
      let currentPath
      for (const match of cell.matchAll(/`([^`]+)`|“([^”]+)”/g)) {
        if (match[1] !== undefined) {
          if (CONFORMANCE_CITED_PATH.test(match[1])) {
            currentPath = match[1]
            if (!citedPaths.includes(currentPath)) citedPaths.push(currentPath)
          }
        } else if (currentPath !== undefined) {
          citations.push({ path: currentPath, name: match[2]! })
        }
      }
    }
  }
  return { citedPaths, citations }
}

function skipTrivia(source: string, index: number): number {
  let current = index
  for (;;) {
    const char = source[current]
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      current += 1
      continue
    }
    if (char === '/' && (source[current + 1] === '/' || source[current + 1] === '*')) {
      current = skipComment(source, current)
      continue
    }
    return current
  }
}

function skipComment(source: string, index: number): number {
  if (source[index + 1] === '/') {
    const end = source.indexOf('\n', index)
    return end === -1 ? source.length : end + 1
  }
  const end = source.indexOf('*/', index + 2)
  return end === -1 ? source.length : end + 2
}

function skipQuoted(source: string, quoteIndex: number): number {
  const quote = source[quoteIndex]
  let index = quoteIndex + 1
  while (index < source.length) {
    const char = source[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === quote) return index + 1
    index += 1
  }
  return index
}

function skipTemplateLiteral(source: string, backtickIndex: number): number {
  let index = backtickIndex + 1
  while (index < source.length) {
    const char = source[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '`') return index + 1
    if (char === '$' && source[index + 1] === '{') {
      index = skipBalanced(source, index + 1)
      continue
    }
    index += 1
  }
  return index
}

const CLOSING_BRACKETS = { '(': ')', '[': ']', '{': '}' }

function skipBalanced(source: string, openIndex: number): number {
  const stack = []
  let index = openIndex
  while (index < source.length) {
    const char = source[index]
    if (char === '"' || char === "'") {
      index = skipQuoted(source, index)
      continue
    }
    if (char === '`') {
      index = skipTemplateLiteral(source, index)
      continue
    }
    if (char === '/' && (source[index + 1] === '/' || source[index + 1] === '*')) {
      index = skipComment(source, index)
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      stack.push(CLOSING_BRACKETS[char])
      index += 1
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      stack.pop()
      index += 1
      if (stack.length === 0) return index
      continue
    }
    index += 1
  }
  return index
}

function readStringLiteral(source: string, index: number) {
  const quote = source[index]
  if (quote === '`') {
    return source.slice(index + 1, skipTemplateLiteral(source, index) - 1)
  }
  if (quote !== "'" && quote !== '"') return undefined
  const end = skipQuoted(source, index)
  return source.slice(index + 1, end - 1).replace(/\\(['"\\])/g, '$1')
}

export function extractTestTitles(source: string) {
  const titles = []
  TEST_KEYWORD.lastIndex = 0
  let match
  while ((match = TEST_KEYWORD.exec(source)) !== null) {
    let index = match.index + match[1]!.length
    for (;;) {
      const dotIndex = skipTrivia(source, index)
      if (source[dotIndex] !== '.') break
      const identifier = /^[A-Za-z_$][\w$]*/.exec(source.slice(dotIndex + 1))
      if (identifier === null) break
      index = dotIndex + 1 + identifier[0].length
      const afterIdentifier = skipTrivia(source, index)
      if (identifier[0] === 'each' && source[afterIdentifier] === '(') {
        index = skipBalanced(source, afterIdentifier)
      } else if (identifier[0] === 'each' && source[afterIdentifier] === '`') {
        index = skipTemplateLiteral(source, afterIdentifier)
      }
    }
    const call = skipTrivia(source, index)
    if (source[call] !== '(') continue
    const title = readStringLiteral(source, skipTrivia(source, call + 1))
    if (title !== undefined) titles.push(title)
  }
  return titles
}

export function findStaleConformanceCitations({
  content,
  rootDirectory,
  displayPath = CONFORMANCE_DOCUMENT,
  readFile = (filePath: string) => readFileSync(filePath, 'utf8'),
  exists = existsSync,
}: {
  content: string
  rootDirectory: string
  displayPath?: string
  readFile?: (path: string) => string
  exists?: (path: string) => boolean
}) {
  const { citedPaths, citations } = parseConformanceCitations(content)
  const issues: string[] = []
  const titlesByPath = new Map<string, string[]>()
  for (const citedPath of citedPaths) {
    const filePath = join(rootDirectory, citedPath)
    if (!exists(filePath)) {
      issues.push(`${displayPath}: cited path not found: ${citedPath}`)
      continue
    }
    titlesByPath.set(citedPath, extractTestTitles(readFile(filePath)))
  }
  for (const citation of citations) {
    const titles = titlesByPath.get(citation.path)
    if (titles === undefined) continue
    if (!titles.some((title) => conformanceCitationMatches(citation.name, title))) {
      issues.push(`${displayPath}: no test titled "${citation.name}" in ${citation.path}`)
    }
  }
  return issues
}

export function validateWorkflowOwnership({
  agentContent,
  developmentContent,
}: {
  agentContent: string
  developmentContent: string
}) {
  const issues: string[] = []
  const count = (content: string, marker: string) => content.split(marker).length - 1
  if (count(agentContent, WORKFLOW_POLICY_MARKER) !== 1) {
    issues.push('AGENTS.md: must contain exactly one workflow policy owner marker')
  }
  if (count(developmentContent, VALIDATION_MECHANICS_MARKER) !== 1) {
    issues.push('docs/DEVELOPMENT.md: must contain exactly one validation mechanics owner marker')
  }
  if (count(developmentContent, WORKFLOW_POLICY_REFERENCE) !== 1) {
    issues.push('docs/DEVELOPMENT.md: must contain exactly one reference to the workflow policy owner')
  }
  if (count(agentContent, VALIDATION_MECHANICS_REFERENCE) !== 1) {
    issues.push('AGENTS.md: must contain exactly one reference to the validation mechanics owner')
  }
  if (developmentContent.includes(WORKFLOW_POLICY_MARKER)) {
    issues.push('docs/DEVELOPMENT.md: workflow policy is owned by AGENTS.md')
  }
  if (agentContent.includes(VALIDATION_MECHANICS_MARKER)) {
    issues.push('AGENTS.md: validation mechanics are owned by docs/DEVELOPMENT.md')
  }
  return issues
}

export function validateOpenQuestions({
  content,
  displayPath = 'docs/OPEN_QUESTIONS.md',
}: {
  content: string
  displayPath?: string
}) {
  if (content.includes(OPEN_QUESTIONS_DECLARATION)) return []
  return [`${displayPath}: missing the non-normative open-questions declaration`]
}

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'out',
  'coverage',
  'test-results',
  'playwright-report',
  'blob-report',
  '.scratch',
  '.tmp',
  '.stryker-tmp',
  'reports',
])

function collectMarkdownPaths(rootDirectory: string) {
  if (existsSync(join(rootDirectory, '.git'))) {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'], {
      cwd: rootDirectory,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
      .split('\0')
      .filter((path) => path && existsSync(join(rootDirectory, path)))
      .sort()
  }
  // Also support source copies and the filesystem fixtures used by this checker.
  const paths: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name))
      else if (entry.isFile() && entry.name.endsWith('.md'))
        paths.push(relative(rootDirectory, join(directory, entry.name)))
    }
  }
  walk(rootDirectory)
  return paths.sort()
}

const CLOSED_PLAN_STATUS = /^(?:completed?|closed|done|retired)\b/iu

function unfinishedPlanPaths(rootDirectory: string) {
  const indexPath = join(rootDirectory, 'plans', 'README.md')
  const paths = new Set<string>()
  if (!existsSync(indexPath)) return paths
  for (const line of readFileSync(indexPath, 'utf8').split(/\r?\n/u)) {
    const status = line.trim().startsWith('|') ? line.split('|')[2]?.trim() : undefined
    if (CLOSED_PLAN_STATUS.test(status ?? '')) continue
    for (const link of markdownLinks(line, true)) {
      const target = link.target.split('#', 1)[0]!
      const path = relative(rootDirectory, resolve(rootDirectory, 'plans', target))
      if (!/^plans\/[^/]+\.md$/u.test(path) || path === 'plans/README.md') continue
      const filePath = join(rootDirectory, path)
      if (!existsSync(filePath)) continue
      const planStatus = readFileSync(filePath, 'utf8').match(/^Status:\s*(.+)$/imu)?.[1] ?? ''
      if (!CLOSED_PLAN_STATUS.test(planStatus)) paths.add(path)
    }
  }
  return paths
}

// Repository-relative paths of the files of a specification, sorted by name.
function listSpecificationFiles(rootDirectory: string, specification: Specification = SPECIFICATIONS.product) {
  const directory = join(rootDirectory, specification.directory)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${specification.directory}/${entry.name}`)
    .sort()
}

// Repository-relative paths of every file under the source directories.
function listSourcePaths(rootDirectory: string) {
  const paths: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(join(rootDirectory, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path)
      } else if (entry.isFile()) {
        paths.push(path)
      }
    }
  }
  for (const directory of SOURCE_DIRECTORIES) {
    if (existsSync(join(rootDirectory, directory))) walk(directory)
  }
  return paths
}

function collectLiveDocuments(rootDirectory: string) {
  const documents = new Set<string>()
  const addIfPresent = (filePath: string) => {
    if (existsSync(filePath)) documents.add(filePath)
  }
  for (const name of ['README.md', 'AGENTS.md', 'SECURITY.md']) addIfPresent(join(rootDirectory, name))
  for (const name of [
    'PRODUCT.md',
    'OPEN_QUESTIONS.md',
    'ARCHITECTURE.md',
    'GLOSSARY.md',
    'DEVELOPMENT.md',
    'DEVELOPMENT_REFERENCE.md',
    'SECURITY.md',
    'VIM_CONFORMANCE.md',
    'AGENT_WORKFLOW.md',
    'AGENT_ROLES.md',
    'WORKING_WITH_AGENT.md',
    'SECURITY_AUDIT.md',
    'releasing.md',
  ]) {
    addIfPresent(join(rootDirectory, 'docs', name))
  }
  for (const specification of Object.values(SPECIFICATIONS)) {
    for (const path of listSpecificationFiles(rootDirectory, specification)) documents.add(join(rootDirectory, path))
  }
  const decisions = join(rootDirectory, 'docs', 'decisions')
  if (existsSync(decisions)) {
    for (const entry of readdirSync(decisions, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) documents.add(join(decisions, entry.name))
    }
  }
  const plans = join(rootDirectory, 'plans')
  if (existsSync(plans)) {
    for (const entry of readdirSync(plans, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) documents.add(join(plans, entry.name))
    }
  }
  // Nested instructions, every README, and the shared agent skills are live documents too.
  const skills = join(rootDirectory, '.agents')
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue
        walk(join(directory, entry.name))
      } else if (
        entry.name === 'AGENTS.md' ||
        entry.name === 'README.md' ||
        (entry.isFile() && entry.name.endsWith('.md') && directory.startsWith(skills))
      ) {
        documents.add(join(directory, entry.name))
      }
    }
  }
  walk(rootDirectory)
  return [...documents]
}

const CHECK_GROUPS = ['links', 'tests', 'decisions', 'structure'] as const
type CheckGroup = (typeof CHECK_GROUPS)[number]

export function runChecks({ rootDirectory = ROOT, group }: { rootDirectory?: string; group?: CheckGroup } = {}) {
  const issues: string[] = []
  const include = (name: CheckGroup) => group === undefined || group === name
  const unfinishedPlans = unfinishedPlanPaths(rootDirectory)
  for (const path of include('structure') ? collectMarkdownPaths(rootDirectory) : []) {
    issues.push(
      ...findScratchDependencies({
        content: readFileSync(join(rootDirectory, path), 'utf8'),
        displayPath: path,
        allowTemporary: path === 'WORKING_PLAN.md' || unfinishedPlans.has(path),
      }),
    )
  }
  const adrNumbers = new Set<number>()
  const decisionsDirectory = join(rootDirectory, 'docs', 'decisions')
  const adrFiles = []
  if (existsSync(decisionsDirectory)) {
    for (const entry of readdirSync(decisionsDirectory, { withFileTypes: true })) {
      if (entry.isFile() && ADR_FILE_PATTERN.test(entry.name)) adrFiles.push(entry.name)
    }
  }
  for (const fileName of adrFiles) {
    const match = ADR_FILE_PATTERN.exec(fileName)
    if (match) adrNumbers.add(Number(match[1]))
  }
  for (const fileName of include('decisions') ? adrFiles : []) {
    const content = readFileSync(join(decisionsDirectory, fileName), 'utf8')
    issues.push(...validateAdr({ fileName, content, adrNumbers }).issues)
  }
  if (include('decisions') && adrFiles.length > 0) {
    const adrIndexPath = join(decisionsDirectory, 'README.md')
    if (existsSync(adrIndexPath)) {
      issues.push(...validateAdrIndex({ content: readFileSync(adrIndexPath, 'utf8'), adrNumbers }))
    } else {
      issues.push('docs/decisions/README.md: missing ADR index')
    }
  }
  const liveDocuments = collectLiveDocuments(rootDirectory)
  let sourcePaths: string[] | undefined
  for (const filePath of liveDocuments) {
    const displayPath = filePath.startsWith(`${rootDirectory}/`) ? filePath.slice(rootDirectory.length + 1) : filePath
    const content = readFileSync(filePath, 'utf8')
    if (include('links')) issues.push(...findBrokenLinks({ content, filePath, displayPath }))
    if (include('decisions')) issues.push(...findBrokenReferences({ content, displayPath, adrNumbers }))
    if (include('structure') && !displayPath.endsWith('PRODUCT.md') && !isProductFile(displayPath)) {
      issues.push(...findProductQuantityRestatements({ content, displayPath }))
    }
    if (include('structure') && displayPath === 'docs/OPEN_QUESTIONS.md') {
      issues.push(...validateOpenQuestions({ content, displayPath }))
    }
    if (include('structure') && (displayPath === PRODUCT_INDEX || isProductFile(displayPath))) {
      issues.push(...findOversizedProductText({ content, displayPath }))
    }
    if (include('structure') && (isProductFile(displayPath) || isArchitectureFile(displayPath))) {
      issues.push(...findTextBeforeFirstSection({ content, displayPath }))
    }
    if (include('structure') && isArchitectureFile(displayPath)) {
      sourcePaths ??= listSourcePaths(rootDirectory)
      issues.push(...findOversizedProductText({ content, displayPath, limits: ARCHITECTURE_LIMITS }))
      issues.push(...findMissingSourceFiles({ content, displayPath, sourcePaths }))
    }
    if (include('tests') && displayPath === CONFORMANCE_DOCUMENT) {
      issues.push(...findStaleConformanceCitations({ content, rootDirectory, displayPath }))
    }
  }
  for (const specification of Object.values(SPECIFICATIONS)) {
    const indexPath = join(rootDirectory, specification.index)
    const paths = listSpecificationFiles(rootDirectory, specification)
    // The architecture is one file until its directory exists; only then is that file an index.
    const isIndex = specification === SPECIFICATIONS.product || paths.length > 0
    if (!include('structure') || !existsSync(indexPath) || !isIndex) continue
    issues.push(
      ...validateSpecificationIndex({
        index: readFileSync(indexPath, 'utf8'),
        files: paths.map((path) => ({ path, content: readFileSync(join(rootDirectory, path), 'utf8') })),
        specification,
      }),
    )
  }
  const agentPath = join(rootDirectory, 'AGENTS.md')
  const developmentPath = join(rootDirectory, 'docs', 'DEVELOPMENT.md')
  if (include('structure') && existsSync(agentPath)) {
    const procedurePath = join(rootDirectory, WORKFLOW_PROCEDURES)
    issues.push(
      ...validateAgentCore({
        agentContent: readFileSync(agentPath, 'utf8'),
        procedureContent: existsSync(procedurePath) ? readFileSync(procedurePath, 'utf8') : undefined,
      }),
    )
  }
  if (include('structure')) {
    const sizes: Record<string, number> = {}
    for (const path of AGENT_RULE_DOCUMENTS) {
      const filePath = join(rootDirectory, path)
      if (existsSync(filePath)) sizes[path] = Buffer.byteLength(readFileSync(filePath, 'utf8'), 'utf8')
    }
    issues.push(...validateAgentRuleBudget({ sizes }))
  }
  if (include('structure') && existsSync(agentPath) && existsSync(developmentPath)) {
    issues.push(
      ...validateWorkflowOwnership({
        agentContent: readFileSync(agentPath, 'utf8'),
        developmentContent: readFileSync(developmentPath, 'utf8'),
      }),
    )
  }
  return { issues, liveDocumentCount: liveDocuments.length }
}

export function parseVerbatimArguments(args: string[]) {
  // Without --file the comparison reads the whole specification: the index and every file under docs/product/.
  const options: { ref: string | undefined; file: string | undefined; allowAdded: number } = {
    ref: undefined,
    file: undefined,
    allowAdded: 0,
  }
  const seen = new Set()
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]!
    const value = args[index + 1]
    if (!['--verbatim', '--file', '--allow-added'].includes(option) || seen.has(option) || value === undefined) {
      throw new Error('Usage: --verbatim <git-ref> [--file <repository-relative-file>] [--allow-added <n>]')
    }
    seen.add(option)
    if (option === '--verbatim') options.ref = value
    if (option === '--file') options.file = value
    if (option === '--allow-added') {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error('--allow-added must be a non-negative safe integer')
      }
      options.allowAdded = Number(value)
    }
  }
  assertValidRef(options.ref)
  assertValidFile(options.file)
  return { ...options, ref: options.ref }
}

function assertValidRef(ref: string | undefined): asserts ref is string {
  if (!ref || ref.startsWith('-') || !/^[\w./~^@{}-]+$/.test(ref)) throw new Error('Invalid git ref')
}

function assertValidFile(file: string | undefined) {
  if (
    file !== undefined &&
    (!/^[\w./-]+$/.test(file) ||
      file.startsWith('/') ||
      file.startsWith('-') ||
      file.split('/').some((part) => part === '..' || part === '' || part === '.'))
  ) {
    throw new Error('Invalid repository-relative file')
  }
}

export function scanVerbatimUnits(content: string) {
  const units: VerbatimUnit[] = []
  const headings = []
  let heading = '(before first heading)'
  let pending: ProductLine[] = []
  let fence: { character: string; length: number } | undefined
  let fencedText = ''
  let comment = false
  const flush = () => {
    for (const block of scanProductBlocks(pending)) {
      const text = block.text.replace(/^\*\*[^*]+[.:]\*\*\s+/, '')
      for (const clause of text.split(/(?<=[.!?;:])\s+/)) {
        const normalized = clause
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[.;:,]+$/, '')
        if (normalized) units.push({ kind: 'clause', text: normalized, heading })
      }
    }
    pending = []
  }
  const lines = content.match(/[^\n]*(?:\n|$)/g)?.filter((line) => line !== '') ?? []
  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/\r?\n$/, '')
    if (fence) {
      fencedText += raw
      const closing = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
      if (closing && closing[1]![0] === fence.character && closing[1]!.length >= fence.length) {
        units.push({ kind: 'fence', text: fencedText, heading })
        fence = undefined
        fencedText = ''
      }
      continue
    }
    const rawOpening = !comment && /^\s*(`{3,}|~{3,})/.exec(line)
    if (rawOpening) {
      flush()
      fence = { character: rawOpening[1]![0]!, length: rawOpening[1]!.length }
      fencedText = raw
      continue
    }
    // Remove comments only outside fences; code examples are compared exactly.
    const commentAtStart = comment
    let visible = ''
    let cursor = 0
    while (cursor < line.length) {
      const delimiter = line.indexOf(comment ? '-->' : '<!--', cursor)
      if (delimiter === -1) {
        if (!comment) visible += line.slice(cursor)
        break
      }
      if (!comment) visible += line.slice(cursor, delimiter)
      cursor = delimiter + (comment ? 3 : 4)
      comment = !comment
    }
    if (!visible.trim() && (commentAtStart || comment || line.includes('<!--'))) continue
    const opening = /^\s*(`{3,}|~{3,})/.exec(visible)
    if (opening) {
      flush()
      fence = { character: opening[1]![0]!, length: opening[1]!.length }
      fencedText = raw
      continue
    }
    const title = /^(#{1,6})\s+(.+)$/.exec(visible)
    if (title) {
      flush()
      heading = visible.trim()
      headings.push(heading)
    } else pending.push({ number: index + 1, text: visible })
  }
  flush()
  if (fence) units.push({ kind: 'fence', text: fencedText, heading })
  return { units, headings }
}

interface VerbatimUnit {
  kind: string
  text: string
  heading: string
}

export function compareVerbatim(before: string, after: string) {
  const oldText = scanVerbatimUnits(before)
  const newText = scanVerbatimUnits(after)
  const keyOf = (unit: VerbatimUnit) => JSON.stringify([unit.kind, unit.text])
  function group<T>(units: T[], key: (unit: T) => string) {
    const result = new Map<string, T[]>()
    for (const unit of units) {
      const id = key(unit)
      if (!result.has(id)) result.set(id, [])
      result.get(id)!.push(unit)
    }
    return result
  }
  const oldGroups = group(oldText.units, keyOf)
  const newGroups = group(newText.units, keyOf)
  const removed = []
  const added = []
  const moved = []
  let unchanged = 0
  for (const id of new Set([...oldGroups.keys(), ...newGroups.keys()])) {
    const remainingOld = [...(oldGroups.get(id) ?? [])]
    const remainingNew = []
    // Match identical headings first so duplicates do not cause false moves.
    for (const unit of newGroups.get(id) ?? []) {
      const sameHeading = remainingOld.findIndex((old) => old.heading === unit.heading)
      if (sameHeading !== -1) {
        remainingOld.splice(sameHeading, 1)
        unchanged += 1
      } else remainingNew.push(unit)
    }
    const matches = Math.min(remainingOld.length, remainingNew.length)
    unchanged += matches
    for (let index = 0; index < matches; index++) {
      moved.push({ ...remainingNew[index]!, from: remainingOld[index]!.heading })
    }
    removed.push(...remainingOld.slice(matches))
    added.push(...remainingNew.slice(matches))
  }
  const oldHeadings = group(oldText.headings, (heading) => heading)
  const newHeadings = group(newText.headings, (heading) => heading)
  const difference = (left: Map<string, string[]>, right: Map<string, string[]>) =>
    [...left].flatMap(([id, items]) => items.slice(right.get(id)?.length ?? 0))
  return {
    before: oldText.units.length,
    after: newText.units.length,
    unchanged,
    removed,
    added,
    headingsRemoved: difference(oldHeadings, newHeadings),
    headingsAdded: difference(newHeadings, oldHeadings),
    moved,
    antecedents: newText.units.filter(
      (unit) =>
        unit.kind === 'clause' &&
        /\b(?:above|below|preceding|following|earlier|later|this section|the rule)\b/i.test(unit.text),
    ),
  }
}

function readWorkingFile(rootDirectory: string, file: string) {
  const path = realpathSync(join(rootDirectory, file))
  const withinRoot = relative(realpathSync(rootDirectory), path)
  if (withinRoot === '..' || withinRoot.startsWith('../')) throw new Error('File resolves outside the repository')
  return readFileSync(path, 'utf8')
}

function gitShow(rootDirectory: string, ref: string, file: string) {
  return execFileSync('git', ['show', `${ref}:${file}`], {
    cwd: rootDirectory,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

// A specification at a revision: the index plus every file directly under its directory that exists
// there. A revision before the split has the single old file.
function readSpecificationAtRef(
  rootDirectory: string,
  ref: string,
  specification: Specification = SPECIFICATIONS.product,
) {
  const prefix = `${specification.directory}/`
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', prefix], {
    cwd: rootDirectory,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .filter((name) => name.startsWith(prefix) && /^[^/]+\.md$/u.test(name.slice(prefix.length)))
    .sort()
  return [specification.index, ...names].map((path) => ({ path, content: gitShow(rootDirectory, ref, path) }))
}

// The specification in the working tree, read the same way.
function readSpecificationInWorkingTree(rootDirectory: string, specification: Specification = SPECIFICATIONS.product) {
  return [specification.index, ...listSpecificationFiles(rootDirectory, specification)].map((path) => ({
    path,
    content: readWorkingFile(rootDirectory, path),
  }))
}

const joinDocuments = (documents: { content: string }[]) =>
  documents.map(({ content }) => (content.endsWith('\n') ? content : `${content}\n`)).join('\n')

export function runVerbatim({
  ref,
  file,
  allowAdded = 0,
  rootDirectory = ROOT,
}: {
  ref: string
  file?: string | undefined
  allowAdded?: number
  rootDirectory?: string
}) {
  // Validate exported API arguments as well as the CLI. Git is invoked without a shell.
  parseVerbatimArguments([
    '--verbatim',
    ref,
    ...(file === undefined ? [] : ['--file', file]),
    '--allow-added',
    String(allowAdded),
  ])
  const after =
    file === undefined
      ? joinDocuments(readSpecificationInWorkingTree(rootDirectory))
      : readWorkingFile(rootDirectory, file)
  const before =
    file === undefined ? joinDocuments(readSpecificationAtRef(rootDirectory, ref)) : gitShow(rootDirectory, ref, file)
  const comparison = compareVerbatim(before, after)
  return { comparison, exitCode: comparison.removed.length === 0 && comparison.added.length <= allowAdded ? 0 : 1 }
}

export interface OrderedDifference {
  id: string
  before: { label: string; line: number; text: string }[]
  after: { label: string; line: number; text: string }[]
}

interface OrderedLine {
  label: string
  line: number
  text: string
}

// The heading line and the lines up to the next numbered heading, without the blank lines and
// separators that end the section. Every other line, including interior blank lines, is kept.
function orderedRange(section: ReturnType<typeof scanProductSections>[number], label: string) {
  const lines: OrderedLine[] = [
    { label, line: section.startLine, text: section.heading },
    ...section.lines.map(({ number, text }) => ({ label, line: number, text })),
  ]
  while (lines.length > 1 && ['', '---'].includes(lines.at(-1)!.text.trim())) lines.pop()
  return lines
}

function diffOrderedLines(before: OrderedLine[], after: OrderedLine[]) {
  const table = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0))
  for (let row = before.length - 1; row >= 0; row--) {
    for (let column = after.length - 1; column >= 0; column--) {
      table[row]![column] =
        before[row]!.text === after[column]!.text
          ? table[row + 1]![column + 1]! + 1
          : Math.max(table[row + 1]![column]!, table[row]![column + 1]!)
    }
  }
  const hunks: { before: OrderedLine[]; after: OrderedLine[] }[] = []
  let current: { before: OrderedLine[]; after: OrderedLine[] } | undefined
  let row = 0
  let column = 0
  while (row < before.length || column < after.length) {
    if (row < before.length && column < after.length && before[row]!.text === after[column]!.text) {
      current = undefined
      row++
      column++
      continue
    }
    if (!current) {
      current = { before: [], after: [] }
      hunks.push(current)
    }
    if (column === after.length || (row < before.length && table[row + 1]![column]! >= table[row]![column + 1]!)) {
      current.before.push(before[row++]!)
    } else current.after.push(after[column++]!)
  }
  return hunks
}

// Compares every numbered section of the specification before a split with the same section in the files
// after it. Line order inside a section matters; the order of the sections and of the files does not.
export function compareOrderedSections({
  before,
  after,
}: {
  before: { path: string; content: string }[]
  after: { path: string; content: string }[]
}) {
  const collect = (documents: { path: string; content: string }[]) => {
    const sections = new Map<string, OrderedLine[]>()
    const duplicates: string[] = []
    for (const { path, content } of documents) {
      for (const section of scanProductSections(content)) {
        if (sections.has(section.id)) duplicates.push(section.id)
        else sections.set(section.id, orderedRange(section, path))
      }
    }
    return { sections, duplicates }
  }
  const oldSide = collect(before)
  const newSide = collect(after)
  const differences: OrderedDifference[] = []
  const problems = [
    ...oldSide.duplicates.map((id) => `§${id}: more than one heading in the base specification`),
    ...newSide.duplicates.map((id) => `§${id}: more than one heading in the files after the split`),
  ]
  for (const [id, oldLines] of oldSide.sections) {
    const newLines = newSide.sections.get(id)
    if (newLines === undefined) {
      problems.push(`§${id}: missing after the split`)
      continue
    }
    for (const hunk of diffOrderedLines(oldLines, newLines)) differences.push({ id, ...hunk })
  }
  for (const id of newSide.sections.keys()) {
    if (!oldSide.sections.has(id)) problems.push(`§${id}: not present in the base specification`)
  }
  // A group of changed lines counts as many lines as its longer side has.
  const differingLines = differences.reduce(
    (total, { before, after }) => total + Math.max(before.length, after.length),
    0,
  )
  return { sectionCount: oldSide.sections.size, differences, differingLines, problems }
}

export function formatOrderedReport(report: ReturnType<typeof compareOrderedSections>) {
  const lines = [
    `Ordered comparison: ${report.sectionCount} sections, ${report.differingLines} differing lines (${report.differences.length} groups), ${report.problems.length} structural problems.`,
  ]
  for (const problem of report.problems) lines.push(`Problem ${problem}`)
  for (const { id, before, after } of report.differences) {
    lines.push(`Difference §${id}`)
    for (const line of before) lines.push(`  - ${line.label}:${line.line}: ${line.text}`)
    for (const line of after) lines.push(`  + ${line.label}:${line.line}: ${line.text}`)
  }
  return lines.join('\n')
}

export function parseOrderedArguments(args: string[]) {
  const options: { ref: string | undefined; allowDifferences: number } = { ref: undefined, allowDifferences: 0 }
  const seen = new Set()
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]!
    const value = args[index + 1]
    if (!['--ordered', '--allow-differences'].includes(option) || seen.has(option) || value === undefined) {
      throw new Error('Usage: --ordered <git-ref> [--allow-differences <n>]')
    }
    seen.add(option)
    if (option === '--ordered') options.ref = value
    else {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error('--allow-differences must be a non-negative safe integer')
      }
      options.allowDifferences = Number(value)
    }
  }
  assertValidRef(options.ref)
  return { ...options, ref: options.ref }
}

export function runOrdered({
  ref,
  allowDifferences = 0,
  rootDirectory = ROOT,
}: {
  ref: string
  allowDifferences?: number
  rootDirectory?: string
}) {
  parseOrderedArguments(['--ordered', ref, '--allow-differences', String(allowDifferences)])
  const report = compareOrderedSections({
    before: readSpecificationAtRef(rootDirectory, ref),
    after: readSpecificationInWorkingTree(rootDirectory),
  })
  return { report, exitCode: report.problems.length === 0 && report.differingLines <= allowDifferences ? 0 : 1 }
}

// The regrouped comparison proves that a restructuring kept every character while it moved text
// between files and under new numbered subsections of the same top-level section.
export interface RegroupedBlock {
  section: string
  path: string
  line: number
  text: string
}

interface RegroupedHeading {
  id: string
  heading: string
  title: string
  path: string
  line: number
}

const OUTSIDE_SECTIONS = '(outside sections)'
const INLINE_LINK_TARGET = /\]\(([^)\s]+)\)/gu

// A relative link target changes when its document moves. Resolve it against the document's
// directory, so that the same destination compares equal from any file.
function resolveLinkTargets(text: string, path: string) {
  return text.replace(INLINE_LINK_TARGET, (link, target: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu.test(target)) return link
    const anchorStart = target.indexOf('#')
    const file = anchorStart === -1 ? target : target.slice(0, anchorStart)
    const anchor = anchorStart === -1 ? '' : target.slice(anchorStart)
    return `](${posix.normalize(posix.join(posix.dirname(path), file))}${anchor})`
  })
}

// A block is a run of non-blank lines, compared character for character. Blank lines inside a fenced
// block stay in the block. Separators and the blank lines between blocks carry no text.
function scanExactBlocks(lines: ProductLine[], section: string, path: string) {
  const blocks: RegroupedBlock[] = []
  let current: ProductLine[] = []
  let fence: { character: string; length: number } | undefined
  const flush = () => {
    if (current.length === 0) return
    blocks.push({
      section,
      path,
      line: current[0]!.number,
      text: resolveLinkTargets(current.map(({ text }) => text).join('\n'), path),
    })
    current = []
  }
  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(line.text)
    if (fenceMatch) {
      if (!fence) fence = { character: fenceMatch[1]![0]!, length: fenceMatch[1]!.length }
      else if (fenceMatch[1]![0] === fence.character && fenceMatch[1]!.length >= fence.length) fence = undefined
      current.push(line)
      continue
    }
    if (!fence && ['', '---'].includes(line.text.trim())) flush()
    else current.push(line)
  }
  flush()
  return blocks
}

function scanRegroupedDocuments(documents: { path: string; content: string }[]) {
  const blocks: RegroupedBlock[] = []
  const headings: RegroupedHeading[] = []
  for (const { path, content } of documents) {
    const sections = scanProductSections(content)
    const preamble = content
      .split(/\r?\n/u)
      .slice(0, sections[0] ? sections[0].startLine - 1 : undefined)
      .map((text, index) => ({ number: index + 1, text }))
    blocks.push(...scanExactBlocks(preamble, OUTSIDE_SECTIONS, path))
    for (const section of sections) {
      headings.push({ id: section.id, heading: section.heading, title: section.title, path, line: section.startLine })
      blocks.push(...scanExactBlocks(section.lines, section.id, path))
    }
  }
  return { blocks, headings }
}

const topLevelSection = (id: string) => (id === OUTSIDE_SECTIONS ? id : id.split('.')[0]!)

export function compareRegrouped({
  before,
  after,
}: {
  before: { path: string; content: string }[]
  after: { path: string; content: string }[]
}) {
  const oldSide = scanRegroupedDocuments(before)
  const newSide = scanRegroupedDocuments(after)
  const problems: string[] = []
  const collectHeadings = (headings: RegroupedHeading[], side: string) => {
    const result = new Map<string, RegroupedHeading>()
    for (const heading of headings) {
      if (result.has(heading.id)) problems.push(`§${heading.id}: more than one heading ${side}`)
      else result.set(heading.id, heading)
    }
    return result
  }
  const oldHeadings = collectHeadings(oldSide.headings, 'in the base revision')
  const newHeadings = collectHeadings(newSide.headings, 'in the working tree')
  const headingsAdded: RegroupedHeading[] = []
  for (const [id, heading] of oldHeadings) {
    const current = newHeadings.get(id)
    if (current === undefined) problems.push(`§${id}: missing in the working tree`)
    else if (current.heading !== heading.heading) {
      problems.push(`§${id}: heading changed from "${heading.heading}" to "${current.heading}"`)
    }
  }
  for (const [id, heading] of newHeadings) {
    if (!oldHeadings.has(id)) headingsAdded.push(heading)
  }

  // Blocks are matched as multisets inside each top-level section, so a block may move to any
  // subsection of its section and to any file.
  const keyOf = (block: RegroupedBlock) => JSON.stringify([topLevelSection(block.section), block.text])
  const unmatchedOld = new Map<string, RegroupedBlock[]>()
  for (const block of oldSide.blocks) unmatchedOld.set(keyOf(block), [...(unmatchedOld.get(keyOf(block)) ?? []), block])
  const added: RegroupedBlock[] = []
  const outsideAdded: RegroupedBlock[] = []
  for (const block of newSide.blocks) {
    const candidates = unmatchedOld.get(keyOf(block))
    if (candidates?.length) candidates.shift()
    else if (block.section === OUTSIDE_SECTIONS) outsideAdded.push(block)
    else added.push(block)
  }
  const removed: RegroupedBlock[] = []
  const renumbered: { from: RegroupedBlock; to: RegroupedHeading }[] = []
  for (const block of [...unmatchedOld.values()].flat()) {
    // An unnumbered heading may gain a number: its words then reappear as a new numbered heading.
    const title = /^#{1,6}\s+(.+)$/u.exec(block.text)?.[1]
    const target = headingsAdded.find(
      (heading) =>
        heading.title === title &&
        topLevelSection(heading.id) === topLevelSection(block.section) &&
        !renumbered.some(({ to }) => to === heading),
    )
    if (target) renumbered.push({ from: block, to: target })
    // The level-one title of the single old file has no counterpart after a split.
    else if (block.section !== OUTSIDE_SECTIONS || !/^#\s+\S/u.test(block.text)) removed.push(block)
  }
  removed.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line)

  // A block that follows a different block than before may have lost the text it refers to.
  const predecessors = (
    blocks: RegroupedBlock[],
    sameGroup: (left: RegroupedBlock, right: RegroupedBlock) => boolean,
  ) => {
    const result = new Map<string, string | undefined>()
    for (const [index, block] of blocks.entries()) {
      const previous = blocks[index - 1]
      if (!result.has(keyOf(block))) {
        result.set(keyOf(block), previous && sameGroup(previous, block) ? previous.text : undefined)
      }
    }
    return result
  }
  const oldPredecessors = predecessors(
    oldSide.blocks,
    (left, right) => left.path === right.path && topLevelSection(left.section) === topLevelSection(right.section),
  )
  const newPredecessors = predecessors(
    newSide.blocks,
    (left, right) => left.path === right.path && left.section === right.section,
  )
  const predecessorChanges = newSide.blocks
    .filter((block) => block.section !== OUTSIDE_SECTIONS && oldPredecessors.has(keyOf(block)))
    .filter((block) => oldPredecessors.get(keyOf(block)) !== newPredecessors.get(keyOf(block)))
    // A block that followed a renumbered heading now starts that numbered section.
    .filter(
      (block) =>
        newPredecessors.get(keyOf(block)) !== undefined ||
        !renumbered.some(({ from }) => from.text === oldPredecessors.get(keyOf(block))),
    )
    .map((block) => ({
      block,
      before: oldPredecessors.get(keyOf(block)),
      after: newPredecessors.get(keyOf(block)),
    }))

  return {
    sectionCount: new Set([...oldHeadings.keys()].map(topLevelSection)).size,
    blockCount: oldSide.blocks.length,
    removed,
    added,
    outsideAdded,
    headingsAdded: headingsAdded.filter((heading) => !renumbered.some(({ to }) => to === heading)),
    renumbered,
    predecessorChanges,
    problems,
  }
}

const excerpt = (text: string | undefined, length = 80) => {
  if (text === undefined) return '(the start of its section)'
  const line = text.replace(/\s+/gu, ' ')
  return JSON.stringify(line.length > length ? `${line.slice(0, length)}…` : line)
}

export function formatRegroupedReport(report: ReturnType<typeof compareRegrouped>) {
  const lines = [
    `Regrouped comparison: ${report.sectionCount} top-level sections, ${report.blockCount} blocks, removed ${report.removed.length}, added ${report.added.length}, headings added ${report.headingsAdded.length}, headings renumbered ${report.renumbered.length}, structural problems ${report.problems.length}, changed predecessors ${report.predecessorChanges.length}.`,
  ]
  for (const problem of report.problems) lines.push(`Problem ${problem}`)
  for (const block of report.removed) {
    lines.push(`Removed §${block.section} ${block.path}:${block.line}: ${JSON.stringify(block.text)}`)
    // Show where the closest added block of the same section first differs.
    let closest: { block: RegroupedBlock; shared: number } | undefined
    for (const candidate of report.added) {
      if (topLevelSection(candidate.section) !== topLevelSection(block.section)) continue
      let shared = 0
      while (shared < block.text.length && block.text[shared] === candidate.text[shared]) shared++
      if (!closest || shared > closest.shared) closest = { block: candidate, shared }
    }
    if (closest && closest.shared >= 20) {
      const start = Math.max(0, closest.shared - 30)
      lines.push(
        `  first difference at character ${closest.shared}, against ${closest.block.path}:${closest.block.line}: ${JSON.stringify(block.text.slice(start, closest.shared + 30))} became ${JSON.stringify(closest.block.text.slice(start, closest.shared + 30))}`,
      )
    }
  }
  for (const block of report.added) {
    lines.push(`Added §${block.section} ${block.path}:${block.line}: ${JSON.stringify(block.text)}`)
  }
  for (const heading of report.headingsAdded) {
    lines.push(`Heading added ${heading.path}:${heading.line}: ${heading.heading}`)
  }
  for (const { from, to } of report.renumbered) {
    lines.push(`Heading renumbered ${to.path}:${to.line}: ${from.text} -> ${to.heading}`)
  }
  for (const block of report.outsideAdded) {
    lines.push(`Outside sections ${block.path}:${block.line}: ${excerpt(block.text)}`)
  }
  for (const { block, before, after } of report.predecessorChanges) {
    lines.push(
      `Predecessor changed §${block.section} ${block.path}:${block.line}: ${excerpt(block.text)} follows ${excerpt(after)}; it followed ${excerpt(before)}`,
    )
  }
  return lines.join('\n')
}

export function parseRegroupedArguments(args: string[]) {
  const options: { ref: string | undefined; spec: SpecificationName } = { ref: undefined, spec: 'product' }
  const seen = new Set()
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]!
    const value = args[index + 1]
    if (!['--regrouped', '--spec'].includes(option) || seen.has(option) || value === undefined) {
      throw new Error(`Usage: --regrouped <git-ref> [--spec ${Object.keys(SPECIFICATIONS).join('|')}]`)
    }
    seen.add(option)
    if (option === '--regrouped') options.ref = value
    else if (Object.keys(SPECIFICATIONS).includes(value)) options.spec = value as SpecificationName
    else throw new Error(`--spec must be one of ${Object.keys(SPECIFICATIONS).join(', ')}`)
  }
  assertValidRef(options.ref)
  return { ...options, ref: options.ref }
}

export function runRegrouped({
  ref,
  spec = 'product',
  rootDirectory = ROOT,
}: {
  ref: string
  spec?: SpecificationName
  rootDirectory?: string
}) {
  parseRegroupedArguments(['--regrouped', ref, '--spec', spec])
  const specification = SPECIFICATIONS[spec]
  const report = compareRegrouped({
    before: readSpecificationAtRef(rootDirectory, ref, specification),
    after: readSpecificationInWorkingTree(rootDirectory, specification),
  })
  const unchanged = report.removed.length === 0 && report.added.length === 0 && report.problems.length === 0
  return { report, exitCode: unchanged ? 0 : 1 }
}

export function formatVerbatimReport(report: ReturnType<typeof compareVerbatim>) {
  const lines = [
    `Verbatim comparison: before ${report.before}, after ${report.after}, unchanged ${report.unchanged}, removed ${report.removed.length}, added ${report.added.length}, moved ${report.moved.length}, headings removed ${report.headingsRemoved.length}, headings added ${report.headingsAdded.length}.`,
  ]
  for (const [label, units] of [
    ['Removed', report.removed],
    ['Added', report.added],
  ] as const) {
    for (const unit of units) lines.push(`${label} [${unit.heading}] ${unit.kind}: ${JSON.stringify(unit.text)}`)
  }
  for (const heading of report.headingsRemoved) lines.push(`Heading removed: ${heading}`)
  for (const heading of report.headingsAdded) lines.push(`Heading added: ${heading}`)
  for (const unit of report.moved)
    lines.push(`Moved [${unit.from} -> ${unit.heading}] ${unit.kind}: ${JSON.stringify(unit.text)}`)
  for (const unit of report.antecedents) lines.push(`Antecedent [${unit.heading}]: ${JSON.stringify(unit.text)}`)
  return lines.join('\n')
}

// The detail comparison lists three classes of exact text that a rewrite must keep or account for:
// literals (code spans, bold labels, and numbers with their units), table cells, and section references.
// It shows differences and does not judge them.

export interface DetailLocation {
  path: string
  section: string
  line: number
  column?: string | undefined
}

export interface DetailLiteral extends DetailLocation {
  kind: 'code' | 'bold' | 'number'
  text: string
}

export interface DetailRow extends DetailLocation {
  header: string[]
  cells: string[]
}

export interface DetailReference extends DetailLocation {
  reference: string
  sentence: string
  context: string
}

interface DetailText extends DetailLocation {
  text: string
}

const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/u
const CODE_SPAN = /(`+)(.+?)\1/gu
const BOLD_SPAN = /\*\*([^*]+)\*\*/gu
const SECTION_RANGE = String.raw`\d+(?:\.\d+)*(?:\s*[–-]\s*\d+(?:\.\d+)*)?`
const SECTION_REFERENCE = new RegExp(
  String.raw`(?:${'`'}?[\w./-]+\.md${'`'}?\s+)?(?:§§${SECTION_RANGE}(?:(?:,\s*|,?\s+and\s+)${SECTION_RANGE})*|§${SECTION_RANGE})`,
  'gu',
)
const NUMBER_WORDS =
  'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million'
const NUMBER_WORD = new RegExp(`^(?:${NUMBER_WORDS})(?:-\\p{L}+)*$`, 'iu')
const PURE_NUMBER = new RegExp(`^(?:\\d+(?:[.,]\\d+)*|${NUMBER_WORDS})$`, 'iu')
const NOT_A_UNIT = /^(?:a|an|and|are|as|at|by|for|from|in|is|of|on|or|than|that|the|to|with)$/iu
const LEADING_PUNCTUATION = /^[([{"'“‘«]+/u
const TRAILING_PUNCTUATION = /[)\]}"'”’»,.;:!?…]+$/u
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[^a-z\s])/gu

// A private-use character keeps the length of the text, so sentence bounds still apply to the original.
const CODE_MASK = String.fromCodePoint(0xe000)
const maskCodeSpans = (text: string) => text.replace(CODE_SPAN, (span) => CODE_MASK.repeat(span.length))

function splitTableRow(row: string) {
  return row
    .trim()
    .replace(/^\|/u, '')
    .replace(/(?<!\\)\|$/u, '')
    .split(/(?<!\\)\|/u)
    .map((cell) => cell.trim().replace(/\s+/gu, ' '))
}

function unnumberedHeadings(lines: ProductLine[]) {
  const headings: { line: number; text: string }[] = []
  let fence: { character: string; length: number } | undefined
  const cleanLines = stripProductComments(lines.map(({ text }) => text).join('\n')).split('\n')
  for (const [index, line] of cleanLines.entries()) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(line)
    if (fenceMatch) {
      if (!fence) fence = { character: fenceMatch[1]![0]!, length: fenceMatch[1]!.length }
      else if (fenceMatch[1]![0] === fence.character && fenceMatch[1]!.length >= fence.length) fence = undefined
      continue
    }
    const heading = !fence && /^#{1,6}\s+(.+)$/u.exec(line.trim())
    if (heading) headings.push({ line: lines[index]!.number, text: heading[1]!.trim() })
  }
  return headings
}

// Splits one specification file into located text units and table rows. Text before the first numbered
// heading has the section ''. Fenced blocks and comments are skipped; --verbatim compares fences exactly.
export function scanDetailDocument({ path, content }: { path: string; content: string }) {
  const texts: DetailText[] = []
  const rows: DetailRow[] = []
  const sections = scanProductSections(content)
  const allLines = content.split(/\r?\n/u)
  const segments = [
    {
      section: '',
      heading: undefined as { line: number; text: string } | undefined,
      lines: allLines
        .slice(0, sections[0] ? sections[0].startLine - 1 : allLines.length)
        .map((text, index) => ({ number: index + 1, text })),
    },
    ...sections.map((section) => ({
      section: section.id,
      heading: { line: section.startLine, text: section.title },
      lines: section.lines,
    })),
  ]
  for (const { section, heading, lines } of segments) {
    const segmentTexts: DetailText[] = []
    if (heading) segmentTexts.push({ path, section, line: heading.line, text: heading.text })
    for (const { line, text } of unnumberedHeadings(lines)) segmentTexts.push({ path, section, line, text })
    const tables: { startLine: number; text: string }[][] = []
    let previousRow = -1
    for (const block of scanProductBlocks(lines)) {
      if (block.kind !== 'table row') {
        segmentTexts.push({ path, section, line: block.startLine, text: block.text })
        continue
      }
      if (block.startLine === previousRow + 1) tables.at(-1)!.push(block)
      else tables.push([block])
      previousRow = block.startLine
    }
    for (const table of tables) {
      const hasHeader =
        table.length > 1 && splitTableRow(table[1]!.text).every((cell) => TABLE_SEPARATOR_CELL.test(cell))
      const header = hasHeader ? splitTableRow(table[0]!.text) : []
      for (const cell of header) segmentTexts.push({ path, section, line: table[0]!.startLine, text: cell })
      for (const row of table.slice(hasHeader ? 2 : 0)) {
        const cells = splitTableRow(row.text)
        const columns = cells.map((_cell, index) => header[index] || `column ${index + 1}`)
        rows.push({ path, section, line: row.startLine, header: columns, cells })
        for (const [index, cell] of cells.entries()) {
          segmentTexts.push({ path, section, line: row.startLine, column: columns[index], text: cell })
        }
      }
    }
    texts.push(...segmentTexts.sort((left, right) => left.line - right.line))
  }
  return { texts, rows }
}

// Code spans, bold spans, and numbers outside them. A number is a token that contains a digit or a
// number word. A bare number takes the following word as its unit ("25 px", "3 attempts").
export function extractDetailLiterals(text: string) {
  const literals: { kind: DetailLiteral['kind']; text: string }[] = []
  for (const match of text.matchAll(CODE_SPAN)) literals.push({ kind: 'code', text: match[0] })
  const masked = maskCodeSpans(text)
  for (const match of masked.matchAll(BOLD_SPAN)) {
    literals.push({ kind: 'bold', text: text.slice(match.index, match.index + match[0].length) })
  }
  const tokens = masked
    .replace(BOLD_SPAN, ' ')
    .replace(/\]\([^)\s]*\)/gu, ']')
    .replace(/<https?:[^>]*>|\bhttps?:\/\/\S+/gu, ' ')
    .replace(SECTION_REFERENCE, ' ')
    .replaceAll(CODE_MASK, ' ')
    .split(/\s+/u)
    .filter(Boolean)
  for (const [index, raw] of tokens.entries()) {
    const core = raw.replace(LEADING_PUNCTUATION, '').replace(TRAILING_PUNCTUATION, '')
    const digits = /\d/u.test(core)
    if (!digits && !NUMBER_WORD.test(core)) continue
    let literal = digits ? core : core.toLowerCase()
    const next = tokens[index + 1]
    if (PURE_NUMBER.test(core) && raw.endsWith(core) && next !== undefined && !LEADING_PUNCTUATION.test(next)) {
      const unit = next.replace(TRAILING_PUNCTUATION, '')
      if (/^(?:%|\p{L})/u.test(unit) && !NOT_A_UNIT.test(unit)) literal += ` ${unit}`
    }
    literals.push({ kind: 'number', text: literal })
  }
  return literals
}

// Section references with the sentence that holds them. The context is the sentence with every reference
// replaced by "§"; two references in the same section and context are one retargeted reference.
export function extractDetailReferences(text: string) {
  const references: { reference: string; sentence: string; context: string }[] = []
  const searchable = text.replace(CODE_SPAN, (span) => (span.includes('§') ? ' '.repeat(span.length) : span))
  const bounds = [0]
  for (const match of maskCodeSpans(text).matchAll(SENTENCE_BREAK))
    bounds.push(match.index, match.index + match[0].length)
  bounds.push(text.length)
  for (let index = 0; index < bounds.length; index += 2) {
    const part = searchable.slice(bounds[index], bounds[index + 1])
    const context = part.replace(SECTION_REFERENCE, '§').replace(/\s+/gu, ' ').trim()
    const sentence = text.slice(bounds[index], bounds[index + 1]).trim()
    for (const match of part.matchAll(SECTION_REFERENCE)) {
      references.push({ reference: match[0].replaceAll('`', '').replace(/\s+/gu, ' '), sentence, context })
    }
  }
  return references
}

function pairBy<T>(oldUnits: T[], newUnits: T[], key: (unit: T) => string) {
  const queues = new Map<string, T[]>()
  for (const unit of newUnits) {
    const queue = queues.get(key(unit))
    if (queue) queue.push(unit)
    else queues.set(key(unit), [unit])
  }
  const pairs: { before: T; after: T }[] = []
  const oldLeft: T[] = []
  const used = new Set<T>()
  for (const unit of oldUnits) {
    const partner = queues.get(key(unit))?.shift()
    if (partner === undefined) oldLeft.push(unit)
    else {
      pairs.push({ before: unit, after: partner })
      used.add(partner)
    }
  }
  return { pairs, oldLeft, newLeft: newUnits.filter((unit) => !used.has(unit)) }
}

// Pairs a changed row with the row of the same table that shares most of its cells, when more than half match.
function pairSimilarRows(oldRows: DetailRow[], newRows: DetailRow[], table: (row: DetailRow) => string) {
  const pairs: { before: DetailRow; after: DetailRow }[] = []
  const oldLeft: DetailRow[] = []
  const remaining = [...newRows]
  for (const row of oldRows) {
    let best = -1
    let bestScore = 0
    for (const [index, candidate] of remaining.entries()) {
      if (table(candidate) !== table(row)) continue
      const score = row.cells.filter((cell, column) => cell === candidate.cells[column]).length
      if (score > bestScore) {
        best = index
        bestScore = score
      }
    }
    if (best !== -1 && bestScore * 2 > Math.max(row.cells.length, remaining[best]!.cells.length)) {
      pairs.push({ before: row, after: remaining.splice(best, 1)[0]! })
    } else oldLeft.push(row)
  }
  return { pairs, oldLeft, newLeft: remaining }
}

const byLocation = (left: DetailLocation, right: DetailLocation) =>
  left.path === right.path ? left.line - right.line : left.path < right.path ? -1 : 1

export function compareDetails({
  before,
  after,
}: {
  before: { path: string; content: string }[]
  after: { path: string; content: string }[]
}) {
  const scan = (documents: { path: string; content: string }[]) => {
    const literals: DetailLiteral[] = []
    const rows: DetailRow[] = []
    const references: DetailReference[] = []
    for (const document of documents) {
      const scanned = scanDetailDocument(document)
      rows.push(...scanned.rows)
      for (const { text, ...location } of scanned.texts) {
        for (const literal of extractDetailLiterals(text)) literals.push({ ...location, ...literal })
        for (const reference of extractDetailReferences(text)) references.push({ ...location, ...reference })
      }
    }
    return { literals, rows, references }
  }
  const oldSide = scan(before)
  const newSide = scan(after)

  // An item that keeps its section is unchanged; the same item in another section has moved.
  const literal = (unit: DetailLiteral) => `${unit.kind}\u0000${unit.text}`
  const keptLiterals = pairBy(oldSide.literals, newSide.literals, (unit) => `${unit.section}\u0001${literal(unit)}`)
  const literals = pairBy(keptLiterals.oldLeft, keptLiterals.newLeft, literal)

  const content = (row: DetailRow) => JSON.stringify([row.header, row.cells])
  const table = (row: DetailRow) => JSON.stringify([row.section, row.header])
  const keptRows = pairBy(oldSide.rows, newSide.rows, (row) => `${row.section}\u0001${content(row)}`)
  const movedRows = pairBy(keptRows.oldLeft, keptRows.newLeft, content)
  const sameName = pairBy(movedRows.oldLeft, movedRows.newLeft, (row) => `${table(row)}\u0001${row.cells[0] ?? ''}`)
  const similar = pairSimilarRows(sameName.oldLeft, sameName.newLeft, table)
  const changed = [...sameName.pairs, ...similar.pairs].flatMap(({ before: oldRow, after: newRow }) =>
    Array.from({ length: Math.max(oldRow.cells.length, newRow.cells.length) }, (_value, index) => ({
      before: { ...oldRow, column: oldRow.header[index] ?? newRow.header[index]! },
      after: { ...newRow, column: newRow.header[index] ?? oldRow.header[index]! },
      row: newRow.cells[0] ?? '',
      oldText: oldRow.cells[index] ?? '',
      newText: newRow.cells[index] ?? '',
    })).filter(({ oldText, newText }) => oldText !== newText),
  )

  const place = (unit: DetailReference) => `${unit.section}\u0001${unit.context}`
  const keptInSentence = pairBy(
    oldSide.references,
    newSide.references,
    (unit) => `${place(unit)}\u0001${unit.reference}`,
  )
  const retargeted = pairBy(keptInSentence.oldLeft, keptInSentence.newLeft, place)
  const keptInSection = pairBy(
    retargeted.oldLeft,
    retargeted.newLeft,
    (unit) => `${unit.section}\u0001${unit.reference}`,
  )
  const references = pairBy(keptInSection.oldLeft, keptInSection.newLeft, (unit) => unit.reference)

  const sortPairs = <T extends DetailLocation>(pairs: { before: T; after: T }[]) =>
    pairs.sort((left, right) => byLocation(left.after, right.after))
  return {
    literals: {
      removed: literals.oldLeft.sort(byLocation),
      added: literals.newLeft.sort(byLocation),
      moved: sortPairs(literals.pairs),
    },
    cells: {
      changed: changed.sort((left, right) => byLocation(left.after, right.after)),
      rowsRemoved: similar.oldLeft.sort(byLocation),
      rowsAdded: similar.newLeft.sort(byLocation),
      rowsMoved: sortPairs(movedRows.pairs),
    },
    references: {
      removed: references.oldLeft.sort(byLocation),
      added: references.newLeft.sort(byLocation),
      retargeted: sortPairs(retargeted.pairs),
      moved: sortPairs(references.pairs),
    },
  }
}

// Moves are listed but do not fail the comparison, as in --verbatim.
export function detailChangeCount(report: ReturnType<typeof compareDetails>) {
  const { literals, cells, references } = report
  return (
    literals.removed.length +
    literals.added.length +
    cells.changed.length +
    cells.rowsRemoved.length +
    cells.rowsAdded.length +
    references.removed.length +
    references.added.length +
    references.retargeted.length
  )
}

export function formatDetailsReport(report: ReturnType<typeof compareDetails>) {
  const { literals, cells, references } = report
  const text = JSON.stringify
  const at = (unit: DetailLocation) =>
    `${unit.path}:${unit.line} ${unit.section === '' ? '(no section)' : `§${unit.section}`}${
      unit.column === undefined ? '' : ` column ${text(unit.column)}`
    }`
  const base = (unit: DetailLocation) => `(base ${unit.path}:${unit.line})`
  const row = (unit: DetailRow) => unit.cells.map((cell, index) => `${unit.header[index]}: ${text(cell)}`).join(', ')
  const lines = [
    `Detail comparison: literals removed ${literals.removed.length}, added ${literals.added.length}, moved ${literals.moved.length}; table cells changed ${cells.changed.length}, rows removed ${cells.rowsRemoved.length}, rows added ${cells.rowsAdded.length}, rows moved ${cells.rowsMoved.length}; references removed ${references.removed.length}, added ${references.added.length}, retargeted ${references.retargeted.length}, moved ${references.moved.length}.`,
  ]
  for (const unit of literals.removed) lines.push(`Literal removed ${at(unit)} ${unit.kind}: ${text(unit.text)}`)
  for (const unit of literals.added) lines.push(`Literal added ${at(unit)} ${unit.kind}: ${text(unit.text)}`)
  for (const { before, after } of literals.moved) {
    lines.push(`Literal moved ${at(before)} -> ${at(after)} ${after.kind}: ${text(after.text)}`)
  }
  for (const change of cells.changed) {
    lines.push(
      `Cell changed ${at(change.after)} ${base(change.before)} row ${text(change.row)}: ${text(change.oldText)} -> ${text(change.newText)}`,
    )
  }
  for (const unit of cells.rowsRemoved) lines.push(`Row removed ${at(unit)}: ${row(unit)}`)
  for (const unit of cells.rowsAdded) lines.push(`Row added ${at(unit)}: ${row(unit)}`)
  for (const { before, after } of cells.rowsMoved) {
    lines.push(`Row moved ${at(before)} -> ${at(after)}: row ${text(after.cells[0] ?? '')}`)
  }
  for (const unit of references.removed) {
    lines.push(`Reference removed ${at(unit)}: ${text(unit.reference)} in ${text(unit.sentence)}`)
  }
  for (const unit of references.added) {
    lines.push(`Reference added ${at(unit)}: ${text(unit.reference)} in ${text(unit.sentence)}`)
  }
  for (const { before, after } of references.retargeted) {
    lines.push(
      `Reference retargeted ${at(after)} ${base(before)}: ${text(before.reference)} -> ${text(after.reference)} in ${text(after.sentence)}`,
    )
  }
  for (const { before, after } of references.moved) {
    lines.push(`Reference moved ${at(before)} -> ${at(after)}: ${text(after.reference)} in ${text(after.sentence)}`)
  }
  return lines.join('\n')
}

export function parseDetailsArguments(args: string[]) {
  const options: { ref: string | undefined; file: string | undefined } = { ref: undefined, file: undefined }
  const seen = new Set()
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]!
    const value = args[index + 1]
    if (!['--details', '--file'].includes(option) || seen.has(option) || value === undefined) {
      throw new Error('Usage: --details <git-ref> [--file <repository-relative-file>]')
    }
    seen.add(option)
    if (option === '--details') options.ref = value
    else options.file = value
  }
  assertValidRef(options.ref)
  assertValidFile(options.file)
  return { ...options, ref: options.ref }
}

// Without --file each side is the whole specification, as in the default --verbatim form.
export function runDetails({
  ref,
  file,
  rootDirectory = ROOT,
}: {
  ref: string
  file?: string | undefined
  rootDirectory?: string
}) {
  parseDetailsArguments(['--details', ref, ...(file === undefined ? [] : ['--file', file])])
  const report = compareDetails(
    file === undefined
      ? { before: readSpecificationAtRef(rootDirectory, ref), after: readSpecificationInWorkingTree(rootDirectory) }
      : {
          before: [{ path: file, content: gitShow(rootDirectory, ref, file) }],
          after: [{ path: file, content: readWorkingFile(rootDirectory, file) }],
        },
  )
  return { report, exitCode: detailChangeCount(report) === 0 ? 0 : 1 }
}

export function main(args = process.argv.slice(2)) {
  let group: CheckGroup | undefined
  if (args[0] === '--group') {
    if (args.length !== 2 || !CHECK_GROUPS.includes(args[1] as CheckGroup)) {
      console.error(`Expected --group ${CHECK_GROUPS.join('|')}`)
      return 2
    }
    group = args[1] as CheckGroup
  } else if (args[0] === '--ordered') {
    try {
      const result = runOrdered(parseOrderedArguments(args))
      console.log(formatOrderedReport(result.report))
      return result.exitCode
    } catch (error) {
      console.error(`Ordered comparison failed: ${error instanceof Error ? error.message : String(error)}`)
      return 2
    }
  } else if (args[0] === '--regrouped') {
    try {
      const result = runRegrouped(parseRegroupedArguments(args))
      console.log(formatRegroupedReport(result.report))
      return result.exitCode
    } catch (error) {
      console.error(`Regrouped comparison failed: ${error instanceof Error ? error.message : String(error)}`)
      return 2
    }
  } else if (args[0] === '--details') {
    try {
      const result = runDetails(parseDetailsArguments(args))
      console.log(formatDetailsReport(result.report))
      return result.exitCode
    } catch (error) {
      console.error(`Detail comparison failed: ${error instanceof Error ? error.message : String(error)}`)
      return 2
    }
  } else if (args.length > 0) {
    try {
      const result = runVerbatim(parseVerbatimArguments(args))
      console.log(formatVerbatimReport(result.comparison))
      return result.exitCode
    } catch (error) {
      console.error(`Verbatim comparison failed: ${error instanceof Error ? error.message : String(error)}`)
      return 2
    }
  }
  const { issues, liveDocumentCount } = runChecks(group ? { group } : {})
  if (issues.length > 0) {
    console.error(`Documentation checks failed with ${issues.length} issue(s):`)
    for (const issue of issues) console.error(`  - ${issue}`)
    return 1
  }
  console.log(`Documentation checks passed (${liveDocumentCount} live documents).`)
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
