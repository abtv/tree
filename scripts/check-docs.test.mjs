import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findBrokenLinks,
  findBrokenReferences,
  findProductQuantityRestatements,
  runChecks,
  validatePlan,
} from './check-docs.mjs'

const temporaryDirectories = []

function createTemporaryRoot() {
  const directory = mkdtempSync(join(tmpdir(), 'tree-check-docs-'))
  temporaryDirectories.push(directory)
  return directory
}

function writeFile(root, relativePath, content) {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

describe('validatePlan', () => {
  const validMetadata = 'Status: Completed\nCreated: 2026-09-13\nCompleted: 2026-09-13\n'

  it('accepts a well-formed completed plan', () => {
    const result = validatePlan({
      fileName: '0001-first-plan.md',
      inCompleted: true,
      content: `${validMetadata}\n# First\n`,
    })
    expect(result.issues).toEqual([])
    expect(result.number).toBe(1)
  })

  it('accepts a well-formed active plan', () => {
    const result = validatePlan({
      fileName: '0002-second-plan.md',
      inCompleted: false,
      content: 'Status: Active\nCreated: 2026-09-13\n\n# Second\n',
    })
    expect(result.issues).toEqual([])
  })

  it('rejects an unchecked checkbox in a completed plan', () => {
    const result = validatePlan({
      fileName: '0003-third-plan.md',
      inCompleted: true,
      content: `${validMetadata}\n* [ ] Do a thing\n`,
    })
    expect(result.issues.some((issue) => issue.includes('unchecked checkbox'))).toBe(true)
  })

  it('rejects stale planning phrases in a completed plan', () => {
    const result = validatePlan({
      fileName: '0004-fourth-plan.md',
      inCompleted: true,
      content: `${validMetadata}\nThis commit is planning only.\n`,
    })
    expect(result.issues.some((issue) => issue.includes('stale phrase'))).toBe(true)
  })

  it('rejects missing completion metadata', () => {
    const result = validatePlan({
      fileName: '0005-fifth-plan.md',
      inCompleted: true,
      content: 'Status: Completed\nCreated: 2026-09-13\n',
    })
    expect(result.issues.some((issue) => issue.includes('Completed metadata'))).toBe(true)
  })

  it('rejects a malformed filename', () => {
    const result = validatePlan({ fileName: 'plan-one.md', inCompleted: false, content: 'Status: Active\n' })
    expect(result.number).toBeUndefined()
    expect(result.issues[0]).toContain('filename must match')
  })
})

describe('findBrokenLinks', () => {
  it('ignores external links, anchors, and existing targets', () => {
    const content = '[a](https://example.com) [b](#anchor) [c](docs/ARCHITECTURE.md)'
    const issues = findBrokenLinks({ content, filePath: '/repo/README.md', exists: () => true })
    expect(issues).toEqual([])
  })

  it('reports a missing relative target', () => {
    const content = '[gone](docs/MISSING.md)'
    const issues = findBrokenLinks({ content, filePath: '/repo/README.md', exists: () => false })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('docs/MISSING.md')
  })
})

describe('findBrokenReferences', () => {
  const planNumbers = new Set([43])
  const adrNumbers = new Set([4])

  it('accepts references whose targets exist', () => {
    const content = 'See plan 0043, ADR 0004, docs/plans/completed/0043-example.md.'
    expect(findBrokenReferences({ content, displayPath: 'docs/X.md', planNumbers, adrNumbers })).toEqual([])
  })

  it('reports references whose targets do not exist', () => {
    const content = 'See plan 9999 and ADR 8888.'
    const issues = findBrokenReferences({ content, displayPath: 'docs/X.md', planNumbers, adrNumbers })
    expect(issues).toHaveLength(2)
  })
})

describe('findProductQuantityRestatements', () => {
  it('flags a restated product quantity', () => {
    const issues = findProductQuantityRestatements({
      content: 'Nodes remain available at level 20.',
      displayPath: 'docs/ARCHITECTURE.md',
    })
    expect(issues).toHaveLength(1)
  })

  it('accepts a reference to the owning document', () => {
    const issues = findProductQuantityRestatements({
      content: 'Nodes remain available at the maximum depth in docs/PRODUCT.md.',
      displayPath: 'docs/ARCHITECTURE.md',
    })
    expect(issues).toEqual([])
  })
})

describe('runChecks', () => {
  it('passes on a minimal valid repository fixture', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'README.md', '# Fixture\n')
    writeFile(root, 'docs/PRODUCT.md', '# Product\n')
    writeFile(
      root,
      'docs/plans/completed/0001-first-plan.md',
      'Status: Completed\nCreated: 2026-09-13\nCompleted: 2026-09-13\n\n# First\n',
    )
    const result = runChecks({ rootDirectory: root })
    expect(result.issues).toEqual([])
  })

  it('detects a completed plan that still says the work is pending', () => {
    const root = createTemporaryRoot()
    writeFile(
      root,
      'docs/plans/completed/0001-first-plan.md',
      'Status: Completed\nCreated: 2026-09-13\nCompleted: 2026-09-13\n\nNo fixes have been implemented.\n',
    )
    const result = runChecks({ rootDirectory: root })
    expect(result.issues.some((issue) => issue.includes('no fixes have been implemented'))).toBe(true)
  })
})
