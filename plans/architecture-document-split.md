# Architecture Document Split

Status: In progress

## Objective

1. Split `docs/ARCHITECTURE.md` (209,630 bytes at `e85fed30`) into per-area files under `docs/architecture/`, with `docs/ARCHITECTURE.md` as the index, the same way `docs/PRODUCT.md` indexes `docs/product/`.
2. Give §4, §7, §8, §13 and §21 numbered subsections by subject, so that each subject is stored in the file of its area. This answered the open question TD-003, which T2 removed from `docs/OPEN_QUESTIONS.md`.
3. Rework every file from a series of change notes into a description of the present design, without losing a lasting architectural fact (Rework Method below).

## Scope Limits

* Documentation and the documentation checker only. No production code, test assertion, or product requirement changes.
* Section numbers never change and are never reused. A citation of `ARCHITECTURE.md §N` names the section with all its numbered subsections, in whatever file they are stored.
* ADRs are not edited. Citations in source comments and nested `AGENTS.md` files are not narrowed.
* `AGENTS.md` is not edited.
* Phase 1 (T1, T2) moves text exactly. The only permitted differences are new numbered headings, numbers added to the six existing `###` headings of §13, relative link targets that follow the file move, and separators.
* Phase 2 (R1–R14) never moves text between files and never renumbers. A needed move is a separate commit proven by `--regrouped`.

## Source-of-Truth Links

`AGENTS.md` §§4, 8, 10, 11, 12, 13; `docs/AGENT_WORKFLOW.md` §§8, 11, 12; `docs/DEVELOPMENT.md` §§9, 11, 12; `docs/PRODUCT.md` (index format); `scripts/check-docs.mts`; `docs/decisions/README.md`.

## Authorization

* Approval scope: the whole initiative, authorized by the Product Owner on 2026-11-22. A new session does not ask again.
* Selected coding tool: Claude Code.
* Priorities: T1, T2, R1 (pilot), then R2–R14 in order.
* Owner decisions of 2026-11-22:
  * **D1.** Subsections for §4, §7, §8, §13 and §21, and the 17-file map below.
  * **D2.** From R14 on, `check:docs` enforces 8,000 characters of own text per architecture section. No per-block limit applies.
  * **D3.** An independent Reviewer checks every rewrite task (R1–R13).
  * **D4.** After R1 the Product Owner reads the rewritten files and confirms the style before R2 starts. Done on 2026-11-22: the Product Owner accepted the pilot and asked for a deeper rework (D5).
  * **D5.** Product Owner statement of 2026-11-22: the rework should go deeper than the pilot; the agent defines what that means and decides the details itself. The principle: a good working architecture description that is a sound base for future work, and no refactoring for the sake of appearance. The Rewrite Method below is the agent's definition under this principle. No further style checkpoint is required before the final acceptance.
* Delegated decisions and their principles:
  * Titles of new subsections, the order of files in the index, and the wording of the index. Principle: the same form as `docs/PRODUCT.md`.
  * Which paragraph belongs to which subsection when the map below is inexact. Principle: the paragraph goes to the subject it describes, and a paragraph stays next to the paragraph it refers to.
  * A stale symbol, path or name in the architecture text, when code, tests and ADR agree. Principle: `AGENTS.md` §2; correct it, record the code evidence, and have the Reviewer verify it.
* Reserved decisions:
  * A mechanism or behavior claim that the code contradicts. Do not reword it; record it under Findings and ask the Product Owner in one batch.
  * A sentence that states user-visible behavior which no `docs/product/` file states. Keep the sentence and record it under Findings as a candidate requirement gap.
* Execution budget: 17 working tasks. Recovery budget: 2 fix cycles each for T1 and T2, and 12 pooled fix cycles for R1–R14. Closure allowance: 2 fix cycles after a rejected acceptance, plus the retirement commit.

## Structure

Line numbers refer to `docs/ARCHITECTURE.md` at `e85fed30` (`git show e85fed30:docs/ARCHITECTURE.md`). The planner proposed them; T2 verifies each range against the text before writing it. Inside a subsection, paragraphs keep their source order. A section's own text comes before its first subsection.

### Subsections

