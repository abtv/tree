import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  conformanceCitationMatches,
  compareDetails,
  compareOrderedSections,
  compareVerbatim,
  detailChangeCount,
  extractDetailLiterals,
  extractDetailReferences,
  formatDetailsReport,
  formatOrderedReport,
  formatVerbatimReport,
  extractTestTitles,
  findBrokenLinks,
  findBrokenReferences,
  findScratchDependencies,
  findProductQuantityRestatements,
  findOversizedProductText,
  findStaleConformanceCitations,
  findTextBeforeFirstSection,
  parseConformanceCitations,
  parseDetailsArguments,
  parseOrderedArguments,
  parseVerbatimArguments,
  runChecks,
  runDetails,
  runOrdered,
  runVerbatim,
  main,
  validateAdr,
  validateAdrIndex,
  validateOpenQuestions,
  validateProductIndex,
  validateWorkflowOwnership,
  validateAgentCore,
  AGENT_CORE_MAX_BYTES,
} from './check-docs.mts'
import { productOwnText, scanProductBlocks, scanProductSections } from './product-sections.mts'

describe('verbatim comparison', () => {
  const original = '## 1. Rules\nFirst rule. Second rule; Third rule: Fourth rule!\n'

  it('compares identical text and counts every occurrence', () => {
    const result = compareVerbatim(original, original)

    expect(result).toMatchObject({ before: 4, after: 4, unchanged: 4, removed: [], added: [], moved: [] })
  })

  it('preserves clauses when paragraphs become items, final punctuation changes, and items regroup', () => {
    const result = compareVerbatim(
      original,
      '## 1. Rules\n* First rule;\n* Second rule.\n\n### New Group\n- Third rule.\n1. Fourth rule!\n',
    )

    expect(result.removed).toEqual([])
    expect(result.added).toEqual([])
    expect(result.headingsAdded).toEqual(['### New Group'])
    expect(result.moved.map(({ text, from, heading }) => [text, from, heading])).toEqual([
      ['Third rule', '## 1. Rules', '### New Group'],
      ['Fourth rule!', '## 1. Rules', '### New Group'],
    ])
    expect(compareVerbatim('* First rule;\n* Second rule.\n', 'First rule; Second rule.\n').removed).toEqual([])
  })

  it('allows a leading label to become a heading but preserves leading bold emphasis', () => {
    expect(compareVerbatim('**Context.** Keep the rule.\n', '### Context\nKeep the rule.\n').removed).toEqual([])
    expect(compareVerbatim('**Always** save changes.\n', 'save changes.\n').removed).toHaveLength(1)
  })

  it('detects changed words, dropped sentences, duplicate sentences, and added sentences', () => {
    const changed = compareVerbatim('First rule. Second rule.\n', 'First rule. Another rule.\n')

    expect(changed.removed.map(({ text }) => text)).toEqual(['Second rule'])
    expect(changed.added.map(({ text }) => text)).toEqual(['Another rule'])
    expect(compareVerbatim('First rule. Second rule.\n', 'First rule.\n').removed).toHaveLength(1)
    expect(compareVerbatim('First rule.\n', 'First rule. First rule.\n').added).toHaveLength(1)
    expect(compareVerbatim('First rule.\n', 'First rule. New rule.\n').added).toHaveLength(1)
  })

  it('normalizes CRLF prose, abbreviations, whitespace, and ignored Markdown', () => {
    const before = '## Old Heading\r\nUse e.g. this rule.\r\n\r\n<!-- hidden\r\n## Fake\r\n-->\r\n---\r\n'

    const result = compareVerbatim(before, '## New Heading\n* Use e.g. this   rule.\n')

    expect(result.removed).toEqual([])
    expect(result.added).toEqual([])
    expect(result.headingsRemoved).toEqual(['## Old Heading'])
    expect(result.headingsAdded).toEqual(['## New Heading'])
  })

  it('compares fenced blocks exactly while allowing them to move', () => {
    const code = '````js\n<!-- keep -->\n## Code Heading\n```\nconst x = 1;\n````\n'
    const before = `## One\n${code}`

    const moved = compareVerbatim(before, `## Two\n${code}`)

    expect(moved).toMatchObject({ before: 1, after: 1, unchanged: 1, removed: [], added: [] })
    expect(moved.moved[0]).toMatchObject({ kind: 'fence', text: code, from: '## One', heading: '## Two' })
    expect(compareVerbatim(before, before.replace('x = 1', 'x = 2')).removed).toHaveLength(1)
    expect(compareVerbatim(before, before.replace('<!-- keep -->', '<!-- changed -->')).added).toHaveLength(1)
    expect(compareVerbatim(before, before.replaceAll('\n', '\r\n')).removed).toHaveLength(1)
    expect(compareVerbatim('~~~\ntext\n', '~~~\nchanged\n').removed).toHaveLength(1)
  })

  it('does not treat comment-contained fences and headings as Markdown structure', () => {
    const result = compareVerbatim('<!--\n```\n## False\n-->\nReal rule.\n', 'Real rule.\n')

    expect(result).toMatchObject({ before: 1, after: 1, removed: [], added: [], headingsRemoved: [] })
    expect(compareVerbatim('Keep <!--\nhidden\n--> this rule.\n', 'Keep this rule.\n')).toMatchObject({
      removed: [],
      added: [],
    })

    const openingComment = '```html <!--\ncode\n```\n'

    expect(compareVerbatim(openingComment + 'First rule.\n', openingComment + 'Changed rule.\n')).toMatchObject({
      removed: [{ kind: 'clause', text: 'First rule', heading: '(before first heading)' }],
      added: [{ kind: 'clause', text: 'Changed rule', heading: '(before first heading)' }],
    })
  })

  it('documents prescribed normalization limits for internal punctuation and same-heading rule order', () => {
    const before = 'First rule. Second rule.\n'

    expect(compareVerbatim(before, 'First rule: Second rule.\n')).toMatchObject({ removed: [], added: [] })
    expect(compareVerbatim(before, 'Second rule. First rule.\n')).toMatchObject({ removed: [], added: [], moved: [] })
  })

  it('matches duplicates in unchanged headings first and reports every antecedent clause', () => {
    const result = compareVerbatim(
      '## One\nRule above.\n## Two\nRule above.\n',
      '## Two\nRule above.\n## Three\nRule above.\n',
    )

    expect(result.moved).toEqual([{ kind: 'clause', text: 'Rule above', from: '## One', heading: '## Three' }])
    expect(result.antecedents).toHaveLength(2)

    const all = compareVerbatim('', 'Above, below, preceding, following, earlier, later, this section, the rule.\n')

    expect(all.antecedents).toHaveLength(1)

    const report = formatVerbatimReport(result)

    expect(report).toContain('removed 0, added 0')
    expect(report).toContain('Heading removed: ## One')
    expect(report).toContain('Moved [## One -> ## Three]')
    expect(report).toContain('Antecedent [## Three]')
  })
})

