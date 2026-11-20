# Product Specification Refactoring

Status: Awaiting owner approval

This plan records the analysis and the proposed task sequence for refactoring `docs/PRODUCT.md`. The Product Owner requested the plan only. No task in this plan is authorized for implementation.

## 1. Objective

Change the form of the product specification without changing product behavior:

1. Split `docs/PRODUCT.md` (2,813 lines, 45,815 words, 287,863 bytes) into per-area files under `docs/product/`, with `docs/PRODUCT.md` as the index.
2. Rewrite history-relative text into present-state normative statements.
3. Move development, release, and process content to its owning document.
4. State each shared behavior once and cite it elsewhere.
5. Present every "this detail could live only in a test" candidate as an owner decision.

Sources of truth: [AGENTS.md](../AGENTS.md) §§2, 8, 11; [Agent Workflow Procedures](../docs/AGENT_WORKFLOW.md) §§8, 11, 12, 13; [Development Guide](../docs/DEVELOPMENT.md) §§9, 11, 12; [Agent Roles](../docs/AGENT_ROLES.md) §§3, 6; [Product Requirements](../docs/PRODUCT.md).

## 2. Scope Limits

- Zero behavior change. Every normative statement is kept, reworded with equal meaning, merged with an identical statement, moved, or held verbatim behind an owner question. Nothing is dropped silently.
- No **Exploratory.** marker is added, removed, or reinterpreted. The specification currently contains no marked section; the only occurrence is the definition in §1.2.
- §1.1 keeps its four commitments and their priority order.
- No production code, test assertion, or test title changes. The only permitted changes outside documentation are the tooling changes of T1 and T2 and the `@requirement` marker lines named in §8.
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/AGENT_WORKFLOW.md`, `AGENTS.md`, `docs/SECURITY.md`, and `docs/releasing.md` are not rewritten. They change only where they receive moved process content, describe changed tooling, or link into the specification.
- ADRs are historical records. Their `PRODUCT.md §N` citations stay valid because section numbers stay stable; ADR text is not edited except for one anchor link (§6.3).
- Repository text stays English.

## 3. Authorization State

- Authorized: recording this plan and its index row (owner request of 2026-11-20).
- Not authorized: every task in §8. Implementation starts only after the owner approves the plan and answers §11.
- Proposed approval scope: the whole initiative, with a pilot checkpoint after R09.
- Selected coding tool: Claude Code. The owner's model routing names Anthropic models (§9).
- Delegated decision areas after approval: wording of present-state statements; file placement inside the approved structure; merging of statements whose meaning is identical; removal of approval attributions and pure history notes (rule W5 in §7.1).
- Reserved for the owner: every question in §11; every statement held under rule W7(c); every suspected inconsistency in §12; every move of a detail to tests only; any new, retired, or retitled section beyond those listed in §11.

## 4. Analysis

### 4.1 Tooling that reads the specification

Checked in the repository at commit `396e094`.

| Consumer | What it reads | Constraint for the split |
| --- | --- | --- |
| `scripts/product-sections.mts` | Numbered headings at levels two to four, in one string | Heading level must equal number depth plus one. Unnumbered headings belong to the nearest numbered section above them. |
| `scripts/check-requirement-coverage.mts` | `docs/PRODUCT.md` only; `// @requirement PRODUCT.md §N` markers in `src/`, `scripts/`, `e2e/`, `perf/` | Marker text is fixed by a regular expression. `EXEMPTIONS` names §1, §1.1, §1.2, §1.3. `BOUNDARY_SECTIONS` names 48 sections that need an `e2e/` marker. A parent is detected by adjacency: the next heading is deeper. Baseline: 126 numbered requirements pass. |
| `scripts/check-docs.mts` | `collectLiveDocuments` lists documents by name | Files under `docs/product/` are not live documents today, so links and ADR references in them would be unchecked. |
| `scripts/check-docs.mts` | `findOversizedProductText` | The 700-character block limit and 8,000-character section limit apply only to `docs/PRODUCT.md`. |
| `scripts/check-docs.mts` | `findProductQuantityRestatements` | Every live document whose path does not end in `PRODUCT.md` fails when it restates a product quantity. A file under `docs/product/` would fail, for example on the node-depth value in §20.2.23. |
| `scripts/check-docs.mts` | `--verbatim <ref> [--file <path>]` | Compares normalized clause multisets of one file against a Git revision. It reports removed, added, and moved clauses and antecedent phrases. It cannot compare one old file with several new files. |
| `scripts/check-docs.mts` | Link check | Verifies that the target file exists. It does not validate heading anchors. |

Measured references (Git-tracked files):

| Kind | Count |
| --- | --- |
| `@requirement PRODUCT.md §N` markers | 1,345 |
| Code and test files that mention `PRODUCT.md` | about 375 |
| Other `PRODUCT … §N` references outside the specification | about 290 |
| Lines mentioning `PRODUCT.md` outside the specification (all kinds) | 1,590 |
| Non-marker code lines with a `§` reference, many without a document name (for example `(§20.2.9)`) | 218 |
| Lines inside the specification with an internal `§` cross-reference | 240 |
| Markdown links with a heading anchor into the specification | 7 |
| Relative Markdown links from the specification to other repository files | 3 |

The seven anchor links are in `docs/SECURITY.md` (1), `src/web/README.md` (5), and `docs/decisions/0024-desktop-notes-archive.md` (1). The three outgoing links are `SECURITY.md` and `VIM_CONFORMANCE.md` in §1.1 (L30, L31) and `../src/web/README.md` in §1.4 (L142). Their relative paths change when the text moves one directory down.

### 4.2 Per-section inventory

Lines and words are measured. "Accretion" is the number of history-relative sentences found by reading; the mechanical phrase search found 128 raw matches in total, and 78 lines use the word "existing". Duplicate and process entries were collected by read-only subagents and are leads: the owning task must confirm each one against the text before acting on it. Line numbers refer to `docs/PRODUCT.md` at `396e094`.

