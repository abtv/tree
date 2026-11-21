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

The original observation predates application search. The current application provides local Find, document-wide node and tag search, and recent-node navigation (`docs/PRODUCT.md` §20.14). The remaining question is whether these facilities resolve retrieval friction in ordinary use; their existence alone is not usage evidence.

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

## PD-007: Where the parent's row stands after leaving a node

Kind: product
Status: Idea

### Question

`docs/PRODUCT.md` §7.1 restores the previous current parent and selects the node the user entered from, but no section says where that row appears in the window. The general rule of §20.8 then applies, and a row far from the top is centered as a distant destination. So the row can stand in a different place than before entering the node, which reads as a jump on a round trip.

### What we are watching

Round trips with `Cmd+.`/`gd` and `Cmd+,`/`Ctrl+o` in long locations: whether the user loses their place when the parent's row returns somewhere other than where they left it.

### What would settle it

A Product Owner choice stated in §7.1: restore the row at the window position it had before entering, or keep the §20.8 reveal. Either choice needs an Electron test of the row position after a round trip.

### Product Owner perspective

Product Owner statement (2026-11-21): record this as a product question; the recommendation is to restore the previous position.

### Evidence

- 2026-11-21 — Usage evidence (survey of late layout changes recorded in `81e46a0`, candidate 4, at `0f2fb33`): in a 600 px window, the selected row stood at 556 px before `gd` and at 317 px after `Ctrl+o`. Each command was one transition with no intermediate frame.

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

## TD-003: Regrouping `docs/ARCHITECTURE.md` §8 and §13

Kind: technical
Status: Deferred

### Question

Should `docs/ARCHITECTURE.md` §8 UI Layer (50,956 bytes) and §13 Persistence (65,001 bytes) be regrouped? §13 also holds search, emoji, command-history, recent-node and finished-task text beside persistence, so a reader looking for one subject loads the others.

### What we are watching

Whether agents and the Product Owner read the whole of §8 or §13 for a task that needs only one of its subjects, and how much each section grows.

### What would settle it

A Product Owner choice of section boundaries. Any regrouping must keep ADR 0004's §13 citation valid. The Product Owner deferred the question on 2026-11-21 (Q4 in `git show c4c4821:plans/documentation-load-and-ownership.md`).

## TD-004: Intermittent failures of window-lifecycle E2E tests

Kind: technical
Status: Idea

### Question

Three Electron tests that exercise the window lifecycle fail now and then in full local runs and pass when rerun alone:

1. `e2e/electron/command-panel.spec.ts`, "Normal command panel › quits through the save-before-quit handshake with the exact q alias".
2. `e2e/electron/about-window.spec.ts`, "About Tree shares the renderer, uses the … palette and restores focus".
3. `e2e/electron/selection-interruptions.spec.ts`, "continues a rich Visual selection after native window blur".

For each: is the cause the test's synchronization, the test environment under parallel load, or a product defect? And do they share one cause?

### What we are watching

Further failures of these tests in local full runs and in CI, with their error text and trace.

### What would settle it

For each test, a reproduction with a trace that shows whether the product did what the test expects while only the test's own call failed. A fix belongs in the test when the product behaved correctly; otherwise the failure is a defect for the defect-first workflow in `AGENTS.md` §9. A shared cause would justify one change instead of three.

### Product Owner perspective

Product Owner statement (2026-11-21): the three tests are all about the window lifecycle; investigate whether they have a common cause, without fixes, and report on each test.

Product Owner statement (2026-11-21, after the report): fix test 1 after the pattern of `persistence-lock.spec.ts`, keeping the check that the document is saved before the quit. Do not fix test 2 without a reproduction; keep it in TD-004. For test 3, first establish whether the main window's renderer hangs or only the driver connection stalls, for example by checking the renderer's response outside Playwright at the moment of the hang. A hung application is a defect for the defect-first workflow; a stalled driver calls for a proposal to isolate the test (a separate worker or serial execution), shown before implementation.

### Evidence