* **§4.** Own text 121–146. 4.1 Agenda Projection: 148. 4.2 Search Modules: 150–252.
* **§7.** Own text 429–484, placed first. 7.1 Desktop Updates: 365–405. 7.2 Command Registry and Focus Borrowing: 407–427. 7.3 Agenda Store: 486–494.
* **§8.** Own text 548, 562–573, 599–605. 8.1 Agenda Rendering: 500, 504–508, 524, 579, 583–597. 8.2 Active-Line Highlight and Rich Input Synchronization: 502, 550. 8.3 Vim Pointer Continuation and Vertical Navigation: 510, 554–560. 8.4 List Layout, Windowing and Measurement: 512–522, 526, 607–624, 642. 8.5 Line Numbers: 528–540. 8.6 Command Panel and Popup Navigation: 542–544, 552. 8.7 Shortcut Profile: 546. 8.8 Completion, Dates and Tags: 575–577, 581, 658–671. 8.9 Drag and Drop: 626–628, 632–640. 8.10 Expansion State: 630. 8.11 Colors and Appearance: 644–654.
* **§13.** Own text 857–889, 917, 975, 986. 13.1 Emoji History: 807. 13.2 Finished-Task Visibility: 809. 13.3 Search Results and Sessions: 811–851, 915. 13.4 Command History: 853–855. 13.5 Schema Versions and View State: 891–901, 907–909. 13.6 Selection Reveal: 903–905. 13.7 Attachment Image Sizes: 911–913. 13.8 Save Scheduling, Flush and Failure: 919–961. 13.9 Durable Writes and Payload Validation: 963–969. 13.10 Attachment Cleanup and Retention: 971–973. 13.11 Generations and Recovery: 977–984. 13.12 Desktop notes replacement: 988–996. 13.13 Desktop notes archive: 998–1026. 13.14 Browser installation and storage protection: 1028–1030. 13.15 Browser offline package and updates: 1032–1073. 13.16 Browser notes archive: 1075–1085. 13.17 Browser folder backup: 1089–1105.
* **§21.** Own text 1382–1408, 1453–1457, 1466. 21.1 Vim and Caret Owners: 1410–1451. 21.2 Editor Store Search Interface: 1459–1464.

Paragraphs that refer to their neighbour and must stay adjacent: 542→544, 558→560, 575→577, 583→585, 587→589, 632→634→636, 853→855, 891→893→895→897→899→901, 903→905, 911→913, 971→973, 422→423→425, 488→490, 944–950→952.

### File map

| File | Sections |
| --- | --- |
| `overview.md` | 1, 2, 3, 12, 18, 19, 20, 21, 22, 23 |
| `domain-model.md` | 4, 5, 6, 10, 11 |
| `application.md` | 7, 7.1 |
| `interaction.md` | 8, 8.7, 8.9, 8.10, 9, 13.2 |
| `list-rendering.md` | 8.2, 8.4, 8.5, 13.6 |
| `appearance.md` | 8.11 |
| `vim.md` | 8.3, 21.1 |
| `command-panel.md` | 7.2, 8.6, 13.4 |
| `search.md` | 4.2, 13.3, 21.2 |
| `completion-and-tags.md` | 8.8, 13.1 |
| `agenda.md` | 4.1, 7.3, 8.1 |
| `persistence.md` | 13, 13.5, 13.9, 13.10, 13.11 |
| `save-scheduling.md` | 13.8 |
| `attachments-and-clipboard.md` | 13.7, 14, 15 |
| `electron.md` | 16, 17 |
| `desktop-data.md` | 13.12, 13.13 |
| `browser.md` | 13.14, 13.15, 13.16, 13.17 |

### Index

`docs/ARCHITECTURE.md` keeps the title, a statement that it holds no architecture text, the citation convention, the section map, and the retired-number list. ADR 0024 links to `../ARCHITECTURE.md#desktop-notes-replacement`; the index keeps an anchor with that id that points to §13.12, because the link check does not validate anchors and ADRs are not edited.

## Rework Method (R1b–R13)

R1 changed only history-relative wording. Under D5 the remaining tasks rework each file so that a reader who changes one area opens one file and finds, for each mechanism, which module owns it, which rules a change must keep, and what it costs. The text was written as a series of change notes; the rework turns it into a description of the present design. It does not polish text beyond that purpose.