| § | Title | Lines | Words | Accretion | Duplicated content (duplicate location) | Process or non-product content | Target file | Risk | Reason for the risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Product Overview (1.1–1.5, 1.4.1) | 236 | 2,709 | 12 | About dialog L52–73 and L92–108; notes per origin L138–140 and L2541; single-writer rule L144–148 and L2702–2704; menu symbols L115, L861, L2719 | §1.4.1 L169–210 (release); L101–103; L140–142; L214 and L235 (verification status); L77 (agent rule); L73 (attribution) | `overview.md`, `browser.md` | High | Three destinations; behavior sits in a section exempt from markers; §24 depends on §1.4 statements |
| 2 | Tree Model | 251 | 4,807 | 15 | Drag hold L290 and L931; gap resolution L432 and L942; depth-limit drag L396 and L954; breadcrumb drop L373 and L927; pin placement L379 and L1539; star and mark rules L470 and L488 | L280, L282 (how alignment is judged); L356 (attribution) | `tree-model.md` | High | Dense view, fold, and star interaction in §2.4; load-compatibility rules; drag rules misplaced in §2.1 |
| 3 | Initial State | 12 | 39 | 0 | L498, L800, L1428–1430 | None | `tree-model.md` | Low | Short |
| 4 | Keyboard Navigation | 64 | 647 | 3 | L520 and L680; L547 overlaps L549–560 and §23.4 | L543 (attribution) | `editing.md` | Medium | §4.3 mixes standard, Insert, and Normal rules |
| 5 | Creating Nodes | 85 | 616 | 2 | `o` rule L574, L598, L1587; L576, L617, L636–640 | None | `editing.md` | High | Interacting Enter rules with antecedents such as "as specified above"; four unnumbered headings |
| 6 | Entering a Node | 56 | 243 | 0 | L673–681 repeat §4 and §5.1; L703 and L720 | None | `editing.md` | Low | Mostly examples |
| 7 | Leaving a Node | 55 | 109 | 1 | L715 and L1618; L720 and L703 | L713 (change constraint) | `editing.md` | Low | Mostly examples |
| 8 | Deleting Nodes | 50 | 652 | 3 | L800, L498, L1430; L785 and L1439 | None | `editing.md` | High | Deletion is data loss; antecedents "rule 2", "this way" |
| 9 | Cmd+0 | 55 | 580 | 4 | Save before quit L845 and L1294; L849 and L1955–1959; L857–859 and L380 | None | `application.md` | Medium | Title covers only one of four subjects; cross-references to §16.2, §20, §21, §23, §25 |
| 10 | Undo and Redo | 56 | 515 | 2 | L893 and L1411–1418; L908–909 restated at L446, L470, L488 | L869 (release scope) | `editing.md` | Medium | Caret-placement rules interact |
| 11 | Drag and Drop | 62 | 878 | 4 | Six pairs with §2 (see §2 row); L946 and L933 | None | `editing.md` | Medium | Heavy duplication with small differences (L931 adds a 4-pixel rule) |
| 12 | Clipboard | 26 | 255 | 1 | L1003 and L1005; image size limit L995, L1174, L2567 | L991 (robustness constraint) | `clipboard-and-paste.md` | Low | Short; security sentences must keep their meaning |
| 13 | Plain Text Paste | 58 | 770 | 2 | L1017 and L1003; L1031 and L1037 | None | `clipboard-and-paste.md` | Medium | Link-state rules; an example sits under the wrong subsection |
| 14 | Multiline Text Paste | 45 | 166 | 0 | L1077 and L1105 | None | `clipboard-and-paste.md` | Low | Mostly examples |
| 15 | Image Paste (15.1, 15.2) | 143 | 1,322 | 4 | L1116, L1359, L14; L1118, L1381, L294; L1140 and L1365 | L1192–1193 (cost assessment); L1254–1255 (disclaimer) | `images.md` | High | Dense cancellation and lifecycle rules; Agenda exceptions |
| 16 | Persistence (16.1, 16.2) | 100 | 1,433 | 1 | Quit rules L1280, L1294, L845; L1286 and L1337; L1301, L1349, L1353 | None | `persistence.md` | High | Durability is the first commitment of §1.1; quit rules are spread over §9.2, §16.1, §21 |
| 17 | Images and Attachments | 50 | 787 | 0 | L1359 and L1116; L1381 and L1118; L1365 and L1140; L1367 and L1369 | None | `images.md` | Medium | L1371 reference rule is data-loss relevant |
| 18 | Node Identity | 19 | 54 | 0 | L1409, L11, L1315 | None | `tree-model.md` | Low | Short |
| 19 | Empty Nodes | 17 | 55 | 0 | L1439 and §8.2 | None | `tree-model.md` | Low | Short |
| 20 | User Interaction Principles (20.1–20.14) | 880 | 19,501 | 74 | See §4.3 | See §4.3 | Six files | High | See §4.3 |
| 21 | Unexpected Renderer Errors | 12 | 133 | 0 | L2331, L1294, L845 | None | `application.md` | Medium | Data-loss relevance; cross-references to §16.1 |
| 22 | Non-Functional Requirements | 36 | 605 | 4 | L2357 and L2105; L2361 and L1841–1843 | L2345–2353 (assessment obligation); L2355 (pre-release memory checks); L2369 (guard obligations) | `non-functional.md` | Medium | About 100 citations of §22.1 in code, `docs/ARCHITECTURE.md`, and `AGENTS.md` must stay resolvable |
| 23 | Agenda | 168 | 4,107 | 13 | With §20.2.9: L2423 and L1559 (reset lists differ), L2424 and L1560, L2425 and L1555; with §4.3: L2421–2422 and L545–547; with §20.1: L2464 and L1467 (counted unit differs); internal: L2433 and L2445, L2432 and L2529, L2484 and L2503 | L2381, L2419 (attributions) | `agenda.md` | High | §23.4 and §23.7 hold dense caret, occurrence, and pin rules with many "as in Tree" antecedents |
| 24 | Browser Data Safety | 172 | 3,214 | 3 | "No dedicated keyboard shortcuts" L2543, L2638, L2717; §24.7 and §26 (six pairs, mostly parallel, not identical); L2541 and L139–140; L2702–2704 and L144–148 | None | `browser.md` | High | Data-loss rules for replace, staging cleanup, and backup; §24.6 and §25 are defined as differences from §24.4 |
| 25 | Desktop Notes Export and Import | 41 | 979 | 0 | Defined by reference to §24.3 and §24.4; L2719 and L861; L2717 and L854 | None | `desktop-data.md` | High | Crash recovery and commit-journal semantics |
| 26 | Desktop App Updates | 62 | 636 | 2 | Menu order L2776–2778 and L52–53; parallel rules in §24.7 | L2754–2755 (who selects releases); L2811–2813 (cost assessment) | `application.md` | Medium | Terse ordering and race rules; no subsections |

### 4.3 Section 20 in detail

| Unit | Lines | Words | Accretion | Duplicated content | Process content | Target file | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| §20 own text, §20.1 | 40 | 571 | 3 | L1473 and L373; L1477 and L2273 | L1469 (cost assessment) | `interaction.md` | Medium |
| §20.2.1–§20.2.6, 20.2.8, 20.2.27 (modes and sessions) | 64 | — | 10 | L1488–1492 and §9.3 L849–859; L1529 and L2428 | L1510 (verification scope) | `vim.md` | High |
| §20.2.9 (motions and undo) | 32 | — | 5 | With §4.3 and §23.4 (see §23 row) | None | `vim.md` | High |
| §20.2.10, 11, 16, 17, 18 (text commands) | 63 | — | 3 | `gu` rule L1605 and L1663; L1657 and L1614–1615 | None | `vim.md` | Medium |
| §20.2.12, 13, 21, 22 (registers and puts) | 47 | — | 4 | Put placement L1627–1628, L1701, L1724; fresh IDs L1659, L1699, L1725, L1751; clipboard L1730–1738 and L1785 | None | `vim.md` | Medium |
| §20.2.14, 15, 19, 20, 23, 24, 25 (visual and structure) | 91 | — | 4 | L1604 and L1715; L1686 and L1716; L1589 and L1714; L1768 and L2146, L2192 | None | `vim.md` | Medium |
| §20.2.26 (local register and local search) | 111 | 1,184 | 5 | L1789 and L1891; L1820, L1824, L1874; L1843 and L2253–2255 | L1790, L1892 (scope notes) | `search.md` | High |
| §20.2.7, 28, 29, 30 (status bar, command panel, popups, registry) | 98 | 2,111 | 14 | `toggle-vim-mode` L1488, L1907, L1960, L1981; L1928 and L224, L2145; L1922 and L126 | L1985, L1924 (rules for future changes); L1989 (attribution) | `command-panel.md` | High |
| §20.3, 20.4, 20.6, 20.7 | 32 | — | 2 | No-animation rule L2003 restated at L1918, L2257, L2278, L2411 | L1993–1995 (license); L2053 (design history) | `interaction.md` | Low |
| §20.5, §20.8 | 78 | — | 7 | L2011 and L1965–1969; L2041 and L2205–2209 | L2015 (rule for adding an appearance); L2031 (reference screenshot) | `interaction.md` | High |
| §20.9–§20.13 (dates, emoji, tags) | 144 | 3,269 | 9 | L2132 and L2134 (verbatim); L2192 and L2146; L2194 and L2148; L2203 and L2233 | L2105, L2180, L2241 (cost and measurement) | `completion-and-tags.md` | High |
| §20.14 (search and recent nodes) | 78 | 2,487 | 8 | L2253 and L2255; L2251 and L2307; L2291, L2294, L2296; L2300, L2309–2310, L2320 | L2284 (measurement obligation); L2313 (design) | `search.md` | High |

