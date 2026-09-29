import { describe, expect, it } from 'vitest'
import { MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_DEPTH_ERROR, parsePersistedState, validatePersistedState } from './document'

interface PersistedStateCase {
  readonly name: string
  readonly state: unknown
  readonly decision: 'accept' | 'reject'
  readonly error?: string
}

interface ValidatorOutcome {
  readonly decision: 'accept' | 'reject'
  readonly error: string | undefined
}

const validState = {
  version: 2,
  document: { roots: [{ id: 'root', text: 'Root', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

/**
 * `validatePersistedState` discards `normalizeLinks`' result and returns the caller's object, while
 * `parsePersistedState` uses the normalized links it builds. A denormalized link (here the covered
 * text no longer matches the URL) is therefore accepted by both validators; only the returned
 * document differs. The conformance table records the shared decision and the test below records the
 * intended difference, so neither side can drift silently.
 */
const denormalizedLinkState = {
  version: 2,
  document: {
    roots: [
      {
        id: 'root',
        text: 'httpsXYZ://example.com',
        links: [{ start: 0, end: 22, url: 'https://example.com' }],
        children: [],
      },
    ],
  },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

const attachmentWithInvalidIdState = {
  version: 2,
  document: {
    roots: [{ id: 'root', text: '', attachment: { id: '../escape', mimeType: 'image/png' }, children: [] }],
  },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

const linkWithInvalidDestinationState = {
  version: 2,
  document: {
    roots: [{ id: 'root', text: 'unsafe', links: [{ start: 0, end: 6, url: 'javascript:alert(1)' }], children: [] }],
  },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

function overDepthRoot(): Record<string, unknown> {
  let node: Record<string, unknown> = { id: `n${MAX_DOCUMENT_DEPTH}`, text: '', children: [] }
  for (let index = MAX_DOCUMENT_DEPTH - 1; index >= 0; index -= 1) {
    node = { id: `n${index}`, text: '', children: [node] }
  }
  return node
}

function outcome(validate: (value: unknown) => unknown, state: unknown): ValidatorOutcome {
  try {
    validate(state)
    return { decision: 'accept', error: undefined }
  } catch (error) {
    return { decision: 'reject', error: error instanceof Error ? error.message : String(error) }
  }
}

const cases: PersistedStateCase[] = [
  {
    name: 'accepts a valid version two state',
    state: validState,
    decision: 'accept',
  },
  {
    name: 'accepts a valid version one state',
    state: { ...validState, version: 1 },
    decision: 'accept',
  },
  {
    name: 'accepts a state whose link matches its covered text',
    state: {
      version: 2,
      document: {
        roots: [
          {
            id: 'root',
            text: 'https://example.com',
            links: [{ start: 0, end: 19, url: 'https://example.com' }],
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    },
    decision: 'accept',
  },
  {
    name: 'accepts a denormalized link that only the load parser normalizes',
    state: denormalizedLinkState,
    decision: 'accept',
  },
  {
    name: 'rejects an attachment identifier containing a path separator',
    state: attachmentWithInvalidIdState,
    decision: 'reject',
    error: 'A saved attachment is invalid.',
  },
  {
    name: 'rejects a non-HTTP(S) persisted link destination',
    state: linkWithInvalidDestinationState,
    decision: 'reject',
    error: 'Saved link URLs must use HTTP or HTTPS.',
  },
  {
    name: 'rejects a non-record state',
    state: null,
    decision: 'reject',
    error: 'The saved document has an unsupported format.',
  },
  {
    name: 'rejects an unsupported version',
    state: { ...validState, version: 4, view: { expandedIds: [] } },
    decision: 'reject',
    error: 'The saved document has an unsupported format.',
  },
  {
    name: 'accepts a version three state with expansion and a selected row position',
    state: { ...validState, version: 3, view: { expandedIds: ['root'], selectedRowTop: 120 } },
    decision: 'accept',
  },
  {
    name: 'accepts a version three expanded id that names no node',
    state: { ...validState, version: 3, view: { expandedIds: ['missing'] } },
    decision: 'accept',
  },
  {
    name: 'rejects a version three state without a view',
    state: { ...validState, version: 3 },
    decision: 'reject',
    error: 'The saved view state is invalid.',
  },
  {
    name: 'rejects expanded ids that are not non-empty strings',
    state: { ...validState, version: 3, view: { expandedIds: ['root', ''] } },
    decision: 'reject',
    error: 'The saved view state is invalid.',
  },
  {
    name: 'rejects a negative selected row position',
    state: { ...validState, version: 3, view: { expandedIds: [], selectedRowTop: -1 } },
    decision: 'reject',
    error: 'The saved view state is invalid.',
  },
  {
    name: 'rejects a non-finite selected row position',
    state: { ...validState, version: 3, view: { expandedIds: [], selectedRowTop: Number.POSITIVE_INFINITY } },
    decision: 'reject',
    error: 'The saved view state is invalid.',
  },
  {
    name: 'rejects a non-record document',
    state: { ...validState, document: 'roots' },
    decision: 'reject',
    error: 'The saved document has an unsupported format.',
  },
  {
    name: 'rejects a non-record location',
    state: { ...validState, location: [] },
    decision: 'reject',
    error: 'The saved document has an unsupported format.',
  },
  {
    name: 'rejects a document without root nodes',
    state: { ...validState, document: { roots: [] } },
    decision: 'reject',
    error: 'The saved document must contain at least one root node.',
  },
  {
    name: 'rejects roots that are not an array',
    state: { ...validState, document: { roots: 'not an array' } },
    decision: 'reject',
    error: 'Node children must be an array.',
  },
  {
    name: 'rejects a non-string current parent ID',
    state: { ...validState, location: { currentParentId: 7, selectedNodeId: 'root' } },
    decision: 'reject',
    error: 'The saved document location is invalid.',
  },
  {
    name: 'rejects a missing selected node ID',
    state: { ...validState, location: { currentParentId: null } },
    decision: 'reject',
    error: 'The saved document location is invalid.',
  },
  {
    name: 'rejects a selected node that is not in the tree',
    state: { ...validState, location: { currentParentId: null, selectedNodeId: 'missing' } },
    decision: 'reject',
    error: 'The saved document location does not match its tree.',
  },
  {
    name: 'rejects a current parent that is not in the tree',
    state: { ...validState, location: { currentParentId: 'missing', selectedNodeId: 'root' } },
    decision: 'reject',
    error: 'The saved document location does not match its tree.',
  },
  {
    name: "rejects a selected node outside the current parent's subtree",
    state: {
      version: 2,
      document: { roots: [{ id: 'root', text: '', children: [{ id: 'child', text: '', children: [] }] }] },
      location: { currentParentId: 'child', selectedNodeId: 'root' },
    },
    decision: 'reject',
    error: 'The saved document location does not match its tree.',
  },
  {
    name: 'rejects an invalid node',
    state: { ...validState, document: { roots: [{ id: '', text: '', children: [] }] } },
    decision: 'reject',
    error: 'A saved node is invalid.',
  },
  {
    name: 'rejects duplicate node IDs',
    state: {
      ...validState,
      document: { roots: [{ id: 'root', text: '', children: [{ id: 'root', text: '', children: [] }] }] },
    },
    decision: 'reject',
    error: 'Node IDs must be unique.',
  },
  {
    name: 'rejects node children that are not an array',
    state: { ...validState, document: { roots: [{ id: 'root', text: '', children: {} }] } },
    decision: 'reject',
    error: 'Node children must be an array.',
  },
  {
    name: 'rejects links that are not an array',
    state: { ...validState, document: { roots: [{ id: 'root', text: '', links: {}, children: [] }] } },
    decision: 'reject',
    error: 'Saved links are invalid.',
  },
  {
    name: 'rejects a link with a non-string URL',
    state: {
      ...validState,
      document: { roots: [{ id: 'root', text: 'hello', links: [{ start: 0, end: 5, url: 7 }], children: [] }] },
    },
    decision: 'reject',
    error: 'Saved links are invalid.',
  },
  {
    name: 'rejects a malformed attachment',
    state: { ...validState, document: { roots: [{ id: 'root', text: '', attachment: {}, children: [] }] } },
    decision: 'reject',
    error: 'A saved attachment is invalid.',
  },
  {
    name: 'rejects a document deeper than the maximum',
    state: { ...validState, document: { roots: [overDepthRoot()] } },
    decision: 'reject',
    error: MAX_DOCUMENT_DEPTH_ERROR,
  },
]

describe('persisted state validator conformance', () => {
  it('accepts attachment IDs generated by the application', () => {
    const state = {
      version: 2,
      document: {
        roots: [
          {
            id: 'root',
            text: '',
            attachment: { id: '2d08108e-8913-45a3-a91b-8c6bef24cb12', mimeType: 'image/png' },
            children: [],
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }

    expect(validatePersistedState(state)).toBe(state)
  })

  it.each(cases)('$name', ({ state, decision, error }) => {
    const guard = outcome(validatePersistedState, state)
    const parser = outcome(parsePersistedState, state)

    // The main-process guard and the renderer load parser must make the same accept/reject decision
    // and report the same error, so a state one accepts can never be rejected by the other.
    expect(parser).toEqual(guard)
    expect(guard.decision).toBe(decision)
    if (decision === 'reject') expect(guard.error).toBe(error)
  })

  it('keeps the intended normalization difference: validate preserves a denormalized link that parse drops', () => {
    expect(validatePersistedState(denormalizedLinkState)).toBe(denormalizedLinkState)
    expect(parsePersistedState(denormalizedLinkState).document.roots[0]!.links).toBeUndefined()
  })
})