A task does this to its file:

1. **Organize by owner and mechanism.** Each numbered subsection describes one owner or one mechanism. When a subsection covers several, add numbered subsections with the next free numbers under the parent and update the section map. Inside a subsection use this order where it applies: what the module owns and where it is; its states, transitions and ordering rules; the constraints a change must keep; costs and guards.
2. **State each fact once.** When several paragraphs state one fact, keep one full statement at its owner and cite that section elsewhere. Merge the performance assessments of one mechanism into one assessment that keeps every distinct count, bound and named guard.
3. **Remove text that holds no lasting fact.** Remove the narration of a past change, and remove a sentence that only says a past change did not affect something else. Keep a negative statement when breaking it would be a regression that someone must prevent: a commitment under PRODUCT.md §22.1 (no write, sync, document traversal or unbounded memory on a named path), a security or process boundary, or an ownership rule. The test: if a later change made the sentence false, would that change need a decision or a guard? If yes, keep the sentence as a constraint. If no, remove it.
4. **Keep decisions and shorten their story.** Keep the reason for a rejected alternative, and keep the conclusion and the stated limit of a measurement, when they constrain a later choice. Shorten the account of how the measurement was made.
5. **Cite the product; do not restate it.** Replace a sentence that only restates user-visible behavior with a citation of `PRODUCT.md §N`, after reading the product file and confirming that it states the fact. Otherwise keep the sentence (reserved decision above).
6. **Use present-state, literal wording.** State what the code does. Do not use change-history phrasing such as "no longer", "the existing", "added", "adds no", "as before", "unchanged", "now". Follow the communication style of `AGENTS.md` §1: active voice, the owning module or type as the subject, short sentences. Cite the product as `PRODUCT.md §N`.
7. **Check the names.** Check that every file, module and symbol name that the file cites exists in the repository. Correct a stale name (delegated decision above).

A task does not do this:

* It does not reword a sentence that is already a clear present-state statement. Such a sentence stays byte-identical.
* It does not audit the whole text against the code. It checks a claim against the code only when the rework changes the claim's meaning or the claim looks wrong.
* It does not move text to another file. The exception is a paragraph that is clearly about another file's subject; that move is a separate commit proven by `--regrouped`.
* It does not change a section number, an ADR, a product file or code.
* It has no size target. Text leaves only under rules 2 to 5.
* It adds no fact. Every added clause traces to one or more old clauses or to code evidence recorded in the ledger.

Keep exactly: module, file, symbol, type, IPC channel, CSS class, attribute and storage-key names; ADR links; section references and their scope; numbers, limits, counts and units; state names; order statements; the modality `must`, `should`, `may`; `never`, `only`, `no`; write and sync counts, complexity bounds, retained-memory bounds and named guards of every performance assessment; stated limits of measurements. Keep the order of statements where order carries meaning.

Proof for each task, with the task's starting commit as `<base>`:

1. `npm run check:docs -- --details <base> --file docs/architecture/<file>.md`. Every removed literal and changed reference has a ledger entry. A literal may leave only with the disposition Merged or Removed.
2. `npm run check:docs -- --verbatim <base> --file docs/architecture/<file>.md`. It exits 1 for a rework. Every removed clause gets one disposition in `.scratch/architecture-split-<task>/ledger.md`: Restated (new location), Merged (location of the surviving full statement), Product-owned (`PRODUCT.md §N`, verified), Removed (no lasting fact, with the reason in a few words), Corrected (code evidence `path:line`), or Moved within file.
3. `npm run check:docs` and `npm run format:check:changed` pass.
4. `git diff --stat` shows only the task's files, the index when subsections are added, and this plan.
5. The Reviewer receives the old text, the new file and the ledger. It confirms that no lasting fact is lost or changed, that every Removed clause holds no lasting fact under rule 3, and that every Merged survivor states the full fact. It checks against the code the claims whose meaning the rework touched. The Reviewer has no shell: before editing, copy the file into the task's scratch directory, or paste the complete removed-clause list of step 2 into the Reviewer's prompt, as R1 did.
6. After the commit, remove the scratch directory with `npm run retire:scratch -- architecture-split-<task>`.

## Tasks

