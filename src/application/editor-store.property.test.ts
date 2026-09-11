import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import {
  assertDocument,
  cloneNode,
  displayedNodes,
  isValidLocation,
  locateNode,
  serializeState,
  type Document,
  type Location,
  type TreeNode,
} from '../domain/document'

interface RawNode {
  text: string
  hasAttachment: boolean
  children: RawNode[]
}

function rawNode(depth: number): fc.Arbitrary<RawNode> {
  if (depth === 0) {
    return fc.record<RawNode>({ text: fc.string(), hasAttachment: fc.boolean(), children: fc.constant<RawNode[]>([]) })
  }
  return fc.record<RawNode>({
    text: fc.string(),
    hasAttachment: fc.boolean(),
    children: fc.array(rawNode(depth - 1), { maxLength: 2 }),
  })
}

const forest = fc.array(rawNode(1), { minLength: 1, maxLength: 3 })

const command = fc.record({
  kind: fc.constantFrom(
    'edit',
    'split',
    'delete',
    'deleteEmpty',
    'move',
    'enter',
    'leave',
    'up',
    'down',
    'navigate',
    'undo',
    'redo',
    'paste',
    'pasteImage',
  ),
  a: fc.nat({ max: 1_000 }),
  b: fc.nat({ max: 1_000 }),
  text: fc.string(),
})

function materialize(rawForest: RawNode[]): Document {
  let counter = 0
  const build = (raw: RawNode): TreeNode => {
    const id = `n${counter++}`
    return {
      id,
      text: raw.text,
      ...(raw.hasAttachment ? { attachment: { id: `a${id}`, mimeType: 'image/png' as const } } : {}),
      children: raw.children.map(build),
    }
  }
  return { roots: rawForest.map(build) }
}

function allNodes(document: Document): TreeNode[] {
  const nodes: TreeNode[] = []
  const visit = (node: TreeNode): void => {
    nodes.push(node)
    node.children.forEach(visit)
  }
  document.roots.forEach(visit)
  return nodes
}

function allIds(document: Document): string[] {
  return allNodes(document).map((node) => node.id)
}

function firstLocation(document: Document): Location {
  const root = document.roots[0]!
  return { currentParentId: null, selectedNodeId: root.id }
}

function createServices(loadValue: unknown | null, clipboard: () => { kind: 'text'; text: string } | { kind: 'image'; png: Uint8Array }): EditorServices & { saves: unknown[] } {
  const saves: unknown[] = []
  return {
    saves,
    load: async () => loadValue,
    save: async (state) => { saves.push(state) },
    readClipboard: async () => clipboard(),
    writeAttachment: async () => undefined,
    hasAttachment: async () => true,
    cleanupAttachments: async () => undefined,
  }
}

function assertInvariants(store: EditorStore): void {
  const state = store.getSnapshot()
  expect(state.status).toBe('ready')
  if (state.status !== 'ready') {
    return
  }

  const ids = allIds(state.document)
  expect(new Set(ids).size).toBe(ids.length)
  expect(isValidLocation(state.document, state.location)).toBe(true)
  expect(locateNode(state.document, state.location.selectedNodeId)).toBeDefined()
  expect(locateNode(state.document, state.focus.nodeId)).toBeDefined()
  expect(() => assertDocument(state.document)).not.toThrow()
  expect(() => serializeState(state.document, state.location)).not.toThrow()
}

describe('EditorStore invariants under command sequences', () => {
  it('keeps the document and location valid after any command sequence', async () => {
    await fc.assert(fc.asyncProperty(forest, fc.array(command, { minLength: 1, maxLength: 30 }), async (rawForest, commands) => {
      const document = materialize(rawForest)
      const clipboard: { current: { kind: 'text'; text: string } | { kind: 'image'; png: Uint8Array } } = { current: { kind: 'text', text: '' } }
      const store = new EditorStore(createServices(
        { version: 1, document, location: firstLocation(document) },
        () => clipboard.current,
      ), (() => {
        let counter = 0
        return () => `x${counter++}`
      })())
      await store.initialize()

      for (const action of commands) {
        const state = store.getSnapshot()
        if (state.status !== 'ready') {
          break
        }

        const nodes = allNodes(state.document)
        const displayed = displayedNodes(state.document, state.location.currentParentId)

        switch (action.kind) {
          case 'edit':
            if (nodes.length > 0) {
              store.editText(nodes[action.a % nodes.length]!.id, action.text)
            }
            break
          case 'split':
            store.createSiblingOrFirstChild(action.a % 30)
            break
          case 'delete':
            store.deleteSelected()
            break
          case 'deleteEmpty':
            store.deleteEmptySelected()
            break
          case 'move':
            if (displayed.length > 0) {
              store.moveNodeTo(displayed[action.a % displayed.length]!.id, action.b % (displayed.length + 2))
            }
            break
          case 'enter':
            store.enter()
            break
          case 'leave':
            store.leave()
            break
          case 'up':
            store.moveSelection('up', action.a % 10)
            break
          case 'down':
            store.moveSelection('down', action.a % 10)
            break
          case 'navigate':
            store.navigateToAncestor(action.a % 2 === 0 ? null : state.location.currentParentId)
            break
          case 'undo':
            store.undo()
            break
          case 'redo':
            store.redo()
            break
          case 'paste':
            clipboard.current = action.a % 2 === 0
              ? { kind: 'text', text: action.text }
              : { kind: 'text', text: `${action.text}\n${action.text}` }
            await store.paste(state.location.selectedNodeId, action.b % 30)
            break
          case 'pasteImage':
            clipboard.current = { kind: 'image', png: new Uint8Array([action.a % 256]) }
            await store.paste(state.location.selectedNodeId, action.b % 30)
            break
        }

        assertInvariants(store)
      }
    }), { numRuns: 500 })
  })

  it('preserves node ids that survive an operation', () => {
    fc.assert(fc.property(forest, (rawForest) => {
      const document = materialize(rawForest)
      const ids = allIds(document)
      const clone = { roots: document.roots.map(cloneNode) }

      expect(allIds(clone)).toEqual(ids)
    }))
  })
})
