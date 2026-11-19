import { describe, expect, it } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import type { PersistedEditorState, TreeNode } from '../domain/document'

function node(id: string, children: TreeNode[] = [], starred = false): TreeNode {
  return { id, text: id, ...(starred ? { starred: true as const } : {}), children }
}

// work (starred) > project > task; work > notes > note; home > chores > chore
function document(workStarred = true): { roots: TreeNode[] } {
  return {
    roots: [
      node('work', [node('project', [node('task')]), node('notes', [node('note')])], workStarred),
      node('home', [node('chores', [node('chore')])]),
    ],
  }
}

function persistence(initial: PersistedEditorState): EditorServices & { saved(): PersistedEditorState } {
  let saved = initial
  return {
    saved: () => saved,
    load: async () => saved,
    save: async (state) => {
      saved = JSON.parse(JSON.stringify(state)) as PersistedEditorState
    },
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
}

async function open(services: EditorServices): Promise<EditorStore> {
  const store = new EditorStore(services, () => 'unused')
  await store.initialize()
  return store
}

function rows(store: EditorStore): string[] {
  return store.getVisibleRows().map((row) => row.node.id)
}

function snapshot(store: EditorStore): ReadySnapshot {
  return store.getSnapshot() as ReadySnapshot
}

function enter(store: EditorStore, nodeId: string): void {
  store.selectNode(nodeId, 0)
  store.enter()
}

// @requirement PRODUCT.md §2.4
describe('expansion views of starred nodes', () => {
  it('keeps separate folds in the root view and a starred node’s view across navigation and relaunch', async () => {
    const services = persistence({
      version: 5,
      document: document(),
      location: { currentParentId: null, selectedNodeId: 'work' },
      view: { expandedIds: ['work', 'project'] },
    })
    const store = await open(services)

    expect(rows(store)).toEqual(['work', 'project', 'task', 'notes', 'home'])

    enter(store, 'work')

    expect(rows(store)).toEqual(['project', 'task', 'notes'])

    store.toggleExpansion('project')
    store.toggleExpansion('notes')

    expect(rows(store)).toEqual(['project', 'notes', 'note'])

    store.leave()

    expect(rows(store)).toEqual(['work', 'project', 'task', 'notes', 'home'])

    enter(store, 'work')

    expect(rows(store)).toEqual(['project', 'notes', 'note'])

    await store.flushPersistence()

    expect(services.saved().view).toEqual({ expandedIds: ['work', 'project'], starredExpandedIds: { work: ['notes'] } })

    const relaunched = await open(services)

    expect(rows(relaunched)).toEqual(['project', 'notes', 'note'])

    relaunched.leave()

    expect(rows(relaunched)).toEqual(['work', 'project', 'task', 'notes', 'home'])
  })

  it('applies the starred view to every location below the starred node', async () => {
    const store = await open(
      persistence({
        version: 5,
        document: document(),
        location: { currentParentId: 'project', selectedNodeId: 'task' },
        view: { expandedIds: [] },
      }),
    )

    expect(snapshot(store).expansion.viewOwnerId).toBe('work')

    store.navigateToAncestor('work')
    store.toggleExpansion('project')
    store.navigateToAncestor(null)

    expect(rows(store)).toEqual(['work', 'home'])

    store.toggleExpansion('work')

    expect(rows(store)).toEqual(['work', 'project', 'notes', 'home'])
  })

  it('closes every fold of the root view with zM at the top level and leaves starred views unchanged', async () => {
    const store = await open(
      persistence({
        version: 5,
        document: document(),
        location: { currentParentId: null, selectedNodeId: 'work' },
        view: { expandedIds: ['work', 'home'], starredExpandedIds: { work: ['notes'] } },
      }),
    )

    store.applyFold('close-all')

    expect(rows(store)).toEqual(['work', 'home'])

    enter(store, 'work')

    expect(rows(store)).toEqual(['project', 'notes', 'note'])
  })

  it('keeps the rows when a star creates a view and restores the inherited view when the star is removed', async () => {
    const store = await open(
      persistence({
        version: 5,
        document: document(),
        location: { currentParentId: null, selectedNodeId: 'home' },
        view: { expandedIds: ['home'] },
      }),
    )
    enter(store, 'home')
    store.selectNode('home', 0)

    store.toggleStarNode()

    expect(rows(store)).toEqual(['chores'])
    expect(snapshot(store).expansion.viewOwnerId).toBe('home')

    store.toggleExpansion('chores')

    expect(rows(store)).toEqual(['chores', 'chore'])

    store.selectNode('home', 0)
    store.toggleStarNode()

    expect(snapshot(store).expansion.viewOwnerId).toBeNull()
    expect(rows(store)).toEqual(['chores'])

    store.undo()

    expect(snapshot(store).expansion.viewOwnerId).toBe('home')
    expect(rows(store)).toEqual(['chores', 'chore'])
  })

  it('shows the root view when an outdent takes the location out of the starred node', async () => {
    const store = await open(
      persistence({
        version: 5,
        document: document(),
        location: { currentParentId: 'work', selectedNodeId: 'project' },
        view: { expandedIds: ['home'], starredExpandedIds: { work: ['project'] } },
      }),
    )

    expect(store.shiftNodeVisual('out', 'project', 'project')).toBe(true)

    expect(snapshot(store).location.currentParentId).toBeNull()
    expect(snapshot(store).expansion.viewOwnerId).toBeNull()
    expect(rows(store)).toEqual(['work', 'project', 'home', 'chores'])
  })

  it('returns from Agenda to the view of the starred location', async () => {
    const store = await open(
      persistence({
        version: 5,
        document: document(),
        location: { currentParentId: 'work', selectedNodeId: 'task' },
        view: { expandedIds: [], starredExpandedIds: { work: ['project'] } },
      }),
    )

    store.openAgenda()
    store.closeAgenda()

    expect(snapshot(store).expansion.viewOwnerId).toBe('work')
    expect(snapshot(store).location).toEqual({ currentParentId: 'work', selectedNodeId: 'task' })
    expect(rows(store)).toEqual(['project', 'task', 'notes'])
  })

  it('shows the inherited view when Agenda closes after an undo removed the star', async () => {
    const store = await open(
      persistence({
        version: 5,
        document: document(false),
        location: { currentParentId: 'work', selectedNodeId: 'work' },
        view: { expandedIds: [] },
      }),
    )
    store.toggleStarNode()
    store.toggleExpansion('project')
    store.selectNode('task', 2)

    store.openAgenda()
    store.undo()
    store.closeAgenda()

    expect(snapshot(store).document.roots[0]).not.toHaveProperty('starred')
    expect(snapshot(store).expansion.viewOwnerId).toBeNull()
    expect(snapshot(store).location).toEqual({ currentParentId: 'work', selectedNodeId: 'project' })
    expect(snapshot(store).focus).toMatchObject({ nodeId: 'project', cursor: 0 })
    expect(rows(store)).toEqual(['project', 'notes'])
  })

  it('shows the root view when finishing the last task of a starred location hides it', async () => {
    const store = await open(
      persistence({
        version: 5,
        document: {
          roots: [node('work', [node('a'), node('b')], true), node('home', [node('chores', [node('chore')])])],
        },
        location: { currentParentId: 'work', selectedNodeId: 'a' },
        view: { expandedIds: ['home'], starredExpandedIds: { work: [] } },
      }),
    )
    await store.setHideFinishedTasks(true)

    store.toggleStrikethrough('a', 'a')
    store.toggleStrikethrough('b', 'b')

    expect(snapshot(store).location).toEqual({ currentParentId: null, selectedNodeId: 'home' })
    expect(snapshot(store).expansion.viewOwnerId).toBeNull()
    expect(rows(store)).toEqual(['home', 'chores'])
  })

  it('drops the view of an unstarred node from the saved file', async () => {
    const services = persistence({
      version: 5,
      document: document(),
      location: { currentParentId: 'work', selectedNodeId: 'work' },
      view: { expandedIds: [], starredExpandedIds: { work: ['notes'] } },
    })
    const store = await open(services)

    store.toggleStarNode()
    await store.flushPersistence()

    expect(services.saved().view).toEqual({ expandedIds: [] })
  })
})