| ID | Outcome | Files | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- | --- |
| T1 | The checker knows the architecture specification and can prove an exact regrouping | `scripts/check-docs.mts`, `scripts/check-docs.test.mts`, `docs/DEVELOPMENT.md` §9 and §12 | Tests for architecture index validation, live documents, link normalization and `--regrouped` (exact regrouping passes; a changed character, a dropped block and a dropped fence fail; a renumbered heading is reported). `npm run check:docs -- --regrouped HEAD --spec architecture` exits 0 on the unchanged tree | Low Risk: `npm run check` | Done |
| T2 | Index plus 17 files; TD-003 removed from `docs/OPEN_QUESTIONS.md` | `docs/ARCHITECTURE.md`, `docs/architecture/*.md`, `docs/AGENT_WORKFLOW.md` §11 document list, `docs/OPEN_QUESTIONS.md`, this plan | `npm run check:docs -- --regrouped <T1 commit> --spec architecture` exits 0; its heading list matches Structure above; every listed adjacent pair is still adjacent; `npm run check:docs` passes. Reviewer on the heading list, section map and report | Minimal Risk: `npm run format:check:changed`, `npm run check:docs`, `npm run check:permissions` | Done |
| R1 | Pilot rewrite; owner checkpoint D4 | `command-panel.md`, `completion-and-tags.md` | Rewrite proof | Minimal Risk | Done |
| R1b | Rework of the two pilot files under the Rework Method. They are the reference example for R2–R13 | `command-panel.md`, `completion-and-tags.md` | Rework proof | Minimal Risk | Done |
| R2 | Rework | `overview.md`, `electron.md`. Leave §1, §3, §12, §18–20, §22, §23 and the §16 list unless a rule of the method applies. `docs/SECURITY.md` cites §15–17: do not weaken a control | Rework proof | Minimal Risk | Done |
| R3 | Rewrite | `domain-model.md`. §11 holds the structural-sharing invariant (ADR 0015) | Rewrite proof | Minimal Risk | Done |
| R4 | Rewrite | `application.md` | Rewrite proof | Minimal Risk | Done |
| R5 | Rewrite | `interaction.md`. §9 holds the single-owner text (ADR 0014) | Rewrite proof | Minimal Risk | Done |
| R6 | Rewrite | `list-rendering.md`, `appearance.md` | Rewrite proof | Minimal Risk | Done |
| R7 | Rewrite; add subsections to §21.1 | `vim.md` | Rewrite proof | Minimal Risk | Done |
| R8 | Rewrite | `search.md` | Rewrite proof | Minimal Risk | Done |
| R9 | Rewrite; add subsections to §8.1 | `agenda.md` | Rewrite proof | Minimal Risk | Done |
| R10 | Rewrite | `persistence.md` | Rewrite proof | Minimal Risk | Done |
| R11 | Rewrite | `save-scheduling.md`, `attachments-and-clipboard.md` | Rewrite proof | Minimal Risk | Done |
| R12 | Rewrite | `desktop-data.md`. Keep the crash-safety step order (ADR 0024) | Rewrite proof | Minimal Risk | Done |
| R13 | Rewrite | `browser.md` | Rewrite proof | Minimal Risk | Done |
| R14 | Lasting writing rules in the index; size limit D2; a check that every source file name cited under `docs/architecture/` exists in the repository | `docs/ARCHITECTURE.md`, `scripts/check-docs.mts`, `scripts/check-docs.test.mts`, `docs/DEVELOPMENT.md` | Every file is within the limit; the name check passes and has tests; `npm run check` passes | Low Risk: `npm run check` | Ready |

T2 wrote each file once with the file-editing tool from the line ranges above, then wrote the index.

## Owner Involvement

* Working tasks: 17. The final owner acceptance of `AGENTS.md` §8 applies.
* Verification rounds: the style checkpoint after R1 (D4) is done; at most one batch of Findings questions during R1b–R13; one final acceptance round.
* Owner-required checks: none. No user-visible behavior changes.
* Capabilities to confirm at run time: `npm run check:docs` with the new arguments runs without a prompt; the Reviewer launches.

| Task | Check | Owner action |
| --- | --- | --- |
| R14 | Final acceptance | Read the index and two or three files; compare with `git show e85fed30:docs/ARCHITECTURE.md` |

