import ts from 'typescript'
import { expect, it } from 'vitest'
import { EditorStore } from './editor-store'
import storeSource from './editor-store.ts?raw'
import generatorSource from './test/editor-store-arbitraries.ts?raw'

// These omissions describe the current generator's scope, not claimed property coverage.
const exclusions: Record<string, string> = {
  openAgenda: 'Agenda lifecycle is generated in editor-store-agenda.property.test.ts.',
  closeAgenda: 'Agenda lifecycle is generated in editor-store-agenda.property.test.ts.',
  applyAgenda: 'Agenda selection and presentation commands have dedicated property coverage.',
  createAgendaDayNode: 'Agenda day creation is generated in editor-store-agenda.property.test.ts.',
  splitAgendaNode: 'Agenda splitting is generated in editor-store-agenda.property.test.ts.',
  createAgendaSibling: 'Agenda sibling creation is generated in editor-store-agenda.property.test.ts.',
  moveAgendaOccurrences:
    'Agenda occurrence moves have dedicated property coverage in editor-store-agenda-move.test.ts.',
  getAgendaRows: 'Read-only Agenda projection with dedicated cache and composition tests.',
  getVisibleRows: 'Read-only projection used by the generator to choose displayed targets.',
  getRestoredSelectedRowTop: 'Read-only startup viewport metadata.',
  registerSelectedRowTopReader: 'Renderer measurement registration requires a viewport harness.',
  noteViewportChange: 'Scroll persistence accounting is covered by save-scheduler tests.',
  registerPendingEditFinisher: 'Renderer edit lifecycle registration requires an input harness.',
  flushPersistence: 'Shutdown persistence lifecycle is covered by dedicated persistence tests.',
  reportError: 'Failure injection is covered by error and persistence-lock tests.',
  requestQuitWithoutSavingPrompt: 'Quit prompt lifecycle is covered by dedicated shutdown tests.',
  dismissQuitWithoutSavingPrompt: 'Quit prompt lifecycle is covered by dedicated shutdown tests.',
  initialize: 'Startup is performed by the property harness before command generation.',
  editContent: 'Rich-link edits need link-aware generated inputs; the generator currently edits plain text.',
  replaceTextRange: 'Range editing is covered by text and Vim properties; not generated here.',
  replaceTextRanges: 'Multi-range link-preserving edits need range-aware generated inputs.',
  deleteLink: 'Link deletion needs link-aware generated documents.',
  copy: 'Clipboard output needs writable clipboard services; this harness only supplies input.',
  copyVimContent:
    'Vim clipboard output is covered by focused application, renderer, and IPC tests; this harness only supplies input.',
  copyVimForest: 'Vim forest export has focused projection and renderer coverage and does not mutate the document.',
  cut: 'Clipboard output needs writable clipboard services; this harness only supplies input.',
  endTextSession: 'History properties call this between commands to separate history entries.',
  markNextTextEditStandalone: 'Text-session grouping is covered by dedicated session tests.',
  moveSelectionBoundary: 'Boundary navigation is covered by navigation and Vim properties; not generated here.',
  createSibling: 'Explicit structural opening is covered by Vim properties; this generator uses split.',
  createChild: 'Explicit structural opening is covered by Vim properties; this generator uses split.',
  createSiblingWithText: 'Structural repeat with supplied text is covered by Vim tests; not generated here.',
  createChildWithText: 'Structural repeat with supplied text is covered by Vim tests; not generated here.',
  deleteSiblingRange: 'Counted subtree deletion needs generated sibling spans; covered by dedicated store tests.',
  pasteSubtree: 'Node-register paste needs generated subtree/register state; clipboard paste is generated instead.',
  pasteNodeForest: 'Forest-register paste needs generated forest/register state.',
  applyNodeVisual: 'Whole-node Visual commands need generated selection spans and register state.',
  canShiftNodeVisualOutWithinCurrentParent:
    'Read-only Tab shortcut boundary check is covered by focused store, property, and renderer tests.',
  moveSelectedTo: 'Convenience wrapper around moveNodeTo, which the generator drives directly.',
}

it('accounts for every public EditorStore prototype method in the command generator or exclusions', () => {
  const source = ts.createSourceFile('editor-store.ts', storeSource, ts.ScriptTarget.Latest, true)
  const declaration = source.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === 'EditorStore',
  )!
  // TypeScript private methods also exist on the runtime prototype. Exclude them using their declarations.
  const privateMethods = new Set(
    declaration.members
      .filter(
        (member) =>
          ts.isMethodDeclaration(member) &&
          ts.getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword),
      )
      .map((member) => member.name!.getText(source)),
  )
  const methods = Object.getOwnPropertyNames(EditorStore.prototype).filter(
    (name) => name !== 'constructor' && !privateMethods.has(name),
  )
  const generator = ts.createSourceFile('editor-store-arbitraries.ts', generatorSource, ts.ScriptTarget.Latest, true)
  const apply = generator.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'applyCommand',
  )!
  const driven = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(generator) === 'store'
    ) {
      driven.add(node.expression.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(apply)
  // A read is not a generated command, even when applyCommand uses it to choose a target.
  driven.delete('getSnapshot')
  driven.delete('getVisibleRows')

  expect(
    methods.filter((name) => !driven.has(name) && !exclusions[name]),
    'Public methods missing from generator or exclusions',
  ).toEqual([])
  expect(
    Object.keys(exclusions).filter((name) => !methods.includes(name)),
    'Stale exclusions',
  ).toEqual([])
  expect(
    Object.keys(exclusions).filter((name) => driven.has(name)),
    'Generated commands must not remain excluded',
  ).toEqual([])
  expect(Object.values(exclusions).every((reason) => reason.trim().length > 0)).toBe(true)
})