§20.2 as a whole has 508 lines and 10,795 words. `docs/VIM_CONFORMANCE.md` cites §20.2 by section number and cites tests by path and title. It quotes no specification clause, and `findStaleConformanceCitations` never reads the specification. Rewording §20.2 therefore requires no edit to that document while numbers stay stable. Its open rows M12 (§20.2.6) and M20 (§20.2.4) describe behavior the specification does not state; a rewrite must not close them.

## 5. Proposed Structure

`docs/PRODUCT.md` stays as the index: purpose, the citation convention, a table from section numbers to files, and a table of retired numbers. It holds no normative text. Every existing citation of `docs/PRODUCT.md §N` stays valid through it.

| File | Sections | Lines | Words |
| --- | --- | --- | --- |
| `docs/product/overview.md` | §1 own text, §1.1, §1.2, §1.3 | 76 | 922 |
| `docs/product/tree-model.md` | §2, §3, §18, §19 | 299 | 4,955 |
| `docs/product/editing.md` | §4–§8, §10, §11 | 428 | 3,660 |
| `docs/product/clipboard-and-paste.md` | §12, §13, §14 | 129 | 1,191 |
| `docs/product/images.md` | §15, §17 | 193 | 2,109 |
| `docs/product/persistence.md` | §16 | 100 | 1,433 |
| `docs/product/application.md` | §9, §21, §26 | 129 | 1,349 |
| `docs/product/interaction.md` | §20 own text, §20.1, §20.3–§20.8 | 150 | 2,950 |
| `docs/product/vim.md` | §20.2 heading, §20.2.1–§20.2.6, §20.2.8–§20.2.25, §20.2.27 | 299 | 7,500 |
| `docs/product/command-panel.md` | §20.2.7, §20.2.28–§20.2.30 | 98 | 2,111 |
| `docs/product/search.md` | §20.2.26, §20.14 | 189 | 3,671 |
| `docs/product/completion-and-tags.md` | §20.9–§20.13 | 144 | 3,269 |
| `docs/product/non-functional.md` | §22 | 36 | 605 |
| `docs/product/agenda.md` | §23 | 168 | 4,107 |
| `docs/product/browser.md` | §1.4, §1.4.1, §1.5, §24 | 332 | 5,001 |
| `docs/product/desktop-data.md` | §25 | 41 | 979 |

The rows sum to the measured 2,811 content lines and 45,812 words. The largest file is 16% of the current document.

The heading `### 20.2 Vim-Inspired Editing` has no text of its own. It moves to `vim.md` and stays the target of every `§20.2` citation, although four of its subsections live in `command-panel.md` and `search.md`. Every numbered heading of the current document, including a parent without own text, appears in exactly one file.

## 6. Migration Strategy for Section IDs, Markers, and Links

### 6.1 Options

| | (a) Stable global numbers | (b) Renumber per file |
| --- | --- | --- |
| Rule | A section number is a permanent identifier. Files group sections by area. Tooling reads every file under `docs/product/` and orders sections by number. | Each file numbers its own sections. Markers and citations are rewritten mechanically. |
| Marker changes | None in T1. About 30 hand edits in later tasks, all listed in §8. | 1,345 markers in about 375 files, plus `EXEMPTIONS` and `BOUNDARY_SECTIONS`. |
| Prose citations | None, except the seven anchor links. | About 290 citations, 240 internal cross-reference lines, about 20 ADR citations, 218 code comments. |
| Main risk | Numbers stop describing the file layout. A reader needs the index to locate §20.2.26 in `search.md`. | A citation without a document name, such as `(§20.2.9)`, cannot be rewritten reliably. A wrong mapping silently attaches a test to another requirement and still passes `check:requirements`. |
| Policy fit | Uses ordinary file edits. | Conflicts with `AGENTS.md` §4, which forbids scripted repository edits; the alternative is hand-editing about 375 files. |
| History | Old commit messages and ADRs keep resolving. | ADR citations must be edited or become stale. `git blame` on every test file shows the rewrite. |
| Cost of changing course later | Low. Renumbering remains possible after the rewrite, as one mechanical task with a complete old-to-new table. | High. A partly applied renumbering cannot be verified section by section. |

### 6.2 Recommendation

Use option (a). Its rules:

1. An existing number never changes and is never reused.
2. A new section takes the next free number under its parent. Gaps are permitted; no check requires contiguous numbers.
3. A section whose content leaves the specification is retired. The index lists the retired number and the document that now owns the content.
4. A heading title may change. The number is the identifier.
5. Markers keep the text `// @requirement PRODUCT.md §N`. `PRODUCT.md` in a marker names the specification, not a file.

Residual risk: the index becomes the only map from number to file. T1 adds a `check:docs` rule that fails when the index and the headings under `docs/product/` disagree.

### 6.3 Tooling changes in T1

1. `check-requirement-coverage.mts` reads every `docs/product/*.md`, scans each file separately, and orders the merged sections by numeric ID before applying the existing parent, duplicate, exemption, and boundary rules. Messages keep the form `PRODUCT.md §N`.
2. `check-docs.mts` adds `docs/product/*.md` to the live documents, applies the block and section limits to each file, and exempts those files from the quantity-restatement check.
3. `check-docs.mts` rejects text before the first numbered heading of a specification file, other than its title, so no requirement can sit outside a numbered section.
4. `check-docs.mts` checks the index against the files (§6.2).
5. `--verbatim` accepts the specification directory as the "after" side, so the old single file can be compared with the union of the new files.
6. The clause comparison of `--verbatim` ignores order by design (`docs/DEVELOPMENT.md` §12), so it cannot prove a mechanical split. T1 adds an ordered per-section comparison: for every numbered section, the lines from its heading to the next numbered heading equal, in the same order, the same range of `docs/PRODUCT.md` at the base commit. The comparison ignores blank lines and `---` separators at file boundaries and reports every other difference.
7. `docs/DEVELOPMENT.md` §9 and §12 describe the changed checks. `docs/AGENT_WORKFLOW.md` §11 names the directory in its document list. `AGENTS.md` needs no change.
8. The seven anchor links into the specification are retargeted by hand to the new files.
9. The three outgoing links get their new relative paths: `../SECURITY.md` and `../VIM_CONFORMANCE.md` in `overview.md`, `../../src/web/README.md` in `browser.md`. These are the only permitted text differences in T1. Both comparisons report them, because a link target is part of its clause and of its line; the T1 evidence lists the three as the complete set of differences.

## 7. Rewrite Method

### 7.1 Wording rules

