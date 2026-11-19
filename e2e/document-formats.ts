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
        { id: 'other', text: 'Other root', children: [] },
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