- 2026-11-21 — Usage evidence: full `npm run test:e2e` at `777ab5f` before commit; the test failed at `command-panel.spec.ts:328` with `keyboard.press: Target page, context or browser has been closed`. A focused rerun (`--repeat-each=3`) passed all three times.
- 2026-11-21 — Usage evidence: the same failure (`keyboard.press: Target page, context or browser has been closed`) recurred in a full local `npm run test:e2e` at `782f883` with uncommitted image-size rendering changes; a focused rerun (`--repeat-each=3`) passed all three times.
- 2026-11-21 — Agent inference, not verified: `Enter` runs the quit command, and the application can close before Playwright finishes the `keyboard.press` call, so the call fails although the expected quit happened. The trace of that run was not kept.
- 2026-11-21 — Usage evidence: in a full run at `491d81c` with the uncommitted changes of `782f883`, test 2 failed at `about-window.spec.ts:131` after `window.mouse.click(10, 100)` closed the dialog from its backdrop: the editor was no longer the active element and the selection was at offset 0 (`active: false, anchor: 0, focus: 0`; expected `active: true, anchor: 4, focus: 4`). It passed ten times in a focused rerun. The document has no image, so the image-size code did not run.
- 2026-11-21 — Usage evidence: in the full run at `782f883` that also failed test 1, test 3 failed with `Electron driver close timed out` and `keyboard.press: Target page, context or browser has been closed`. It passed three times in a focused rerun.
- 2026-11-21 — Usage evidence: reproduction attempts at `72ff192`. The three specs together with `vim-navigation-and-visual.spec.ts` (`--repeat-each=4`, 6 workers) passed all 460 tests. Two full runs (`--repeat-each=2`, 2,215 tests, 10.9 minutes) reproduced only test 3, once.
- 2026-11-21 — Usage evidence (test 3, trace of that failure): every step through `other.destroy()` (line 66) completed within about 400 ms of launch. After it, two calls to the main page never completed: the `keyboard.press('h')` at line 68 and a concurrent fixture evaluation of `.save-error`. The test reached its 60-second timeout, and teardown then failed with `Renderer error collection timed out.` The main page stopped answering the driver after the second native window was destroyed. Whether the renderer hung or only the driver connection stalled is not known. This is the only spec that launches a visible window (`windows: 'visible'`); the other 5 workers run hidden windows.
- 2026-11-21 — Repository fact (test 1): the command panel runs a command on the `Enter` keydown (`src/renderer/use-command-panel.ts`, keydown handler), and `keyboard.press` sends keyup after keydown. `e2e/electron/persistence-lock.spec.ts` (around line 286, added in `ef9dfdd`) already handles the same error on a quit, with the comment "Immediate quit can close the CDP target before Playwright sends Enter's keyup". This supports the earlier inference that test 1 is a test-synchronization failure. Whether the document was saved in the failing runs was not observed.
- 2026-11-21 — Agent inference (test 2), not reproduced: the observed state is what a press on the window outside the editor leaves: focus off the editor and the selection collapsed at the start. The dialog restores focus synchronously when the backdrop click closes it (`src/renderer/about-dialog.ts`, `captureFocusRestoration`), so that state suggests the pointer press reached the page after the dialog had closed, or that focus moved again after the restoration. No trace was kept.
- 2026-11-21 — Agent inference: no single shared cause is established. The three failures have different mechanisms: a keyup sent after the application quit (test 1), a focus assertion after a modal dialog closes (test 2), and a page that stops answering the driver after a native window is destroyed (test 3). Their only established common factor is load: each failed only in a full run with 6 workers and passed alone. Cheapest next experiments: for test 1, the keyup guard of `persistence-lock.spec.ts` plus a saved-document check after the quit; for test 2, record the active element and pointer and focus events around the backdrop click; for test 3, repeat the full run and, on failure, check whether the main window's renderer still answers through the main process.
- 2026-11-21 — Repository fact (test 1): the test now tolerates only the closed-target error of `Enter`'s keyup, as `persistence-lock.spec.ts` does, and still asserts that the quit saved the document. The intermittent failure was not reproduced for this change; five focused runs passed.
- 2026-11-21 — Usage evidence: a full run at `7bf995c` (`--repeat-each=2`, 2,216 tests) failed once, in `app-updates.spec.ts` ("updates only on request, flushes edits, and keeps normal quit safe after installation failure"), with the same `keyboard.press: Target page, context or browser has been closed` on the `Enter` that runs the `update-app` command and quits. This is the mechanism of test 1 in another test. The three tests that press a quitting key now share the `pressKeyThatQuits` fixture helper. Test 3 passed in both repetitions of that run.
- 2026-11-21 — Usage evidence (test 3, temporary uncommitted probe): the probe installed a 20 ms main-process timer that logged a tick and read the main renderer's focus and selection with `webContents.executeJavaScript`, outside Playwright. In a full run at `d4878ed` (`--repeat-each=2`), test 3 hung once at the `keyboard.press('h')` after `other.destroy()`. Until the destroy, ticks ran every 20–30 ms and the renderer answered in 0–32 ms. After it, the log has no further tick for the remaining 60 seconds, no `unresponsive` event and no `render-process-gone` event. The main process stopped running its timers, so it is not only the driver connection that stalled. Whether the main thread was blocked natively or paused through Playwright's Node inspector connection is not known; no stack was captured.
- 2026-11-21 — Usage evidence (test 3): two further full runs with the probe extended to capture `sample` stacks of the main and renderer processes after 5 seconds without progress did not reproduce the hang. In both runs, both repetitions of test 3 failed earlier, at the first `expect.poll(... document.hasFocus())` after `browserWindow.focus()`: `BrowserWindow.isFocused()` stayed `false` for the whole 10-second poll while the main process and renderer kept answering. Agent inference, not verified: macOS did not activate the application while another application was frontmost on the live desktop, which makes the visible test depend on desktop use during the run.
- 2026-11-21 — Repository fact (test 3): the second window is test-owned, an empty `BrowserWindow` created in the main process and removed with `destroy()`, which skips the ordinary close events. The application creates only its main window (`src/electron/main/index.ts`); a user moves focus away through another application, native sheets or the editor context menu, none of which destroys a second application window. The observed stall followed the `destroy()` of that test window, a path users cannot take.
- 2026-11-21 — Product Owner statement: further capture runs are canceled because users cannot take this path and the investigation is not worth the machine time. The test now closes its window with `close()` and waits for `closed`; the temporary probe is removed. If test 3 fails again after this change, return to this question and to isolating the test (a separate serial run).