- **W1. Rewrite the minimum.** Change only a sentence that is history-relative, duplicated, process content, misplaced, or unclear. Leave every other sentence byte-identical, so the verbatim report lists it as unchanged.
- **W2. Dispositions.** Each old clause gets one of: Kept, Reworded, Merged, Moved, Removed (non-normative), Held.
- **W3. Result statements are not accretion.** "The document is unchanged" as the result of a failed or cancelled command is present-state wording and stays.
- **W4. Compatibility statements are normative.** Sentences about older documents, earlier releases, or legacy files state current obligations and stay.
- **W5. Attribution and history may be removed.** "As approved by the owner" and "previously X" carry no behavior. The statement map lists each removal with its quote. The reason for a deliberate difference from platform or Vim conventions stays, because §1.1 and §1.3 require it.
- **W6. No new normative content.** An added clause must trace to one or more old clauses.
- **W7. Antecedents.** For "X retains its existing behavior": (a) if a section defines that behavior, cite the section; (b) if the sentence only limits the scope of the rule beside it, reword it as a scope limit ("This rule applies only to …"); (c) if it asserts behavior that no section states, hold the sentence verbatim and add an owner question. Do not derive the missing behavior from code.
- **W8. Merge only identical meaning.** Record any difference, even one word. When the two statements differ in a detail, keep both and name the detail in the map.
- **W9. Literals.** Every number, key name, UI string, and code span survives, or its removal is a recorded Merged or Moved disposition.
- **W10. Structure.** Unnumbered headings stay inside their numbered section. Hard-wrapped paragraphs may be unwrapped. The 700-character and 8,000-character limits apply.
- **W11. Order.** Keep the order of statements wherever order carries meaning: the priority order of §1.1, numbered or lettered rule lists, steps, precedence lists, and any text that another sentence addresses by position ("rule 2", "the rule above"). Record every reordering in the statement map with its reason. The verbatim report does not detect reordering.

### 7.2 Calibration sample: §9.2 and §9.3 (medium risk)

**Before, §9.2 (L845):**

> Closing the main window quits the application on macOS, including when the application is inactive. It follows the same save-before-quit behavior as `Cmd+Q`: pending changes are flushed, and if saving cannot finish within the bounded time or reports an error, the application remains open and displays the failure so the user can retry. In the locked save-failure state, the user can instead explicitly confirm quitting without saving, as defined in §16.2. A terminated renderer process is the exception defined in §21.

**After:**

> Closing the main window quits the application on macOS, including when the application is inactive. Window close and `Cmd+Q` (§9.1) have the same save-before-quit behavior, which §16.1 defines.

**Before, §9.3 (L859, first sentence; the other four sentences are present-state and stay byte-identical under W1):**

> The Appearance and Vim Editing items have no status-bar toggles.

**After:**

> The status bar has no Appearance toggle. It has no Vim Editing toggle either (§20.2.1).

**Before, §9.3 (L861):**

> Tree and Agenda invoke the same named view commands as the command panel (§20.2.28), without additional shortcuts. Selecting the already open view does nothing. Switching views finishes buffered editing and preserves the existing origin/caret behavior (§23). These commands do nothing while no renderer is available or while its main frame is loading. The native Tree, Agenda, Export Notes… and Import Notes… items retain text labels and show macOS symbols for connected nodes, a calendar, export and import. Other native items retain their standard text/check-mark presentation.

**After:**

> Tree and Agenda invoke the same named view commands as the command panel (§20.2.28), without additional shortcuts. Selecting the already open view does nothing. Switching views finishes buffered editing; the origin and the caret then follow §23.1. These commands do nothing while no renderer is available or while its main frame is loading. The native Tree, Agenda, Export Notes… and Import Notes… items have text labels and show macOS symbols for connected nodes, a calendar, export and import. Other native items have the standard text and check-mark presentation.

**Statement map:**

| # | Old statement | Disposition | Evidence |
| --- | --- | --- | --- |
| 1 | Closing the main window quits on macOS, also when inactive | Kept | Byte-identical |
| 2 | Window close follows the save-before-quit behavior of `Cmd+Q` | Reworded | Same two subjects, same relation |
| 3 | Pending changes are flushed | Merged | §16.1 L1280: "Every pending change is flushed before a normal quit completes." |
| 4 | On a timeout or an error the application stays open and shows the failure so the user can retry | Merged | §16.1 L1294, second sentence. L1294 adds "without silently losing changes"; the surviving statement is the wider one. |
| 5 | In the locked state the user can confirm quitting without saving (§16.2) | Merged | §16.1 L1294, third sentence. Recorded difference: "instead" here, "also" there. Both describe an alternative to retrying; judged identical. |
| 6 | A terminated renderer is the exception of §21 | Merged | §16.1 L1294, last sentence, identical |
| 7 | The Appearance menu item has no status-bar toggle | Reworded | Stated only here; stays in §9.3 |
| 8 | The Vim Editing menu item has no status-bar toggle | Merged | §20.2.1 L1489 and §2.2 L379 state the same; §9.3 keeps a citation |
| 9 | Sentences 2–5 of L859 | Kept | Byte-identical |
| 10 | Switching views finishes buffered editing | Kept | Not merged with §23.1 L2377 ("A pending Insert or Replace edit finishes"): "buffered editing" is wider, so both stay (W8) |
| 11 | Switching views preserves the existing origin and caret behavior (§23) | Reworded | W7(a): §23.1 L2377 defines the origin, selection, and cursor restoration |
| 12 | Native Tree, Agenda, export, and import items have labels and the four symbols | Reworded | "retain" becomes "have"; all four symbols listed |
| 13 | Other native items have the standard presentation | Reworded | "retain their" becomes "have the" |

Result: 13 statements; none lost, none changed, five merged with a cited survivor, none moved. A merge is valid only while the survivor exists, so the verifier of a later task that rewrites §16.1 must find statements 3–6 there.

### 7.3 Verification for each rewrite task

1. **Base.** Record the starting commit. Run `npm run check:requirements` and record the requirement count.
2. **Rewrite.** Apply §7.1 to the task's sections only.
3. **Clause inventory.** Run `npm run check:docs -- --verbatim <base> --file <file>` for each changed specification file. The command exits 1 for a rewrite; that is expected. Its report is the complete list of removed and added clauses.
4. **Statement map.** In `.scratch/product-spec-<task>/`, give every removed clause a disposition under W2 and every added clause its source clauses. For Merged and Moved, name the surviving location.
5. **Independent verifier.** A reviewer in a fresh context receives the Git status, the full Git diff (old text on the removed side, new text on the added side), the rules of §7.1, and read access to the new files. It does not receive the statement map. It produces its own statement-level table with the classes lost, changed, merged, moved, added, reordered, and it audits literals under W9 and order under W11.
6. **Reconcile.** The implementer compares the verifier's table with the map. Every lost, changed, added, or unrecorded reordered entry is corrected or becomes an owner question with the sentence held verbatim. Repeat the verifier pass only when corrections are substantial (`AGENTS.md` §13).
7. **Validation.** Minimal Risk tier: `npm run format:check:changed`, `npm run check:docs`, `npm run check:requirements`, and `npm run check:opencode` when agent workflow documents change. A task that edits a marker line in a test file is Low Risk: also run lint and the focused tests for the touched files.
8. **Commit** the rewrite with the plan status update. Remove the scratch directory after the commit.

### 7.4 Evidence that counts as "no behavior change"

All seven conditions hold:

- **E1.** The diff touches only the files named for the task. Under `src/`, `e2e/`, `perf/`, and `scripts/`, it changes only the listed marker lines.
- **E2.** The statement map covers every removed and every added clause of the verbatim report, with no clause unassigned.
- **E3.** The independent verifier's table has no unresolved lost, changed, or added entry.
- **E4.** The requirement count is unchanged, or each difference is a section addition or retirement named in §8.
- **E5.** Every literal is preserved or covered by a recorded Merged or Moved disposition.
- **E6.** The checks of step 7 pass.
- **E7.** Order is preserved wherever W11 applies, or each reordering is recorded in the map and confirmed by the verifier.