## Decisions and Findings

* The planner (2026-11-22) could not read Git history. The rewrite rules above were checked against §7 of the retired product plan (`git show bb427a3:plans/product-spec-refactoring.md`).
* `PRODUCT_LIMITS` is not applied to the architecture in Phase 1: many paragraphs are single blocks of 1–4.6 KB, and the limit would force rewording during a mechanical move.
* T1 added `--spec` only to `--regrouped`. Rewrite tasks use `--verbatim` and `--details` with `--file`, which accept any path.
* In this Claude Code session the sandbox denied writes to the temporary directory, so test runs that create temporary directories (`npm test`, `npm run check`) ran outside the sandbox. `npm run check:docs` ran inside it.
* T2 result: `npm run check:docs -- --regrouped 60160df5 --spec architecture` reported 384 blocks, removed 0, added 0, structural problems 0, 29 headings added and 6 renumbered. The Reviewer reported no meaningful issues. To inspect the split, compare any file with `git show 60160df5:docs/ARCHITECTURE.md`.
* Findings from the T2 review, for the rewrite tasks:
  * R2: §1 in `overview.md` says "This document describes"; after the split it must name the architecture description, not one file. §21 in `overview.md` lists the domain and application modules; the matching renderer list ("The renderer currently isolates DOM/caret behavior") is in §21.1 in `vim.md`, because most of it names Vim and caret modules. Add a reference to §21.1.
  * R6: `list-rendering.md` §8.4 says "the same sticky-anchor arrangement as Agenda"; cite §8.1.
  * R8 and R9: the last two sentences of the "Agenda parent paths" paragraph of §8.1 in `agenda.md` describe Global Search. Moving them to `search.md` needs a separate commit proven by `--regrouped`; otherwise keep them and cite §13.3.
  * `--regrouped` does not fail for text added before the first numbered heading. `npm run check:docs` rejects such text in the files under `docs/architecture/`, but not in the index. Check the index by reading it when `--regrouped` is used again.
  * `--regrouped` also resolves link targets inside code spans and fenced blocks. The architecture files have no link inside code.

* R1 result (base `e5225f51`): 53 of 178 clauses changed in the two files; every other clause is byte-identical. `--details` shows no changed name, number or table cell; the only changed literals and references are the citation form. The Reviewer found no lost, changed or added fact; its three low-severity wording findings are applied.
* R14 gains the file-name check under D5: a description that cites modules which no longer exist is not a sound base for later work, and a check prevents that without a recurring review.
* Style choices of the pilot, accepted at D4, that R1b–R13 apply the same way:
  * Citations of the product specification use the plain form `PRODUCT.md §N`, replacing `docs/PRODUCT.md` in a code span, `PRODUCT §N` and `§N of PRODUCT`. Citations inside ADRs and other documents are not changed.
  * An assessment that only said "this adds no …" becomes a sentence with a named subject, and starts with "Performance assessment (PRODUCT.md §22.1):" when it states costs.
  * A sentence that compared the mechanism with an earlier state ("remains unchanged", "retains its existing …") states the present fact, or leaves under rule 3 of the Rework Method when it holds no lasting fact.
  * A long paragraph is split at sentence boundaries when it describes several mechanisms.

