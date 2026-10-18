import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  conformanceCitationMatches,
  compareVerbatim,
  formatVerbatimReport,
  extractTestTitles,
  findBrokenLinks,
  findBrokenReferences,
  findScratchDependencies,
  findProductQuantityRestatements,
  findOversizedProductText,
  findStaleConformanceCitations,
  parseConformanceCitations,
  parseVerbatimArguments,
  runChecks,
  runVerbatim,
  main,
  validateAdr,
  validateAdrIndex,
  validateOpenQuestions,
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
