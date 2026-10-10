# PRODUCT.md Structure

## Objective

Make [`docs/PRODUCT.md`](../docs/PRODUCT.md) easier for agents to search, cite, and apply rule by rule, without changing product behavior and without splitting the file:

1. a `check:docs` guard on the size of PRODUCT.md paragraphs, list items, and leaf sections;
2. numbered subsections for §20.2 (Vim-inspired editing) that the requirement checker sees, with every test marker citing the subsection its test exercises;
3. dense paragraphs rewritten as one-rule list items with every sentence preserved verbatim;
4. [`docs/VIM_CONFORMANCE.md`](../docs/VIM_CONFORMANCE.md) citing PRODUCT subsections instead of restating behavior, with rules that exist only in the matrix surfaced to the Product Owner.

## Scope and Sources of Truth

* This plan is a coordination record. `docs/PRODUCT.md` stays the single source of truth for behavior; no task changes product behavior.
* One PRODUCT.md. No existing section is renumbered; only new children of §20.2 are added.
* Tests change only by `@requirement` marker comments, except under decision D8.
* `AGENTS.md` changes only by the D3 relocation in PS-11.
* Wording that turns out to be ambiguous during restructuring is recorded under Questions for the Product Owner below and never resolved by the agent.
* Out of scope: reorganizing §20 (decision D7), size limits for documents other than PRODUCT.md, and Codex or OpenCode transcript analysis.

## Authorization State

* 2026-10-10: the Product Owner authorized creating this initiative plan. Each task is authorized by the Product Owner's request to continue (`AGENTS.md` §8).
* D1 and D2 have defaults that apply unless the Product Owner answers otherwise before PS-1 starts.
* D3: the Product Owner confirmed the recommendation on 2026-10-10. PS-11 moves "Who decides a divergence" into `AGENTS.md` §5.
* D4 to D8 are decided as described below, when the task reaches them.

## Findings

Origin labels: measured in the planning session at HEAD `e47b906`, or read there. Line numbers are locators at that HEAD only; after any edit, the `check:docs` report from PS-1 is authoritative.