describe('verbatim CLI and Git loading', () => {
  it.each(['bad:ref', '-HEAD', 'HEAD;touch', 'HEAD$(pwd)', ''])('rejects invalid or option-like refs: %s', (ref) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(main(['--verbatim', ref])).toBe(2)
    } finally {
      error.mockRestore()
    }
  })

  it('validates files and addition bounds and rejects unknown, repeated, or incomplete options', () => {
    expect(
      parseVerbatimArguments(['--verbatim', 'HEAD~1', '--file', 'docs/VIM_CONFORMANCE.md', '--allow-added', '2']),
    ).toEqual({ ref: 'HEAD~1', file: 'docs/VIM_CONFORMANCE.md', allowAdded: 2 })
    for (const args of [
      ['--verbatim'],
      ['--file', 'docs/PRODUCT.md'],
      ['--unknown', 'HEAD'],
      ['--verbatim', 'HEAD', '--verbatim', 'HEAD'],
      ...['../file', '/tmp/file', 'docs/../file', '-file', 'docs/file:other'].map((file) => [
        '--verbatim',
        'HEAD',
        '--file',
        file,
      ]),
      ...['-1', '1.5', 'NaN', '9007199254740992'].map((n) => ['--verbatim', 'HEAD', '--allow-added', n]),
    ])
      expect(() => parseVerbatimArguments(args)).toThrow()
  })

  it('reads a real Git revision and allows additions only within the explicit bound', () => {
    const root = createTemporaryRoot()
    const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })

    git(['init', '--quiet'])
    writeFile(root, 'docs/PRODUCT.md', '## One\nKeep this rule.\n')
    git(['add', 'docs/PRODUCT.md'])
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'docs(fixture): add synthetic rules',
    ])

    expect(runVerbatim({ ref: 'HEAD', file: 'docs/PRODUCT.md', rootDirectory: root }).exitCode).toBe(0)

    writeFile(root, 'docs/PRODUCT.md', '## One\nNormal mode also supports:\n* Keep this rule.\n')
    const options = { ref: 'HEAD', file: 'docs/PRODUCT.md', rootDirectory: root }

    expect(runVerbatim(options).exitCode).toBe(1)
    expect(runVerbatim({ ...options, allowAdded: 1 }).exitCode).toBe(0)

    writeFile(root, 'docs/PRODUCT.md', 'Normal mode also supports:\n')

    expect(runVerbatim({ ...options, allowAdded: 10 }).exitCode).toBe(1)
    expect(() => runVerbatim({ ...options, ref: 'missing' })).toThrow()
    expect(() => runVerbatim({ ...options, file: 'docs/missing.md' })).toThrow()
  })

  it('returns process exit 2 for bad refs and missing files', () => {
    const script = join(import.meta.dirname, 'check-docs.mts')
    for (const args of [
      ['--verbatim', '-HEAD'],
      ['--verbatim', 'bad:ref'],
      ['--verbatim', 'HEAD', '--file', 'docs/missing.md'],
    ]) {
      const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })

      expect(result.status).toBe(2)
      expect(result.stderr).toContain('Verbatim comparison failed:')
    }
  })

  it('rejects a file symlink that resolves outside the repository', () => {
    const root = createTemporaryRoot()
    const outside = createTemporaryRoot()

    writeFile(outside, 'rules.md', 'External text.\n')
    symlinkSync(join(outside, 'rules.md'), join(root, 'rules.md'))

    expect(() => runVerbatim({ ref: 'HEAD', file: 'rules.md', rootDirectory: root })).toThrow('outside the repository')
  })
})

describe('PRODUCT scanning and size limits', () => {
  const scan = (text: string) =>
    scanProductBlocks(text.split('\n').map((text: string, index: number) => ({ number: index + 1, text })))
  const checkSize = (content: string, options: Partial<Parameters<typeof findOversizedProductText>[0]> = {}) =>
    findOversizedProductText({ content, ...options })

  it('scans levels two through four with original line numbers and ignores comments and fenced headings', () => {
    const sections = scanProductSections(
      '## 1. Parent\n<!--\n### 9.9 Hidden\n-->\n### 1.1 Child\n~~~~\n#### 9.9.9 Hidden\n~~~\n~~~~\n#### 1.1.1 Leaf\nRule',
    )

    expect(sections.map(({ id, level, startLine }) => [id, level, startLine])).toEqual([
      ['1', 2, 1],
      ['1.1', 3, 5],
      ['1.1.1', 4, 10],
    ])
    expect(sections[2]!.lines).toEqual([{ number: 11, text: 'Rule' }])
  })

  it('counts paragraphs, each list item with its continuation, and table rows separately', () => {
    expect(scan('First\nsecond\n\n* One\n  continued\n- Two\n3. Three\n\n| A | B |\n| C | D |')).toEqual([
      { kind: 'paragraph', startLine: 1, text: 'First second' },
      { kind: 'list item', startLine: 4, text: 'One continued' },
      { kind: 'list item', startLine: 6, text: 'Two' },
      { kind: 'list item', startLine: 7, text: 'Three' },
      { kind: 'table row', startLine: 9, text: '| A | B |' },
      { kind: 'table row', startLine: 10, text: '| C | D |' },
    ])
    expect(scan('# Heading\n<!-- ignored -->\n---\n```\n' + 'x'.repeat(900) + '\n```')).toEqual([])
    expect(scan('Rule <!-- hidden -->ends')[0]!.text).toBe('Rule ends')
  })

  it('accepts the exact block limit and reports one character over with its section and line', () => {
    expect(checkSize('## 1. One\n' + 'x'.repeat(700))).toEqual([])
    expect(checkSize('## 1. One\n' + 'x'.repeat(701))).toEqual([
      'docs/PRODUCT.md:2 (§1): paragraph has 701 characters; the limit is 700. Split it into one rule per list item without rewording (docs/DEVELOPMENT.md §12).',
    ])
    expect(checkSize('## 1. One\n* ' + 'x'.repeat(400) + '\n* ' + 'x'.repeat(400))).toEqual([])
  })

  it('counts only own section text, including unnumbered headings and fences', () => {
    const content =
      '## 1. Parent\n<!-- hidden -->\n---\n### 1.1 Child\n#### Example\n```\nabc\n```\n#### 1.1.1 Leaf\nxyz'
    const sections = scanProductSections(content)

    expect(productOwnText(sections[0]!.lines)).toBe('')
    expect(productOwnText(sections[1]!.lines)).toBe('#### Example\n```\nabc\n```')
    expect(checkSize(content, { limits: { block: 700, section: 23 } })).toEqual([
      'docs/PRODUCT.md §1.1: 24 characters of own text; the limit is 23. Split it into numbered subsections (docs/DEVELOPMENT.md §12).',
    ])
    expect(checkSize(content, { limits: { block: 700, section: 24 } })).toEqual([])
  })

  it('applies both limits in every section, whatever its number', () => {
    const content = '## 20.2. Vim\n' + 'x'.repeat(8001) + '\n### 20.2.1 Leaf\n' + 'y'.repeat(701)

    expect(checkSize(content)).toEqual([
      'docs/PRODUCT.md:2 (§20.2): paragraph has 8001 characters; the limit is 700. Split it into one rule per list item without rewording (docs/DEVELOPMENT.md §12).',
      'docs/PRODUCT.md §20.2: 8001 characters of own text; the limit is 8000. Split it into numbered subsections (docs/DEVELOPMENT.md §12).',
      'docs/PRODUCT.md:4 (§20.2.1): paragraph has 701 characters; the limit is 700. Split it into one rule per list item without rewording (docs/DEVELOPMENT.md §12).',
    ])
  })

  it('runs without PRODUCT and passes a title-only PRODUCT', () => {
    const root = createTemporaryRoot()

    expect(runChecks({ rootDirectory: root }).issues).toEqual([])

    writeFile(root, 'docs/PRODUCT.md', '# Product\n')

    expect(runChecks({ rootDirectory: root }).issues).toEqual([])
  })

  it('fails runChecks on an over-limit paragraph in PRODUCT', () => {
    const root = createTemporaryRoot()

    writeFile(root, 'docs/PRODUCT.md', '# Product\n\n## 1. One\n\n' + 'x'.repeat(701) + '\n')

    expect(runChecks({ rootDirectory: root }).issues).toEqual([
      'docs/PRODUCT.md:5 (§1): paragraph has 701 characters; the limit is 700. Split it into one rule per list item without rewording (docs/DEVELOPMENT.md §12).',
    ])
  })
})

