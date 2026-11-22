# Architecture Document Split

Status: In progress

## Objective

1. Split `docs/ARCHITECTURE.md` (209,630 bytes at `e85fed30`) into per-area files under `docs/architecture/`, with `docs/ARCHITECTURE.md` as the index, the same way `docs/PRODUCT.md` indexes `docs/product/`.
2. Give §4, §7, §8, §13 and §21 numbered subsections by subject, so that each subject is stored in the file of its area. This answered the open question TD-003, which T2 removed from `docs/OPEN_QUESTIONS.md`.
3. Rewrite the wording of every file as present-state statements without losing an architectural fact.

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
  * **D4.** After R1 the Product Owner reads the rewritten files and confirms the style before R2 starts.
* Delegated decisions and their principles:
  * Titles of new subsections, the order of files in the index, and the wording of the index. Principle: the same form as `docs/PRODUCT.md`.
  * Which paragraph belongs to which subsection when the map below is inexact. Principle: the paragraph goes to the subject it describes, and a paragraph stays next to the paragraph it refers to.
  * A stale symbol, path or name in the architecture text, when code, tests and ADR agree. Principle: `AGENTS.md` §2; correct it, record the code evidence, and have the Reviewer verify it.
* Reserved decisions:
  * A mechanism or behavior claim that the code contradicts. Do not reword it; record it under Findings and ask the Product Owner in one batch.
  * A sentence that states user-visible behavior which no `docs/product/` file states. Keep the sentence and record it under Findings as a candidate requirement gap.
* Execution budget: 16 working tasks. Recovery budget: 2 fix cycles each for T1 and T2, and 10 pooled fix cycles for R1–R14. Closure allowance: 2 fix cycles after a rejected acceptance, plus the retirement commit.

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

## Rewrite Method (R1–R13)

Wording rules:

* **Rewrite the minimum.** Change a sentence only when it is history-relative, restates product behavior, or is unclear. Leave every other sentence byte-identical.
* State what the code does now. Remove change-history phrasing such as "no longer", "the existing", "added", "adds no", "as before", "unchanged", "now" and restate the fact. Example: "adds no writes or syncs" becomes "performs no writes or syncs".
* Follow the communication style of `AGENTS.md` §1: active voice, literal terms, short sentences, the owning module or type as the subject, one mechanism per paragraph.
* Add no new fact. Every added clause traces to one or more old clauses.
* Replace a sentence that only restates user-visible behavior with a citation of `PRODUCT.md §N`, after reading the product file and confirming that it states the fact. Otherwise keep the sentence (reserved decision above).
* Keep the reason for a rejected alternative when it constrains future change, as a present-state reason.
* Keep exactly: module, file, symbol, type, IPC channel, CSS class, attribute and storage-key names; ADR links; section references and their scope; numbers, limits, counts and units; state names; order statements; the modality `must`, `should`, `may`; `never`, `only`, `no`; write and sync counts, complexity bounds, retained-memory bounds and named guards of every performance assessment; stated limits of measurements.
* Keep the order of statements where order carries meaning, and keep a paragraph next to the paragraph it refers to.
* A task may add numbered subsections inside its file and then updates the section map.

Proof for each rewrite task, with the task's starting commit as `<base>`:

1. `npm run check:docs -- --details <base> --file docs/architecture/<file>.md`. Every removed literal and changed reference has a ledger entry; no table cell changes.
2. `npm run check:docs -- --verbatim <base> --file docs/architecture/<file>.md`. It exits 1 for a rewrite. Every removed clause gets one disposition in `.scratch/architecture-split-<task>/ledger.md`: Restated (new location), Product-owned (`PRODUCT.md §N`, verified), History-only (no fact), Corrected (code evidence `path:line`), or Moved within file. "Dropped" is not a disposition.
3. `npm run check:docs` and `npm run format:check:changed` pass.
4. `git diff --stat` shows only the task's files, the index when subsections are added, and this plan.
5. The Reviewer receives the old file, the new file, the ledger and both reports, and confirms that no fact is lost, changed or added.

## Tasks

