import { expect, it } from 'vitest'
import type { Document, TreeNode } from '../domain/document'
import { searchNodes } from './node-search'

function ids(document: Document, query: string): string[] {
  const work = searchNodes(document, query)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value.map(({ id }) => id)
}

const node = (id: string, text: string, children: TreeNode[] = []): TreeNode => ({ id, text, children })

// @requirement PRODUCT.md §20.14
// @requirement PRODUCT.md §20.14.3
it('requires all unordered terms with flexible whitespace and smart case per term', () => {
  const document = { roots: [node('a', 'OpenSearch    slow'), node('b', 'SLOW opensearch'), node('c', 'slow')] }

  expect(ids(document, 'slow opensearch')).toEqual(['a', 'b'])
  expect(ids(document, '  opensearch\t\n slow\u00a0')).toEqual(['a', 'b'])
  expect(ids(document, 'OpenSearch slow')).toEqual(['a'])
  expect(ids(document, 'opensearch SLOW')).toEqual(['b'])
  expect(ids(document, 'slow slow')).toEqual(['a', 'b', 'c'])
  expect(ids(document, ' \t\n')).toEqual([])
  expect(ids(document, '')).toEqual([])
})

it('inherits every term through the full chain and excludes siblings without their own match', () => {
  const document = {
    roots: [
      node('root', '@Alex', [
        node('second', '#K8s', [
          node('third', '&Meeting', [
            node('fourth', 'Infrastructure', [node('leaf', 'opensearch-dashboards'), node('sibling', 'postgres')]),
          ]),
        ]),
      ]),
      node('outside', 'opensearch'),
      node('direct', '@Alex #K8s &Meeting Infrastructure opensearch'),
    ],
  }

  expect(ids(document, '@alex #k8s &meeting infrastructure opensearch')).toEqual(['leaf', 'direct'])
  expect(ids(document, 'opensearch #k8s @alex')).toEqual(['leaf', 'direct'])
  expect(ids(document, '@ALEX #k8s opensearch')).toEqual([])
  expect(ids(document, '@alex #K8s opensearch')).toEqual(['leaf', 'direct'])
  expect(ids(document, '@alex #k8s')).toEqual(['second', 'direct'])
  expect(ids(document, '@alex')).toEqual(['root', 'direct'])
})

it('returns both a matching ancestor and descendant without leaking across sibling branches', () => {
  const document = {
    roots: [
      node('root', 'alpha beta', [node('child', 'beta'), node('blank', 'unrelated')]),
      node('other-root', 'beta', [node('other-child', 'beta')]),
    ],
  }

  expect(ids(document, 'alpha beta')).toEqual(['root', 'child'])
})

it.each(['#', '@', '&'])('requires complete recognized %s markers and excludes links', (prefix) => {
  const document = {
    roots: [
      node('exact', `${prefix}Alex opensearch`),
      node('prefix', `${prefix}Alexander opensearch`),
      node('embedded', `email${prefix}Alex opensearch`),
      { ...node('linked', `${prefix}Alex opensearch`), links: [{ start: 0, end: 5, url: 'https://example.com' }] },
    ],
  }

  expect(ids(document, `${prefix}alex opensearch`)).toEqual(['exact'])
  expect(ids(document, `${prefix}Alex opensearch`)).toEqual(['exact'])
  expect(ids(document, `${prefix}ALEX opensearch`)).toEqual([])
  expect(ids(document, `${prefix} opensearch`)).toEqual([])
})

it('inherits from complete ancestor text beyond the displayed path cutoff', () => {
  const document = { roots: [node('root', `${'x'.repeat(200)} alpha`, [node('leaf', 'beta')])] }

  expect(ids(document, 'alpha beta')).toEqual(['leaf'])
})
