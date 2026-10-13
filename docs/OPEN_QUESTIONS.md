# Open Questions

> This document is non-normative. It records questions that are still open — product and technical alike — together with their evidence and the Product Owner's decisions. Nothing here is an implementation requirement. Only what the Product Owner approves and moves into `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, or an ADR may be planned or implemented.

## 1. Purpose and Ownership

This document holds the questions the project has not answered yet. Answered ones live elsewhere: settled product behavior in `docs/PRODUCT.md`, settled technical decisions in `docs/decisions/`. A question belongs here exactly while it is open.

It is not a prioritized backlog and implies no delivery commitment, estimate, or assignment. Work that is authorized and scheduled lives in [`../plans/README.md`](../plans/README.md) instead.

Each entry is tagged `Kind: product` or `Kind: technical`, with `PD-` and `TD-` identifiers. A product question asks what the product should do for the user; a technical one asks how the implementation should work, including durability, performance, and the agent-driven development process itself. The tag chooses where an accepted answer lands, not how seriously the question is taken.

The Product Owner decides whether a direction is accepted, rejected, or deferred — for technical questions as well as product ones, since a technical answer can constrain the product for a long time. Agents may investigate questions, challenge hypotheses, organize supplied evidence, identify conflicts with the standing commitments in `docs/PRODUCT.md` §1.1, and propose experiments. Agents must not invent the Product Owner's position or convert a conclusion here into a requirement.

Every claim should be labeled by its basis when that basis is not self-evident:

- **Repository fact:** directly supported by current code or documentation.
- **Product Owner statement:** stated by the Product Owner, with their meaning preserved.
- **Usage evidence:** an observed interaction or result, including its date and context.
- **External evidence:** information from outside the repository, with a dated source.
- **Agent inference:** analysis that has not been established as fact.

## 2. Statuses

- `Idea` — captured but not yet investigated.
- `Exploring` — the problem and competing explanations are being examined.
- `Experimenting` — an agreed experiment is collecting evidence.
- `Accepted` — the Product Owner accepts the direction, but has not thereby authorized implementation.
- `Rejected` — the Product Owner has decided not to pursue the direction based on current evidence.
- `Deferred` — no current decision or experiment is warranted.

Only the Product Owner may set `Accepted`, `Rejected`, or `Deferred`. Accepting a direction does not authorize implementation. When the Product Owner requests a specific behavior, update `docs/PRODUCT.md` and follow the planning and development workflow in `AGENTS.md`. Ordinary implementation plans do not need separate approval; ask the Product Owner about material choices that remain unresolved.

## 3. How a Question Moves

Capture the question without prescribing an answer. Say what would settle it before collecting evidence, and keep evidence separate from interpretation. Ask the Product Owner to decide, defer, or ask for more evidence. When a direction is accepted, propose the corresponding change to `docs/PRODUCT.md` or an ADR separately — acceptance is not authorization to implement.

Prefer ordinary use and reversible prototypes over production implementation. Changing product code for an experiment requires a separate Product Owner request and the workflow in `AGENTS.md`.

Some questions are answered by living with the behavior rather than by an experiment. When the Product Owner marks a `docs/PRODUCT.md` section exploratory (§1.2 there), the entry here records what to watch and cites that section, and the implemented behavior stays the source of truth for what the product currently does.

## 4. Entry Template

Three sections are required. Start with these and nothing else:

```md
## PD-NNN: Short question

Kind: product
Status: Idea

### Question

What is uncertain and why it matters, without assuming an answer.

### What we are watching

The use, measurement, or observation that would move this either way.

### What would settle it

The evidence or cheapest experiment that would change the decision, and what each outcome would mean.
```

Use `TD-NNN` and `Kind: technical` for a technical question.