* Size and growth (measured with `git cat-file --batch-check`): PRODUCT.md grew from 10,064 bytes (2026-09-11) to 135,798 bytes (2026-10-10) while its line count grew from 594 to 1309. Growth happens by appending clauses to existing paragraphs, about 4 KB per day recently, mostly in `feat` commits.
* How agents read it (measured from all Claude Code session transcripts 2026-09-23 to 2026-10-10): 0 of 187 Read calls read PRODUCT.md without `offset`/`limit`. Agents search, then read ranges. Median PRODUCT.md text per session: main agent about 16k characters, reviewer about 9k, product verifier about 13k, planner about 32k (maximum 108k). Codex sessions were not captured by the analysis (format mismatch); unverified. Conclusion: context cost is not the problem; findability and self-contained fragments are.
* Splitting into files was rejected: it fixes none of the dense paragraphs, coarse traceability, or duplication, and it breaks § numbering and `npm run check:requirements`.
* Traceability: `parseSections` in `scripts/check-requirement-coverage.mjs` reads only `##` and `###` headings, so §20.2 (about 33 to 35 KB) is one requirement; 33 markers cite `// @requirement PRODUCT.md §20.2` in 12 files (measured).
* Dangling references: 24 code comments in 15 files cite `§20.2.1` (most with a label `T1` to `T8`). That subsection was "Planned Tree-Specific Vim Editing", added in `9f04f4f` and removed in `7a124fa` when the `vim-org-editing` initiative moved its clauses into the §20.2 text. Its labels were: T1 subtree units and counts, T2 Visual nesting (`>`/`<`), T3 Visual register exchange and `gp`/`gP`, T4 vertical operators, T5 text commands (`Y`, case), T6 joins, T7 `gv`, T8 repeat. Once a real §20.2.1 exists these comments would point at the wrong topic.
* Tooling constraint (read): `.claude/settings.json` denies `Bash(node *)` and `opencode.json` denies `node`, so an agent cannot run an ad hoc comparison script. The verbatim comparison must be a mode of an allowed command: `npm run check:docs -- --verbatim <ref>`.
* PS-1 exact measurements on the unchanged PRODUCT.md at `e47b906`, using `scanProductSections`, `scanProductBlocks`, and `productOwnText`: blocks of at least 600 characters: 51; 700: 37; 800: 31; 1000: 20; 1500: 5; 2000: 4. The longest block is the paragraph at line 981 (§20.2), 2,535 characters. Splitting blocks at sentence-final punctuation followed by whitespace gives a longest sentence of 506 characters, at line 981, starting "If the user invokes an application undo or redo shortcut" and ending "the command still acts on what the user selected." No measured sentence exceeds the 700-character block limit.
* At a 700-character limit, 37 blocks in 17 sections violate: 2.1, 2.2, 2.4, 2.5, 10, 11, 13, 16.1, 20.2, 20.5, 20.8, 20.9, 23.2, 23.4, 23.5, 23.11, 23.12 (16 of the blocks are in §20.2). The guard run with empty exemption sets confirmed these ids. Exact top five leaf own-text sizes: §20.2 33,082; §16.1 5,319; §20.9 4,709; §2.1 4,662; §20.5 3,909 characters. Only §20.2 exceeds 8,000 characters.
* VIM_CONFORMANCE.md (87 KB, 139 lines) restates PRODUCT rules in its behavior column, and by reading it also states behavior that PRODUCT.md does not (seeds under PS-9). Its first table has a two-column header while rows at lines 21, 22, 23, 25, 41 to 45, and 49 have three cells.
* References to `§20.2` (measured, lines): 33 test markers; 9 plain code comments or titles; 24 dangling `§20.2.1` comments; 13 in PRODUCT.md; 37 in VIM_CONFORMANCE.md; `docs/DEVELOPMENT.md:228`, `docs/ARCHITECTURE.md:547`, `plans/agenda.md:295` and `:481`; `'20.2'` in `BOUNDARY_SECTIONS`. No ADR cites §20.2. ADRs are historical and are never edited for renumbering.

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| PS-1 | Shared section scanner accepts numbered `####` headings; `check:docs` enforces block and leaf-section limits on PRODUCT.md with shrinking per-section exemptions; a marker may not cite a section that has numbered children and no text of its own | — | `npm run check`; unit tests; exact sizes and longest sentence recorded here; a trial over-limit paragraph fails the guard | Complete |
| PS-2 | `npm run check:docs -- --verbatim <git-ref>` compares clauses before and after an edit | PS-1 | Unit tests with adversarial cases; clean run on `HEAD`; run against a past PRODUCT.md commit; `npm run check`; `npm run check:opencode`; independent review | Complete |
| PS-3 | §20.2 restructured under unnumbered `####` headings into one-rule items, verbatim | PS-2 | Verbatim report clean except listed lead-ins; no §20.2 block over the limit; `20.2` block exemption deleted; `npm run check`; independent review | Complete |
| PS-4 | §20.2 subsections numbered 20.2.1 and onward; every marker re-pointed or added to the subsection its test exercises; boundary list updated | PS-3 | `npm run check` (every leaf marked, boundary leaves have E2E markers, no `§20.2` marker left); `20.2` section exemption deleted; independent review of the mapping | Complete |
| PS-5 | Code-comment references re-pointed (24 dangling `§20.2.1`, 9 plain `§20.2`) | PS-4 | No `§20.2.1 T` left; `npm run check` | Complete |
| PS-6 | Batch A split verbatim: §2.1, §2.2, §2.4, §2.5, §10, §11, §13, §16.1 | PS-2 | Verbatim report clean; exemptions deleted; `npm run check`; independent review | Planned |
| PS-7 | Batch B split verbatim: §20.5, §20.8, §20.9, §23.2, §23.4, §23.5, §23.11, §23.12 | PS-6 | Same as PS-6 | Planned |
| PS-8 | Limits made absolute; exemption mechanism removed | PS-3, PS-4, PS-6, PS-7 | `npm run check`; no exemption parameter or constant remains | Planned |
| PS-9 | VIM_CONFORMANCE.md "Mode and command families" and "Completed Tree operation replay" cite subsections; matrix-only rules kept and queued | PS-4 | `npm run check:docs`; divergence markers kept with reasons; evidence cells unchanged; removed-clause audit; independent review | Planned |
| PS-10 | Same for "Interaction-state contract" and "Image and caret transitions"; queue complete; one Product Owner message sent | PS-9 | Same as PS-9; queue recorded here | Planned |
| PS-11 | Approved matrix-only rules written into PRODUCT.md; matrix purpose, Agenda paragraph, history paragraphs, and "Who decides a divergence" resolved | PS-10, Product Owner answers | `npm run check`; independent review | Planned |
| PS-12 | Close: lasting knowledge moved to `docs/DEVELOPMENT.md`; plan and index row removed | PS-8, PS-11, Product Owner confirmation | `npm run check:docs`; `npm run format:check:changed` | Planned |

Suggested sessions (at most four commits each, `AGENTS.md` §12): PS-1 and PS-2; PS-3; PS-4 and PS-5; PS-6 to PS-8; PS-9 and PS-10; PS-11 and PS-12.

**Next task:** PS-6. Start every task with `git status` and `git log -3 -- docs/PRODUCT.md`; if PRODUCT.md changed since the last update of this plan, rerun the guard report before trusting the section lists here.

PS-1 completed (2026-10-10): shared scanner, size guard, coverage checks, exact
measurements, focused tests, and primary review. PRODUCT.md is unchanged.
Full validation passed with a temporary single test worker; all 3,202 tests,
coverage floors, static/governance checks, and build passed. Default concurrency
failed only the existing date-parser wall-clock timing guards; isolated and
serial full-suite runs passed, supporting contention as the explanation. The
temporary concurrency setting was restored before commit. No thresholds or
tests were weakened. Future sessions should retain this environment caveat when
investigating a repeated default-concurrency timing failure.

PS-2 completed (2026-10-10): verbatim CLI, multiset comparison and review reports,
50 focused documentation-tool tests, and the S3 practice documented. The npm
command forwarded its arguments and the shell-free Git child worked in the
sandbox: HEAD reported 1,479 unchanged units with 0 removed and 0 added; comparing
with `e34e23d` reported the real date change, 2 removed and 6 added clauses
(expected exit 1). Full `npm run check` passed with the same temporary single
worker condition as PS-1 (3,220 tests, coverage, governance and build); the setting
was restored. `npm run check:opencode` passed 284 expectations. Independent review
reported no meaningful issues after comment/fence edge fixes and explicit
documentation of the prescribed punctuation and order limits. PRODUCT.md stays
unchanged; no product decisions or unresolved wording questions arose. PS-3 is
a larger restructuring task and starts in a fresh session.