For T1, the evidence is stricter:

- The ordered per-section comparison of §6.3 item 6 reports exactly three differing lines, the outgoing links of §6.3 item 9, and no other difference in content or order.
- The verbatim comparison of the old file with the new directory reports zero removed headings and zero moved clauses. Its removed and added clauses are the same three link clauses, plus added clauses from the index and the file titles.
- Every numbered heading of the base document, including §20.2, exists in exactly one file.
- `git diff --stat` shows no change under `src/`, `e2e/`, or `perf/`, and the requirement count stays 126.

These conditions prove that the text keeps its statements. They do not prove that the old text matched the implementation; that question is outside this initiative.

## 8. Tasks

Working-task count: 43. Final owner acceptance under `AGENTS.md` §8 applies.

Evidence sets: **S** = T1 evidence of §7.4; **R** = E1–E7 of §7.4. Tiers follow `docs/DEVELOPMENT.md` §9. All specification files are under `docs/product/`. Every rewrite task also updates this plan and `plans/README.md`. Routing: implementer / verifier (§9).

| ID | Outcome | Depends on | Files | Tier | Routing | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Mechanical split into the files of §5, index, tooling of §6.3, seven incoming anchor links, three outgoing link paths. No other text change and no reordering. | Approval | `docs/PRODUCT.md`, `docs/product/*.md`, `scripts/product-sections.mts`, `scripts/check-requirement-coverage.mts`, `scripts/check-docs.mts`, their tests, `docs/DEVELOPMENT.md`, `docs/AGENT_WORKFLOW.md`, `docs/SECURITY.md`, `src/web/README.md`, `docs/decisions/0024-desktop-notes-archive.md` | Low (`npm run check`) | Sonnet medium / Opus high | S | Planned |
| T2 | Literal comparison report for rewrite verification (numbers, code spans, bold UI labels) as a `check:docs` mode, with tests. Only if Q10 is approved. | T1 | `scripts/check-docs.mts`, `scripts/check-docs.test.mts`, `docs/DEVELOPMENT.md` | Low (`npm run check`) | Opus high / Opus high | Tool tests pass; report on the §7.2 sample lists no unexplained literal | Planned |
| R09 | Pilot: rewrite §9. Retitle the heading if Q3 allows. Owner checkpoint follows. | T1 | `application.md` | Minimal | Opus high / Fable high | R | Planned |
| R01a | Rewrite §1, §1.1–§1.3. Create §9.4 About Tree as the single owner of the dialog (Q4). §1.1 order and §1.2 rules unchanged. | R09, Q4, Q5 | `overview.md`, `application.md`, `browser.md`, `scripts/check-requirement-coverage.mts`, `e2e/electron/about-window.spec.ts` (one marker) | Low | Opus high / Fable high | R; new §9.4 has unit-or-E2E markers | Planned |
| R01b | Rewrite §1.4 and §1.5 as browser behavior. | R01a | `browser.md` | Minimal | Fable high / Fable high | R | Planned |
| R01c | Move release and process content of §1.4, §1.4.1, §1.5 to its owners (Q5). Retire §1.4.1. | R01b, Q5 | `browser.md`, `docs/PRODUCT.md`, `docs/releasing.md`, `docs/SECURITY.md`, `docs/DEVELOPMENT.md`, `deployment/github-pages/README.md`, `src/web/README.md`, four marker lines in `scripts/release-source.test.mts` and `scripts/web-release/*.test.mts` | Low | Opus high / Fable high | R; per-sentence table "already stated at / moved to" for L169–210 | Planned |
| R02 | Rewrite §2. | R01c | `tree-model.md` | Minimal | Fable high / Fable high | R | Planned |
| R03 | Rewrite §3. | R02 | `tree-model.md` | Minimal | Opus high / Opus high | R | Planned |
| R04 | Rewrite §4. | R03 | `editing.md` | Minimal | Opus high / Fable high | R | Planned |
| R05 | Rewrite §5. | R04 | `editing.md` | Minimal | Fable high / Fable high | R | Planned |
| R06 | Rewrite §6. | R05 | `editing.md` | Minimal | Opus high / Opus high | R | Planned |
| R07 | Rewrite §7. | R06 | `editing.md` | Minimal | Opus high / Opus high | R | Planned |
| R08 | Rewrite §8. | R07 | `editing.md` | Minimal | Fable high / Fable high | R | Planned |
| R10 | Rewrite §10. | R08 | `editing.md` | Minimal | Opus high / Fable high | R | Planned |
| R11 | Rewrite §11. | R10 | `editing.md` | Minimal | Opus high / Fable high | R | Planned |
| R12 | Rewrite §12. | R11 | `clipboard-and-paste.md` | Minimal | Opus high / Opus high | R | Planned |
| R13 | Rewrite §13. | R12 | `clipboard-and-paste.md` | Minimal | Opus high / Fable high | R | Planned |
| R14 | Rewrite §14. | R13 | `clipboard-and-paste.md` | Minimal | Opus high / Opus high | R | Planned |
| R15 | Rewrite §15. | R14 | `images.md` | Minimal | Fable high / Fable high | R | Planned |
| R16 | Rewrite §16. | R15 | `persistence.md` | Minimal | Fable high / Fable high | R; statements 3–6 of §7.2 still present | Planned |
| R17 | Rewrite §17. | R16 | `images.md` | Minimal | Opus high / Fable high | R | Planned |
| R18 | Rewrite §18. | R17 | `tree-model.md` | Minimal | Opus high / Opus high | R | Planned |
| R19 | Rewrite §19. | R18 | `tree-model.md` | Minimal | Opus high / Opus high | R | Planned |
| R20a | Rewrite §20 own text, §20.1, §20.3, §20.4, §20.6, §20.7. | R19 | `interaction.md` | Minimal | Opus high / Fable high | R | Planned |
| R20b | Rewrite §20.5 and §20.8. | R20a | `interaction.md` | Minimal | Fable high / Fable high | R | Planned |
| R20c | Rewrite §20.2.1–§20.2.6, §20.2.8, §20.2.27. | R20b | `vim.md` | Minimal | Fable high / Fable high | R; rows M12 and M20 of `docs/VIM_CONFORMANCE.md` stay open | Planned |
| R20d | Rewrite §20.2.9. | R20c | `vim.md` | Minimal | Fable high / Fable high | R | Planned |
| R20e | Rewrite §20.2.10, 11, 16, 17, 18. | R20d | `vim.md` | Minimal | Fable high / Fable high | R | Planned |
| R20f | Rewrite §20.2.12, 13, 21, 22. | R20e | `vim.md` | Minimal | Fable high / Fable high | R | Planned |
| R20g | Rewrite §20.2.14, 15, 20, 23, 24, 25, then 19. | R20f | `vim.md` | Minimal | Fable high / Fable high | R | Planned |
| R20h | Rewrite §20.2.26. | R20g | `search.md` | Minimal | Fable high / Fable high | R | Planned |
| R20i | Rewrite §20.2.7, 28, 29, 30. | R20h | `command-panel.md` | Minimal | Fable high / Fable high | R | Planned |
| R20j | Rewrite §20.9–§20.13. | R20i | `completion-and-tags.md` | Minimal | Fable high / Fable high | R | Planned |
| R20k | Rewrite §20.14. | R20j | `search.md` | Minimal | Fable high / Fable high | R | Planned |
| R21 | Rewrite §21. | R20k | `application.md` | Minimal | Opus high / Fable high | R | Planned |
| R22 | Rewrite §22. Move procedure sentences to their owners (Q6); §22.1 and §22.2 keep their numbers. | R21, Q6 | `non-functional.md`, `docs/AGENT_WORKFLOW.md`, `docs/DEVELOPMENT.md` | Minimal, plus `npm run check:opencode` | Opus high / Fable high | R; `docs/ARCHITECTURE.md` and `AGENTS.md` citations of §22 still resolve to the cited content | Planned |
| R23a | Rewrite §23.1–§23.6. | R22 | `agenda.md` | Minimal | Fable high / Fable high | R | Planned |
| R23b | Rewrite §23.7–§23.15. | R23a | `agenda.md` | Minimal | Fable high / Fable high | R | Planned |
| R24 | Rewrite §24. | R23b | `browser.md` | Minimal | Fable high / Fable high | R | Planned |
| R25 | Rewrite §25. | R24 | `desktop-data.md` | Minimal | Fable high / Fable high | R | Planned |
| R26 | Rewrite §26. | R25 | `application.md` | Minimal | Opus high / Fable high | R | Planned |
| F1 | Apply only the owner's answers that keep implemented behavior. A held sentence (W7(c)) or a §12 finding is resolved by stating what the application already does, and the resolution cites a test or source location as evidence. An answer that would change behavior is not applied here: it is recorded as a separate product task outside this initiative, and both original statements stay. Also apply approved moves to tests (Q9). Skipped parts are recorded. | R26, owner answers | Files named by the answers | By content | Fable high / Fable high | R per changed section; each resolution cites its implementation evidence; no production code and no test assertion changes | Planned |
| F2 | Final sweep: phrase search for remaining history-relative wording, index and retired-number table, every citation and anchor in the repository resolves, acceptance package. | F1 | `docs/PRODUCT.md`, `docs/product/*.md`, citing documents | Minimal | Opus high / Fable high | Citation check listed per citing file; R for changed text | Planned |

