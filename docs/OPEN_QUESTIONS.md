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

The original observation predates application search. The current application provides local Find, document-wide node and tag search, and marked and starred nodes listed by empty Search (`docs/PRODUCT.md` §20.14); recent-node navigation was removed on 2026-11-22. The remaining question is whether these facilities resolve retrieval friction in ordinary use; their existence alone is not usage evidence.

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
- 2026-11-03 — Repository fact: PRODUCT §20.14 and the search implementation supersede the original absence-of-search premise. The recorded status is unchanged; any further experiment must assess the existing search first.

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
- 2026-10-04 — Product Owner request: "move nodes from one parent to another, it's not working now with drag and drop". This asked for cross-parent moves by mouse; the initiative was completed and its plan retired in `e7d392f`. Current behavior is specified in PRODUCT §11. This request did not authorize keyboard moves.
- 2026-09-21 — Repository fact: `docs/PRODUCT.md` defines drag-and-drop as the only sibling-reordering interaction.

## PD-004: User-controlled export and backup

Kind: product
Status: Exploring

### Observation

The original observation predates the data-portability features. Browser export, import, Chromium folder backup and folder restore are defined in `docs/PRODUCT.md` §24; desktop export, import and Replaced Notes recovery are defined in §25. Desktop persistence retains recovery generations, while browser storage does not. The remaining question is which personal recovery and portability scenarios these facilities cover adequately.

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
- 2026-11-03 — Repository fact: PRODUCT §§24–25 and the browser/desktop archive implementations supersede the original absence-of-export premise. The recorded status is unchanged; any further experiment must assess the existing workflows first.

## PD-009: How to improve Agenda

Kind: product
Status: Idea

### Question

Product Owner statement (2026-11-21): Agenda should be improved, but how is not yet known. Which Agenda problems in ordinary use are worth solving? Dates and date completion (PD-010) may be part of the answer.

### What we are watching

Moments in ordinary use when Agenda (§23) is slow, confusing or missing something, with what was being attempted.

### What would settle it

A list of concrete Agenda problems from use. Each becomes its own product change or question. Without such problems, Agenda stays as specified.

## PD-010: Dates and date completion

Kind: product
Status: Idea

### Question

Product Owner statement (2026-11-21): dates and date completion (§20.9–20.11, §23.2) are in question and need research, probably together with Agenda (PD-009). What does not work for the Product Owner is not yet recorded.

### What we are watching

Each time a typed, completed or displayed date in Tree or Agenda is unexpected or awkward, with what was intended.

### What would settle it

Research that compares the observed problems with the current date model, followed by a Product Owner choice: keep, change together with Agenda, or simplify.

## PD-011: Two search interfaces

Kind: product
Status: Idea

### Question

Product Owner statement (2026-11-21): there are currently two versions of search, and Search should be improved, but how is not yet known. Repository fact: local search in the current view (`/` and `Cmd+F`, §20.2.26) uses the status bar in Vim and a Find panel in standard editing; document-wide node search is `Cmd+;` (§20.14). Which two versions the Product Owner means is not yet recorded. PD-001 asks the related retrieval question.

### What we are watching

Which search is used for which purpose in ordinary use, and when the wrong one is opened or neither finds the note.

### What would settle it

The Product Owner names the two versions and the friction between them. Agent inference: the options include merging them, separating their purposes more clearly, or changing one of them.

## PD-013: Whether `#` tags and `&` events are useful

Kind: product
Status: Idea

### Question

Product Owner statement (2026-11-21): `@` people are definitely used; `#` tags and `&` events were expected to be useful, but whether they are is not yet known. Each marker kind has its own completion catalog, highlighting and search terms (§20.13, §20.14.4).

### What we are watching

Whether `#` and `&` are typed or searched in ordinary use.

### What would settle it

A period of ordinary use. An unused marker kind becomes a removal candidate for a Product Owner decision; a used one stays.

## PD-014: Image to Text in the browser version

Kind: product
Status: Idea

### Question

Product Owner statement (2026-11-21): the browser version will need image text recognition for feature parity, later. Repository fact: Image to Text runs only on Apple Silicon macOS Electron (§15.1).

### What we are watching

Browser use with images whose text should be searchable.

### What would settle it

The Product Owner decides when to start. A browser recognition approach then needs research and an architecture decision, since it may add a dependency or a service.

## TD-003: Regrouping `docs/ARCHITECTURE.md` §8 and §13

Kind: technical
Status: Deferred

### Question

Should `docs/ARCHITECTURE.md` §8 UI Layer and §13 Persistence, the two largest sections (sizes under Evidence), be regrouped? §13 also holds search, emoji, command-history and finished-task text beside persistence, so a reader looking for one subject loads the others.

### What we are watching

Whether agents and the Product Owner read the whole of §8 or §13 for a task that needs only one of its subjects, and how much each section grows.

### What would settle it

A Product Owner choice of section boundaries. Any regrouping must keep ADR 0004's §13 citation valid. The Product Owner deferred the question on 2026-11-21 (Q4 in `git show c4c4821:plans/documentation-load-and-ownership.md`), and kept it deferred until the decision about removing features (Q8 in `git show 1d20944:plans/documentation-consistency-and-policy-load.md`).

### Evidence

- 2026-11-21 — Repository fact: at `bba6aa1`, §8 is 50,956 bytes and §13 is 68,067 bytes, 56% of the file (`grep -b -n '^## '`).
- 2026-11-21 — Repository fact: other sections also hold unrelated subjects. §4 "Domain Layer" describes search modules of `src/application/` and `src/renderer/`; §7 "Application Layer" opens with main-process desktop updates; §21 "Module Structure" holds Vim and caret owner mechanics.
- 2026-11-22 — Repository fact: at `22a7ac35`, after Recent nodes was removed, §8 is 50,986 bytes and §13 is 67,168 bytes (`grep -b -n '^## '`). §13 keeps only a short note that earlier recent-node files are no longer read, written or deleted.
- 2026-11-22 — Repository fact: the feature-removal question (PD-008) was closed. Summarize, the `image-to-text` command and Recent nodes were removed; every other feature was kept. Dates (PD-010) and the `#` and `&` markers (PD-013) remain open and could still remove content from §8 or §13.
- 2026-11-21 — Agent inference (independent audit, byte split not re-checked): Agenda, the browser version and the notes archives hold a large part of §8 and §13, so a decision to remove features would change what there is to regroup.