| ID | Outcome | Files | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- | --- |
| T1 | The checker knows the architecture specification and can prove an exact regrouping | `scripts/check-docs.mts`, `scripts/check-docs.test.mts`, `docs/DEVELOPMENT.md` §9 and §12 | Tests for architecture index validation, live documents, link normalization and `--regrouped` (exact regrouping passes; a changed character, a dropped block and a dropped fence fail; a renumbered heading is reported). `npm run check:docs -- --regrouped HEAD --spec architecture` exits 0 on the unchanged tree | Low Risk: `npm run check` | Done |
| T2 | Index plus 17 files; TD-003 removed from `docs/OPEN_QUESTIONS.md` | `docs/ARCHITECTURE.md`, `docs/architecture/*.md`, `docs/AGENT_WORKFLOW.md` §11 document list, `docs/OPEN_QUESTIONS.md`, this plan | `npm run check:docs -- --regrouped <T1 commit> --spec architecture` exits 0; its heading list matches Structure above; every listed adjacent pair is still adjacent; `npm run check:docs` passes. Reviewer on the heading list, section map and report | Minimal Risk: `npm run format:check:changed`, `npm run check:docs`, `npm run check:permissions` | Done |
| R1 | Pilot rewrite; owner checkpoint D4 | `command-panel.md`, `completion-and-tags.md` | Rewrite proof | Minimal Risk | Ready |
| R2 | Rewrite | `overview.md`, `electron.md`. Leave §1, §3, §12, §18–20, §22, §23 and the §16 list unless they hold change-history phrasing. `docs/SECURITY.md` cites §15–17: do not weaken a control | Rewrite proof | Minimal Risk | Planned |
| R3 | Rewrite | `domain-model.md`. §11 holds the structural-sharing invariant (ADR 0015) | Rewrite proof | Minimal Risk | Planned |
| R4 | Rewrite | `application.md` | Rewrite proof | Minimal Risk | Planned |
| R5 | Rewrite | `interaction.md`. §9 holds the single-owner text (ADR 0014) | Rewrite proof | Minimal Risk | Planned |
| R6 | Rewrite | `list-rendering.md`, `appearance.md` | Rewrite proof | Minimal Risk | Planned |
| R7 | Rewrite; add subsections to §21.1 | `vim.md` | Rewrite proof | Minimal Risk | Planned |
| R8 | Rewrite | `search.md` | Rewrite proof | Minimal Risk | Planned |
| R9 | Rewrite; add subsections to §8.1 | `agenda.md` | Rewrite proof | Minimal Risk | Planned |
| R10 | Rewrite | `persistence.md` | Rewrite proof | Minimal Risk | Planned |
| R11 | Rewrite | `save-scheduling.md`, `attachments-and-clipboard.md` | Rewrite proof | Minimal Risk | Planned |
| R12 | Rewrite | `desktop-data.md`. Keep the crash-safety step order (ADR 0024) | Rewrite proof | Minimal Risk | Planned |
| R13 | Rewrite | `browser.md` | Rewrite proof | Minimal Risk | Planned |
| R14 | Lasting wording rules in the index; size limit D2 | `docs/ARCHITECTURE.md`, `scripts/check-docs.mts`, `scripts/check-docs.test.mts`, `docs/DEVELOPMENT.md` | Every file is within the limit; `npm run check` passes | Low Risk: `npm run check` | Planned |

T2 wrote each file once with the file-editing tool from the line ranges above, then wrote the index.

## Owner Involvement

* Working tasks: 16. The final owner acceptance of `AGENTS.md` §8 applies.
* Verification rounds: one style checkpoint after R1 (D4); at most one batch of Findings questions during R2–R13; one final acceptance round.
* Owner-required checks: none. No user-visible behavior changes.
* Capabilities to confirm at run time: `npm run check:docs` with the new arguments runs without a prompt; the Reviewer launches.

| Task | Check | Owner action |
| --- | --- | --- |
| R1 | Style of the rewritten files | Read `docs/architecture/command-panel.md` and `docs/architecture/completion-and-tags.md`; confirm or correct the style |
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

## Next Task

R1. Record its starting commit as `<base>` before editing.