Dependencies between rewrite tasks are an order, not a technical constraint, with two exceptions: every rewrite needs T1, and a merge keeps its survivor (§7.2).

Marker edits in total: one in R01a, four in R01c, and those the owner approves in F1. No other task edits a marker.

## 9. Model Routing and Roles

| Function | Role in `docs/AGENT_ROLES.md` | Model and effort | How it is selected |
| --- | --- | --- | --- |
| T1 implementer | Primary (§1) | Sonnet, medium | `.claude/settings.json` already pins `sonnet` for a new session. The owner sets medium effort in the client. |
| Implementer, high-risk section | Primary (§1) | Fable, high | The owner selects the model for that session with `/model`. |
| Implementer, other section | Primary (§1) | Opus, high | The owner selects the model for that session with `/model`. |
| Independent verifier | Reviewer (§3), fresh context | Fable, high; Opus, high for the low-risk tasks R03, R06, R07, R12, R14, R18, R19 | The primary launches the configured `reviewer` subagent. Its adapter default is `claude-opus-5-5`, high effort. For a Fable pass the primary passes a per-invocation model override. |

High-risk sections, from the owner's list and the inventory: §1.4, §2, §5, §8, §15, §16, §20.2, §20.5, §20.8, §20.9–§20.14, §23, §24, §25.

The verifier is never the session that wrote the rewrite: it is a separate reviewer context that receives the diff and the rules, and not the implementer's map.

Adapter configuration: no change is needed. `.claude/agents/reviewer.md` keeps `claude-opus-5-5` so reviews outside this initiative keep their cost. The per-invocation override is an initiative rule recorded here; it needs the owner's approval because `docs/AGENT_ROLES.md` §6 lists Opus for the reviewer (Q11). The effort setting for a primary session is a client setting; this repository does not configure it, and this plan has not verified the client mechanism.

## 10. Owner Involvement and Budget

No task needs a manual application check: the initiative changes no runtime behavior.

| Round | When | Owner action | State |
| --- | --- | --- | --- |
| 1 | Now | Approve or change the plan; answer §11 | Confirmed |
| 2 | After R09 | Pilot checkpoint: read the rewritten §9 and its evidence; confirm the method and the budget | Confirmed |
| 3 | After R20k | Answer the held sentences and suspected inconsistencies collected so far | Confirmed |
| 4 | After R26 | Answer the remaining held sentences; decide each move to tests (Q9) | Confirmed |
| 5 | After F2 | Final acceptance of the delivered specification | Confirmed |
| + | Any time | A rejected acceptance, or a held sentence that blocks a later task | Possible |

A held sentence does not block its task: the sentence stays verbatim and the task completes.

Budget:

- Execution: 43 primary sessions, one task each, as the owner specified.
- Recovery: at most two correction cycles per task after verifier findings; then escalate. Reserve: 8 sessions.
- Closure allowance: 1 session after final acceptance.
- Token cost is not estimated here. T1 and R09 record measured input, output, and verifier usage, and round 2 revises the budget from those numbers.

Unresolved capabilities: none identified. `npm run check:docs` and `npm run check:requirements` ran in the planning session (52 live documents; 126 numbered requirements). The reviewer role's model override has not been exercised in this repository.

## 11. Owner Questions

Each question has a recommended default.

**Structure and identifiers**

- **Q1. Section identifiers.** Keep global numbers stable (§6.2), or renumber per file? Default: stable numbers.
- **Q2. File layout.** Accept the 16 files of §5, including the placement of §20.2.7 and §20.2.28–30 in `command-panel.md` and §20.2.26 in `search.md`? Default: yes. Alternative: keep all of §20.2 in `vim.md` (508 lines).
- **Q3. Retitling.** May a heading title change while its number stays, for example §9 "Cmd+0" and §1.4 "Browser static-hosting checkpoint"? Default: yes.
- **Q4. About dialog.** §1.3 and §1.4 both specify it, and §1.3 is exempt from test markers. Create §9.4 About Tree as the single owner, cited by §1.3 and §1.4, with one marker re-pointed? Default: yes.

**Process content**

- **Q5. Release and verification content of §1.** Nearly every sentence of §1.4.1 already exists in another document, and no contradiction was found. Proposed owners:
  - release identity, tag reservation, retries: `docs/releasing.md`;
  - validation gates before publication: `docs/DEVELOPMENT.md` §9;
  - signed manifest and publisher trust: `docs/SECURITY.md`;
  - asset retention, limits, and the cancellation rule: `deployment/github-pages/README.md`, which is where these exist today although it was not on the destination list;
  - verification status of §1.5 (L214, L235): `src/web/README.md` and `docs/DEVELOPMENT.md` §8;
  - the completion check of L77: `docs/AGENT_WORKFLOW.md` §13, which already states it.

  Retire §1.4.1 and delete its two markers and the two release markers filed under §1.4; the tests stay. Default: yes to all. Alternative: keep §1.4.1 as a short product-level statement of release identity.
- **Q6. §22 obligations.** §22.1 mixes product commitments with obligations on every change. Keep the commitments and the numbers §22.1 and §22.2; move the assessment procedure to `docs/AGENT_WORKFLOW.md` §4 and the pre-release memory checks to `docs/DEVELOPMENT.md`; leave one sentence in §22.1 that cites them. Default: yes. Alternative: leave §22 whole, because about 100 citations name §22.1 as the owner of the assessment.
- **Q7. Cost-assessment sentences inside feature sections** (L1192–1193, L1469, L2180, L2241, L2284, L2811–2813). Keep where they state a user-visible commitment; move measurement method and guard obligations to `docs/DEVELOPMENT.md` §12. Default: yes, decided sentence by sentence in the owning task.