const temporaryDirectories: string[] = []

function createTemporaryRoot() {
  const directory = mkdtempSync(join(tmpdir(), 'tree-check-docs-'))
  temporaryDirectories.push(directory)
  return directory
}

function writeFile(root: string, relativePath: string, content: string) {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
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

describe('scratch dependencies', () => {
  const check = (content: string, allowTemporary = false) =>
    findScratchDependencies({ content, displayPath: 'docs/NOTES.md', allowTemporary })

  it.each([
    'Evidence: `.scratch/task/evidence.md`.',
    '[Evidence](../.scratch/task/evidence.md)',
    '[Evidence][result]\n[result]: ../.scratch/task/result.json',
    '<../.scratch/task/screenshot.png>',
    '[Evidence](../%2escratch/task/result%2Ejson)',
    'Read `.scratch/task/latest`.',
  ])('rejects a permanent dependency: %s', (content) => {
    expect(check(content)).toEqual([expect.stringContaining('docs/NOTES.md:')])
  })

  it('reports the original line number and allows temporary continuation evidence', () => {
    expect(check('Heading\n\nRead `.scratch/task/evidence.md`.')[0]).toContain('docs/NOTES.md:3:')
    expect(check('Read `.scratch/task/evidence.md`.', true)).toEqual([])
  })

  it('allows command examples, placeholders, directory locations, and external URLs', () => {
    expect(
      check(
        [
          'Profiles live under `.scratch/task/`.',
          'Write `.scratch/<task>/report.json`.',
          'Run `node .scratch/task/probe.mjs`.',
          'Run `npm run test:e2e:diagnose -- --json-output=.scratch/task/report.json`.',
          '```sh\nnode .scratch/task/probe.mjs\n```',
          '[External](https://example.com/.scratch/task/report.json)',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('does not let an example command hide another dependency on the same line', () => {
    expect(check('Run `node .scratch/task/probe.mjs`; read `.scratch/task/evidence.md`.')).toHaveLength(1)
  })

  it('checks Markdown outside the central live-document list', () => {
    const root = createTemporaryRoot()

    writeFile(root, 'src/web/README.md', 'Read `.scratch/task/evidence.md`.')
    writeFile(root, 'docs/notes/new.md', 'Read `.scratch/task/results.json`.')

    expect(runChecks({ rootDirectory: root }).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('src/web/README.md:1:'),
        expect.stringContaining('docs/notes/new.md:1:'),
      ]),
    )
  })

  it('checks tracked and new Markdown in Git even when the referenced scratch artifact exists', () => {
    const root = createTemporaryRoot()

    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeFile(root, '.gitignore', '.scratch/\n')
    writeFile(root, 'README.md', 'Read `.scratch/task/evidence.md`.')
    writeFile(root, '.scratch/task/evidence.md', 'Local evidence.\nRead `.scratch/task/other.md`.')
    execFileSync('git', ['add', 'README.md', '.gitignore'], { cwd: root })
    writeFile(root, 'prototypes/new/README.md', 'Read `.scratch/task/evidence.md`.')

    expect(runChecks({ rootDirectory: root }).issues).toEqual([
      expect.stringContaining('README.md:1:'),
      expect.stringContaining('prototypes/new/README.md:1:'),
    ])
  })

  it('permits only indexed unfinished plans and the temporary working plan', () => {
    const root = createTemporaryRoot()

    writeFile(root, 'plans/README.md', '[Active](active.md)\n[Finished](finished.md)\n')
    writeFile(root, 'plans/active.md', 'Status: Awaiting owner acceptance\nRead `.scratch/task/evidence.md`.')
    writeFile(root, 'plans/finished.md', 'Status: Completed\nRead `.scratch/task/evidence.md`.')
    writeFile(root, 'plans/unlisted.md', 'Read `.scratch/task/evidence.md`.')
    writeFile(root, 'WORKING_PLAN.md', 'Read `.scratch/task/evidence.md`.')
    const issues = runChecks({ rootDirectory: root }).issues

    expect(issues).toEqual([
      expect.stringContaining('plans/finished.md:2:'),
      expect.stringContaining('plans/unlisted.md:1:'),
    ])
  })

  it('rejects a plan marked completed in its index even before its own status is updated', () => {
    const root = createTemporaryRoot()

    writeFile(root, 'plans/README.md', '| Initiative | Status | Next task |\n| [Plan](closed.md) | Closed | None |')
    writeFile(root, 'plans/closed.md', 'Status: In progress\nRead `.scratch/task/evidence.md`.')

    expect(runChecks({ rootDirectory: root }).issues).toEqual([expect.stringContaining('plans/closed.md:2:')])
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
  function createFixture(files: Record<string, string>) {
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

describe('agent instruction routing', () => {
  const titles = [
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
  const procedureContent = titles.map((title) => `## ${title}`).join('\n')
  const routes = titles
    .map((title) => `[Read](docs/AGENT_WORKFLOW.md#${title.toLowerCase().replaceAll('.', '').replaceAll(' ', '-')})`)
    .join('\n')

  it('accepts a routed core at the byte limit, including multibyte text', () => {
    const agentContent = routes + 'é'.repeat(Math.floor((AGENT_CORE_MAX_BYTES - Buffer.byteLength(routes)) / 2))

    expect(validateAgentCore({ agentContent, procedureContent })).toEqual([])
    expect(validateAgentCore({ agentContent: agentContent + 'é', procedureContent })).toEqual([
      expect.stringContaining('UTF-8 bytes exceeds'),
    ])
  })

  it('detects missing procedures, dropped routes, and renamed destination headings', () => {
    expect(validateAgentCore({ agentContent: routes })).toEqual([
      expect.stringContaining('binding workflow procedures are missing'),
    ])
    expect(validateAgentCore({ agentContent: routes.replace('#9-tests', '#9-removed'), procedureContent })).toEqual([
      expect.stringContaining('missing required procedure route'),
    ])
    expect(
      validateAgentCore({
        agentContent: routes,
        procedureContent: procedureContent.replace('## 9. Tests', '## Tests'),
      }),
    ).toEqual([expect.stringContaining('missing routed heading 9. Tests')])
  })

  it('checks the core and all shared workflow documents in the normal repository check', () => {
    const root = createTemporaryRoot()

    writeFile(root, 'AGENTS.md', routes)
    writeFile(root, 'docs/AGENT_WORKFLOW.md', procedureContent + '\n[Missing](MISSING.md)')
    writeFile(root, 'docs/WORKING_WITH_AGENT.md', '[Missing](MISSING.md)')

    expect(runChecks({ rootDirectory: root }).issues).toEqual([
      expect.stringContaining('docs/AGENT_WORKFLOW.md: link target not found'),
      expect.stringContaining('docs/WORKING_WITH_AGENT.md: link target not found'),
    ])

    writeFile(root, 'AGENTS.md', routes + 'a'.repeat(AGENT_CORE_MAX_BYTES))

    expect(runChecks({ rootDirectory: root }).issues).toContainEqual(expect.stringContaining('UTF-8 bytes exceeds'))
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
  it('separates CI check categories without losing any default checks', () => {
    const root = createTemporaryRoot()
    writeFile(root, 'README.md', '[Missing](missing.md)\n')
    writeFile(root, 'docs/decisions/0001-first.md', '# Decision\n')
    writeFile(root, 'docs/VIM_CONFORMANCE.md', '| Product | `src/x.test.ts`: “missing name” |\n')
    writeFile(root, 'src/x.test.ts', "it('present name', () => {})\n")
    writeFile(root, 'docs/OPEN_QUESTIONS.md', '# Questions\n')

    const groups = ['links', 'tests', 'decisions', 'structure'] as const
    const results = groups.map((group) => runChecks({ rootDirectory: root, group }).issues)
    const all = runChecks({ rootDirectory: root }).issues

    expect(results[0]).toEqual([expect.stringContaining('link target not found')])
    expect(results[1]).toEqual([expect.stringContaining('no test titled')])
    expect(results[2]).toEqual([
      expect.stringContaining('missing Status metadata'),
      expect.stringContaining('missing ADR index'),
    ])
    expect(results[3]).toEqual([expect.stringContaining('non-normative')])
    expect(results.flat().sort()).toEqual(all.sort())
  })

  it('rejects unknown documentation categories rather than silently skipping checks', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(main(['--group', 'unknown'])).toBe(2)
    expect(main(['--group'])).toBe(2)

    error.mockRestore()
  })

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

describe('specification files under docs/product', () => {
  const index = [
    '# Product Requirements',
    '',
    '| Sections | File |',
    '| --- | --- |',
    '| 1, 1.1 | [Overview](product/overview.md) |',
    '| 20, 20.2, 20.2.1 | [Vim](product/vim.md) |',
    '',
    '## Retired Numbers',
    '',
    '| Number | Now owned by |',
    '| --- | --- |',
    '',
  ].join('\n')
  const overview = '# Overview\n\n## 1. One\n\n### 1.1 Child\nRule.\n'
  const vim = '# Vim\n\n## 20. Principles\n\n### 20.2 Vim\n\n#### 20.2.1 Mode\nKeep this rule. Keep that rule.\n'
  const files = [
    { path: 'docs/product/overview.md', content: overview },
    { path: 'docs/product/vim.md', content: vim },
  ]

  function writeSpecification(root: string, specification = { index, overview, vim }) {
    writeFile(root, 'docs/PRODUCT.md', specification.index)
    writeFile(root, 'docs/product/overview.md', specification.overview)
    writeFile(root, 'docs/product/vim.md', specification.vim)
  }

  it('accepts an index that matches the headings and lists no titles', () => {
    expect(validateProductIndex({ index, files })).toEqual([])
  })

  it('reports a number the index omits, maps to the wrong file, or lists without a heading', () => {
    const omitted = index.replace('1, 1.1', '1')
    const wrong = index.replace('1, 1.1', '1').replace('20, 20.2, 20.2.1', '1.1, 20, 20.2, 20.2.1')
    const phantom = index.replace('20, 20.2, 20.2.1', '20, 20.2, 20.2.1, 20.2.9')

    expect(validateProductIndex({ index: omitted, files })).toEqual([
      'docs/PRODUCT.md: the index does not list §1.1 (docs/product/overview.md)',
    ])
    expect(validateProductIndex({ index: wrong, files })).toEqual([
      'docs/PRODUCT.md: the index maps §1.1 to docs/product/vim.md, but its heading is in docs/product/overview.md',
    ])
    expect(validateProductIndex({ index: phantom, files })).toEqual([
      'docs/PRODUCT.md: the index lists §20.2.9, which no file defines',
    ])
  })

  it('reports a duplicated number, a missing file, and an unlisted file', () => {
    const twice = index.replace('20, 20.2, 20.2.1', '20, 20, 20.2, 20.2.1')
    const missing = index.replace('product/vim.md', 'product/other.md')

    expect(validateProductIndex({ index: twice, files })).toEqual([
      'docs/PRODUCT.md: the index lists §20 more than once',
    ])
    expect(validateProductIndex({ index: missing, files })).toEqual([
      'docs/PRODUCT.md: the index names docs/product/other.md, which does not exist',
      'docs/PRODUCT.md: the index does not list docs/product/vim.md',
      'docs/PRODUCT.md: the index maps §20 to docs/product/other.md, but its heading is in docs/product/vim.md',
      'docs/PRODUCT.md: the index maps §20.2 to docs/product/other.md, but its heading is in docs/product/vim.md',
      'docs/PRODUCT.md: the index maps §20.2.1 to docs/product/other.md, but its heading is in docs/product/vim.md',
    ])
    expect(
      validateProductIndex({
        index,
        files: [...files, { path: 'docs/product/extra.md', content: '# Extra\n' }],
      }),
    ).toEqual(['docs/PRODUCT.md: the index does not list docs/product/extra.md'])
  })

  it('reports a number that two files define', () => {
    const duplicate = [...files, { path: 'docs/product/extra.md', content: '# Extra\n\n## 1. Again\nRule.\n' }]

    expect(validateProductIndex({ index, files: duplicate })).toEqual(
      expect.arrayContaining(['docs/PRODUCT.md: §1 has a heading in more than one file']),
    )
  })

  it('keeps a retired number out of the headings and the listing', () => {
    const retired = index.replace(
      '| Number | Now owned by |\n| --- | --- |\n',
      '| Number | Now owned by |\n| --- | --- |\n| 1.1 | `docs/DEVELOPMENT.md` |\n',
    )
    const withoutHeading = [{ ...files[0]!, content: '# Overview\n\n## 1. One\nRule.\n' }, files[1]!]

    expect(validateProductIndex({ index: retired.replace('1, 1.1', '1'), files: withoutHeading })).toEqual([])
    expect(validateProductIndex({ index: retired, files })).toEqual(
      expect.arrayContaining([
        'docs/PRODUCT.md: §1.1 is retired but a heading in docs/product/overview.md defines it',
        'docs/PRODUCT.md: §1.1 is both listed and retired',
      ]),
    )
  })

  it('rejects text before the first numbered heading other than the title', () => {
    const check = (content: string) => findTextBeforeFirstSection({ content, displayPath: 'docs/product/x.md' })

    expect(check('# Title\n\n<!-- note -->\n---\n\n## 1. One\nRule.\n')).toEqual([])
    expect(check('# Title\n')).toEqual([])
    expect(check('# Title\n\nA rule outside a section.\n\n## 1. One\nRule.\n')).toEqual([
      'docs/product/x.md:3: text before the first numbered heading; every requirement belongs to a numbered section',
    ])
    expect(check('## 1. One\nRule.\n')).toEqual([
      'docs/product/x.md: missing the level-one title before the first numbered heading',
    ])
    expect(check('# One\n# Two\n## 1. One\n')).toEqual([
      'docs/product/x.md:2: text before the first numbered heading; every requirement belongs to a numbered section',
    ])
  })

  it('passes a consistent specification and counts its files as live documents', () => {
    const root = createTemporaryRoot()

    writeSpecification(root)
    const result = runChecks({ rootDirectory: root })

    expect(result.issues).toEqual([])
    expect(result.liveDocumentCount).toBe(3)
  })

  it('applies the block and section limits to every file', () => {
    const root = createTemporaryRoot()

    writeSpecification(root, { index, overview, vim: vim + 'x'.repeat(701) + '\n' })
    const result = runChecks({ rootDirectory: root })

    expect(result.issues).toEqual([
      expect.stringMatching(
        /^docs\/product\/vim\.md:\d+ \(§20\.2\.1\): paragraph has \d+ characters; the limit is 700/,
      ),
    ])
  })

  it('exempts these files from the quantity restatement check but not other documents', () => {
    const root = createTemporaryRoot()

    writeSpecification(root, { index, overview, vim: vim.replace('Keep this rule.', 'Nodes remain at level 20.') })
    writeFile(root, 'README.md', 'Nodes remain at level 20.\n')

    expect(runChecks({ rootDirectory: root }).issues).toEqual([
      'README.md: restates the node-depth value ("level 20"); the owner is docs/PRODUCT.md',
    ])
  })

  it('checks links of every file relative to its own directory', () => {
    const root = createTemporaryRoot()

    writeSpecification(root, { index, overview: overview + '[Security](../SECURITY.md)\n', vim })
    const missing = runChecks({ rootDirectory: root, group: 'links' }).issues

    writeFile(root, 'docs/SECURITY.md', '# Security\n')

    expect(missing).toEqual(['docs/product/overview.md: link target not found: ../SECURITY.md'])
    expect(runChecks({ rootDirectory: root, group: 'links' }).issues).toEqual([])
  })

  it('fails when text precedes the first numbered heading of a file or the index disagrees with the files', () => {
    const root = createTemporaryRoot()

    writeSpecification(root, {
      index: index.replace('1, 1.1', '1'),
      overview: overview.replace('# Overview\n', '# Overview\nLoose rule.\n'),
      vim,
    })
    const issues = runChecks({ rootDirectory: root }).issues

    expect(issues).toEqual([
      'docs/product/overview.md:2: text before the first numbered heading; every requirement belongs to a numbered section',
      'docs/PRODUCT.md: the index does not list §1.1 (docs/product/overview.md)',
    ])
  })
})

describe('verbatim comparison of the whole specification', () => {
  const singleFile =
    '# Product\n\n## 1. One\nFirst rule. Second rule.\n\n## 20. Vim\n\n### 20.2 Modes\n\n#### 20.2.1 Keys\nVim rule one. Vim rule two.\n'
  const split = {
    index:
      '# Product\n\n| Sections | File |\n| --- | --- |\n| 1 | [Overview](product/overview.md) |\n| 20, 20.2, 20.2.1 | [Vim](product/vim.md) |\n',
    overview: '# Overview\n\n## 1. One\nFirst rule. Second rule.\n',
    vim: '# Vim\n\n## 20. Vim\n\n### 20.2 Modes\n\n#### 20.2.1 Keys\nVim rule one. Vim rule two.\n',
  }

  function commit(root: string, message: string) {
    const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })

    git(['add', '-A'])
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      message,
    ])
    return git(['rev-parse', 'HEAD']).trim()
  }

  function writeSplit(root: string, vim = split.vim) {
    writeFile(root, 'docs/PRODUCT.md', split.index)
    writeFile(root, 'docs/product/overview.md', split.overview)
    writeFile(root, 'docs/product/vim.md', vim)
  }

  it('compares the index and every file with the single file of a revision before the split', () => {
    const root = createTemporaryRoot()
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeFile(root, 'docs/PRODUCT.md', singleFile)
    const base = commit(root, 'docs(fixture): add the single file')

    writeSplit(root)
    const result = runVerbatim({ ref: base, rootDirectory: root, allowAdded: 100 })

    expect(result.comparison.removed).toEqual([])
    expect(result.comparison.moved).toEqual([])
    expect(result.comparison.headingsRemoved).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it('exits 1 when a clause is removed from a file while the index is unchanged', () => {
    const root = createTemporaryRoot()
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeSplit(root)
    const base = commit(root, 'docs(fixture): add the split specification')

    expect(runVerbatim({ ref: base, rootDirectory: root }).exitCode).toBe(0)

    writeSplit(root, split.vim.replace(' Vim rule two.', ''))
    const result = runVerbatim({ ref: base, rootDirectory: root })

    expect(result.exitCode).toBe(1)
    expect(result.comparison.removed.map(({ text }) => text)).toEqual(['Vim rule two'])
  })

  it('reports a clause that moves to another file as moved, not lost', () => {
    const root = createTemporaryRoot()
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeSplit(root)
    const base = commit(root, 'docs(fixture): add the split specification')

    writeFile(root, 'docs/product/overview.md', split.overview + '\nVim rule two.\n')
    writeFile(root, 'docs/product/vim.md', split.vim.replace(' Vim rule two.', ''))
    const result = runVerbatim({ ref: base, rootDirectory: root })

    expect(result.comparison.removed).toEqual([])
    expect(result.comparison.moved.map(({ text }) => text)).toEqual(['Vim rule two'])
  })

  it('narrows both sides to one file with --file', () => {
    const root = createTemporaryRoot()
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeSplit(root)
    const base = commit(root, 'docs(fixture): add the split specification')

    writeSplit(root, split.vim.replace(' Vim rule two.', ''))

    expect(runVerbatim({ ref: base, file: 'docs/PRODUCT.md', rootDirectory: root }).exitCode).toBe(0)
    expect(runVerbatim({ ref: base, file: 'docs/product/vim.md', rootDirectory: root }).exitCode).toBe(1)
  })

  it('reads only the files directly under docs/product at the revision', () => {
    const root = createTemporaryRoot()
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeSplit(root)
    writeFile(root, 'docs/product/nested/extra.md', '# Extra\n\n## 99. Nested\nNested rule.\n')
    const base = commit(root, 'docs(fixture): add a nested file')

    const result = runVerbatim({ ref: base, rootDirectory: root })

    expect(result.comparison.removed).toEqual([])
    expect(result.comparison.before).toBe(result.comparison.after)
  })

  it('has no default file in the argument parser', () => {
    expect(parseVerbatimArguments(['--verbatim', 'HEAD'])).toEqual({ ref: 'HEAD', file: undefined, allowAdded: 0 })
  })
})

describe('ordered comparison of numbered sections', () => {
  const before =
    '# Product\n\n## 1. One\n\nFirst rule.\nSee [Security](SECURITY.md).\n\n---\n\n## 2. Two\n\n### 2.1 Child\nAlpha.\nBeta.\n'
  const after = [
    { path: 'docs/PRODUCT.md', content: '# Product\n\n| 1, 2, 2.1 | files |\n' },
    { path: 'docs/product/a.md', content: '# A\n\n## 1. One\n\nFirst rule.\nSee [Security](SECURITY.md).\n' },
    { path: 'docs/product/b.md', content: '# B\n\n## 2. Two\n\n### 2.1 Child\nAlpha.\nBeta.\n\n---\n' },
  ]
  const compare = (files = after) =>
    compareOrderedSections({ before: [{ path: 'docs/PRODUCT.md', content: before }], after: files })

  it('accepts a split that moves whole sections and ignores trailing separators and blank lines', () => {
    expect(compare()).toEqual({ sectionCount: 3, differences: [], differingLines: 0, problems: [] })
  })

  it('accepts the sections in any file order', () => {
    expect(compare([after[0]!, after[2]!, after[1]!]).differences).toEqual([])
  })

  it('reports a changed line with both locations, and a changed link target', () => {
    const changed = [
      after[0]!,
      { ...after[1]!, content: after[1]!.content.replace('(SECURITY.md)', '(../SECURITY.md)') },
      after[2]!,
    ]

    const result = compare(changed)

    expect(result.problems).toEqual([])
    expect(result.differences).toEqual([
      {
        id: '1',
        before: [{ label: 'docs/PRODUCT.md', line: 6, text: 'See [Security](SECURITY.md).' }],
        after: [{ label: 'docs/product/a.md', line: 6, text: 'See [Security](../SECURITY.md).' }],
      },
    ])
    expect(formatOrderedReport(result)).toBe(
      [
        'Ordered comparison: 3 sections, 1 differing lines (1 groups), 0 structural problems.',
        'Difference §1',
        '  - docs/PRODUCT.md:6: See [Security](SECURITY.md).',
        '  + docs/product/a.md:6: See [Security](../SECURITY.md).',
      ].join('\n'),
    )
  })

  it('reports reordered, dropped, added, and extra interior blank lines', () => {
    const reordered = [
      after[0]!,
      after[1]!,
      { ...after[2]!, content: after[2]!.content.replace('Alpha.\nBeta.', 'Beta.\nAlpha.') },
    ]
    const dropped = [after[0]!, after[1]!, { ...after[2]!, content: after[2]!.content.replace('Beta.\n', '') }]
    const added = [
      after[0]!,
      after[1]!,
      { ...after[2]!, content: after[2]!.content.replace('Beta.\n', 'Beta.\nGamma.\n') },
    ]
    const blank = [
      after[0]!,
      { ...after[1]!, content: after[1]!.content.replace('First rule.', '\nFirst rule.') },
      after[2]!,
    ]

    expect(compare(reordered).differences).not.toEqual([])
    expect(compare(dropped).differences).toEqual([
      { id: '2.1', before: [expect.objectContaining({ text: 'Beta.' })], after: [] },
    ])
    expect(compare(added).differences).toEqual([
      { id: '2.1', before: [], after: [expect.objectContaining({ text: 'Gamma.' })] },
    ])
    expect(compare(blank).differences).toHaveLength(1)
  })

  it('reports a heading change, a missing section, an extra section, and a duplicate', () => {
    const retitled = [
      after[0]!,
      { ...after[1]!, content: after[1]!.content.replace('## 1. One', '## 1. Uno') },
      after[2]!,
    ]
    const missing = [after[0]!, after[1]!]
    const extra = [...after, { path: 'docs/product/c.md', content: '# C\n\n## 3. Three\nRule.\n' }]
    const duplicate = [...after, { path: 'docs/product/c.md', content: '# C\n\n## 1. One\nRule.\n' }]

    expect(compare(retitled).differences).toHaveLength(1)
    expect(compare(missing).problems).toEqual(['§2: missing after the split', '§2.1: missing after the split'])
    expect(compare(extra).problems).toEqual(['§3: not present in the base specification'])
    expect(compare(duplicate).problems).toEqual(['§1: more than one heading in the files after the split'])
  })

  it('parses its arguments strictly', () => {
    expect(parseOrderedArguments(['--ordered', 'HEAD~1'])).toEqual({ ref: 'HEAD~1', allowDifferences: 0 })
    expect(parseOrderedArguments(['--ordered', 'abc123', '--allow-differences', '4'])).toEqual({
      ref: 'abc123',
      allowDifferences: 4,
    })
    for (const args of [
      [],
      ['--ordered'],
      ['--ordered', '-HEAD'],
      ['--ordered', 'bad:ref'],
      ['--ordered', 'HEAD', '--ordered', 'HEAD'],
      ['--ordered', 'HEAD', '--allow-differences', '-1'],
      ['--ordered', 'HEAD', '--file', 'docs/PRODUCT.md'],
    ])
      expect(() => parseOrderedArguments(args)).toThrow()
  })

  it('compares a Git revision with the working tree and exits 1 for any difference unless allowed', () => {
    const root = createTemporaryRoot()
    const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })

    git(['init', '--quiet'])
    writeFile(root, 'docs/PRODUCT.md', before)
    git(['add', '-A'])
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'docs(fixture): add the single file',
    ])
    for (const { path, content } of after) writeFile(root, path, content)

    expect(runOrdered({ ref: 'HEAD', rootDirectory: root }).exitCode).toBe(0)

    writeFile(root, 'docs/product/a.md', after[1]!.content.replace('First rule.', 'Changed rule.'))

    expect(runOrdered({ ref: 'HEAD', rootDirectory: root }).exitCode).toBe(1)
    expect(runOrdered({ ref: 'HEAD', rootDirectory: root, allowDifferences: 1 }).exitCode).toBe(0)
    expect(() => runOrdered({ ref: 'missing', rootDirectory: root })).toThrow()
  })

  it('returns process exit 2 for bad ordered arguments', () => {
    const script = join(import.meta.dirname, 'check-docs.mts')
    const result = spawnSync(process.execPath, [script, '--ordered', '-HEAD'], { encoding: 'utf8' })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Ordered comparison failed:')
  })
})

describe('detail comparison of literals, table cells, and section references', () => {
  const emptyCounts = (references: string) =>
    `Detail comparison: literals removed 0, added 0, moved 0; table cells changed 0, rows removed 0, rows added 0, rows moved 0; references ${references}.`
  const compareFile = (path: string, before: string, after: string) =>
    compareDetails({ before: [{ path, content: before }], after: [{ path, content: after }] })

  // Rows copied from the command registry of §20.2.30 in docs/product/command-panel.md.
  const registryPath = 'docs/product/command-panel.md'
  const registryHeader = [
    '| Name | Alias | Description | Active state | Shortcut | Effect |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  const findRow = '| `find` | — | Find in the current view | — | `⌘F` | Open local Find (§20.2.26) |'
  const showAgendaRow =
    '| `show-agenda` | — | Show Agenda | Agenda open | — | Open Agenda using the existing origin/caret navigation (§23); do nothing if already in Agenda |'
  const showTreeRow =
    '| `show-tree` | — | Show Tree | Tree open | — | Return to Tree using the existing Agenda origin (§23); do nothing if already in Tree |'
  const registry = ({ find = findRow, showAgenda = showAgendaRow } = {}) =>
    [
      '# Command Panel',
      '',
      '#### 20.2.30 Command Registry',
      '',
      ...registryHeader,
      find,
      showAgenda,
      showTreeRow,
      '',
    ].join('\n')
  const compareRegistry = (changes: { find?: string; showAgenda?: string }) =>
    compareFile(registryPath, registry(), registry(changes))

  it('reports nothing and counts no change for an unchanged specification', () => {
    const result = compareRegistry({})

    expect(formatDetailsReport(result)).toBe(emptyCounts('removed 0, added 0, retargeted 0, moved 0'))
    expect(detailChangeCount(result)).toBe(0)
  })

  it('reports a changed Description cell of the find command with its column', () => {
    const result = compareRegistry({ find: findRow.replace('Find in the current view', 'Find in this view') })

    expect(formatDetailsReport(result)).toBe(
      [
        'Detail comparison: literals removed 0, added 0, moved 0; table cells changed 1, rows removed 0, rows added 0, rows moved 0; references removed 0, added 0, retargeted 0, moved 0.',
        'Cell changed docs/product/command-panel.md:7 §20.2.30 column "Description" (base docs/product/command-panel.md:7) row "`find`": "Find in the current view" -> "Find in this view"',
      ].join('\n'),
    )
    expect(detailChangeCount(result)).toBe(1)
  })

  it('reports a reworded Effect cell of show-agenda and leaves its unchanged cells and reference out', () => {
    const reworded = showAgendaRow.replace(
      'Open Agenda using the existing origin/caret navigation (§23);',
      'Open Agenda; the origin and the caret follow §23;',
    )

    const result = compareRegistry({ showAgenda: reworded })

    expect(formatDetailsReport(result)).toBe(
      [
        'Detail comparison: literals removed 0, added 0, moved 0; table cells changed 1, rows removed 0, rows added 0, rows moved 0; references removed 0, added 0, retargeted 0, moved 0.',
        'Cell changed docs/product/command-panel.md:8 §20.2.30 column "Effect" (base docs/product/command-panel.md:8) row "`show-agenda`": "Open Agenda using the existing origin/caret navigation (§23); do nothing if already in Agenda" -> "Open Agenda; the origin and the caret follow §23; do nothing if already in Agenda"',
      ].join('\n'),
    )
  })

  it('reports a changed Active state cell of show-agenda', () => {
    const result = compareRegistry({ showAgenda: showAgendaRow.replace('Agenda open', 'Agenda shown') })

    expect(result.cells.changed.map(({ after, oldText, newText }) => [after.column, oldText, newText])).toEqual([
      ['Active state', 'Agenda open', 'Agenda shown'],
    ])
    expect(detailChangeCount(result)).toBe(1)
  })

  it('reports the §23 reference of the show-agenda Effect cell when it changes', () => {
    const result = compareRegistry({ showAgenda: showAgendaRow.replace('(§23)', '(§23.7)') })

    expect(formatDetailsReport(result).split('\n').slice(1)).toEqual([
      'Cell changed docs/product/command-panel.md:8 §20.2.30 column "Effect" (base docs/product/command-panel.md:8) row "`show-agenda`": "Open Agenda using the existing origin/caret navigation (§23); do nothing if already in Agenda" -> "Open Agenda using the existing origin/caret navigation (§23.7); do nothing if already in Agenda"',
      'Reference retargeted docs/product/command-panel.md:8 §20.2.30 column "Effect" (base docs/product/command-panel.md:8): "§23" -> "§23.7" in "Open Agenda using the existing origin/caret navigation (§23.7); do nothing if already in Agenda"',
    ])
  })

  it('reports a changed number with its unit', () => {
    const before = '# Vim\n\n### 20.2 Modes\n\nThe bar height stays 27px. Saving locks after 3 attempts.\n'

    const result = compareFile(
      'docs/product/vim.md',
      before,
      before.replace('27px', '28px').replace('3 attempts', 'three attempts'),
    )

    expect(formatDetailsReport(result)).toBe(
      [
        'Detail comparison: literals removed 2, added 2, moved 0; table cells changed 0, rows removed 0, rows added 0, rows moved 0; references removed 0, added 0, retargeted 0, moved 0.',
        'Literal removed docs/product/vim.md:5 §20.2 number: "27px"',
        'Literal removed docs/product/vim.md:5 §20.2 number: "3 attempts"',
        'Literal added docs/product/vim.md:5 §20.2 number: "28px"',
        'Literal added docs/product/vim.md:5 §20.2 number: "three attempts"',
      ].join('\n'),
    )
  })

  it('reports an added, a removed, and a retargeted section reference', () => {
    const result = compareFile(
      'docs/product/application.md',
      '# Application\n\n## 9. App\n\nQuit follows §16.1. Close follows §21.\n',
      '# Application\n\n## 9. App\n\nQuit follows §16.2. Close follows the rules. Open follows §9.1.\n',
    )

    expect(formatDetailsReport(result)).toBe(
      [
        emptyCounts('removed 1, added 1, retargeted 1, moved 0'),
        'Reference removed docs/product/application.md:5 §9: "§21" in "Close follows §21."',
        'Reference added docs/product/application.md:5 §9: "§9.1" in "Open follows §9.1."',
        'Reference retargeted docs/product/application.md:5 §9 (base docs/product/application.md:5): "§16.1" -> "§16.2" in "Quit follows §16.2."',
      ].join('\n'),
    )
    expect(detailChangeCount(result)).toBe(3)
  })

  it('shows a pure move to another file and section as moved and counts no change', () => {
    const moved = 'Quit with `Cmd+Q` (§21).\n\n| Name | Effect |\n| --- | --- |\n| `quit` | Quit (§9.1) |\n'
    const before = [
      { path: 'docs/product/application.md', content: `# Application\n\n## 9. App\n\n${moved}` },
      { path: 'docs/product/persistence.md', content: '# Persistence\n\n## 16. Persistence\n\nSave rule.\n' },
    ]
    const after = [
      { path: 'docs/product/application.md', content: '# Application\n\n## 9. App\n' },
      { path: 'docs/product/persistence.md', content: `# Persistence\n\n## 16. Persistence\n\nSave rule.\n\n${moved}` },
    ]

    const result = compareDetails({ before, after })

    expect(formatDetailsReport(result)).toBe(
      [
        'Detail comparison: literals removed 0, added 0, moved 2; table cells changed 0, rows removed 0, rows added 0, rows moved 1; references removed 0, added 0, retargeted 0, moved 2.',
        'Literal moved docs/product/application.md:5 §9 -> docs/product/persistence.md:7 §16 code: "`Cmd+Q`"',
        'Literal moved docs/product/application.md:9 §9 column "Name" -> docs/product/persistence.md:11 §16 column "Name" code: "`quit`"',
        'Row moved docs/product/application.md:9 §9 -> docs/product/persistence.md:11 §16: row "`quit`"',
        'Reference moved docs/product/application.md:5 §9 -> docs/product/persistence.md:7 §16: "§21" in "Quit with `Cmd+Q` (§21)."',
        'Reference moved docs/product/application.md:9 §9 column "Effect" -> docs/product/persistence.md:11 §16 column "Effect": "§9.1" in "Quit (§9.1)"',
      ].join('\n'),
    )
    expect(detailChangeCount(result)).toBe(0)
  })

  it('reports a removed and an added row with every cell and its column', () => {
    const result = compareRegistry({
      find: showTreeRow.replaceAll('Tree', 'Outline').replace('show-tree', 'show-outline'),
    })

    expect(
      formatDetailsReport(result)
        .split('\n')
        .filter((line) => line.startsWith('Row')),
    ).toEqual([
      'Row removed docs/product/command-panel.md:7 §20.2.30: Name: "`find`", Alias: "—", Description: "Find in the current view", Active state: "—", Shortcut: "`⌘F`", Effect: "Open local Find (§20.2.26)"',
      'Row added docs/product/command-panel.md:7 §20.2.30: Name: "`show-outline`", Alias: "—", Description: "Show Outline", Active state: "Outline open", Shortcut: "—", Effect: "Return to Outline using the existing Agenda origin (§23); do nothing if already in Outline"',
    ])
  })

  it('pairs a row whose name changed when most of its cells are equal', () => {
    const result = compareRegistry({ find: findRow.replace('`find`', '`find-local`') })

    expect(result.cells.changed.map(({ after, oldText, newText }) => [after.column, oldText, newText])).toEqual([
      ['Name', '`find`', '`find-local`'],
    ])
    expect(result.cells.rowsRemoved).toEqual([])
  })

  it('reports the §7.2 calibration sample with only items the statement map explains', () => {
    const view =
      '* **View** holds **Tree** and **Agenda**, then a separator and an **Appearance** submenu with five mutually exclusive items: **Automatic**, **Light**, **Dark**, **Gray**, and **White**. The item for the current appearance choice is checked (§20.5).'
    const laterSentences =
      'Choosing Vim Editing enters Normal mode or returns to standard editing with the caret kept (§20.2.3); the choice is saved and restored at the next start. Always on Top agrees with the pin toggle: either control pins or unpins the window, keeps editor focus, and saves the choice. The menu check marks and corresponding window, appearance and editing states always agree, including at startup. A newer selection made during startup takes precedence over an earlier preference read, including for the first editor keystroke.'
    const sample = (windowClose: string, firstSentence: string, viewCommands: string) =>
      [
        '# Application',
        '',
        '### 9.2 Window Close',
        '',
        windowClose,
        '',
        '### 9.3 Application Menu',
        '',
        view,
        '',
        `${firstSentence} ${laterSentences}`,
        '',
        viewCommands,
        '',
      ].join('\n')
    const before = sample(
      'Closing the main window quits the application on macOS, including when the application is inactive. It follows the same save-before-quit behavior as `Cmd+Q`: pending changes are flushed, and if saving cannot finish within the bounded time or reports an error, the application remains open and displays the failure so the user can retry. In the locked save-failure state, the user can instead explicitly confirm quitting without saving, as defined in §16.2. A terminated renderer process is the exception defined in §21.',
      'The Appearance and Vim Editing items have no status-bar toggles.',
      'Tree and Agenda invoke the same named view commands as the command panel (§20.2.28), without additional shortcuts. Selecting the already open view does nothing. Switching views finishes buffered editing and preserves the existing origin/caret behavior (§23). These commands do nothing while no renderer is available or while its main frame is loading. The native Tree, Agenda, Export Notes… and Import Notes… items retain text labels and show macOS symbols for connected nodes, a calendar, export and import. Other native items retain their standard text/check-mark presentation.',
    )
    const after = sample(
      'Closing the main window quits the application on macOS, including when the application is inactive. Window close and `Cmd+Q` (§9.1) have the same save-before-quit behavior, which §16.1 defines.',
      'The status bar has no Appearance toggle. It has no Vim Editing toggle either (§20.2.1).',
      'Tree and Agenda invoke the same named view commands as the command panel (§20.2.28), without additional shortcuts. Selecting the already open view does nothing. Switching views finishes buffered editing; the origin and the caret follow §23. These commands do nothing while no renderer is available or while its main frame is loading. The native Tree, Agenda, Export Notes… and Import Notes… items have text labels and show macOS symbols for connected nodes, a calendar, export and import. Other native items have the standard text and check-mark presentation.',
    )

    const result = compareFile('docs/product/application.md', before, after)

    // §16.2 and §21 leave §9.2 with statements 5 and 6, merged into §16.1. §9.1 and §16.1 are the
    // citations of reworded statement 2, and §20.2.1 is the citation of merged statement 8. `Cmd+Q` stays
    // in §9.2, and §23 stays in §9.3 with reworded statement 11, so neither is reported.
    expect(formatDetailsReport(result)).toBe(
      [
        emptyCounts('removed 2, added 3, retargeted 0, moved 0'),
        'Reference removed docs/product/application.md:5 §9.2: "§16.2" in "In the locked save-failure state, the user can instead explicitly confirm quitting without saving, as defined in §16.2."',
        'Reference removed docs/product/application.md:5 §9.2: "§21" in "A terminated renderer process is the exception defined in §21."',
        'Reference added docs/product/application.md:5 §9.2: "§9.1" in "Window close and `Cmd+Q` (§9.1) have the same save-before-quit behavior, which §16.1 defines."',
        'Reference added docs/product/application.md:5 §9.2: "§16.1" in "Window close and `Cmd+Q` (§9.1) have the same save-before-quit behavior, which §16.1 defines."',
        'Reference added docs/product/application.md:11 §9.3: "§20.2.1" in "It has no Vim Editing toggle either (§20.2.1)."',
      ].join('\n'),
    )
  })

  it('extracts code spans, bold spans, and numbers with their units', () => {
    const literals = extractDetailLiterals(
      '**Quit Tree** (`Cmd+Q`, §9.1) waits 5 seconds, then 25 px (25px), p99 below 5 ms, ten-second, one of them; see [ADR](a/1.md).',
    )

    expect(literals).toEqual([
      { kind: 'code', text: '`Cmd+Q`' },
      { kind: 'bold', text: '**Quit Tree**' },
      { kind: 'number', text: '5 seconds' },
      { kind: 'number', text: '25 px' },
      { kind: 'number', text: '25px' },
      { kind: 'number', text: 'p99' },
      { kind: 'number', text: '5 ms' },
      { kind: 'number', text: 'ten-second' },
      { kind: 'number', text: 'one' },
    ])
  })

  it('extracts the reference forms of the specification and ignores references inside code spans', () => {
    const references = extractDetailReferences(
      'Same as Export Notes (§24–25) and §20.2.1–3; see §§16.1 and 16.2, `AGENTS.md` §5 and [AGENTS.md §4](../AGENTS.md#4-x). Markers use `// @requirement PRODUCT.md §13.1`.',
    )

    expect(references.map(({ reference }) => reference)).toEqual([
      '§24–25',
      '§20.2.1–3',
      '§§16.1 and 16.2',
      'AGENTS.md §5',
      'AGENTS.md §4',
    ])
    expect(references[0]!.context).toBe('Same as Export Notes (§) and §; see §, § and [§](../AGENTS.md#4-x).')
  })

  it('skips fenced blocks and labels text before the first numbered heading', () => {
    const result = compareFile(
      'docs/PRODUCT.md',
      '# Product\n\nUse `old`.\n\n## 1. One\n\n```text\n§2 and 5 px\n```\n',
      '# Product\n\nUse `new`.\n\n## 1. One\n\n```text\n§3 and 6 px\n```\n',
    )

    expect(formatDetailsReport(result).split('\n').slice(1)).toEqual([
      'Literal removed docs/PRODUCT.md:3 (no section) code: "`old`"',
      'Literal added docs/PRODUCT.md:3 (no section) code: "`new`"',
    ])
  })

  it('parses its arguments strictly', () => {
    expect(parseDetailsArguments(['--details', 'HEAD~1'])).toEqual({ ref: 'HEAD~1', file: undefined })
    expect(parseDetailsArguments(['--details', 'abc123', '--file', 'docs/product/vim.md'])).toEqual({
      ref: 'abc123',
      file: 'docs/product/vim.md',
    })
    for (const args of [
      [],
      ['--details'],
      ['--details', '-HEAD'],
      ['--details', 'bad:ref'],
      ['--details', 'HEAD', '--details', 'HEAD'],
      ['--details', 'HEAD', '--file', '../file'],
      ['--details', 'HEAD', '--allow-added', '1'],
    ])
      expect(() => parseDetailsArguments(args)).toThrow()
  })

  it('compares a Git revision with the working tree and narrows both sides with --file', () => {
    const root = createTemporaryRoot()
    const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })
    const vim = '# Vim\n\n### 20.2 Modes\n\nThe bar height stays 27px (§20.2.7).\n'

    git(['init', '--quiet'])
    writeFile(
      root,
      'docs/PRODUCT.md',
      '# Product\n\n| Sections | File |\n| --- | --- |\n| 20.2 | [vim.md](product/vim.md) |\n',
    )
    writeFile(root, 'docs/product/vim.md', vim)
    git(['add', '-A'])
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'docs(fixture): add the specification',
    ])

    expect(runDetails({ ref: 'HEAD', rootDirectory: root }).exitCode).toBe(0)

    writeFile(root, 'docs/product/vim.md', vim.replace('27px', '28px'))
    const result = runDetails({ ref: 'HEAD', rootDirectory: root })

    expect(result.exitCode).toBe(1)
    expect(result.report.literals.removed.map(({ path, text }) => [path, text])).toEqual([
      ['docs/product/vim.md', '27px'],
    ])
    expect(runDetails({ ref: 'HEAD', file: 'docs/PRODUCT.md', rootDirectory: root }).exitCode).toBe(0)
    expect(runDetails({ ref: 'HEAD', file: 'docs/product/vim.md', rootDirectory: root }).exitCode).toBe(1)
    expect(() => runDetails({ ref: 'missing', rootDirectory: root })).toThrow()
  })

  it('returns process exit 2 for bad detail arguments', () => {
    const script = join(import.meta.dirname, 'check-docs.mts')
    const result = spawnSync(process.execPath, [script, '--details', '-HEAD'], { encoding: 'utf8' })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Detail comparison failed:')
  })
})