* R1b result (base `57212de2`): the two files gained the subsections 7.2.1–7.2.3, 8.6.1–8.6.2 and 8.8.1–8.8.4, one per owner or mechanism. 19 clauses left or changed, each with a ledger disposition; no literal and no reference was removed. The Reviewer found one write bound that had left its owner and three wording changes that weakened a bound or a constraint; all four are corrected by restoring the base sentences. Recovery: 1 of the 12 pooled fix cycles is used.
* Practice from R1b for R2–R13:
  * A sentence that states a write count, a complexity bound or a negative constraint stays byte-identical when it moves or when another sentence merges into it. Merge the weaker sentence into the stronger one, not the reverse.
  * An assessment stays in the subsection of the owner that produces the cost. A cross-reference is added only to a section that states the cited fact.
  * To read the comparison reports, filter the moved lines: `npm run check:docs -- --verbatim <base> --file <path> | grep -vE "^(Moved|Literal moved|Reference moved)"`.
  * A base sentence of the form "this adds no writes, syncs or scans to the existing paths" is relative to earlier code. Before stating it in absolute form ("causes no ..."), read the owning module. When the module does such work, state what it does and when, with the code evidence in the ledger.
  * The same holds for a count: "the change adds one call per event" is the added cost, not the total. State the cost of one use of the mechanism, or keep the relative scope with "of its own".
  * A negative constraint keeps the path it constrains as its subject. A sentence that says a pure module performs no writes is true and constrains nothing.
  * A sentence with "these", "this" or "that" keeps its position after the text it names. Moving it after another paragraph widens or changes its scope.
  * When two cost sentences merge, the survivor keeps every item of both lists (writes, syncs, reads).
  * When a sentence moves to another section, search the architecture files for references to its old section and retarget them.
  * "Of its own" does not cover a save that the mechanism itself schedules. For every "no writes" sentence about a path that changes selection, location, folds or view state, find whether the path calls `markPersistedChange` and state it: "performs no direct disk writes; ... marks a persisted change, which the idle autosave coalesces".
  * When a paragraph is split, a closing "These ..." sentence keeps the whole split text as its subject: name the subject or make the sentence its own paragraph.
  * When the sentence before a pronoun gets a new subject, name the pronoun's subject. Do not let "It" pass from an owner module to its caller.
  * Before removing a "retains its existing ordering" sentence, search the owning module for the rule. When the code keeps the ordering on purpose, restate the rule in the present.
  * A base sentence "this changes no X; X is unchanged" narrates a past change. Do not restate it as "does not affect X": that is an absolute claim. Either remove the comparison under rule 3, or state what the code does, with evidence.