**Level of detail**

- **Q8. Pixel values, colors, and exact strings.** Keep them in the specification. Reason: a value in the specification changes only with an owner-visible specification change, while a test is not an owner-approved artifact; and `check:requirements` proves section-level traceability, not that a test pins a sentence. Default: keep. This leaves problem 5 of the brief (overlap with tests) mostly in place by choice.
- **Q9. Candidates for "test only".** If the owner prefers to move some details, these are the only ones where an existing test with a marker for the same section asserts the value. Each needs a separate yes or no. Default for each: keep in the specification.

  | # | Detail | Section | Test and marker |
  | --- | --- | --- | --- |
  | 1 | Selected-marker offset of 7px | §2.1 | `e2e/electron/node-gutter-alignment.spec.ts:266` |
  | 2 | Line-number gutter width of 40px | §2.1.1 | `e2e/electron/line-numbers.spec.ts:118` |
  | 3 | `grabbing` cursor during a drag | §11 | `e2e/electron/drag-and-drop.spec.ts:67` |
  | 4 | Gray and White background hex values | §20.5 | `e2e/electron/gray-appearance.spec.ts:18`, `:138` |
  | 5 | Context margin of 25 px | §20.8 | `e2e/electron/scroll-selection.spec.ts:262` |
  | 6 | Date-like underline style and two of its three colors | §20.10 | `e2e/electron/date-like-indicator.spec.ts:30`, `src/renderer/styles.test.ts:131` |
  | 7 | Six people and event tag colors | §20.13 | `e2e/electron/people-events.spec.ts:14` |
  | 8 | Search popup width of 960 px | §20.14 | `e2e/electron/recent-nodes.spec.ts:18` |
  | 9 | Status-bar height of 27px | §20.2.7 | `e2e/electron/summarize.spec.ts:127` |

  Not proposed, although a test pins them: limits, counts, timers, and exact UI strings (for example the archive limits of §24.2, the three-attempt save lock, the wrap width, the update strings of §26). These are user-observable quantities or approved text, and `src/domain/AGENTS.md` names the specification as the owner of message text.

**Method and routing**

- **Q10. Literal comparison tool (T2).** Add it? It costs one session and catches a changed number, key, or string mechanically. Default: yes.
- **Q11. Verifier routing.** Use the configured `reviewer` role with a per-invocation Fable override, leaving the adapter default at Opus? Default: yes. Alternative: change `.claude/agents/reviewer.md` and the table in `docs/AGENT_ROLES.md` §6.
- **Q12. Small sections.** The plan follows "one top-level section per task and per session". Three merges would remove four sessions without mixing risk levels: R03 with R18 and R19 (48 lines, one file); R06 with R07 (111 lines, one file); R12 with R14 (71 lines, one file). Default: allow these three merges, giving 39 tasks.
- **Q13. Pilot checkpoint.** Stop after R09 for owner review before the remaining 38 rewrite tasks? Default: yes.

## 12. Suspected Inconsistencies Found During Analysis

The analysis found statements that appear to conflict or to refer to nothing. Subagents reported them; this session did not verify each one. A rewrite must not resolve them: both statements stay, and the owning task confirms the finding and adds it to the owner round. Choosing one of two conflicting statements can differ from what the application does, so this initiative applies an answer only when it matches implemented behavior (F1). A decision that changes behavior becomes an ordinary product task under `AGENTS.md` §5, outside this plan.

| # | Location | Finding |
| --- | --- | --- |
| 1 | L92 and L2690 | Browser menu ends with About Tree below Update App; §24.7 places Update App at the bottom |
| 2 | L2113 and L2129–2134 | Month prefixes are allowed in one place; "full English month name" is required in another |
| 3 | L2241 | Specification states a budget below 1 ms; `src/domain/tag-catalog.performance.test.ts` asserts a p99 below 5 ms |
| 4 | L1708 and L2041 | "Yellow highlight" against palette-specific colors |
| 5 | L2567, L2611 | Cite "the attachment limit of §17"; §17 states none, the limit is in §12 |
| 6 | L1510 | "Both appearances"; there are five |
| 7 | L1312–1331 and L2458 | The persisted-state list of §16.1 omits Agenda folds |
| 8 | L1531, L1542, L1557, L1561, L1711, L1885, L1936, L1940 | "Existing behavior" with no defining section (W7(c) candidates) |
| 9 | L2423, L2466 | Agenda sentences that "retain existing" rules whose owner must be located |
| 10 | L207–210 and `docs/ARCHITECTURE.md` §2 | Different lists of trusted parties for publication |

## 13. Risks

1. **A merge hides a difference.** Two near-identical statements can differ in one condition (examples: L2423 and L1559; L2464 and L1467; the five-second and six-second closing timers of §24 and §25). Control: W8, and the verifier does not see the implementer's map.
2. **A reworded antecedent adds behavior.** Control: W7; nothing is derived from code.
3. **A merge survivor is later reworded away.** Control: the R16 evidence line and the F2 sweep.
4. **Anchors break silently**, because `check:docs` does not validate them. Control: seven known links fixed in T1; F2 lists every citation.
5. **Cost.** 43 sessions with a Fable verifier on most of them. Control: W1 keeps the verification surface small; the pilot checkpoint revises the budget; Q12 removes four sessions.
6. **Concurrent feature work edits the specification.** Each rewrite task starts from the current commit and one section, so a conflict is local. A feature change that lands in a section already rewritten must follow §7.1; `docs/DEVELOPMENT.md` §12 should say so after T1.
7. **T1 on a smaller model changes checker semantics.** Control: evidence S, an independent review, and the unchanged requirement count.
8. **The inventory is partly second-hand.** Read-only subagents collected the duplicate, process, and test-pin entries of §4.2, §4.3, §11 (Q9), §12, and Appendix A; this session read §1, §9, §13, and parts of §16 and §23 itself. Control: each task confirms its own entries against the text before acting on them.

## 14. Next Task

None. The plan awaits owner approval and the answers to §11. After approval the next task is T1.

## 15. Prompt for the Next Session

Use only after the owner approves the plan. Replace the bracketed part with the owner's answers.

```text
Execute task T1 of plans/product-spec-refactoring.md.
Model: Sonnet, effort medium.
The Product Owner approved the plan on [date] with these answers to its §11: [answers].
T1 is a mechanical split with tooling changes and no wording change. Stop after the T1 commit and report.
```

## Appendix A. Other Documents

### A.1 Duplication between `docs/ARCHITECTURE.md` and the specification

A subagent read `docs/ARCHITECTURE.md` in full. It estimates that 10–12% of that document (about 24 KB of 208 KB) restates product behavior or quantities. Proposed rule for every row: the specification owns user-visible behavior, quantities, and message text; the architecture document owns mechanism and keeps a citation.

