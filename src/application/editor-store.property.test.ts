import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
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

const deepForest = fc.array(rawNode(2), { minLength: 1, maxLength: 3 })

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
    'horizontal',
    'navigate',
    'undo',
    'redo',
    'paste',
    'pasteImage',
    'selectDescendant',
    'toggleExpansion',
    'foldAll',
  ),
  a: fc.nat({ max: 1_000 }),
  b: fc.nat({ max: 1_000 }),
  text: fc.string(),
})

type CommandAction = {
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
  a: number
  b: number
  text: string
}

type ClipboardRef = { current: { kind: 'text'; text: string } | { kind: 'image'; png: Uint8Array } }

function freshIds(prefix = 'x'): () => string {
  let counter = 0
  return () => `${prefix}${counter++}`
}

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

function createServices(
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
  expect(() => serializeState(state.document, state.location, state.expansion)).not.toThrow()
}

/** Whether the selected node is the heading or one of the location's visible rows. */
function isDisplayed(store: EditorStore): boolean {
  const state = store.getSnapshot()
  if (state.status !== 'ready') return false
  const selected = state.location.selectedNodeId
  return selected === state.location.currentParentId || store.getVisibleRows().some((row) => row.node.id === selected)
}

/**
 * Applies one generated command to `store` and reports whether it ran. `onDeepSelection` is
 * notified whenever `selectDescendant` actually moves selection to a descendant below the current
 * displayed level, so a caller can confirm the branch was exercised across a whole property run.
 */
async function applyCommand(
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
      const candidates = nodes.filter(
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
  }

  return true
}