* R2 result (base `7b7d30d5`): subsections 2.1–2.3, 16.1–16.3 and 17.1 added; 22 clauses left or changed, each with a disposition. The four security paragraphs now in §16.1 are byte-identical to the base. The Reviewer found one absolute cost claim that the code contradicts (corrected, below) and two wording points (applied). Recovery: 2 of the 12 pooled fix cycles are used.
* R3 result (base `a710f42c`): subsections 5.1–5.5 and 11.1–11.3 added; 19 clauses changed, each with a disposition; none removed without a restatement. The structural-sharing paragraph of §11 is byte-identical. The Reviewer verified the five reworded cost claims against the code and reported one non-blocking wording point (an "also" that lost its antecedent), which is applied. The recovery count stays at 2 of 12: it counts a repair that a blocking finding or a failed check requires.
* R4 result (base `6599a738`): subsections 7.4–7.6 added (7.2 and 7.3 are in other files); §7.1 split into six paragraphs in base order; 9 clauses changed, one removed. The security sentences of §7.4 and §7.5 are byte-identical apart from the citation form. The Reviewer verified the four reworded claims against the code and found no meaningful issue.
* R5 result (base `ce686800`): subsections 9.1–9.4 added; §8.9 reordered with the application owners first; §8.10 split into six paragraphs with every sentence byte-identical; 19 clauses changed. The single-owner paragraph (ADR 0014) is §9.1 and differs in one word. The Reviewer found two cost sentences whose scope had changed (§8.7, §9.3); both are corrected with code evidence. Recovery: 3 of the 12 pooled fix cycles are used.
* R6 result (base `1c52b349`): subsections 8.2.1–8.2.2, 8.4.1–8.4.5 and 8.11.1–8.11.5 added; the 13 paragraphs of §8.4 are regrouped by mechanism; 43 clauses changed. The Reviewer found a sentence whose scope widened when it moved (screenshot baselines), a merged assessment that had dropped "no sync", and one relative cost sentence stated absolutely; all three are corrected. It also found that "(§13)" in §8.11.3 pointed to the appearance IPC sentence that R1b moved from §13.4 to §7.2.1; the reference is retargeted. Recovery: 4 of the 12 pooled fix cycles are used.
* R7 result (base `4b6dbe0d`): subsections 8.3.1–8.3.2 and 21.1.1–21.1.7 added; the module list opens §21.1; 45 clauses changed, one clause part removed. The Reviewer found a "These modules" sentence with a narrowed subject, an allocation claim broader than the base, and two "no writes of its own" sentences on a path that schedules a save; all are corrected with code evidence. Recovery: 5 of the 12 pooled fix cycles are used.
* R8 result (base `421ec114`): subsections 4.2.1–4.2.5 and 13.3.1–13.3.4 added; 30 clauses changed, one removed. The Reviewer found a sentence whose "It" had passed from the search session to the popup, and a "no writes of its own" sentence about the store's search view, whose commands mark a persisted change; both are corrected with code evidence, with three smaller points. It also found one base sentence that the code contradicts (Q1 below). Recovery: 6 of the 12 pooled fix cycles are used.
* R9 result (base `4df32e3c`): subsections 7.3.1–7.3.3 and 8.1.1–8.1.7 added; the 14 paragraphs of §8.1 are regrouped; 36 clauses changed, one duplicate merged. The two Global Search sentences stay in §8.1.4 with a citation of §13.3 (finding of the T2 review). The Reviewer found that a removed sentence held an ordering rule that the code keeps on purpose (restated in §8.1.6) and confirmed one base sentence that the code contradicts (Q2), with one more for the owner to judge (Q3). Recovery: 7 of the 12 pooled fix cycles are used.
* R10 result (base `f145c023`): subsections 13.5.1–13.5.5, 13.9.1–13.9.3 and 13.10.1–13.10.2 added as headings before existing paragraphs; no sentence moved; 25 clauses changed, none removed. The durable-write, cleanup and recovery rules are byte-identical. The Reviewer verified six reworded claims against the code and found that one reworded base sentence is contradicted by the code; the base sentence is restored unchanged and recorded as Q4. Recovery: 8 of the 12 pooled fix cycles are used.
* R11 result (base `f804761e`): subsections 13.8.1–13.8.5, 14.1–14.2 and 15.1–15.2 added; the 12 paragraphs of §13.8 are regrouped; 34 clauses changed. The save, flush, lock and attachment-limit rules and the clipboard ownership rules are intact. The Reviewer found two "unchanged" narrations restated as absolute claims that the code contradicts (§13.8.1 timing, §13.8.4 coordinator); both are corrected. Recovery: 9 of the 12 pooled fix cycles are used.
* R12 result (base `6732750b`): subsections 13.12.1–13.12.3 and 13.13.1–13.13.5 added as headings before existing paragraphs; no sentence moved; 12 clauses changed, none removed. The crash-safety text of §13.12 (ADR 0024) is byte-identical apart from the citation form. The Reviewer verified the reworded claims against the code and found no blocking issue; its two wording points are applied. The recovery count stays at 9 of 12.
* R13 result (base `25bbc673`): subsections 13.15.1–13.15.6, 13.16.1–13.16.2 and 13.17.1–13.17.4 added as headings before existing paragraphs; no sentence moved; 15 clauses changed, none removed. The update protocol, the import journal and phase rules and the backup rules are byte-identical. The Reviewer verified the reworded claims against the code and found no meaningful issue; its wording suggestions are applied. The recovery count stays at 9 of 12.
* Decisions made under D5, for the final acceptance:
  * R2: §17.1 states that the image-to-text queue traverses the document only to admit a reindex and to find the new owner of a reindex job whose node lost its image (`src/application/image-to-text-queue.ts:38-62`, `:102-118`). The base said that the queue "adds no ... document scans to the existing paths".
  * R2: the sentence "The Electron build preserves its existing output paths" is removed from §2 as a statement about a past change.
  * R6: §8.11.3 states "An appearance change performs one preference write and no sync" (`src/electron/main/index.ts:110-117`, `src/infrastructure/main/window-state.ts:125-132`); the base said that Gray and White need "no additional disk writes, syncs, or startup reads".
  * R7: §21.1.5 and §8.3.2 state that a cross-node motion step that changes the selected node marks a persisted change for the idle autosave (`src/application/editor-store.ts:793-806`, `:960`); the base said "no new disk writes or syncs". The clause "character completion parses the same counts as before" is removed from §21.1.4 as a comparison with earlier code.
  * R8: §13.3.2 states that `openSearchResult` marks a persisted change for the idle autosave (`src/application/editor-store.ts:1018-1037`), and §21.2 states that the `navigate` and `confirm` commands of `EditorStore.search` mark one for a Tree destination (`:776-791`). §13.3.1 states the `recent-nodes` compatibility rule without "no longer". The clause "ancestor walks, projection-cache calls, retained state, writes and syncs are unchanged" is removed from §4.2.5 as a comparison with earlier code.
  * R9: §7.3.2 states that entering a node from Agenda marks a persisted change for the idle autosave (`src/application/editor-store.ts:987-1014`); the base said "the existing navigation save policy without extra writes or syncs". §8.1.6 states "Only the scroll event commits synchronously; layout-effect and resize updates keep their ordinary commit order" (`src/renderer/AgendaView.tsx:364-378`).
  * R11: §13.8.1 states "The timing configuration sets only the idle and cleanup-retry delays; it does not change which events trigger a save" (`src/application/editor-save-scheduler.ts:96-139`, `src/web/main.tsx:29-32`); the base said that explicit timing "changes no save triggers, write or sync counts, document-scale work or retained history", which holds only for the triggers. The clause "capture timing, serialization, write/sync counts and document-scale work are unchanged" is removed from the `PersistenceCoordinator` paragraph (§13.8.4) as a comparison with earlier code.
  * R4: the sentence "This changes no IPC contracts, timers, persistence operations or runtime growth" is removed from the `quit-handshake.ts` paragraph (now §7.6) as a statement about a past change. §7.1 says that `AppUpdates` does not use the ordinary `QuitHandshake` (base: "the ordinary QuitHandshake is unchanged"; `src/electron/main/app-updates.ts` has no reference to it).
  * R1b: §7.2.1 names image-to-text availability as the third input of the command panel's available registry (`src/renderer/use-command-panel.ts:68-77`). The base sentence named two inputs. The code does not contradict it; the sentence was incomplete, so this is a correction with code evidence and not a reserved case.

