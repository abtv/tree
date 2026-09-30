import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { EditorStore, type EditorServices } from './editor-store'
import {
  allIds,
  applyCommand,
  command,
  createServices,
  deepForest,
  firstLocation,
  forest,
  freshIds,
  isDisplayed,
  materialize,
  type ClipboardRef,
  type CommandAction,
} from './test/editor-store-arbitraries'
import {
  assertDocument,
  cloneNode,
  isValidLocation,
  locateNode,
  serializeState,
  type TreeNode,
} from '../domain/document'

type ReadyState = Extract<ReturnType<EditorStore['getSnapshot']>, { status: 'ready' }>

function displayedIn(state: ReadyState, document: ReadyState['document'], nodeId: string): boolean {
  if (nodeId === state.location.currentParentId) return locateNode(document, nodeId) !== undefined
  const node = locateNode(document, nodeId)
  if (node === undefined) return false
  const parent = state.location.currentParentId
  const parentIndex = parent === null ? -1 : node.ancestors.findIndex((ancestor) => ancestor.id === parent)
  if (parent !== null && parentIndex === -1) return false
  return node.ancestors.slice(parentIndex + 1).every((ancestor) => state.expansion.expandedIds.has(ancestor.id))
}

/** Check effects against the incoming view, independently of the location chosen by the command. */
function assertTransition(store: EditorStore, before: ReadyState, action: CommandAction, knownIds: Set<string>): void {
  assertInvariants(store)
  const after = store.getSnapshot()
  if (after.status !== 'ready') return
  for (const id of allIds(after.document)) knownIds.add(id)
  for (const id of after.expansion.expandedIds) expect(knownIds.has(id)).toBe(true)

  // Expansion is independent of document history. Deleted nodes retain their choices for undo.
  if (action.kind !== 'toggleExpansion' && action.kind !== 'foldAll') {
    expect(after.expansion.expandedIds).toEqual(before.expansion.expandedIds)
  }

  switch (action.kind) {
    case 'enter':
    case 'leave':
    case 'navigate':
      return
    case 'undo':
    case 'redo':
      // §10 allows navigation only when displaying the resulting change site requires it.
      if (!displayedIn(before, after.document, after.location.selectedNodeId)) return
      break
    case 'paste':
    case 'pasteImage':
      // A paste on the heading can create a sibling outside its current location (§§14–15).
      if (before.location.selectedNodeId === before.location.currentParentId) return
      break
  }
  expect(after.location.currentParentId).toBe(before.location.currentParentId)
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
  expect(isDisplayed(store)).toBe(true)
  expect(() => assertDocument(state.document)).not.toThrow()
  expect(() => serializeState(state.document, state.location, state.expansion)).not.toThrow()
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
        const knownIds = new Set(allIds(document))
        assertInvariants(store)

        for (const action of commands) {
          const before = store.getSnapshot()
          if (before.status !== 'ready') break
          const ran = await applyCommand(store, action, clipboard)
          if (!ran) break
          assertTransition(store, before, action, knownIds)
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
        const knownIds = new Set(allIds(document))
        assertInvariants(store)

        for (const action of commands) {
          const before = store.getSnapshot()
          if (before.status !== 'ready') break
          const ran = await applyCommand(store, action, clipboard, () => {
            exercisedDeepSelection = true
          })
          if (!ran) break
          assertTransition(store, before, action, knownIds)
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

  it('keeps the location and expansion choices through visible descendant deletion, undo, and redo', async () => {
    await fc.assert(
      fc.asyncProperty(forest, fc.boolean(), fc.boolean(), async (rawForest, rootLocation, emptyDelete) => {
        const descendants = materialize(rawForest).roots
        const document = {
          roots: [
            {
              id: 'view-root',
              text: 'Root',
              children: [
                {
                  id: 'branch',
                  text: 'Branch',
                  children: [{ id: 'leaf', text: '', children: descendants }],
                },
              ],
            },
          ],
        }
        const clipboard: ClipboardRef = { current: { kind: 'text', text: '' } }
        const store = new EditorStore(
          createServices(
            {
              version: 1,
              document,
              location: {
                currentParentId: rootLocation ? null : 'view-root',
                selectedNodeId: 'branch',
              },
            },
            () => clipboard.current,
          ),
          freshIds(),
        )
        await store.initialize()
        const knownIds = new Set(allIds(document))
        const run = async (kind: CommandAction['kind']): Promise<void> => {
          const before = store.getSnapshot()
          if (before.status !== 'ready') throw new Error('Editor did not initialize')
          const action = { kind, a: 1, b: 0, text: '' }
          await applyCommand(store, action, clipboard)
          assertTransition(store, before, action, knownIds)
        }
        await run('foldAll')
        store.selectNode('leaf', 0)
        assertInvariants(store)
        await run(emptyDelete ? 'deleteEmpty' : 'delete')
        await run('undo')
        expect(store.getSnapshot()).toMatchObject({ location: { selectedNodeId: 'leaf' } })
        expect(store.getVisibleRows().map((row) => row.node.id)).toContain(descendants[0]!.id)
        await run('redo')
      }),
      { numRuns: propertyRuns(100) },
    )
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
