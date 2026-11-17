import { expect, it } from 'vitest'
import { textPasteTransition } from './editor-clipboard-transitions'

// @requirement PRODUCT.md §14
// @requirement PRODUCT.md §22.1
it('keeps a large rich multiline paste within the interactive work budget', () => {
  const url = 'https://example.com'
  const text = `${'line\r\n'.repeat(40_000)}${url}`
  const start = performance.now()

  const result = textPasteTransition(
    { roots: [{ id: 'target', text: '', children: [] }] },
    { currentParentId: null, selectedNodeId: 'target' },
    'target',
    0,
    { kind: 'text', text, links: [{ start: text.length - url.length, end: text.length, url }] },
    (count) => Array.from({ length: count }, (_, index) => `pasted-${index}`),
  )
  const elapsed = performance.now() - start
  console.info('PERF rich-multiline-paste', { lines: 40_001, elapsedMs: elapsed })

  expect(result.document.roots).toHaveLength(40_001)
  expect(result.document.roots.at(-1)).toMatchObject({
    text: url,
    links: [{ start: 0, end: url.length, url }],
  })
  expect(result.focus).toEqual({ nodeId: 'pasted-39999', cursor: url.length })
  expect(elapsed).toBeLessThan(500)
})
