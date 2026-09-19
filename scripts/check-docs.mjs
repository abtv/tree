import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
  for (const name of ['PRODUCT.md', 'ARCHITECTURE.md', 'DEVELOPMENT.md', 'SECURITY.md']) {
    addIfPresent(join(rootDirectory, 'docs', name))
  }
  const decisions = join(rootDirectory, 'docs', 'decisions')
  if (existsSync(decisions)) {
    for (const entry of readdirSync(decisions, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) documents.add(join(decisions, entry.name))
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
  }
  return { issues, liveDocumentCount: liveDocuments.length }
}

function main() {
  const { issues, liveDocumentCount } = runChecks()
  if (issues.length > 0) {
    console.error(`Documentation checks failed with ${issues.length} issue(s):`)
    for (const issue of issues) console.error(`  - ${issue}`)
    process.exitCode = 1
    return
  }
  console.log(`Documentation checks passed (${liveDocumentCount} live documents).`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