Add a section only when it has content to hold: **Product Owner perspective** (their position, with disagreement preserved rather than resolved), **Counter-hypotheses and tradeoffs**, **Evidence** (dated, each item labeled with its basis per §1), and **Decision and rationale** (the Product Owner's only). An empty heading reading `Pending` carries no information; leave it out until it does.

Keep an entry short enough to re-read in a minute. A question that needs more than that is usually several questions.

## 5. Active Questions

## PD-001: Retrieval across the hierarchy

Kind: product
Status: Exploring

### Observation

Repository fact: the application navigates and renders one level at a time. It has no application-level facility for retrieving a node from elsewhere in the hierarchy. Browser find is limited to rendered content, and wide levels may leave off-screen rows unmounted.

### Hypothesis

As personal notes accumulate, remembering that a note exists but not where it lives will become a frequent enough problem that hierarchy navigation alone is insufficient.

### Counter-hypotheses and tradeoffs

- A stable, personally designed hierarchy may make retrieval sufficiently fast.
- A search interface could add visual or conceptual distraction.
- Better capture and organization conventions might address the problem without another interface.

### Experiment

During normal use, record each failed or noticeably slow retrieval attempt, what was remembered, where the note was located, and how it was eventually found. After enough real attempts to reveal a pattern, compare hierarchy navigation with a disposable, non-production retrieval prototype.

### Decision criteria

Support requires recurring retrieval failures that a focused search interaction resolves materially faster without exposing an expanded tree. Disconfirmation would be reliable hierarchy navigation with negligible retrieval friction.

### Evidence

- 2026-09-21 — Repository fact: `docs/PRODUCT.md` specifies one-level navigation and describes browser-find limitations for windowed sibling lists.
- 2026-09-21 — Agent inference: retrieval is likely to become more important as the document grows; real usage evidence is still required.

## PD-002: Keyboard-only sibling reordering

Kind: product
Status: Exploring

### Observation

Repository fact: ordinary editing and navigation are keyboard-first, while sibling reordering requires mouse drag-and-drop.

### Hypothesis

Keyboard sibling-reordering commands would reduce interruptions for a touch typist without weakening the one-level-at-a-time interaction model.

### Counter-hypotheses and tradeoffs

- Reordering may happen too rarely to justify additional commands.
- Memorable, conflict-free shortcuts may be difficult to choose.
- The actual need may be moving notes between parents rather than reordering siblings.

### Experiment

During normal use, record every reordering attempt that requires leaving the keyboard, whether the desired move is within the current level or to another parent, and which command gesture felt natural at that moment.

### Decision criteria

Support requires repeated mouse transitions for sibling moves and a shortcut that remains memorable in use. A predominance of cross-parent moves would disconfirm sibling reordering as the main problem.

### Evidence

- 2026-09-21 — Product Owner statement: fast note-taking as a touch typist is important.
- 2026-10-04 — Product Owner request: "move nodes from one parent to another, it's not working now with drag and drop". This asks for cross-parent moves by mouse; the initiative is `plans/cross-parent-drag-and-drop.md`. Keyboard moves remain unrequested.
- 2026-09-21 — Repository fact: `docs/PRODUCT.md` defines drag-and-drop as the only sibling-reordering interaction.

## PD-004: User-controlled export and backup

Kind: product
Status: Exploring

### Observation

Repository fact: the application automatically persists the document and retains recovery generations, but it provides no documented user-facing export, import, backup, or recovery workflow.

### Hypothesis

A personal note store needs a user-controlled way to preserve and leave with its data even when internal persistence is reliable.

### Counter-hypotheses and tradeoffs

- Existing local files and retained generations may be sufficient for one person's use.
- A readable export and a lossless backup solve different problems and should not be conflated.
- Import, attachments, and restoration could create substantial complexity beyond the immediate need.

### Experiment

List the concrete recovery and portability scenarios that matter in personal use—machine replacement, accidental deletion, corruption, application abandonment, and reading notes elsewhere—then test which are already covered by current storage and ordinary system backup tools.

### Decision criteria

Support requires at least one important scenario that current persistence and system backups do not cover adequately. The experiment should determine whether the need is readable export, lossless backup and restore, or both before behavior is specified.

### Evidence

- 2026-09-21 — Repository fact: `docs/PRODUCT.md` specifies automatic persistence and retained generations but no user-facing data-portability workflow.
- 2026-09-21 — Agent inference: portability is commonly important for long-lived personal notes; the Product Owner's actual scenarios remain to be established.

## TD-001: Whether a written rule is the right response to a recurring defect

Kind: technical
Status: Idea

### Question

The project's default response to a defect or a process gap is another paragraph in `AGENTS.md`. It is not established that this works. If it does not, the cost is paid twice: the defect recurs anyway, and every later session reads a longer policy.

### What we are watching

The size of `AGENTS.md` over time, and whether a rule added in response to a defect is followed in the sessions after it. A recurrence of the same defect class after its rule exists is the signal that the rule was not the fix.

### What would settle it

For each rule added in response to a defect, whether that defect class recurred afterwards. A structural change is the alternative to compare against: the caret defect cluster stopped after the ownership refactor, not after the two rules that preceded it.

### Evidence

- 2026-09-29 — Repository fact: `AGENTS.md` grew from 7,052 bytes (`5f03f6b`, 2026-09-11) to 36,810 bytes (`02242a3`, 2026-09-29). Of its 51 revisions, 4 reduced the file.
- 2026-09-29 — Repository fact: `576cf41` (2026-09-26) and `bdf073b` (2026-09-27) added navigation and caret rules; 8 and 4 fixes of the same class followed them. The cluster ended after the ownership refactor recorded in [ADR 0014](decisions/0014-single-owner-for-renderer-interaction-state.md), whose context states that test volume was not the constraint and ownership was.
- 2026-09-29 — Repository fact: `4f3f365` fixed a misaligned focus marker and, in the same commit, added a normative paragraph to `docs/PRODUCT.md`, a paragraph to `AGENTS.md` §9, and a rewritten sentence in `docs/DEVELOPMENT.md` §9 — three days after the visual-evidence rules of 2026-09-25 failed to prevent that defect.
- 2026-09-29 — Agent inference: past some size, an added rule may reduce adherence to the rest. Not established.

## TD-002: Other places where content appears or resizes after the first paint

Kind: technical
Status: Idea

### Question

One defect of a class is fixed; whether the class has other members is not known. The fixed defect: leaving a node with `Ctrl+o` remounted the rows, and an attachment image rendered nothing until its bytes loaded, so every row below it jumped down about two frames later. The class is any view that starts from an empty or default state on mount and fills in or resizes after the first paint, which the user sees as blinking or a lack of smoothness. The Product Owner expects more of them. The question is which transitions have this defect, and whether they share a structural cause that one change would remove, rather than being fixed one at a time.

### What we are watching

Any transition where the Product Owner sees a blink, a jump, or content that arrives late. The cheapest observation is a frame-by-frame record of the geometry of a row that sits below the changing content, as in `e2e/leave-layout-stability.spec.ts`: the list of distinct positions a row takes during the transition should have one entry.

### What would settle it

A survey that runs that kind of frame recording over the transitions listed under Evidence and reports, for each, whether it shifts and by how much. Each reproduced shift is a defect for the defect-first workflow in `AGENTS.md` §9. If most reproduced shifts share one cause, such as state that is initialised asynchronously after mount, the survey should say so, because that would justify a structural change under `AGENTS.md` §8 instead of separate fixes. A survey that finds no further shifts closes the question.

### Product Owner perspective

Product Owner statement (2026-10-03): after the `Ctrl+o` defect was fixed, they asked whether other places have the same kind of problem, because they notice a lack of smoothness. They asked to record this as an observation, expecting that a defect of this kind makes others likely, and to leave the investigation to a later session with a more capable model.

### Evidence

- 2026-10-03 — Usage evidence: `gd` into a node and `Ctrl+o` back, in a document with an image above a row containing a hyperlink, made the row visibly move. Reproduced with frame recording: the row stood at 116 px, then at 236 px; the 120 px difference equals the image height. Fixed in `5d9859b`.
- 2026-10-03 — Repository fact: the cause was `AttachmentImage` in `src/renderer/AttachmentPreview.tsx`. Its state starts as `loading` and renders `null`; the bytes arrive through a Promise and a `useEffect`, and the `<img>` is decoded asynchronously.
- 2026-10-03 — Agent inference, none reproduced. Candidates found by reading code, most likely first:
  1. Opening the image preview: `ImagePreview` uses the same loading hook, so the dialog renders without its image for at least one frame. The size memory added in `5d9859b` does not apply, because the preview size depends on the window.
  2. The always-on-top control at launch: `src/renderer/App.tsx` starts `alwaysOnTop` as `false` and sets the real value from an asynchronous call, while the Vim preference is read before the first render for the same reason (comment on `initialVimEnabled`).
  3. The first link in a node: `src/renderer/NodeInput.tsx` swaps a `textarea` for a `contentEditable` element, and `src/renderer/use-node-input-bindings.ts` restores focus and caret in a layout effect and again in a microtask.
  4. Scroll position on entering and leaving a node: one scroll container serves all levels, and `revealInViewport` in `src/renderer/scroll-viewport.ts` centered a selected row that is not fully visible, which read as a jump. Keyboard movement at the window edge now scrolls by about one row (`docs/PRODUCT.md` §20.8); entering and leaving a node was not re-checked.
  5. The bundled font: `@font-face` in `src/renderer/styles.css` sets no `font-display`.
  6. Lists above 500 rows: row heights are estimated at 25 px until measured (`src/renderer/list-window.ts`); `e2e/windowed-list.spec.ts` already records a shift from image loading there as accepted.
- 2026-10-03 — Repository fact: `AGENTS.md` §9 requires flash-free window creation, loading, reloading, and closing (`docs/PRODUCT.md` §20.5). Whether any requirement covers transitions inside the editor was not checked.