## Questions for the Product Owner

Each question names a base sentence that the code contradicts (reserved decision). The sentence is unchanged in the architecture file. The recommendation is the correction that the code and the product specification support. Ask all questions in one batch.

* **Q1.** `search.md` §13.3.2: "The query matcher collects starred and unstarred matches separately during its depth-first traversal and returns the starred matches first." The code returns marked matches first, then starred matches, then the rest (`src/application/node-search.ts:36-37`, `:79`, `:103-105`), as `docs/product/search.md` and `docs/product/tree-model.md` state. Recommendation: correct the sentence to "collects marked, starred and other matches separately ... and returns marked matches first, then starred matches".
* **Q2.** `agenda.md` §7.3.1: "Performance assessment for Agenda state (`docs/PRODUCT.md` §22.1): opening, selection, day folds, and focused presentation changes cause no document writes or syncs and add no undo snapshots." An explicit timeline fold command marks a persisted change (`src/application/editor-store.ts:383-387`, `src/application/agenda-fold-memory.ts:23-44`), as ADR 0030 and §8.1.5 state; focused-day folds do not. Recommendation: "Opening, selection, focused presentation changes and focused-day folds cause no document writes or syncs; an explicit timeline fold choice marks a persisted change for the idle autosave (§8.1.5); none causes an undo snapshot."
* **Q3.** `agenda.md` §7.3.1: "Rows are rebuilt only when that projection, Today, displayed week, day folds, or focused day change." A change of the active occurrence also runs the row build (`src/application/agenda-rows.ts:306`, `:326-348`); the published array keeps its identity when the rows compare equal. The sentence is wrong if "rebuilt" means that the build runs, and right if it means that a new array is published. Recommendation: "The row build runs only when that projection, Today, displayed week, day folds, focused day or the active occurrence change; equal rows keep the published array."
* **Q4.** `persistence.md` §13.5.1: "Serialization filters the expanded ids against the id set the existing validation walk already builds, which adds `O(E)` for `E` remembered ids to a save that is already `O(N)`." `serializeState` discards the id set of the validation walk and filters against the derived node index (`src/domain/document-serialization.ts:71-81`, `src/domain/document-index.ts:32-42`), as §13.9.3 of the same file states. The two bounds are correct. Recommendation: "Serialization filters the expanded ids against the document's derived node index (§13.9.3), which adds `O(E)` for `E` remembered ids to a save that is `O(N)`."

## Next Task

R14. After R14, ask the Product Owner the questions Q1–Q4 in one batch and request the final acceptance.
