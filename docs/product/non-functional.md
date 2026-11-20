# Non-Functional Requirements

## 22. Non-Functional Requirements

### 22.1 Performance of State and Persistence Changes

The application must stay responsive and must not accumulate unbounded memory or perform unnecessary disk operations as the document and edit history grow.

Typing in long decorated rows must keep the caret and viewport stable without pauses caused by redundant replacement of unchanged formatted content. Actual formatting changes, undo/redo and composition must retain their existing behavior.

Preparing and dispatching a large save must leave ongoing typing and navigation responsive, including when a save scheduled in Tree becomes due after opening Agenda. This must preserve the existing save timing, ordering, failure handling and durable acknowledgment.

Any change to editor state or persistence must include an explicit assessment of its performance implications, covering:

* disk operations, especially writes and filesystem syncs, which must be minimized to limit SSD wear;
* CPU work added to interactive paths, such as typing, navigation, and commands;
* memory usage, especially any structure that can grow without bound with document size or edit count.

The assessment must consider how the cost scales with document size and the number of edits, and the change must state the expected cost and any mitigation.

Concrete budgets are not fixed here. When a change can affect performance at scale, the implementation must add or update an automated performance guard at the appropriate level (unit, boundary, or performance suite). Budgets are derived from measured baselines and recorded by the owning automated guard and its result artifacts.

Pre-release Linux memory checks must reject fast retained-memory growth and excessive sampled footprint in the maintained scenarios. The checks must demonstrate detection with deliberately retained allocations and preserve measurements on failure. Slow leaks below their finite-run budgets remain an accepted testing risk, not a relaxation of the application's bounded-memory requirement.

Text recognition must avoid quadratic retries over whitespace when joining nodes. Link reconciliation must consume word matches incrementally, retaining only recognized links. Relative-date count parsing must retain only the fields needed for validation, and Vim number case detection must not collect every letter merely to inspect the last one. These rules do not impose a new text-length limit.

### 22.2 Perceived Vim Editing Responsiveness

Local search (§20.2.26) updates matching prefixes in ordinary mounted rows without a blank frame. Oversized rows and queries keep yielding to input. Once an exact count is ready, confirmation and repeat navigation from a match reuse its positions while the document, scope and query stay current.

An idle Vim Normal editor must not continuously mutate its selection or generate a self-sustaining selection-change event loop in Tree or Agenda.

Vertical Vim navigation through long wrapped text must remain responsive in Tree and Agenda, including near the beginning, middle and end of a node. Repeated character-position lookups must not rescan every character boundary for each measured position. This does not impose a node or clipboard text-length limit.

Everyday Vim editing must feel lightweight and consistently responsive on supported documents. Typing, caret movement, moving between nearby nodes, switching modes, and common edit commands must give prompt visible feedback so the user can stay in an editing flow. Repeated interactions must not develop noticeable pauses, and work that only changes the active node or caret must not become slower merely because the document contains more off-screen nodes.

Performance guards must exercise representative sequences in the running application, including key-to-visible-frame latency for Vim interactions and typing, as well as document-scale cases that could expose renderer or React work on the interactive path. Measure both typical and slow interactions; investigate regressions before adding further editing features. This requirement does not imply support for Vim-sized files or prescribe a particular UI implementation.