PS-3 completed (2026-10-10): §20.2 now has 27 unnumbered `####` subsections of
one-rule items; no sentence was reworded. `npm run check:docs -- --verbatim
ff29955 --allow-added 6` reported before 1,479, after 1,485, unchanged 1,479,
removed 0, added 6; the six added clauses are the lead-in "Normal mode also
supports" (the original "Normal mode supports:" opens the first list). The `20.2`
block exemption is deleted; no §20.2 block exceeds 700 characters. Deviations
from Appendix A, all keeping the original sentence order (S3 rule 3): the
mouse-click sentence stays after the Insert-interruption sentence, under its own
"Pointer Presses and Application Commands"; the Put, Join, and Fold commands and
Text Objects and Surround Delimiters are separate subsections; "Local Vim
Register" is its own final subsection and was not moved. Rule 2 exception: "These
structural mutations are each one undoable command." is a separate last item of
the whole-node Visual group, because joining it to the four preceding sentences
would exceed 700 characters and joining it to the put sentences would narrow its
scope. PRODUCT.md stays the only behavior source; no product decision was made.

PS-4 completed (2026-10-10): the 27 §20.2 headings are numbered 20.2.1 to
20.2.27; no other PRODUCT.md text changed. The 33 `§20.2` markers were
re-pointed and 28 markers were added to tests that had none, after reading each
test's assertions; every subsection has at least one marker, so D8 did not apply.
One marker left §20.2: the standard-editing selection-highlight test in
`e2e/drag-and-drop.spec.ts` now cites §20.5, because it runs with Vim disabled
and §20.2.20 states the highlight only for Vim selections. Boundary subsections,
each with an `e2e/` marker: 20.2.1 (preference persistence), 20.2.5 (quit and
close save), 20.2.8 (drag-and-drop), 20.2.12 (`Enter` opens a hyperlink through
the Electron shell), 20.2.22 (system clipboard), and 20.2.26 (register separate
from the system clipboard). 20.2.24 is not a boundary subsection but has an E2E
marker. The `20.2` section exemption is deleted. Q1 stays open: its three "this
section" sentences now sit in numbered subsections 20.2.2 and 20.2.3. Validation:
static checks of `npm run check` passed (90 numbered requirements); its default
concurrency run failed only the known date-parser wall-clock guard, which passed
alone; `npm run test:coverage -- --maxWorkers=1` passed 3,220 tests with coverage,
and `npm run build` passed. Independent review found no meaningful issues; it
noted that the `editor-store.test.ts` "text-bearing structural creation" marker
(§20.2.19) tests the store primitive behind repeated `o` and `O`, not `.` itself,
and was kept because other tests cover §20.2.19 directly. Until PS-5 lands, the
24 `§20.2.1 T…` code comments resolve to Toggle and Preference.

