import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const PLAN_FILE_PATTERN = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const ADR_FILE_PATTERN = /^(\d{4})-[a-z0-9-]+\.md$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const COMPLETED_FORBIDDEN_PHRASES = [
  'suggested resume prompt',
  'planning only',
  'prepares the plan only',
  'remain outstanding',
  'remains outstanding',
  'no fixes have been implemented',
  'implementation checklist remains outstanding',
]

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

export function parsePlanMetadata(content) {
  const metadata = {}
  for (const key of ['Status', 'Created', 'Completed']) {
    const match = content.match(new RegExp(`^${key}:\\s*(\\S.*)$`, 'm'))
    if (match) metadata[key.toLowerCase()] = match[1].trim()
  }
  return metadata
}

export function validatePlan({ fileName, inCompleted, content }) {
  const issues = []
  const match = PLAN_FILE_PATTERN.exec(fileName)
  if (!match) {
    return { issues: [`${fileName}: filename must match NNNN-short-description.md`], number: undefined }
  }
  const number = Number(match[1])
  const metadata = parsePlanMetadata(content)
  if (!metadata.status) {
    issues.push(`${fileName}: missing Status metadata`)
  } else if (metadata.status !== 'Active' && metadata.status !== 'Completed') {
    issues.push(`${fileName}: Status must be Active or Completed`)
  }
  if (!metadata.created) {
    issues.push(`${fileName}: missing Created metadata`)
  } else if (!DATE_PATTERN.test(metadata.created)) {
    issues.push(`${fileName}: Created must use YYYY-MM-DD`)
  }
  if (inCompleted) {
    if (metadata.status !== 'Completed') issues.push(`${fileName}: a completed plan must have Status: Completed`)
    if (!metadata.completed) {
      issues.push(`${fileName}: a completed plan must have Completed metadata`)
    } else if (!DATE_PATTERN.test(metadata.completed)) {
      issues.push(`${fileName}: Completed must use YYYY-MM-DD`)
    }
    if (/^[-*]\s+\[ \]/m.test(content)) {
      issues.push(`${fileName}: a completed plan must not contain unchecked checkboxes`)
    }
    const lower = content.toLowerCase()
    for (const phrase of COMPLETED_FORBIDDEN_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push(`${fileName}: a completed plan must not contain the stale phrase "${phrase}"`)
      }
    }
  } else if (metadata.status !== 'Active') {
    issues.push(`${fileName}: an active plan must have Status: Active`)
  }
  return { issues, number }
}

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

export function findBrokenReferences({ content, displayPath, planNumbers, adrNumbers }) {
  const issues = []
  const requireNumber = (label, number) => {
    if (!planNumbers.has(number))
      issues.push(`${displayPath}: ${label} references missing plan ${String(number).padStart(4, '0')}`)
  }
  const requireAdr = (label, number) => {
    if (!adrNumbers.has(number))
      issues.push(`${displayPath}: ${label} references missing ADR ${String(number).padStart(4, '0')}`)
  }
  for (const match of content.matchAll(/docs\/plans\/(?:active|completed)\/(\d{4})-[a-z0-9-]+\.md/g)) {
    requireNumber('path', Number(match[1]))
  }
  for (const match of content.matchAll(/docs\/decisions\/(\d{4})-[a-z0-9-]+\.md/g)) {
    requireAdr('path', Number(match[1]))
  }
  for (const match of content.matchAll(/\bplan\s+(\d{4})\b/gi)) {
    requireNumber('prose', Number(match[1]))
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
  addIfPresent(join(rootDirectory, 'docs', 'plans', 'README.md'))
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
        if (entry.name === 'plans' && directory === join(rootDirectory, 'docs')) continue
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
  const warnings = []
  const planNumbers = new Set()
  let planCount = 0
  for (const [relativeDirectory, inCompleted] of [
    ['docs/plans/active', false],
    ['docs/plans/completed', true],
  ]) {
    const directory = join(rootDirectory, relativeDirectory)
    if (!existsSync(directory)) continue
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      planCount += 1
      const content = readFileSync(join(directory, entry.name), 'utf8')
      const result = validatePlan({ fileName: entry.name, inCompleted, content })
      issues.push(...result.issues)
      if (result.number !== undefined) {
        if (planNumbers.has(result.number))
          issues.push(`duplicate plan number ${String(result.number).padStart(4, '0')}`)
        planNumbers.add(result.number)
      }
    }
  }
  const orderedNumbers = [...planNumbers].sort((left, right) => left - right)
  for (let index = 0; index < orderedNumbers.length; index += 1) {
    if (orderedNumbers[index] !== index + 1) {
      warnings.push(
        `plan numbering gap: expected ${String(index + 1).padStart(4, '0')} but found ${String(orderedNumbers[index]).padStart(4, '0')}`,
      )
      break
    }
  }
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
    issues.push(...findBrokenReferences({ content, displayPath, planNumbers, adrNumbers }))
    if (!displayPath.endsWith('PRODUCT.md')) {
      issues.push(...findProductQuantityRestatements({ content, displayPath }))
    }
  }
  return { issues, warnings, planCount, liveDocumentCount: liveDocuments.length }
}

function main() {
  const { issues, warnings, planCount, liveDocumentCount } = runChecks()
  for (const warning of warnings) console.warn(`Warning: ${warning}`)
  if (issues.length > 0) {
    console.error(`Documentation checks failed with ${issues.length} issue(s):`)
    for (const issue of issues) console.error(`  - ${issue}`)
    process.exitCode = 1
    return
  }
  console.log(`Documentation checks passed (${planCount} plans, ${liveDocumentCount} live documents).`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