describe('EditorStore invariants under command sequences', () => {
  it('keeps the document and location valid after any command sequence', async () => {
    await fc.assert(
      fc.asyncProperty(forest, fc.array(command, { minLength: 1, maxLength: 30 }), async (rawForest, commands) => {
        const document = materialize(rawForest)
        const clipboard: ClipboardRef = { current: { kind: 'text', text: '' } }
        const store = new EditorStore(
          createServices({ version: 1, document, location: firstLocation(document) }, () => clipboard.current),
          freshIds(),
        )
        await store.initialize()

        for (const action of commands) {
          const ran = await applyCommand(store, action, clipboard)
          if (!ran) break
          assertInvariants(store)
        }
      }),
      { numRuns: propertyRuns(500) },
    )
  })

  it('restores an equal document and a displayed location after a serialize-and-restore round trip', async () => {
    let exercisedDeepSelection = false

    await fc.assert(
      fc.asyncProperty(deepForest, fc.array(command, { minLength: 1, maxLength: 30 }), async (rawForest, commands) => {
        const document = materialize(rawForest)
        const clipboard: ClipboardRef = { current: { kind: 'text', text: '' } }
        const store = new EditorStore(
          createServices({ version: 1, document, location: firstLocation(document) }, () => clipboard.current),
          freshIds(),
        )
        await store.initialize()

        for (const action of commands) {
          const ran = await applyCommand(store, action, clipboard, () => {
            exercisedDeepSelection = true
          })
          if (!ran) break
          assertInvariants(store)
        }

        const state = store.getSnapshot()
        if (state.status !== 'ready') return

        const persisted = JSON.parse(
          JSON.stringify(serializeState(state.document, state.location, state.expansion)),
        ) as unknown

        const restoredStore = new EditorStore(
          createServices(persisted, () => ({ kind: 'text', text: '' })),
          freshIds(),
        )
        await restoredStore.initialize()
        const restored = restoredStore.getSnapshot()

        expect(restored.status).toBe('ready')
        if (restored.status !== 'ready') return
        expect(restored.document).toEqual(state.document)
        expect(restored.location.currentParentId).toBe(state.location.currentParentId)
        // Every remembered choice for a node the document still holds survives the restart, so the
        // restored location shows the same rows, and a selection that was displayed is kept.
        const liveIds = new Set(allIds(state.document))
        expect(restored.expansion.expandedIds).toEqual(
          new Set([...state.expansion.expandedIds].filter((id) => liveIds.has(id))),
        )
        expect(restoredStore.getVisibleRows().map((row) => row.node.id)).toEqual(
          store.getVisibleRows().map((row) => row.node.id),
        )
        expect(isDisplayed(restoredStore)).toBe(true)
        if (isDisplayed(store)) expect(restored.location.selectedNodeId).toBe(state.location.selectedNodeId)
      }),
      // Fixed seed on purpose: the assertion below needs this run to reach a deep selection, and a
      // random seed cannot promise that. Replaying FC_SEED does not override an explicit seed.
      { seed: 20_260_929, numRuns: propertyRuns(300) },
    )

    // Confirms the property run above actually exercised the branch this task guards, not only the
    // shallow cases already covered by the hand-written store tests.
    expect(exercisedDeepSelection).toBe(true)
  })

  it('preserves node ids that survive an operation', () => {
    fc.assert(
      fc.property(forest, (rawForest) => {
        const document = materialize(rawForest)
        const ids = allIds(document)
        const clone = { roots: document.roots.map(cloneNode) }

        expect(allIds(clone)).toEqual(ids)
      }),
    )
  })

  it('places a sibling created from an empty node immediately after that node', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.string(), { minLength: 1, maxLength: 5 }), async (texts) => {
        const roots = texts.map((text, index) => ({ id: `root-${index}`, text, children: [] as TreeNode[] }))
        roots.splice(1, 0, { id: 'empty', text: '', children: [] })
        const store = new EditorStore(
          createServices(
            {
              version: 1,
              document: { roots },
              location: { currentParentId: null, selectedNodeId: 'empty' },
            },
            () => ({ kind: 'text', text: '' }),
          ),
          () => 'created',
        )
        await store.initialize()

        store.createSiblingOrFirstChild(0)

        const state = store.getSnapshot()
        expect(state.status).toBe('ready')
        if (state.status === 'ready') {
          const emptyIndex = state.document.roots.findIndex((node) => node.id === 'empty')
          expect(state.document.roots[emptyIndex + 1]?.id).toBe('created')
          expect(state.location.selectedNodeId).toBe('created')
          expect(state.focus).toMatchObject({ nodeId: 'created', cursor: 0 })
        }
      }),
      { numRuns: propertyRuns(100) },
    )
  })

  it('never removes text for a delayed cut once the target content has changed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ maxLength: 20 }),
        async (original, intervening) => {
          let release: (() => void) | undefined
          const services = createServices(
            {
              version: 1,
              document: { roots: [{ id: 'root', text: original, children: [] }] },
              location: { currentParentId: null, selectedNodeId: 'root' },
            },
            () => ({ kind: 'text', text: '' }),
          )
          services.writeClipboard = () =>
            new Promise<void>((resolve) => {
              release = resolve
            })
          const store = new EditorStore(services, () => 'unused')
          await store.initialize()

          const pending = store.cut('root', 0, original.length)
          expect(release).toBeTypeOf('function')
          store.editText('root', intervening)
          release!()
          await pending

          const state = store.getSnapshot()
          expect(state.status).toBe('ready')
          if (state.status !== 'ready') {
            return
          }
          if (intervening === original) {
            expect(state.document.roots[0]!.text).toBe('')
            expect(state.operationError).toBeUndefined()
            store.undo()
            expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: original }] } })
            store.redo()
            expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: '' }] } })
          } else {
            expect(state.document.roots[0]!.text).toBe(intervening)
            expect(state.operationError).toBe('The cut could not finish because the text changed.')
            store.undo()
            expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: original }] } })
            store.redo()
            expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: intervening }] } })
          }
          assertInvariants(store)
        },
      ),
      { numRuns: propertyRuns(200) },
    )
  })
})

type SaveEvent = { kind: 'insert'; words: number } | { kind: 'success' } | { kind: 'failure' }

interface DeferredSave {
  resolve: () => void
  reject: (error: Error) => void
}

