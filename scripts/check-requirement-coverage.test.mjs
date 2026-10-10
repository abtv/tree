import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkCoverage, parseSections, runChecks } from './check-requirement-coverage.mjs'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function check(product, files = [], options = {}) {
  return checkCoverage({ product, files, exemptions: new Map(), boundarySections: new Set(), ...options })
}

describe('requirement section parsing', () => {
  it('accepts four-level headings and rejects number-depth mismatches', () => {
    expect(parseSections('## 1. Parent\n### 1.1 Child\n#### 1.1.1 Leaf\nRule')).toEqual([
      { id: '1', title: 'Parent', required: false },
      { id: '1.1', title: 'Child', required: false },
      { id: '1.1.1', title: 'Leaf', required: true },
    ])
    expect(check('### 1. Wrong\nRule').issues).toContain('PRODUCT.md §1: heading level does not match its number depth')
  })

  it('rejects a marker on a parent without own text', () => {
    expect(
      check('## 1. Parent\n### 1.1 Leaf\nRule', [
        {
          path: 'src/x.test.ts',
          content: '// @requirement PRODUCT.md §1\n// @requirement PRODUCT.md §1.1\n',
        },
      ]).issues,
    ).toEqual(['src/x.test.ts:1: PRODUCT.md §1 has numbered subsections and no text of its own; cite a subsection'])
  })
  it('requires leaves and parents with their own text, including unnumbered subheadings', () => {
    expect(
      parseSections('## 1. Parent\n### 1.1 Leaf\nRule\n### Example\nMore\n## 2. Parent\nOwn rule\n### 2.1 Leaf\n'),
    ).toEqual([
      { id: '1', title: 'Parent', required: false },
      { id: '1.1', title: 'Leaf', required: true },
      { id: '2', title: 'Parent', required: true },
      { id: '2.1', title: 'Leaf', required: true },
    ])
  })

  it('ignores fenced headings, comment metadata, and section separators', () => {
    const product =
      '## 1. Parent\n<!-- metadata -->\n---\n### 1.1 Leaf\n```text\n## 2. Fake\n```\n~~~\n### 3. Fake\n~~~\n'
    expect(parseSections(product).map(({ id, required }) => [id, required])).toEqual([
      ['1', false],
      ['1.1', true],
    ])
  })

  it('rejects empty inventories and duplicate section numbers', () => {
    expect(check('# Product').issues).toContain('PRODUCT.md: no numbered sections found')
    expect(check('## 1. One\n## 1. Duplicate').issues).toContain('PRODUCT.md: duplicate numbered sections')
  })
})

describe('requirement coverage', () => {
  const product = '## 1. Parent\n### 1.1 Rule\nMust work\n'
  const marker = '// @requirement PRODUCT.md §1.1\n'

  it('fails with the section name when its only marker is removed', () => {
    expect(check(product, [{ path: 'src/rule.test.ts', content: marker }]).issues).toEqual([])
    expect(check(product, [{ path: 'src/rule.test.ts', content: '' }]).issues).toEqual([
      'PRODUCT.md §1.1: missing test marker',
    ])
  })

  it('fails with both stale and uncovered numbers after a section is renamed', () => {
    expect(
      check(product.replace('### 1.1', '### 1.2'), [{ path: 'src/rule.test.ts', content: marker }]).issues,
    ).toEqual(['src/rule.test.ts:1: unknown PRODUCT.md §1.1', 'PRODUCT.md §1.2: missing test marker'])
  })

  it('requires an E2E marker for a boundary, even with unit and performance markers', () => {
    const options = { boundarySections: new Set(['1.1']) }
    const files = [
      { path: 'src/rule.test.ts', content: marker },
      { path: 'perf/rule.spec.ts', content: marker },
    ]
    expect(check(product, files, options).issues).toEqual(['PRODUCT.md §1.1: missing E2E marker'])
    expect(check(product, [...files, { path: 'e2e/rule.spec.ts', content: marker }], options).issues).toEqual([])
  })

  it('rejects malformed markers without accepting trailing text or numeric prefixes', () => {
    expect(
      check(product, [
        { path: 'src/rule.test.ts', content: `${marker.trim()} extra\n// @requirement PRODUCT.md §1.10\n` },
      ]).issues,
    ).toEqual([
      'src/rule.test.ts:1: malformed requirement marker',
      'src/rule.test.ts:2: unknown PRODUCT.md §1.10',
      'PRODUCT.md §1.1: missing test marker',
    ])
  })

  it('requires reasons and rejects stale exemption and boundary entries', () => {
    expect(check(product, [], { exemptions: new Map([['1.1', 'Governance']]) }).issues).toEqual([])
    expect(
      check(product, [], {
        exemptions: new Map([
          ['1.1', ' '],
          ['9', 'Gone'],
        ]),
        boundarySections: new Set(['8']),
      }).issues,
    ).toEqual([
      'PRODUCT.md §1.1: exemption needs a reason',
      'Exemption names missing PRODUCT.md §9',
      'Boundary list names missing PRODUCT.md §8',
    ])
  })

  it('does not count examples of markers inside strings as comments', () => {
    const content = `const example = '${marker.trim()}'\nconst template = \`\n${marker}\`\n/*\n${marker}*/\n`
    expect(check(product, [{ path: 'src/rule.test.ts', content }]).issues).toEqual([
      'PRODUCT.md §1.1: missing test marker',
    ])
  })

  it('finds standalone comments inside suites and at the end of a file', () => {
    const content = `describe('rules', () => {\n${marker}it('works', () => {})\n})\n`
    expect(check(product, [{ path: 'src/rule.test.ts', content }]).issues).toEqual([])
    expect(check(product, [{ path: 'src/rule.test.ts', content: marker }]).issues).toEqual([])
  })
})

describe('repository discovery', () => {
  it('scans nested source tests and E2E/performance TypeScript while ignoring production files and other extensions', () => {
    const root = mkdtempSync(join(tmpdir(), 'tree-requirements-'))
    roots.push(root)
    const write = (path, content) => {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    write('docs/PRODUCT.md', '## 1. One\n## 2. Two\n## 3. Three\n## 4. Four\n')
    write('src/nested/one.test.tsx', '// @requirement PRODUCT.md §1\n')
    write('src/two.ts', '// @requirement PRODUCT.md §2\n')
    write('e2e/nested/two.spec.ts', '// @requirement PRODUCT.md §2\n')
    write('perf/three.spec.ts', '// @requirement PRODUCT.md §3\n')
    write('e2e/four.txt', '// @requirement PRODUCT.md §4\n')
    expect(runChecks({ rootDirectory: root, exemptions: new Map(), boundarySections: new Set(['2']) })).toEqual({
      issues: ['PRODUCT.md §4: missing test marker'],
      requirementCount: 4,
    })
  })
})
