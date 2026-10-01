import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  conformanceCitationMatches,
  extractTestTitles,
  findBrokenLinks,
  findBrokenReferences,
  findProductQuantityRestatements,
  findStaleConformanceCitations,
  parseConformanceCitations,
  runChecks,
  validateAdr,
  validateAdrIndex,
  validateOpenQuestions,
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

describe('conformanceCitationMatches', () => {
  it('matches an exact title or a title the citation begins', () => {
    expect(conformanceCitationMatches('runs', 'runs')).toBe(true)
    expect(conformanceCitationMatches('switches modes', 'switches modes and applies edits')).toBe(true)
    expect(conformanceCitationMatches('switches edits', 'switches modes and applies edits')).toBe(false)
  })

  it('treats placeholders as wildcards on either side', () => {
    expect(conformanceCitationMatches('reports asynchronous %s failures', 'reports asynchronous $path failures')).toBe(
      true,
    )
    expect(
      conformanceCitationMatches(
        'clears character Visual endpoints through %s and re-anchors the next motion',
        'clears character Visual endpoints through blur and re-anchors the next motion',
      ),
    ).toBe(true)
    expect(
      conformanceCitationMatches(
        'clears a Normal-mode command before Cmd+.',
        'clears a Normal-mode command before $name',
      ),
    ).toBe(true)
  })

  it('normalizes straight and curly apostrophes', () => {
    expect(
      conformanceCitationMatches(
        'restores a different image’s saved position',
        "restores a different image's saved position after G",
      ),
    ).toBe(true)
  })
})

describe('extractTestTitles', () => {
  it('extracts describe, it, test, test.describe, and .each titles', () => {
    const source = `
      describe('outer', () => {})
      test.describe('group', () => {
        test('a test', () => {})
        it.each(['a', 'b'])('runs %s', () => {})
        it.only('only the test', () => {})
        test.describe.configure({ mode: 'parallel' })
      })
    `
    expect(extractTestTitles(source)).toEqual(['outer', 'group', 'a test', 'runs %s', 'only the test'])
  })
})

describe('parseConformanceCitations', () => {
  it('attributes names to the nearest preceding path in the same cell', () => {
    const content = '| row | `e2e/a.spec.ts`: “one”, “two”; `src/b.test.ts`: “three” | “not a citation” |'
    expect(parseConformanceCitations(content)).toEqual({
      citedPaths: ['e2e/a.spec.ts', 'src/b.test.ts'],
      citations: [
        { path: 'e2e/a.spec.ts', name: 'one' },
        { path: 'e2e/a.spec.ts', name: 'two' },
        { path: 'src/b.test.ts', name: 'three' },
      ],
    })
  })
})

describe('findStaleConformanceCitations', () => {
  function createFixture(files) {
    const root = createTemporaryRoot()
    for (const [relativePath, content] of Object.entries(files)) writeFile(root, relativePath, content)
    return root
  }

  it('accepts a matching title, an .each placeholder, and an apostrophe variant', () => {
    const root = createFixture({
      'src/x.test.ts': [
        "it('matches exactly', () => {})",
        "it.each(['a'])('reports %s failures', () => {})",
        'it("restores a different image\'s saved position after G", () => {})',
      ].join('\n'),
    })
    const content =
      '| Product | `src/x.test.ts`: “matches exactly”, “reports %s failures”, “restores a different image’s saved position” |'
    expect(findStaleConformanceCitations({ content, rootDirectory: root })).toEqual([])
  })

  it('reports a renamed test and a missing file', () => {
    const root = createFixture({ 'src/x.test.ts': "it('new name', () => {})" })
    const content = '| Product | `src/x.test.ts`: “old name”; `src/gone.test.ts`: “anything” |'
    expect(findStaleConformanceCitations({ content, rootDirectory: root })).toEqual([
      expect.stringContaining('cited path not found: src/gone.test.ts'),
      expect.stringContaining('no test titled "old name" in src/x.test.ts'),
    ])
  })

  it('ignores curly-quoted prose that no cited path introduces', () => {
    const root = createFixture({ 'src/x.test.ts': "it('real title', () => {})" })
    const content = [
      'The introduction says “Covered” without citing a path.',
      '| Product | `src/x.test.ts`: “real title” | “stray” |',
    ].join('\n')
    expect(findStaleConformanceCitations({ content, rootDirectory: root })).toEqual([])
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

describe('validateOpenQuestions', () => {
  it('requires an explicit non-normative declaration', () => {
    expect(validateOpenQuestions({ content: '> This document is non-normative. Research only.\n' })).toEqual([])
    expect(validateOpenQuestions({ content: '# Open Questions\n' })).toEqual([
      expect.stringContaining('missing the non-normative open-questions declaration'),
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

  it('governs the open-questions document as a live document', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'docs/OPEN_QUESTIONS.md', '# Questions\n[missing](MISSING.md)\nNodes remain at level 20.\n')
    const result = runChecks({ rootDirectory: root })
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('missing the non-normative open-questions declaration'),
        expect.stringContaining('link target not found'),
        expect.stringContaining('restates the node-depth value'),
      ]),
    )
    expect(result.liveDocumentCount).toBe(1)
  })

  it('accepts a valid open-questions document', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'docs/OPEN_QUESTIONS.md', '# Questions\n> This document is non-normative.\n')
    const result = runChecks({ rootDirectory: root })
    expect(result.issues).toEqual([])
    expect(result.liveDocumentCount).toBe(1)
  })

  it('checks Vim conformance citations as a live document', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'docs/VIM_CONFORMANCE.md', '| Product | `src/x.test.ts`: “missing name” |\n')
    writeFile(root, 'src/x.test.ts', "it('present name', () => {})\n")
    const result = runChecks({ rootDirectory: root })
    expect(result.issues).toEqual([expect.stringContaining('no test titled "missing name"')])
    expect(result.liveDocumentCount).toBe(1)
  })
})