function noopClock(): { setTimeout: () => undefined; clearTimeout: () => undefined } {
  return { setTimeout: () => undefined, clearTimeout: () => undefined }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('EditorStore save accounting', () => {
  it('requests saves according to an independent watermark model before the failure lock', async () => {
    const event: fc.Arbitrary<SaveEvent> = fc.oneof(
      fc.record({ kind: fc.constant('insert' as const), words: fc.integer({ min: 1, max: 10 }) }),
      fc.record({ kind: fc.constant('success' as const) }),
      fc.record({ kind: fc.constant('failure' as const) }),
    )
    const boundedEvents = fc.array(event, { maxLength: 40 }).map((events) => {
      let failures = 0
      return events.map((current) => {
        if (current.kind !== 'failure') return current
        failures += 1
        return failures <= 2 ? current : ({ kind: 'success' } as const)
      })
    })

    await fc.assert(
      fc.asyncProperty(boundedEvents, async (events) => {
        const saves: unknown[] = []
        const pending: DeferredSave[] = []
        const services: EditorServices & { saves: unknown[] } = {
          saves,
          load: async () => ({
            version: 1,
            document: { roots: [{ id: 'root', text: '', children: [] }] },
            location: { currentParentId: null, selectedNodeId: 'root' },
          }),
          save: (state) =>
            new Promise<void>((resolve, reject) => {
              saves.push(state)
              pending.push({ resolve, reject })
            }),
          readClipboard: async () => ({ kind: 'text', text: '' }),
          writeAttachment: async () => undefined,
          cleanupAttachments: async () => undefined,
        }
        const store = new EditorStore(services, () => 'created', noopClock())
        await store.initialize()
        await store.flushPersistence()
        saves.length = 0

        const threshold = 10
        let inserted = 0
        let acknowledged = 0
        let requested = false
        let inFlight: number | undefined
        let started = 0
        const startIfIdle = (): void => {
          if (inFlight === undefined && requested) {
            inFlight = inserted
            requested = false
            started += 1
          }
        }
        let wordCount = 0
        const textFor = (words: number): string =>
          `${Array.from({ length: words }, (_, index) => `w${index}`).join(' ')} `

        for (const current of events) {
          if (current.kind === 'insert') {
            wordCount += current.words
            store.editText('root', textFor(wordCount))
            inserted += current.words
            if (inserted - acknowledged >= threshold) requested = true
            await tick()
            startIfIdle()
            expect(saves.length).toBe(started)
            continue
          }

          if (inFlight === undefined) continue
          const next = pending.shift()
          expect(next).toBeDefined()
          if (current.kind === 'success') {
            next!.resolve()
            acknowledged = Math.max(acknowledged, inFlight)
          } else {
            next!.reject(new Error('save failed'))
          }
          inFlight = undefined
          startIfIdle()
          await tick()
          expect(saves.length).toBe(started)
        }

        while (inFlight !== undefined || requested) {
          startIfIdle()
          if (inFlight === undefined) break
          pending.shift()!.resolve()
          acknowledged = Math.max(acknowledged, inFlight)
          inFlight = undefined
          startIfIdle()
          await tick()
        }
        while (pending.length > 0) {
          pending.shift()!.resolve()
          await tick()
        }
        expect(saves.length).toBe(started)

        wordCount += threshold
        store.editText('root', textFor(wordCount))
        inserted += threshold
        if (inserted - acknowledged >= threshold) requested = true
        await tick()
        startIfIdle()
        let guard = 0
        while ((inFlight !== undefined || requested || pending.length > 0) && guard < 100) {
          guard += 1
          startIfIdle()
          if (pending.length > 0) {
            pending.shift()!.resolve()
            acknowledged = Math.max(acknowledged, inFlight ?? acknowledged)
            inFlight = undefined
            startIfIdle()
          }
          await tick()
        }
        expect(acknowledged).toBe(inserted)

        wordCount += 1
        store.editText('root', textFor(wordCount))
        await tick()
        expect(saves.length).toBe(started)
      }),
      { numRuns: propertyRuns(200) },
    )
  })
})
