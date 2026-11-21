# Non-Functional Requirements

## 22. Non-Functional Requirements

### 22.1 Performance of State and Persistence Changes

The application must stay responsive and must not accumulate unbounded memory or perform unnecessary disk operations as the document and edit history grow.

Typing in long decorated rows must keep the caret and viewport stable without pauses caused by redundant replacement of unchanged formatted content. This rule does not change the behavior of actual formatting changes, undo/redo and composition.

Preparing and dispatching a large save must leave ongoing typing and navigation responsive, including when a save scheduled in Tree becomes due after opening Agenda. This rule does not change save timing, ordering, failure handling or durable acknowledgment.

Concrete budgets are not fixed here. `docs/AGENT_WORKFLOW.md` §4 defines the performance assessment that every change to editor state or persistence requires and the automated performance guards that a change affecting performance at scale requires, and `docs/DEVELOPMENT.md` §8 defines the pre-release Linux memory checks.

Text recognition must avoid quadratic retries over whitespace when joining nodes. Link reconciliation must consume word matches incrementally, retaining only recognized links. Relative-date count parsing must retain only the fields needed for validation, and Vim number case detection must not collect every letter merely to inspect the last one. These rules do not impose a new text-length limit.

### 22.2 Perceived Vim Editing Responsiveness

Local search (§20.2.26) updates matching prefixes in ordinary mounted rows without a blank frame. Oversized rows and queries keep yielding to input. Once an exact count is ready, confirmation and repeat navigation from a match reuse its positions while the document, scope and query stay current.

An idle Vim Normal editor must not continuously mutate its selection or generate a self-sustaining selection-change event loop in Tree or Agenda.

Vertical Vim navigation through long wrapped text must remain responsive in Tree and Agenda, including near the beginning, middle and end of a node. Repeated character-position lookups must not rescan every character boundary for each measured position. This does not impose a node or clipboard text-length limit.

Everyday Vim editing must feel lightweight and consistently responsive on supported documents. Typing, caret movement, moving between nearby nodes, switching modes, and common edit commands must give prompt visible feedback so the user can stay in an editing flow. Repeated interactions must not develop noticeable pauses, and work that only changes the active node or caret must not become slower merely because the document contains more off-screen nodes.

This requirement does not imply support for Vim-sized files or prescribe a particular UI implementation. `docs/DEVELOPMENT.md` §12 defines its performance guards.