Subsection numbers for PS-5 labels: T1 counts §20.2.16; T2 Visual shifts
§20.2.23; T3 register exchange and puts §20.2.13 for `gp` and `gP`, §20.2.20 for
character Visual `p` and `P`, §20.2.23 for whole-node Visual `p` and `P` (read the
comment's code); T4 vertical operators and T5 text commands §20.2.11; T6 joins
§20.2.14; T7 `gv` §20.2.25; T8 dot repeat §20.2.19.

PS-5 completed (2026-10-10): the 24 dangling `§20.2.1` and 9 plain `§20.2`
code-comment references in 19 files now cite numbered subsections; comments
only, no code change. Labels followed the mapping above, after reading each
comment's code: the count before a Visual put (`vim-keyboard-handler.ts`) is
character Visual §20.2.20, and the register exchange in `vim-edit-session.ts`
and the Visual shifts in `editor-store.ts` and
`editor-node-visual-transitions.ts` are §20.2.23. Plain references: `o`
§20.2.10, Normal `p` §20.2.13, case around hyperlinks §20.2.11, `z` folds
§20.2.15, composition §20.2.27, `h`/`l` and image positions §20.2.9, first-run
default §20.2.1. A search for `§20.2` followed by anything other than a
subsection number, and for `§20.2.1 T`, returns nothing.

## Conventions

* Tier names are those of `docs/DEVELOPMENT.md` §9. A task that deletes an exemption edits a validation script, so it is Low Risk and runs `npm run check` even when its text change is documentation only.
* "Review" means an independent reviewer under `AGENTS.md` §13. No product verifier is needed: no user-visible behavior changes.
* "V" means `npm run check:docs -- --verbatim <HEAD at task start> --allow-added <N>`.
* Commit types: `chore(docs)` for tooling, `docs(product)` for PRODUCT.md text, `docs(vim)` for VIM_CONFORMANCE.md. Each task commits together with its status update in this plan.
* For tooling tasks, the primary agent exercises the failure paths by hand and records them as acceptance evidence.

## S1. Guard Specification (PS-1)

* New `scripts/product-sections.mjs` (no TypeScript import) exports `scanProductSections(content)`: for each numbered heading of levels 2 to 4, `{ id, title, level, startLine, lines: [{ number, text }] }`, with the same fence tracking as `parseSections`; and `scanProductBlocks(lines)` returning blocks.
* Blocks. Counted: a paragraph (consecutive non-blank lines joined by one space), a list item (marker `*`, `-`, or `N.` removed; indented continuation lines absorbed), a table row. Not counted: headings, fenced code, `---`, HTML comments, blank lines. Length is JavaScript `string.length` after trimming.
* `parseSections` keeps its return shape `{ id, title, required }` and delegates to the scanner; `check-requirement-coverage.mjs` keeps exporting it so the existing test import works.
* `checkCoverage` gains two issues: a heading level must equal the number of id segments plus one (`PRODUCT.md §20.2.1: heading level does not match its number depth`); a marker may not cite a section that is not `required` (`src/x.test.ts:12: PRODUCT.md §20.2 has numbered subsections and no text of its own; cite a subsection`). No marker cites a text-less parent today (measured).
* `scripts/check-docs.mjs` exports `PRODUCT_LIMITS = { block: 700, section: 8000 }` (D1), `findOversizedProductText({ content, limits, blockExemptions, sectionExemptions, displayPath })`, and two exported `Set`s of section ids holding the temporary exemptions. `runChecks` calls it only when `docs/PRODUCT.md` exists.
* Own text of a section: lines up to the next numbered heading, including unnumbered subheadings and fences, excluding the heading line, HTML comments, and `---`.
* Messages: `docs/PRODUCT.md:981 (§20.2): paragraph has 2741 characters; the limit is 700. Split it into one rule per list item without rewording (docs/DEVELOPMENT.md §12).`; `docs/PRODUCT.md §20.2: 34512 characters of own text; the limit is 8000. Split it into numbered subsections (docs/DEVELOPMENT.md §12).`; `docs/PRODUCT.md §X: stale size exemption; delete it.`
* Exemptions: the block set starts with the 17 section ids listed in Findings and the section set with `20.2`. Set them by running the guard once with empty sets and copying the reported ids. An exemption whose section no longer violates is an error, so each restructuring task deletes what it fixed; PS-8 deletes the mechanism. The guard comes first so that sections without an exemption are protected from the first commit. A baseline keyed by block and a permanent allowlist were rejected.

## S2. Verbatim Comparison Specification (PS-2)

* CLI: `node scripts/check-docs.mjs --verbatim <git-ref> [--file docs/PRODUCT.md] [--allow-added <n>]`, run by agents as `npm run check:docs -- --verbatim HEAD`. It reads `git show <ref>:<file>` through `execFileSync('git', [...])` without a shell, validates the ref against `/^[\w./~^@{}-]+$/`, rejects a ref starting with `-`, and compares with the working-tree file. Exit 0 only when removed is 0 and added is at most `--allow-added` (default 0); exit 1 on differences; exit 2 on a bad ref or file. The default `check:docs` run is unchanged.
* Normalization of both texts: (1) each fenced block is one unit compared exactly; (2) drop blank lines, headings, `---`, and HTML comments; (3) strip list markers and a leading bold label such as `**Context.**`; (4) split each block into clauses at `(?<=[.!?;:])\s+`; (5) trim, collapse whitespace, strip trailing `[.;:,]`, drop empty clauses; (6) compare as multisets.
* Splitting a paragraph into items, regrouping items, moving a sentence under another heading, and changing an item's final `;` to `.` pass. A changed word, a dropped sentence, an extra copy, or a new sentence fails. Known limits of the prescribed normalization: clause and sentence order are not verified, and internal clause-boundary periods, semicolons, and colons normalize alike. A clean report proves only the normalized clause multiset; the reviewer checks the diff against S3's stricter wording and order rules.
* Output: counts (before, after, unchanged, removed, added); each removed and added clause; headings added or removed; clauses that moved to a different heading; and every new-text clause containing `above`, `below`, `preceding`, `following`, `earlier`, `later`, `this section`, or `the rule`, with its heading, so the reviewer can check each antecedent.
* Tests in `scripts/check-docs.test.mjs`: identical text; paragraph to items; items regrouped under a new heading; `;` to `.`; label to heading; one word changed; sentence dropped; sentence duplicated; lead-in added with and without `--allow-added`; fence moved and fence edited; CRLF; abbreviation splits cancelling; semicolon-joined items merged into one paragraph; a bad ref and an option-like ref exit 2.
* A separate script with its own `package.json` entry was rejected: it would need new allow rules in `opencode.json` and `.claude/settings.json`.

## S3. Restructuring Rules (PS-3, PS-6, PS-7)

1. Every sentence keeps its characters, inline code, links, numbers, and cross-references. Allowed edits: add headings; add lead-in lines ending in `:` (counted by `--allow-added`); change a list item's final `;`, `.`, or `:`; replace a leading bold label with a heading.
2. One item is one rule: a sentence stays in one item with the sentences that only qualify it (starting "It", "They", "That", "This", "Such", "These", or containing "above" or "below").
3. Keep the original order. Regroup only where topics interleave, and list each cross-block move in the handoff. A sentence with "above", "below", "the rule above", or "following" must still point at the same antecedent; if placement cannot keep that, keep the pair together or record a Product Owner question. Do not edit the sentence.
4. No block over the block limit. A single sentence longer than the limit stops the task with a Product Owner question.
5. Use `*` bullets, Title Case headings, and blank lines around lists. Run `npm run format:check:changed`.
6. Record each ambiguity under Questions for the Product Owner in this plan, committed with the task.

## Appendix A. Proposed Outline of §20.2 (PS-3, PS-4)

A proposal only. Merge or split as needed; each subsection stays under the section limit (target about 4,000 characters) and is exercised by at least one test. Anchors are the first words of the current text.

| # | Proposed title | Current text |
| --- | --- | --- |
| 1 | Toggle and Preference | "Vim-inspired editing is optional", "The choice persists" (boundary: preference storage) |
| 2 | Standard Editing While Vim Is Disabled | "While Vim editing is disabled" |
| 3 | Switching Vim Editing On and Off | "Disabling Vim editing completes" |
| 4 | Modes and Escape | "The editor starts in Normal mode", from the start of line 981 to the mouse-click sentence |
| 5 | Pending Replace and Insert Sessions | the application-command, quit and close, Insert-interruption, and select-all/cut/paste sentences of line 981 (boundary: quit save) |
| 6 | Mode Indicator and Status Bar | "A persistent indicator displays" to the end of line 981 |
| 7 | Drops and Whole-Node Visual Mode | "Whole-node Visual mode ends and returns to Normal mode when a drop" (boundary: drag-and-drop) |
| 8 | Motions | items `gg`/`G` to `0`/`^`/`$` |
| 9 | Insert, Node Creation and Character Edits | items `i`/`a`/`I`/`A`, `o`/`O`, `x`/`X`/`r`/`s` |
| 10 | Operators | items `d`/`y`/`c` with motions and with `j`/`k`, `ys`/`ds`/`cs`, `D`/`C`/`Y`, `gu`/`gU`/`g~`, `cc`/`S`, `~` |
| 11 | Node Commands | items `yy`, `dd`, `gd`, `Enter`, `Ctrl+o`, `v`, `V` |
| 12 | Put, Join and Fold Commands | items `p`/`P`/`gp`/`gP`, `J`/`gJ`, `z` folds |
| 13 | Counts | "Numeric prefixes repeat in-node motions" |
| 14 | Text Objects and Surround Delimiters | "Text objects may follow", "Surround delimiters are" |
| 15 | Dot Repeat | "`.` repeats the last completed Vim change" |
| 16 | Character Visual Mode | "Visual mode selects characters only within the current node" |
| 17 | Registers and Puts in Normal Mode | the Normal-mode register and put sentences at the end of that paragraph; "The local Vim register is held only for the running renderer session" (move only if "above" references still resolve) |
| 18 | System Clipboard | "Vim yanks and Normal-mode `dd` also copy content" through "follow the newline rule above" (boundary: clipboard) |
| 19 | Whole-Node Visual Mode and Shifts | "Whole-node Visual mode (`V`) selects a contiguous range", "`>` moves the selected siblings" |
| 20 | Tab and Shift+Tab | "When a node editor has keyboard focus, plain Tab" (native focus traversal; an E2E marker is advisable) |
| 21 | Restoring a Selection with gv | "Normal `gv` restores" |
| 22 | Unsupported Keys, Composition and Selection Offsets | "Unsupported unmodified keys", "Reading a text selection's offsets" |

## Appendix B. Marker Seeds for PS-4

From test titles only; read each test's assertions before re-pointing. Numbers refer to Appendix A.

* 1 to 3: `src/renderer/App.test.tsx` lines 1438, 1464, 1486, 1509, 1533, 1574, 1590, 1633; `e2e/vim-toggle.spec.ts` lines 22, 91, 126.
* 4 to 6: `e2e/vim-text-editing.spec.ts:60`; `e2e/sticky-location-bar.spec.ts:51`.
* 8: `e2e/vim-navigation-and-visual.spec.ts:409` (`gg`); `e2e/scroll-selection.spec.ts:185` (`H`/`M`/`L`); `src/renderer/vim-editing.test.ts:20` (image positions).
* 10: `e2e/vim-text-editing.spec.ts` lines 1049 (case) and 1200 (`Y`).
* 12: `src/application/editor-store.test.ts` lines 812, 854, 1808, and 639 (joins; it also carries §16.2); `src/renderer/editor-input-handlers.test.ts:1365`; `src/renderer/vim-put-into-children.test.ts:80`; `e2e/vim-navigation-and-visual.spec.ts:156`; `e2e/vim-text-editing.spec.ts` lines 1126 and 1162.
* 16: `e2e/drag-and-drop.spec.ts:441` (multi-character selection highlight).
* 18: `e2e/vim-clipboard.spec.ts` lines 68 and 142.
* 19: `src/application/editor-store.test.ts:249` (Visual shift).
* 21 and 22: `e2e/vim-navigation-and-visual.spec.ts:2097`.
* Unknown, read the test: `src/application/editor-store.test.ts:765` ("text-bearing structural creation").
* Candidates for subsections with no marker today, from the VIM_CONFORMANCE.md evidence column: Counts, "applies counts to node motions and subtree puts"; Text objects and surround, "uses word, quote, and bracket text objects" and "adds, changes, and deletes surrounding pairs"; Dot repeat, "repeats inserted text and honors a count before dot"; Whole-node Visual, "selects complete sibling subtrees with V"; Tab, `e2e/tab-structure.spec.ts`; `gv`, "restores the latest whole-node Visual selection with gv and ignores one that was invalidated"; Unsupported keys, "blocks unsupported editing keys in Normal mode"; Folds, "folds inline expansion with the Vim fold keys, moving the caret to the displayed ancestor it hides"; Pending Replace and quit, "persists a pending Replace edit when Cmd+Q is pressed in the editor"; Drops, "preserves whole-node Visual mode for a same-parent reorder".

## Task Details

* **PS-1.** Files: new `scripts/product-sections.mjs`; `scripts/check-requirement-coverage.mjs` and `scripts/check-requirement-coverage.test.mjs`; `scripts/check-docs.mjs` and `scripts/check-docs.test.mjs`; `docs/DEVELOPMENT.md` §12 (extend the traceability paragraph to four-level numbers; add a short paragraph naming the two limits, the guard messages, and the temporary exemptions); this plan; `plans/README.md`. Content: S1. Record the exact top five leaf sizes, block counts, and the longest sentence under Findings, replacing the estimates. Tests: scanner (fences, comments, list items, table rows, levels 2 to 4, depth mismatch); marker on a text-less parent rejected; a block at the limit passes and one character over fails with line and section; per-item counting; own-text-only section size; exemption suppresses; stale exemption fails; `runChecks` on a repository without PRODUCT.md and with `# Product` only. Evidence: `npm run check`; by hand, append an 800-character paragraph to a section without an exemption, see `npm run check:docs` fail with file and line, then revert (not committed). Tier: Low Risk. Review: primary diff review. PO: D1, D2 (defaults apply). Commit: `chore(docs): limit the size of PRODUCT.md blocks and sections`.
* **PS-2.** Files: `scripts/check-docs.mjs`, `scripts/check-docs.test.mjs`, `docs/DEVELOPMENT.md` §12 (document the command and the S3 practice), this plan. Content: S2, reusing the PS-1 block scanner. Evidence: unit tests; a clean tree reports 0 removed and 0 added; a run against a past commit that edited PRODUCT.md (`git log -5 --oneline -- docs/PRODUCT.md`) shows its real differences; `npm run check`; `npm run check:opencode`. Confirm that `npm run check:docs -- --verbatim HEAD` forwards its arguments and that `git show` works from the Node child process in the agent sandbox. Tier: Low Risk. Review: yes, because every later "no rule lost" claim rests on this tool; the reviewer attacks the normalization with edge cases. Commit: `chore(docs): add a verbatim comparison mode to the documentation check`.
* **PS-3.** Files: `docs/PRODUCT.md` (§20.2 only), `scripts/check-docs.mjs` (delete `20.2` from the block exemptions), this plan. Content: apply S3 to §20.2 with Appendix A as the outline. Use unnumbered `####` headings, which the checker ignores, so §20.2 stays one leaf with its 33 markers and needs no marker work. Split the "Normal mode supports:" list into several lists with lead-ins such as "Normal mode also supports:". Evidence: V clean apart from the listed lead-ins; `npm run check` passes with no block exemption for `20.2` (the section exemption stays); the moved-clause and antecedent lists from V reviewed; the reviewer reports no meaningful issues. Tier: Low Risk. Review: yes, because the tool proves clauses are preserved but not that antecedents, lead-ins, and headings still read correctly. A second commit is allowed if the diff outgrows one session. Commit: `docs(product): restructure Vim-inspired editing into one-rule items`.
* **PS-4.** Files: `docs/PRODUCT.md` (turn the `####` headings into `#### 20.2.n Title`; no other text edits); `scripts/check-requirement-coverage.mjs` (`BOUNDARY_SECTIONS`: delete `'20.2'`, add the boundary subsections); `scripts/check-docs.mjs` (delete the `20.2` section exemption); the 12 files holding the 33 markers; test files that gain markers (Appendix B); `docs/DEVELOPMENT.md:228` (to the toggle and preference subsection); `docs/ARCHITECTURE.md:547` (to the System Clipboard subsection); this plan. Do not change the 13 `§20.2` references inside PRODUCT.md sentences (D5). Content: §20.2 has no text of its own, so no `§20.2` marker may remain. For each subsection find at least one test that exercises it; boundary subsections (`AGENTS.md` §9: persistence, clipboard, drag-and-drop, shutdown, native shortcuts) also need an `e2e/` marker. Read each test's assertions, not only its title; leave a gap rather than guess. Evidence: `npm run check`; a table in `WORKING_PLAN.md` of marker, file, test title, subsection, and E2E or not. Tier: Low Risk. Review: yes (samples the mapping and the boundary classification). PO: D8 if a subsection has no exercising test. Commit: `docs(product): number the Vim editing subsections and trace their tests` (two commits are fine: headings and boundary list, then markers).
* **PS-5.** Files with dangling `§20.2.1` references: `src/domain/document-operations.ts:564`; `src/application/editor-node-visual-transitions.ts` lines 110 and 191; `src/application/editor-store.ts` lines 1072 and 1121; `src/application/editor-command-transitions.ts:393`; `src/renderer/vim-visual-memory.ts:5`; `src/renderer/vim-command-state.ts:9`; `src/renderer/vim-keyboard-handler.ts` lines 52, 743, 819; `src/renderer/vim-session-finish.ts` lines 99 and 111; `src/renderer/vim-edit-session.ts` lines 136 and 154; `src/renderer/vim-keyboard-types.ts` lines 117, 159, 176; `src/renderer/editor-input-handlers.ts` lines 102 and 397; `src/renderer/node-input-pointer-handlers.ts:151`; `src/renderer/editor-input-handlers.test.ts:1198`; `src/renderer/vim-edit-session.property.test.ts:98`; `e2e/vim-navigation-and-visual.spec.ts:363`. Plain `§20.2` references: `src/application/editor-store.ts:940`, `src/application/editor-command-transitions.ts:107`, `src/renderer/vim-keyboard-handler.ts:41`, `src/renderer/vim-text-commands.ts:160`, `src/renderer/vim-keyboard-types.ts:103`, `src/renderer/editor-input-handlers.ts:160`, `src/renderer/vim-editing.test.ts:21` (a `describe` title), `e2e/inline-expansion.spec.ts:246`, `e2e/initial-state.spec.ts:10`. Content: map each label to its new subsection using the label meanings in Findings (T1 counts, T2 Visual shifts, T3 register exchange and puts, T4 operators, T5 operators or text commands, T6 joins, T7 `gv`, T8 dot repeat); bare `§20.2.1` at `editor-store.ts:1072` and `editor-node-visual-transitions.ts:110` is T2, and at `vim-keyboard-handler.ts:743` and `vim-edit-session.ts:154` is T3. Comments only; no code change. Evidence: a search for `§20\.2\.1 T` returns nothing; `npm run check`. Tier: Low Risk. Review: primary only. Commit: `docs(product): re-point Vim code-comment references to numbered subsections`.
* **PS-6.** Files: `docs/PRODUCT.md` (§2.1 line 118, §2.2 line 139, §2.4 lines 162 and 164, §2.5 line 174, §10 line 577, §11 line 595, §13 line 666, §16.1 line 835), `scripts/check-docs.mjs` (delete those exemptions), this plan. Content: S3 with no moves across sections; blocks between 600 and 700 characters in the same sections may be split when it helps. Evidence: V clean; `npm run check`; review. Tier: Low Risk. Review: yes. Commit: `docs(product): split dense paragraphs in the tree model and general sections`.
* **PS-7.** Files: `docs/PRODUCT.md` (§20.5 line 1079, §20.8 lines 1103 and 1107, §20.9 lines 1121, 1123, and 1127, §23.2 line 1191, §23.4 lines 1201 and 1203, §23.5 line 1211, §23.11 line 1265, §23.12 line 1277), exemptions, this plan. §20.8 starts six paragraphs with bold labels that may become headings. §23 is recent text; check `git log` for concurrent Agenda edits first. Evidence and tier as PS-6. Commit: `docs(product): split dense paragraphs in interaction and Agenda sections`.
* **PS-8.** Files: `scripts/check-docs.mjs`, `scripts/check-docs.test.mjs`, `docs/DEVELOPMENT.md` (remove the temporary-exemption wording), this plan. Content: delete both exemption sets, their parameters, the stale check and its tests; keep absolute limits. Evidence: `npm run check`; a test that a long paragraph fails in any section. Tier: Low Risk. Review: primary only. Commit: `chore(docs): make the PRODUCT.md size limits absolute`.
* **PS-9.** Files: `docs/VIM_CONFORMANCE.md` (first two tables, lines 13 to 63), this plan (queue). New schema for every table: `PRODUCT` (precise subsection) | `Case` (short title of the tested case) | `Vim divergence` (empty, or the existing marker with what Vim does and the reason) | `Evidence` (cells byte-identical). Per row: list each clause of the old behavior cell; find the PRODUCT sentence that states it and cite its subsection; if none states it, keep the clause in the row tagged `matrix-only` and add it to the queue below (rule, row, tests, classification). Never delete such a clause. Use V with `--file docs/VIM_CONFORMANCE.md` to list removed clauses; each must be cited or queued. Keep every `**Vim divergence:**` marker with its reason (PRODUCT §1.1 names this document as their owner). Evidence: `npm run check:docs`; marker count unchanged; no backticked test path or quoted test name in the removed list; review. Tier: Minimal Risk. Review: yes (no rule lost). `WORKING_PLAN.md`: yes (removed-clause audit). Commit: `docs(vim): cite PRODUCT subsections in the conformance command tables`.
* **PS-10.** Files: `docs/VIM_CONFORMANCE.md` (lines 65 to 113), this plan. Same procedure for "Interaction-state contract" and "Image and caret transitions". Architecture statements (for example "The store owns location and focus intent") are queued, not deleted. End the task with one Product Owner message listing the whole queue (`AGENTS.md` §14) and set PS-11 to Blocked until it is answered. Tier: Minimal Risk. Review: yes. Commit: `docs(vim): cite PRODUCT subsections in the image and caret tables`.
* **PS-11.** Files: `docs/VIM_CONFORMANCE.md` (lines 3 to 9 and 115 to 139); `docs/PRODUCT.md` (approved rules); `docs/ARCHITECTURE.md` (only if D4 sends a statement there that is absent); `docs/DEVELOPMENT.md:203` (it duplicates the divergence-marker definition at VIM_CONFORMANCE.md line 7; keep one); `AGENTS.md` §5 (D3, confirmed); this plan. Content: (a) per D4, write approved matrix-only rules into the right PRODUCT subsection as items within the limits, with minimal edits to drop test-inventory phrasing, each listed in the handoff with its source row and tests; (b) move the stray Agenda paragraph (line 3) into an Agenda section after the purpose statement, and update the purpose statement, which names only §4.3 and §20.2; (c) per D6, dispose of the history paragraphs (lines 115 to 139); (d) per D3, place "Who decides a divergence". Evidence: `npm run check`; `npm run check:opencode` if `AGENTS.md` changed; review. Tier: Low Risk. Review: yes. Commit: `docs(vim): record matrix-only Vim rules in PRODUCT and simplify the conformance matrix`.
* **PS-12.** Files: this plan (deleted), `plans/README.md`, `docs/DEVELOPMENT.md` §12 (limits, guard messages, the verbatim practice with the S3 rules, numbering rules, the VIM_CONFORMANCE schema; remove temporary wording). No ADR: no architecture boundary changes. Evidence: `npm run check:docs`; `npm run format:check:changed`. Tier: Minimal Risk. PO: confirmation that no further tasks remain. Commit: `docs(plans): close the PRODUCT.md structure initiative`.

## Matrix-Only Rule Queue

Seeds found by reading during planning; PS-9 and PS-10 complete the audit.

* Row 23: a structural `o`/`O` session captures its dot-repeat payload from the node it created, not from a node a pointer landed on. PRODUCT.md line 1025 states the recording rule only for plain sessions and lists "an application shortcut" among interruptions, while row 23 says select-all, cut, and paste leave the session untouched. Possible conflict; a Product Owner question.
* Rows 41 to 43: focus-changing application commands during character Visual mode and pending Normal commands. PRODUCT.md states this for select-all, cut, paste, `Cmd+E`, and `Cmd+Enter`, not for `Cmd+.`, `Cmd+,`, `Cmd+Backspace`, undo, redo, breadcrumb, and enter-control clicks.
* Rows 72 to 76: saved image return position and focus intent.
* Rows 104 to 108: Replace mode and the image caret.
* Rows 110 and 112: caret at text position 0 after `gd` on a childless node with an attachment, and after whole-node Visual moves.
* Not a missing rule: "native paste fallback" (rows 22 and 133) names a mechanism and a test scenario; the rule that a pending Replace commits before a paste is in PRODUCT.md line 981.

## Decisions Reserved for the Product Owner

* **D1. Limit values.** Default: 700 characters per block and 8,000 per leaf section. Alternative 600 and 6,000: 14 more blocks and probably §20.9 as a second section violation.
* **D2. Numbering option.** Default A: keep §20.2 and add `#### 20.2.n` subsections, with the checker reading level 4. Every existing `§20.2` reference stays valid (119 lines in 33 files). Option B, moving Vim to a new top-level section, needs 86 more reference edits and places a core capability after Agenda. A does not prevent B later.
* **D3. "Who decides a divergence"** (VIM_CONFORMANCE.md line 9). Recommendation: move it verbatim into `AGENTS.md` §5 after "Requirement gaps", leaving a pointer. It changes how the minor-gap rule applies to Vim, and `AGENTS.md` owns agent working rules while VIM_CONFORMANCE.md calls itself a test inventory. Cost: about 900 characters in a file loaded every session. Confirmed by the Product Owner on 2026-10-10.
* **D4. Matrix-only rules.** Default: move into PRODUCT.md each rule that is user-visible, implemented, cited by a named test in its row, and not in conflict with PRODUCT.md; leave conflicting or unclear rules flagged in the matrix and ask; send mechanism and architecture statements to `docs/ARCHITECTURE.md` only if absent there, otherwise delete them. Decided from the queue sent at the end of PS-10.
* **D5. Wording edits.** Default: none. Cross-reference numbers and deictic phrases inside PRODUCT.md sentences stay as written. Asked only if a task meets a case it cannot resolve by placement.
* **D6. History paragraphs in VIM_CONFORMANCE.md** (lines 115 to 139). Default: delete history-only text (Git keeps it), keep rules per D4, and list the removed paragraphs by first words in the handoff.
* **D7. Reorganizing §20** (dates in §20.9 to §20.11). Default: out of scope; moving them renumbers sections cited on 38 lines in 22 files.
* **D8. Subsection with no exercising test.** Default: add the narrowest test that characterizes the implemented behavior in the same commit; if it fails, stop and report a defect or documentation error. No checker exemption.

## Questions for the Product Owner

* **Q1. "This section" inside §20.2 (PS-3).** Three sentences use "this section" meaning all of §20.2: "…defined outside this section…" and "The commands that exist only as Vim keys in this section…" under Standard Editing While Vim Is Disabled, and "The rest of this section describes the editor while Vim editing is enabled." under Switching Vim Editing On and Off. Once PS-4 numbers the subsections, a reader could take "this section" as the subsection. Decision D5 leaves the wording unchanged. The Product Owner can approve rewording to "§20.2" in PS-4, or accept the reading as is.
* **Q2. Rules listed under "Normal mode also supports:" (PS-3, from review).** Two items state exclusions rather than commands: "In Visual modes `gp` and `gP` are not commands." (Put Commands) and "Character-wise Visual `J` and `gJ` are not commands." (end of the Visual `J` item, Join Commands). Under the lead-in they can be read as something Normal mode supports. "Counts follow the underlying motion…" and the case-command items beginning "A hyperlink's text…" and "`gu` takes the `u` key…" are rules that qualify the item above them. Fixing the first two needs a wording or lead-in change, which D5 forbids; the Product Owner can approve a lead-in such as "Normal mode supports these commands and rules:" or accept the reading.

## Risks

* A moved sentence loses its antecedent ("above", "below", "it"); the clause tool cannot see it. Mitigation: S3 rule 3, the antecedent list from V, independent review of PS-3, PS-6, PS-7.
* A lead-in changes the scope of its items. Mitigation: the reviewer reads each new list against its original paragraph.
* A wrong marker mapping gives false coverage. Mitigation: read assertions, the mapping table, reviewer sampling, E2E markers for boundary subsections.
* Matrix cells deleted while the rule exists only there. Mitigation: the PS-9 procedure keeps and queues such clauses; removed-clause audit.
* Concurrent feature edits to PRODUCT.md (Agenda AG-28 is pending). Mitigation: `git log` at task start; the guard protects sections without exemptions from PS-1.
* Prettier reflows list formatting. Mitigation: `npm run format:check:changed` in every task.
* Exemption deletions make restructuring tasks Low Risk, so each runs `npm run check`. Accepted cost.
* Observation outside scope: `docs/DEVELOPMENT.md` and `AGENTS.md` also have very long single-line paragraphs; the guard covers PRODUCT.md only.

## Resume Prompt

> Continue the PRODUCT.md structure initiative in `plans/product-structure.md`. Run the Next task: follow its Task details and the S1, S2, and S3 specifications, validate at its tier, commit it together with its status update, and stop at the session limit in `AGENTS.md` §12. Do not reword any PRODUCT.md sentence; record ambiguities under Questions for the Product Owner in the plan.
