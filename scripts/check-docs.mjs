import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { productOwnText, scanProductBlocks, scanProductSections } from './product-sections.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const PRODUCT_LIMITS = { block: 700, section: 8000 }

export function findOversizedProductText({ content, limits = PRODUCT_LIMITS, displayPath = 'docs/PRODUCT.md' }) {
  const issues = []
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

export function validateAdr({ fileName, content, adrNumbers }) {
  const issues = []
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

export function validateAdrIndex({ content, adrNumbers }) {
  const issues = []
  for (const number of [...adrNumbers].sort((left, right) => left - right)) {
    const padded = String(number).padStart(4, '0')
    if (!content.includes(`](${padded}-`)) {
      issues.push(`docs/decisions/README.md: missing an index entry for ADR ${padded}`)
    }
  }
  return issues
}

export function findBrokenLinks({ content, filePath, displayPath = filePath, exists = existsSync }) {
  const issues = []
  const baseDirectory = dirname(filePath)
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    const withoutAnchor = target.split('#')[0]
    if (withoutAnchor === '') continue
    if (!exists(resolve(baseDirectory, withoutAnchor))) {
      issues.push(`${displayPath}: link target not found: ${target}`)
    }
  }
  return issues
}

export function findBrokenReferences({ content, displayPath, adrNumbers }) {
  const issues = []
  const requireAdr = (label, number) => {
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

export function findProductQuantityRestatements({ content, displayPath }) {
  const issues = []
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

function normalizeConformanceText(value) {
  return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
}

function tokenizeConformancePattern(value) {
  const units = []
  let lastIndex = 0
  CONFORMANCE_PLACEHOLDER.lastIndex = 0
  let match
  const pushLiteral = (text) => {
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

function matchConformanceUnits(nameUnits, titleUnits, nameIndex = 0, titleIndex = 0) {
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

export function conformanceCitationMatches(name, title) {
  return matchConformanceUnits(
    tokenizeConformancePattern(normalizeConformanceText(name)),
    tokenizeConformancePattern(normalizeConformanceText(title)),
  )
}

export function parseConformanceCitations(content) {
  const citedPaths = []
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
          citations.push({ path: currentPath, name: match[2] })
        }
      }
    }
  }
  return { citedPaths, citations }
}

function skipTrivia(source, index) {
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

function skipComment(source, index) {
  if (source[index + 1] === '/') {
    const end = source.indexOf('\n', index)
    return end === -1 ? source.length : end + 1
  }
  const end = source.indexOf('*/', index + 2)
  return end === -1 ? source.length : end + 2
}

function skipQuoted(source, quoteIndex) {
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

function skipTemplateLiteral(source, backtickIndex) {
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

function skipBalanced(source, openIndex) {
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

function readStringLiteral(source, index) {
  const quote = source[index]
  if (quote === '`') {
    return source.slice(index + 1, skipTemplateLiteral(source, index) - 1)
  }
  if (quote !== "'" && quote !== '"') return undefined
  const end = skipQuoted(source, index)
  return source.slice(index + 1, end - 1).replace(/\\(['"\\])/g, '$1')
}

export function extractTestTitles(source) {
  const titles = []
  TEST_KEYWORD.lastIndex = 0
  let match
  while ((match = TEST_KEYWORD.exec(source)) !== null) {
    let index = match.index + match[1].length
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
  readFile = (filePath) => readFileSync(filePath, 'utf8'),
  exists = existsSync,
} = {}) {
  const { citedPaths, citations } = parseConformanceCitations(content)
  const issues = []
  const titlesByPath = new Map()
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

export function validateWorkflowOwnership({ agentContent, developmentContent }) {
  const issues = []
  const count = (content, marker) => content.split(marker).length - 1
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

export function validateOpenQuestions({ content, displayPath = 'docs/OPEN_QUESTIONS.md' }) {
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
])

function collectLiveDocuments(rootDirectory) {
  const documents = new Set()
  const addIfPresent = (filePath) => {
    if (existsSync(filePath)) documents.add(filePath)
  }
  for (const name of ['README.md', 'AGENTS.md', 'SECURITY.md']) addIfPresent(join(rootDirectory, name))
  for (const name of [
    'PRODUCT.md',
    'OPEN_QUESTIONS.md',
    'ARCHITECTURE.md',
    'DEVELOPMENT.md',
    'SECURITY.md',
    'VIM_CONFORMANCE.md',
  ]) {
    addIfPresent(join(rootDirectory, 'docs', name))
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
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue
        walk(join(directory, entry.name))
      } else if (entry.name === 'AGENTS.md') {
        documents.add(join(directory, entry.name))
      }
    }
  }
  walk(rootDirectory)
  return [...documents]
}

export function runChecks({ rootDirectory = ROOT } = {}) {
  const issues = []
  const adrNumbers = new Set()
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
  for (const fileName of adrFiles) {
    const content = readFileSync(join(decisionsDirectory, fileName), 'utf8')
    issues.push(...validateAdr({ fileName, content, adrNumbers }).issues)
  }
  if (adrFiles.length > 0) {
    const adrIndexPath = join(decisionsDirectory, 'README.md')
    if (existsSync(adrIndexPath)) {
      issues.push(...validateAdrIndex({ content: readFileSync(adrIndexPath, 'utf8'), adrNumbers }))
    } else {
      issues.push('docs/decisions/README.md: missing ADR index')
    }
  }
  const liveDocuments = collectLiveDocuments(rootDirectory)
  for (const filePath of liveDocuments) {
    const displayPath = filePath.startsWith(`${rootDirectory}/`) ? filePath.slice(rootDirectory.length + 1) : filePath
    const content = readFileSync(filePath, 'utf8')
    issues.push(...findBrokenLinks({ content, filePath, displayPath }))
    issues.push(...findBrokenReferences({ content, displayPath, adrNumbers }))
    if (!displayPath.endsWith('PRODUCT.md')) {
      issues.push(...findProductQuantityRestatements({ content, displayPath }))
    }
    if (displayPath === 'docs/OPEN_QUESTIONS.md') {
      issues.push(...validateOpenQuestions({ content, displayPath }))
    }
    if (displayPath === 'docs/PRODUCT.md') {
      issues.push(...findOversizedProductText({ content, displayPath }))
    }
    if (displayPath === CONFORMANCE_DOCUMENT) {
      issues.push(...findStaleConformanceCitations({ content, rootDirectory, displayPath }))
    }
  }
  const agentPath = join(rootDirectory, 'AGENTS.md')
  const developmentPath = join(rootDirectory, 'docs', 'DEVELOPMENT.md')
  if (existsSync(agentPath) && existsSync(developmentPath)) {
    issues.push(
      ...validateWorkflowOwnership({
        agentContent: readFileSync(agentPath, 'utf8'),
        developmentContent: readFileSync(developmentPath, 'utf8'),
      }),
    )
  }
  return { issues, liveDocumentCount: liveDocuments.length }
}

export function parseVerbatimArguments(args) {
  const options = { ref: undefined, file: 'docs/PRODUCT.md', allowAdded: 0 }
  const seen = new Set()
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]
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
  if (!options.ref || options.ref.startsWith('-') || !/^[\w./~^@{}-]+$/.test(options.ref)) {
    throw new Error('Invalid git ref')
  }
  if (
    !/^[\w./-]+$/.test(options.file) ||
    options.file.startsWith('/') ||
    options.file.startsWith('-') ||
    options.file.split('/').some((part) => part === '..' || part === '' || part === '.')
  ) {
    throw new Error('Invalid repository-relative file')
  }
  return options
}

export function scanVerbatimUnits(content) {
  const units = []
  const headings = []
  let heading = '(before first heading)'
  let pending = []
  let fence
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
      if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) {
        units.push({ kind: 'fence', text: fencedText, heading })
        fence = undefined
        fencedText = ''
      }
      continue
    }
    const rawOpening = !comment && /^\s*(`{3,}|~{3,})/.exec(line)
    if (rawOpening) {
      flush()
      fence = { character: rawOpening[1][0], length: rawOpening[1].length }
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
      fence = { character: opening[1][0], length: opening[1].length }
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

export function compareVerbatim(before, after) {
  const oldText = scanVerbatimUnits(before)
  const newText = scanVerbatimUnits(after)
  const keyOf = (unit) => JSON.stringify([unit.kind, unit.text])
  const group = (units, key = keyOf) => {
    const result = new Map()
    for (const unit of units) {
      const id = key(unit)
      if (!result.has(id)) result.set(id, [])
      result.get(id).push(unit)
    }
    return result
  }
  const oldGroups = group(oldText.units)
  const newGroups = group(newText.units)
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
      moved.push({ ...remainingNew[index], from: remainingOld[index].heading })
    }
    removed.push(...remainingOld.slice(matches))
    added.push(...remainingNew.slice(matches))
  }
  const oldHeadings = group(oldText.headings, (heading) => heading)
  const newHeadings = group(newText.headings, (heading) => heading)
  const difference = (left, right) => [...left].flatMap(([id, items]) => items.slice(right.get(id)?.length ?? 0))
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

export function runVerbatim({ ref, file, allowAdded = 0, rootDirectory = ROOT }) {
  // Validate exported API arguments as well as the CLI. Git is invoked without a shell.
  parseVerbatimArguments(['--verbatim', ref, '--file', file, '--allow-added', String(allowAdded)])
  const path = realpathSync(join(rootDirectory, file))
  const withinRoot = relative(realpathSync(rootDirectory), path)
  if (withinRoot === '..' || withinRoot.startsWith('../')) throw new Error('File resolves outside the repository')
  const before = execFileSync('git', ['show', `${ref}:${file}`], {
    cwd: rootDirectory,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const after = readFileSync(path, 'utf8')
  const comparison = compareVerbatim(before, after)
  return { comparison, exitCode: comparison.removed.length === 0 && comparison.added.length <= allowAdded ? 0 : 1 }
}

export function formatVerbatimReport(report) {
  const lines = [
    `Verbatim comparison: before ${report.before}, after ${report.after}, unchanged ${report.unchanged}, removed ${report.removed.length}, added ${report.added.length}.`,
  ]
  for (const [label, units] of [
    ['Removed', report.removed],
    ['Added', report.added],
  ]) {
    for (const unit of units) lines.push(`${label} [${unit.heading}] ${unit.kind}: ${JSON.stringify(unit.text)}`)
  }
  for (const heading of report.headingsRemoved) lines.push(`Heading removed: ${heading}`)
  for (const heading of report.headingsAdded) lines.push(`Heading added: ${heading}`)
  for (const unit of report.moved)
    lines.push(`Moved [${unit.from} -> ${unit.heading}] ${unit.kind}: ${JSON.stringify(unit.text)}`)
  for (const unit of report.antecedents) lines.push(`Antecedent [${unit.heading}]: ${JSON.stringify(unit.text)}`)
  return lines.join('\n')
}

export function main(args = process.argv.slice(2)) {
  if (args.length > 0) {
    try {
      const result = runVerbatim(parseVerbatimArguments(args))
      console.log(formatVerbatimReport(result.comparison))
      return result.exitCode
    } catch (error) {
      console.error(`Verbatim comparison failed: ${error.message}`)
      return 2
    }
  }
  const { issues, liveDocumentCount } = runChecks()
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
