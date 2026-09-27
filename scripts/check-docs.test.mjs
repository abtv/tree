import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findBrokenLinks,
  findBrokenReferences,
  findProductQuantityRestatements,
  runChecks,
  validateAdr,
  validateAdrIndex,
  validateProductDiscovery,
  validateWorkflowOwnership,
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

describe('validateAdr', () => {
  it('accepts an accepted ADR', () => {
    const result = validateAdr({
      fileName: '0002-example.md',
      content: 'Status: Accepted\nDate: 2026-09-13\n',
      adrNumbers: new Set([2]),
    })
    expect(result.issues).toEqual([])
  })

  it('accepts a superseded ADR whose successor exists', () => {
    const result = validateAdr({
      fileName: '0001-example.md',
      content: 'Status: Superseded by ADR 0002\n',
      adrNumbers: new Set([1, 2]),
    })
    expect(result.issues).toEqual([])
  })

  it('rejects a missing successor and an unknown status', () => {
    const missing = validateAdr({
      fileName: '0001-example.md',
      content: 'Status: Superseded by ADR 0099\n',
      adrNumbers: new Set([1]),
    })
    expect(missing.issues.some((issue) => issue.includes('missing ADR'))).toBe(true)
    const unknown = validateAdr({ fileName: '0003-example.md', content: 'Status: Draft\n', adrNumbers: new Set([3]) })
    expect(unknown.issues.some((issue) => issue.includes('Status must be'))).toBe(true)
  })
})

describe('validateAdrIndex', () => {
  it('requires an entry for every ADR', () => {
    const issues = validateAdrIndex({ content: '[0001](0001-one.md)', adrNumbers: new Set([1, 2]) })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('0002')
  })
})

describe('findBrokenLinks', () => {
  it('ignores external links, anchors, and existing targets', () => {
    const content = '[a](https://example.com) [b](#anchor) [c](docs/ARCHITECTURE.md)'
    const issues = findBrokenLinks({ content, filePath: '/repo/README.md', exists: () => true })
    expect(issues).toEqual([])
  })

  it('reports a missing relative target', () => {
    const issues = findBrokenLinks({
      content: '[gone](docs/MISSING.md)',
      filePath: '/repo/README.md',
      exists: () => false,
    })
    expect(issues[0]).toContain('docs/MISSING.md')
  })
})

describe('findBrokenReferences', () => {
  it('accepts existing ADR references and rejects missing ones', () => {
    const adrNumbers = new Set([4])
    expect(findBrokenReferences({ content: 'See ADR 0004.', displayPath: 'docs/X.md', adrNumbers })).toEqual([])
    expect(findBrokenReferences({ content: 'See ADR 9999.', displayPath: 'docs/X.md', adrNumbers })).toHaveLength(1)
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
})

describe('validateWorkflowOwnership', () => {
  const validAgents =
    '# Agents\n<!-- workflow-policy-owner -->\n<!-- validation-mechanics-reference: docs/DEVELOPMENT.md -->\n'
  const validDevelopment =
    '# Development\n<!-- validation-mechanics-owner -->\n<!-- workflow-policy-reference: AGENTS.md -->\n'

  it('accepts one policy owner and one validation-mechanics owner', () => {
    expect(validateWorkflowOwnership({ agentContent: validAgents, developmentContent: validDevelopment })).toEqual([])
  })

  it('rejects missing or misplaced ownership markers', () => {
    const issues = validateWorkflowOwnership({
      agentContent: `${validAgents}<!-- validation-mechanics-owner -->`,
      developmentContent: '# Development\n<!-- workflow-policy-owner -->\n',
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('validation mechanics are owned'),
        expect.stringContaining('must contain exactly one validation mechanics owner marker'),
        expect.stringContaining('reference to the workflow policy owner'),
        expect.stringContaining('workflow policy is owned'),
      ]),
    )
  })

  it('requires reciprocal owner references', () => {
    const issues = validateWorkflowOwnership({
      agentContent: '# Agents\n<!-- workflow-policy-owner -->\n',
      developmentContent: '# Development\n<!-- validation-mechanics-owner -->\n',
    })
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('reference to the workflow policy owner'),
        expect.stringContaining('reference to the validation mechanics owner'),
      ]),
    )
  })
})

describe('validateProductDiscovery', () => {
  it('requires an explicit non-normative declaration', () => {
    expect(validateProductDiscovery({ content: '> This document is non-normative. Research only.\n' })).toEqual([])
    expect(validateProductDiscovery({ content: '# Product Discovery\n' })).toEqual([
      expect.stringContaining('missing the non-normative product-discovery declaration'),
    ])
  })
})

describe('runChecks', () => {
  it('passes on a minimal repository without a plan archive', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'README.md', '# Fixture\n')
    writeFile(root, 'docs/PRODUCT.md', '# Product\n')
    const result = runChecks({ rootDirectory: root })
    expect(result.issues).toEqual([])
  })

  it('requires every ADR to appear in the ADR index', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'docs/decisions/README.md', '# Decisions\n')
    writeFile(root, 'docs/decisions/0001-first.md', 'Status: Accepted\n')
    const result = runChecks({ rootDirectory: root })
    expect(result.issues.some((issue) => issue.includes('missing an index entry for ADR 0001'))).toBe(true)
  })

  it('checks links in active initiative plans and their index', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'plans/README.md', '[Active](active.md)\n')
    writeFile(root, 'plans/active.md', '[Missing](../docs/MISSING.md)\n')
    const result = runChecks({ rootDirectory: root })
    expect(result.issues).toEqual([expect.stringContaining('plans/active.md: link target not found')])
    expect(result.liveDocumentCount).toBe(2)
  })

  it('governs the product-discovery document as a live document', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'docs/PRODUCT_DISCOVERY.md', '# Discovery\n[missing](MISSING.md)\nNodes remain at level 20.\n')
    const result = runChecks({ rootDirectory: root })
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing the non-normative product-discovery declaration'),
        expect.stringContaining('link target not found'),
        expect.stringContaining('restates the node-depth value'),
      ]),
    )
    expect(result.liveDocumentCount).toBe(1)
  })

  it('accepts a valid product-discovery document', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'docs/PRODUCT_DISCOVERY.md', '# Discovery\n> This document is non-normative.\n')
    const result = runChecks({ rootDirectory: root })
    expect(result.issues).toEqual([])
    expect(result.liveDocumentCount).toBe(1)
  })
})
