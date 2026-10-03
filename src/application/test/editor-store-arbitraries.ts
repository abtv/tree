import fc from 'fast-check'
import {
  displayedNodes,
  isValidLocation,
  locateNode,
  type Document,
  type Location,
  type TreeNode,
} from '../../domain/document'
import type { EditorServices } from '../editor-store'
import type { EditorStore } from '../editor-store'

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

export const forest = fc.array(rawNode(1), { minLength: 1, maxLength: 3 })

export const deepForest = fc.array(rawNode(2), { minLength: 1, maxLength: 3 })

export const command = fc.record({
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
    'horizontal',
    'navigate',
    'undo',
    'redo',
    'paste',
    'pasteImage',
    'selectDescendant',
    'toggleExpansion',
    'foldAll',
    'shift',
  ),
  a: fc.nat({ max: 1_000 }),
  b: fc.nat({ max: 1_000 }),
  text: fc.string(),
})

export type CommandAction = {
  kind:
    | 'edit'
    | 'split'
    | 'delete'
    | 'deleteEmpty'
    | 'move'
    | 'enter'
    | 'leave'
    | 'up'
    | 'down'
    | 'horizontal'
    | 'navigate'
    | 'undo'
    | 'redo'
    | 'paste'
    | 'pasteImage'
    | 'selectDescendant'
    | 'toggleExpansion'
    | 'foldAll'
    | 'shift'
  a: number
  b: number
  text: string
}

export type ClipboardRef = { current: { kind: 'text'; text: string } | { kind: 'image'; png: Uint8Array } }

export function freshIds(prefix = 'x'): () => string {
  let counter = 0
  return () => `${prefix}${counter++}`
}

export function materialize(rawForest: RawNode[]): Document {
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

export function allNodes(document: Document): TreeNode[] {
  const nodes: TreeNode[] = []
  const visit = (node: TreeNode): void => {
    nodes.push(node)
    node.children.forEach(visit)
  }
  document.roots.forEach(visit)
  return nodes
}

export function allIds(document: Document): string[] {
  return allNodes(document).map((node) => node.id)
}

export function firstLocation(document: Document): Location {
  const root = document.roots[0]!
  return { currentParentId: null, selectedNodeId: root.id }
}

export function createServices(
  loadValue: unknown | null,
  clipboard: () => { kind: 'text'; text: string } | { kind: 'image'; png: Uint8Array },
): EditorServices & { saves: unknown[] } {
  const saves: unknown[] = []
  return {
    saves,
    load: async () => loadValue,
    save: async (state) => {
      saves.push(state)
    },
    readClipboard: async () => clipboard(),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
}

/** Whether the selected node is the heading or one of the location's visible rows. */
export function isDisplayed(store: EditorStore): boolean {
  const state = store.getSnapshot()
  if (state.status !== 'ready') return false
  const selected = state.location.selectedNodeId
  return selected === state.location.currentParentId || store.getVisibleRows().some((row) => row.node.id === selected)
}

/**
 * Applies one generated command to `store` and reports whether it ran. `onDeepSelection` is
 * notified whenever `selectDescendant` moves selection to a visible descendant below the current
 * sibling level, so a caller can confirm the branch was exercised across a whole property run.
 */
export async function applyCommand(
  store: EditorStore,
  action: CommandAction,
  clipboard: ClipboardRef,
  onDeepSelection?: () => void,
): Promise<boolean> {
  const state = store.getSnapshot()
  if (state.status !== 'ready') {
    return false
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
    case 'move': {
      const rows = store.getVisibleRows()
      if (rows.length > 0) {
        const target = rows[action.a % rows.length]!.node
        const siblings = locateNode(state.document, target.id)!.siblings
        store.moveNodeTo(target.id, action.b % (siblings.length + 2))
      }
      break
    }
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
    case 'horizontal':
      store.moveHorizontal(action.a % 2 === 0 ? 'left' : 'right', action.b % 30)
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
      clipboard.current =
        action.a % 2 === 0
          ? { kind: 'text', text: action.text }
          : { kind: 'text', text: `${action.text}\n${action.text}` }
      await store.paste(state.location.selectedNodeId, action.b % 30)
      break
    case 'pasteImage':
      clipboard.current = { kind: 'image', png: new Uint8Array([action.a % 256]) }
      await store.paste(state.location.selectedNodeId, action.b % 30)
      break
    case 'selectDescendant': {
      const displayedIds = new Set(displayed.map((node) => node.id))
      const candidates = store
        .getVisibleRows()
        .map((row) => row.node)
        .filter(
          (node) =>
            node.id !== state.location.currentParentId &&
            !displayedIds.has(node.id) &&
            isValidLocation(state.document, { ...state.location, selectedNodeId: node.id }),
        )
      if (candidates.length > 0) {
        store.selectNode(candidates[action.a % candidates.length]!.id, 0)
        onDeepSelection?.()
      }
      break
    }
    case 'toggleExpansion': {
      const rows = store.getVisibleRows().filter((row) => row.node.children.length > 0)
      if (rows.length > 0) store.toggleExpansion(rows[action.a % rows.length]!.node.id)
      break
    }
    case 'foldAll':
      store.applyFold(action.a % 2 === 0 ? 'close-all' : 'open-all')
      break
    case 'shift': {
      // A whole-node Visual range always ends at the selected node; its other end is any sibling.
      const siblings = locateNode(state.document, state.location.selectedNodeId)?.siblings ?? []
      if (siblings.length > 0) {
        const anchor = siblings[action.b % siblings.length]!
        store.shiftNodeVisual(
          action.a % 2 === 0 ? 'in' : 'out',
          anchor.id,
          state.location.selectedNodeId,
          1 + (action.text.length % 3),
        )
      }
      break
    }
  }

  return true
}