| # | Architecture | Specification | Duplicated | Differences found |
| --- | --- | --- | --- | --- |
| 1 | §13 | §16.1, §9.2 | Save triggers, flush before quit | The quit timeout value exists only in the architecture document |
| 2 | §13 | §16.2 | Save-failure lock | Architecture adds that a successful save releases the lock |
| 3 | §13 | §16.1 | Generations and load order | One citation names §16 for a value stated in §16.1 |
| 4 | §9, §13 | §16.1, §2.4 | Persisted state list, scroll restore | The two differ on whether scrolling resets an armed idle timer |
| 5 | §13, §14 | §17 | Attachment reachability and cleanup | None |
| 6 | §7 | §12, §15.1, §24.2 | Image limits | Two pixel limits exist only in the architecture document |
| 7 | §11 | §10 | Undoable operations and eviction | The redo bound exists only in the architecture document |
| 8 | §8 | §20.1 | Windowed list behavior | None |
| 9 | §13 | §25.4 | Replaced Notes and journal recovery | None; near-verbatim |
| 10 | §13 | §25.1–§25.3 | Desktop export and import | None |
| 11 | §13 | §24.2–§24.4 | Archive validation | None |
| 12 | §13 | §24.5–§24.6 | Folder backup and restore | None |
| 13 | §13 | §24.1, §24.7 | Storage protection, browser updates | None |
| 14 | §7 | §26 | Desktop updates | None |
| 15 | §2 | §1.4.1 | Release pipeline and trust model | Trusted parties differ (§12, row 10) |
| 16 | §13, §4 | §20.12, §20.14, §20.2.28 | History caps, recent rows, search rules | One interval exists only in the specification |
| 17 | §5, §13 | §2.5–§2.7 | Completion, star, and mark rules | None |
| 18 | §8, §16 | §20.5, §16.1 | Palettes, window geometry | None |

The architecture document cites the specification 54 times; 30 of them name §22.1. It uses five citation styles, none with a heading anchor, so stable numbers keep all of them valid.

### A.2 Duplication among the process documents

| Rule | Locations | Proposed owner |
| --- | --- | --- |
| Release gate composition | `docs/DEVELOPMENT.md` §9 and §12, `docs/releasing.md`, `deployment/github-pages/README.md` | `docs/DEVELOPMENT.md` §9 |
| Tag reservation and same-version skip | `docs/releasing.md`, `docs/DEVELOPMENT.md` §12, `deployment/github-pages/README.md` | `docs/releasing.md` |
| Failed-job retry and artifact reuse | `docs/releasing.md`, `docs/DEVELOPMENT.md` §9, `deployment/github-pages/README.md` | `docs/releasing.md` |
| `npm run release` usage | `docs/releasing.md`, `docs/DEVELOPMENT.md` §12 | `docs/releasing.md` |
| Publisher trust and verifier source | `docs/SECURITY.md`, `deployment/github-pages/README.md` | `docs/SECURITY.md` |
| Storage boundary before publishing | `src/web/README.md`, `deployment/github-pages/README.md`, `docs/SECURITY.md` | `deployment/github-pages/README.md` for the step, `docs/SECURITY.md` for the fact |
| Performance assessment obligation | Specification §22.1, `docs/AGENT_WORKFLOW.md` §4 and §10, `AGENTS.md` §4, `src/domain/AGENTS.md` | Q6 |
| Exploratory-marker agent rules | Specification §1.2, `docs/AGENT_WORKFLOW.md` §5, `docs/WORKING_WITH_AGENT.md`, `docs/OPEN_QUESTIONS.md` | `docs/AGENT_WORKFLOW.md` §5 for agent rules; §1.2 keeps the marker definition and is not changed by this initiative |

### A.3 Cross-references into the specification

| Document | References |
| --- | --- |
| `AGENTS.md` | §22, §1.3, two without a section |
| `docs/AGENT_WORKFLOW.md` | §1.1, §1.2 (2), §1.3, §20.5, §22 (2) |
| `docs/DEVELOPMENT.md` | §1.3–§1.4, §13.1 (example), §16.1 (2), §20.2.1, §20.5, §20.7, §22 |
| `docs/SECURITY.md` | §24.1, §24.2, §24.7, one anchor to §1.4 |
| `docs/releasing.md` | §26 |
| `src/web/README.md` | §24.5, five anchors (§1.4, §1.5, §24, §24.1, §24.7) |
| `docs/OPEN_QUESTIONS.md` | §1.1, §1.2, §11, §20.5, §20.8, §20.14, §24–§25 |
| `docs/VIM_CONFORMANCE.md` | About 30 lines: §2.1, §4.3, §5.1, §6.1, §8.3, §20.2.x, §20.8, §20.9, §20.12, §20.13, §23.x |
| `docs/decisions/` | Ten ADRs: §1.1, §2.5, §10, §16, §16.1, §16.2, §17, §20.1, §22, §22.1, §24.2, §24.5, §25.4, one anchor to §25.4 |
| `docs/ARCHITECTURE.md` | 54 (A.1) |
| Nested `AGENTS.md` | `src/domain/AGENTS.md` §22.1; `e2e/electron/AGENTS.md` §16.1 |
| `.agents/skills/` | §22 |

Under option (a) only the anchors and the references to retired §1.4.1 need an edit. No document cites §1.4.1; only two test markers do.

### A.4 Session load before work starts

Measured sizes of the text a session must read before a typical product-behavior change, excluding the product and architecture sections of the task itself:

| Text | Bytes | Words | Share |
| --- | --- | --- | --- |
| `AGENTS.md` (always loaded; 90% of its 24 KiB limit) | 22,091 | 2,931 | 15% |
| `docs/AGENT_WORKFLOW.md` §§4, 5, 9, 10, 12, 13, 14 | 46,796 | 6,808 | 31% |
| `docs/DEVELOPMENT.md` §9 Full Validation | 64,759 | 9,160 | 44% |
| `docs/DEVELOPMENT.md` §10 Development Workflow | 15,067 | 2,101 | 10% |
| Total | 148,713 | 21,000 | 100% |

At about four bytes per token this is roughly 37,000 tokens; the conversion is an estimate. Conditional additions: `docs/DEVELOPMENT.md` §8 Tests (61,293 bytes) for navigation, caret, or test-selection work; `docs/AGENT_ROLES.md` (14,380 bytes) before delegation; `docs/DEVELOPMENT.md` §12 (32,948 bytes) for test strategy.

Largest contributors:

1. `docs/DEVELOPMENT.md` §9. The risk-tier table and evidence rules that every task needs are 28,423 bytes. The container and GitHub Actions reference in the same section is 32,185 bytes and is needed only for CI work.
2. `docs/DEVELOPMENT.md` §8, when it applies: 61,293 bytes in one section.
3. `docs/AGENT_WORKFLOW.md` procedures: 46,796 bytes across seven sections, read on demand.
4. `docs/DEVELOPMENT.md` §10: mostly per-tool permission descriptions.

### A.5 Recommendation for a follow-up initiative

A follow-up is worth it, in this order, and only after this initiative closes:

1. **`docs/DEVELOPMENT.md` §8–§10.** Separate what every session must read (tier table, evidence and reuse rules, capability check) from reference material (CI jobs, container tests, per-tool permission detail). Expected effect: about 45 KB less mandatory reading per session, the largest gain available. Low risk: no product behavior is involved.
2. **`docs/ARCHITECTURE.md`.** A narrow pass that removes the restatements of A.1, starting with rows 1, 4, 6, 7, and 15 where the two documents already differ. Its larger problem is placement: §13 is 65 KB and holds search, emoji, and command history beside persistence, and §8 is 51 KB.
3. **Release documents.** Give each of the first four rules of A.2 one owner. Small.

Not recommended: a rewrite of `AGENTS.md` or `docs/AGENT_WORKFLOW.md`. They already have a core-and-procedures structure with a size limit enforced by `check:docs`.
