import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The categories are defined in docs/DEVELOPMENT.md §8. Every category is final: a spec whose
// behavior can differ between the editing modes must be converted to `both` rather than parked.
export const CATEGORIES = new Set(['both', 'vim', 'independent', 'explicit'])

export const EXPLICIT_FILES = new Set(['e2e/vim-toggle.spec.ts'])

const HELPER = 'describeForEachEditingMode'
const MARKER = /^\/\/ @editing-modes: (\S+)\s*$/

export function checkEditingModes({ files, categories = CATEGORIES, explicitFiles = EXPLICIT_FILES }) {
  const issues = []
  for (const { path, content } of files) {
    const firstLine = content.split(/\r?\n/, 1)[0]
    const match = MARKER.exec(firstLine)
    if (!match) {
      issues.push(`${path}: the first line must be "// @editing-modes: <category>"`)
      continue
    }
    const category = match[1]
    if (!categories.has(category)) {
      issues.push(`${path}: unknown editing-mode category "${category}"`)
      continue
    }
    const usesHelper = new RegExp(`\\b${HELPER}\\s*\\(`).test(content)
    if (category === 'both' && !usesHelper) issues.push(`${path}: a "both" spec must call ${HELPER}`)
    if (category !== 'both' && usesHelper) issues.push(`${path}: only a "both" spec may call ${HELPER}`)
    if (category === 'explicit' && !explicitFiles.has(path)) {
      issues.push(`${path}: only ${[...explicitFiles].join(', ')} may use the "explicit" category`)
    }
    if (category !== 'explicit' && explicitFiles.has(path)) issues.push(`${path}: must use the "explicit" category`)
  }
  return { issues, specCount: files.length }
}

export function runChecks({ rootDirectory = ROOT } = {}) {
  const files = []
  const walk = (directory) => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      // `_*.spec.ts` files are temporary diagnostics (e2e/AGENTS.md) and are not part of the suite.
      else if (entry.isFile() && /\.spec\.ts$/.test(entry.name) && !entry.name.startsWith('_')) {
        files.push({ path: relative(rootDirectory, path).split('\\').join('/'), content: readFileSync(path, 'utf8') })
      }
    }
  }
  walk(join(rootDirectory, 'e2e'))
  return checkEditingModes({ files })
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { issues, specCount } = runChecks()
  if (issues.length > 0) {
    console.error(`E2E editing-mode checks failed (${issues.length} issues):`)
    for (const issue of issues) console.error(`  - ${issue}`)
    process.exitCode = 1
  } else console.log(`E2E editing-mode checks passed (${specCount} specs).`)
}
