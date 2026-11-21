/**
 * The notes of `historicalNotes` after the current version saves them: the image size read from the
 * attachment header (a 1×1 PNG in these tests) is stored with the image (`docs/PRODUCT.md` §17).
 */
export function savedHistoricalNotes(version: number, edit = '') {
  const notes = structuredClone(historicalNotes(version, edit))
  const entry = notes.document.roots[0]!.children[0] as unknown as { attachment: Record<string, unknown> }
  entry.attachment['width'] = 1
  entry.attachment['height'] = 1
  return notes
}

/** Each fixture contains only fields the corresponding notes format could write. */
export function historicalNotes(version: number, edit = '') {
  return {
    version,
    document: {
      roots: [
        {
          id: 'project',
          text: 'Project',
          children: [
            {
              id: 'entry',
              text: 'Notes\n第二行' + edit,
              attachment: {
                id: 'diagram',
                mimeType: 'image/png',
                ...(version >= 4 ? { searchText: 'Recognized diagram label' } : {}),
              },
              children: [],
              ...(version >= 5 ? { starred: true } : {}),
            },
            {
              id: 'branch',
              text: 'https://example.org',
              ...(version >= 2 ? { links: [{ start: 0, end: 19, url: 'https://example.org' }] } : {}),
              children: [
                { id: 'leaf', text: 'Nested', children: [], ...(version >= 4 ? { struckThrough: true } : {}) },
              ],
              ...(version >= 4 ? { struckThrough: true } : {}),
            },
          ],
        },
        { id: 'other', text: 'Other root', children: [], ...(version >= 6 ? { marked: true } : {}) },
      ],
    },
    location: { currentParentId: 'project', selectedNodeId: 'entry' },
    ...(version >= 3
      ? {
          view: {
            expandedIds: ['branch'],
            ...(version >= 4 ? { agendaFolds: { days: [5], overdueWeeks: [4] } } : {}),
          },
        }
      : {}),
  }
}
