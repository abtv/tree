# Product Specification Refactoring

Status: In progress; T1, T2, R09, R01a, R01b, and R01c done and accepted; R02 to R12 done; R13 to F2 authorized

This plan records the analysis and the task sequence for refactoring `docs/PRODUCT.md`. The Product Owner accepted the plan and answered its questions on 2026-11-20 (§11). Step P0 is done. On 2026-11-20 the owner authorized T1, T2, and R09. On 2026-11-20 the owner accepted the rewritten §9, recorded three method decisions (§3), and authorized R01a only. On 2026-11-20 the owner accepted R01a, answered Owner Question Log entries 2 and 3 (§3, decisions D4 and D5), and authorized R01b only. On 2026-11-20 the owner accepted R01b, answered Owner Question Log entries 4, 5, and 6 (§3, decisions D6, D7, and D8), and authorized R01c only. On 2026-11-21 the owner accepted R01c and authorized the autonomous execution of every remaining task, R02 to F2, on Opus with high effort (§3). Final owner acceptance follows F2.

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
- No production code, test assertion, or test title changes. The only permitted changes outside documentation are the tooling changes of T1 and T2, the one-entry boundary-list change of R01a, and the `@requirement` marker lines named in §8.
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/AGENT_WORKFLOW.md`, `AGENTS.md`, `docs/SECURITY.md`, and `docs/releasing.md` are not rewritten. They change only where they receive moved process content, describe changed tooling, or link into the specification.
- ADRs are historical records. Their `PRODUCT.md §N` citations stay valid because section numbers stay stable; ADR text is not edited except for one anchor link (§6.3).
- Repository text stays English.

## 3. Authorization State

- Authorized and done: recording this plan, its two review corrections, and step P0 (owner instructions of 2026-11-20).
- Accepted by the owner on 2026-11-20: the plan as corrected in commit `9178ec3`, and the recommended defaults for Q1–Q8 and Q10–Q13. Q9 is decided per confirmed candidate in round 4.
- Authorized by the owner on 2026-11-20: T1, T2, and R09, in that order. The authorization holds across the session changes between these three tasks; a new session for T2 or R09 does not ask again.
- Execution arrangement (same instruction): each task keeps its own session and the model of §9.
- Pilot decision of the owner, 2026-11-20 (§10, round 2): the rewritten §9 is accepted. The owner authorized the refinement of this plan by the three method decisions below and the execution of R01a only.
- Method decisions of the same instruction. They apply to R01a and to every later task:
  - **D1. Retitled heading.** A literal that an approved retitle removes from a heading takes the disposition "Retitled heading" when three conditions hold: the section number stays; the heading set no separate requirement; and the body of the section still states the literal with its meaning. The task checks the references to the old heading title and records the result. This closes Owner Question Log entry 1 and the `Cmd+0` case of R09.
  - **D2. New reference created by a merge.** A new reference to an existing section that a merge creates is justified by the Merge Ledger row of that merge. The reviewer checks that the referenced location still states the full rule with all its conditions and exceptions. For the reference to §16.1 added in R09, the justification is ledger rows 1 and 2.
  - **D3. Index entry of R01a.** R01a adds only the number 9.4 to the `application.md` row of the index in `docs/PRODUCT.md`. An in-memory check showed that `--details` reports this as one added literal, one removed row, and one added row. That report is accepted when the comparison confirms that the path, the order, and the other numbers of the row are unchanged.
- Execution arrangement for R01a (same instruction): the primary session that records the decision executes R01a itself, by its row in §8. After validation it launches the independent reviewer (Fable, effort high) with the diff and the validation results. The reviewer receives the implementer's statement map only after it has written its own table. After the review and its corrections, R01a is committed and the work stops.
- Owner decision of 2026-11-20 after R01a: R01a is accepted. R01b only is authorized. Two further method decisions answer Owner Question Log entries 2 and 3:
  - **D4. The guideline-check paragraph of §1.3 (log entry 2).** The last paragraph of §1.3 stays verbatim until F1. In F1, one change fixes the user-interface check rule in `docs/AGENT_WORKFLOW.md` §13, updates the citations of that rule in `AGENTS.md` and `docs/AGENT_WORKFLOW.md`, and, if necessary, refines the reason for §1.3 in `EXEMPTIONS` of `scripts/check-requirement-coverage.mts`. §1.3 keeps the requirement to follow Apple's Human Interface Guidelines and the rule that an explicitly recorded deliberate difference takes precedence.
  - **D5. Index change of R01c (log entry 3).** Acceptance condition for R01c: in the Section Map of `docs/PRODUCT.md`, only `1.4.1` is removed from the `browser.md` row; the path, the other numbers, and their order stay. The Retired Numbers table gains exactly one row, for 1.4.1, which links every document that receives rules of §1.4.1 under Q5. The sentence "No number is retired." is removed, because it becomes false. The task and the verifier check the actual changes of both tables, not only the `--details` summary.
- Execution arrangement for R01b (same instruction): a new primary session on Fable, effort high, executes R01b by its row in §8. When it retitles §1.4, it updates both references to the old heading in `docs/SECURITY.md` and `src/web/README.md`. After validation, the independent reviewer (Fable, effort high) writes its own table without the statement map (§7.3 step 7); the implementer compares that table with its map (§7.3 step 8). After the R01b commit, the work stops.
- Owner decision of 2026-11-20 after R01b: R01b is accepted. R01c only is authorized. Three decisions answer Owner Question Log entries 4, 6, and 5:
  - **D6. The parity sentence of §1.4 (log entry 4).** R01c removes from §1.4 only the sentence "It does not claim full browser parity or completion of the Browser Tree initiative." The statement map records it as Removed (non-normative). The neighboring requirement that the browser version has no synchronization or accounts stays, with its reference to §24.
  - **D7. The publication instruction of §1.4 (log entry 6).** `src/web/README.md` already says that, before publication, the user must be told why notes will not transfer. `deployment/github-pages/README.md` already describes this limitation and the way to transfer notes. R01c names both locations in the statement map and removes the publication instruction from §1.4. §1.4 keeps the rule that notes are stored separately per browser profile and origin, and keeps the link to `src/web/README.md`. The link sentence loses the word "existing".
  - **D8. The last items of the browser menu (log entry 5).** When an update is ready, Update App appears directly above About Tree. About Tree ends the menu. Status messages are in the bottom status bar of the window. F1 makes both edits: it clarifies §24.7, and it removes "below statuses" from §1.4. Evidence named by the owner: `src/web/index.html:54`, `src/web/app-updates.ts:154`, and the reference snapshot `e2e/electron/menu-icons.spec.ts-snapshots/browser-update-light-darwin.png`. R01c does not make these edits.
- Execution arrangement for R01c (same instruction): the primary session that records this decision executes R01c itself, by its row in §8, with the conditions of Q5 and D5. The plan and `plans/README.md` are updated and committed before the specification changes. For every sentence of §1.4.1 the task names the exact location where the full rule is now stated, and it checks the actual changes of both index tables. After validation, the independent reviewer (Fable, effort high) receives the diff and the validation results and writes its own table; the implementer then compares that table with its map. Cleanup exception (§7.3 step 10): the transfer table of §1.4.1 and the reviewer's original table stay in `.scratch/product-spec-R01c/` until the owner accepts R01c. After the R01c commit the session reports the commit hash, the paths of both tables, and the measured cost of each role, and stops before R02.
- Done on 2026-11-21: R01c. It retired §1.4.1 and left one open entry in the Owner Question Log (§16, entry 7). Its transfer table and the reviewer's original table are in `.scratch/product-spec-R01c/` until the owner's acceptance. One difference from the letter of E1 (§7.4) is part of that acceptance: E1 names only link targets in `src/web/README.md`, and R01c also moved the verification-status sentences of §1.5 into that file, as Q5 and the R01c row direct. The reviewer reported this difference; E1 is not edited.
- Owner decision of 2026-11-21: R01c (commit `347e8af`) is accepted, including the move of the verification-status sentences of §1.5 into `src/web/README.md` under Q5. This acceptance covers the difference from the letter of E1 recorded above. The session that records the acceptance removes `.scratch/product-spec-R01c/`.
- Authorized by the owner on 2026-11-21: every remaining task of §8, from R02 to F2 inclusive, within the budget of §10. The authorization is initiative-wide (`docs/AGENT_WORKFLOW.md` §8). It holds across task and session changes; a new session does not ask again. Execution arrangement of the same instruction, which replaces the per-task arrangements above for the remaining tasks:
  - **Model.** Every remaining task uses Opus with high effort, for the implementer and for the independent reviewer (§9).
  - **Commit and review per task.** Each task has its own commit and its own independent review. After validation, the implementer launches the configured `reviewer` role in a fresh context with the full diff, the rules of §7.1, and the validation record (§7.3 step 7). The reviewer writes its own table before any comparison with the implementer's statement map; it does not receive the map. The implementer then compares the two (§7.3 step 8), resolves the findings itself, reruns the affected checks, commits, and continues with the next task. The owner does not confirm individual commits.
  - **Sessions.** At most four tasks per primary session (`docs/AGENT_WORKFLOW.md` §12). A session change uses the ordinary continuation (§14, §15). If the client requires the owner to open the new session, the session gives the owner a short continuation text; the authorization already exists.
  - **Delegated decisions.** Editorial and technical decisions inside this plan are made by the implementer together with the reviewer. A disputed wording stays verbatim and goes to the Owner Question Log.
  - **Question rounds.** After R20k and after R26 the session sends the owner one summary of the open entries of the Owner Question Log and continues with the tasks that do not need an answer (§10). Under Q9 every candidate value stays in the specification until the owner decides it. F1 applies the decisions already agreed: D4, D8, and every log entry the owner has answered by then.
  - **Owner contact.** Before F2 the session contacts the owner only for a blocking product choice, a needed access, an exhausted budget, or a mandatory check that still fails after the recovery attempts of §10. After F2 it sends one final report: the result, the remaining questions, and the request for final acceptance (§10, round 5).
- Done on 2026-11-21: R02. It merged the mouse-hold rules of §2.1 into §11 (Merge Ledger row 4), excluded Q9 candidate 1, and added Owner Question Log entry 8.
- Done on 2026-11-21: R03. It merged the empty-node sentence of §3 into §19 (Merge Ledger row 5); §18 and §19 needed no change.
- Done on 2026-11-21: R04. It removed the attribution "explicitly requested" from §4.3 (W5); the reason for that Vim divergence survives in `docs/VIM_CONFORMANCE.md` ("the owner's explicit single-step emoji requirement"). Precedent for later tasks: where an owner request is the only stated reason for a deliberate divergence, the words stay unless the task shows that the reason survives in another owning document. Lead "L520 and L680" is an identical duplicate: §4.1 "When the editable current parent is selected, pressing `↑` places the caret at the beginning of the current parent." and §6.1 "`↑` moves the caret to the beginning of the parent's text". R06 merges it with §4.1 as the survivor. The other leads of §4 differ in detail and stay (W8).
- Done on 2026-11-21: R05. §5 needed no change. "Existing children" and "existing folds" in §5.1 name the state at the moment of the key press, not history. "Vim Normal `Enter` keeps its image-preview and hyperlink behavior (see §20.2)" already cites its defining section (W7(a)). The repetitions between §5.1 and its unnumbered example headings share one section number. The `o` rule repeated in §20.2.10 belongs to R20e, with §5.1 as the survivor of any merge.
- Done on 2026-11-21: R06. It merged the `↑` bullet of §6.1 into §4.1 (Merge Ledger row 6). The other leads of §6 and §7 differ in detail or are not duplicates and stay (W8). "This shortcut must remain exactly `Cmd+,`." in §7.1 is not process content: it is a normative constraint on the product's key binding and stays verbatim under W1. The `Ctrl+o` alias is stated in §7.1 and in §20.2.12; §20.2.12 is outside the R06 row, so R06 kept both and recorded the lead in the R20f row.
- Done on 2026-11-21: R08. It merged "Empty nodes are never deleted automatically." of §8.2 into §19 (Merge Ledger row 7), merged the §8.1 sentence "When inside a parent, `Cmd+Backspace` deletes the currently selected child." into the first sentence of §8.1, which is wider, and reworded "remains ordinary text editing" and "retains" as present-state statements. Rule 3 of §8.1, "return to the parent", is unchanged: the same section states that "deleting a node never enters or leaves a location", and `deleteSelectedTransition` in `src/application/editor-command-transitions.ts` (L423–426 at `dbb766a`) selects the real parent and keeps the location. No test asserts the location for the deletion of the only child of the current parent. Lead "L785 and L1439" stays: §8.2 adds the subtree, the displayed-level scope, and the heading exclusion, and §19 already cites 8.2 (W8). The antecedents "rule 2" and "this way" are unchanged and still resolve inside §8.2 and §8.3. The references "(see 8.2–8.3)" without the `§` sign stay for F2.
- Done on 2026-11-21: R10. It merged "Stable node IDs must survive undo and redo." of §10 into §18 (Merge Ledger row 8) and held "Undo and redo are mandatory in v1." verbatim (Owner Question Log entry 9). Lead "L908–909 restated at L446, L470, L488": the §2 sentences already cite §10 for the change site of undo and redo, so nothing is merged. "They retain the current location" and "The undo/redo history retains at most the 200 most recent entries" state results and limits in the present (W3) and stay.
- Done on 2026-11-21: R11. It reworded "remains available", "retains native text selection", and "remains a dedicated pointer target" as present-state statements. Under W7(a) it reworded "The node dot and fold arrow keep their existing actions." to "The node dot and fold arrow keep the actions of §2.1 and §2.4.": §2.1 defines both actions (the circular indicator enters the node; the disclosure chevron expands or collapses it), and §2.4 limits a fold change to its location's view and selects the collapsing node when a collapse hides the caret. A citation of §2.1 alone would have dropped the §2.4 exception (W12). The two added references are covered by W7(a) and were checked by the verifier. It merged "Use the outer row bands for gaps and the middle for dropping onto a node." into the §11 bullet "The outer quarter of a row's height, capped at 8 pixels, acts as the gaps before and after it; its middle accepts the dragged node as a child.", which is wider; both carry §11, so no ledger row applies. The leads with §2 stay (W8): the gap-resolution paragraphs of §11 and §2.4 differ (§11 adds sibling reordering and says "a visible node" and "a displayed ancestor" where §2.4 says "an ancestor"; §2.4 adds "release there changes nothing"), the depth sentences of §11 and §2.3 differ (§11 adds that the drop is offered), and the breadcrumb drop already cites §2.2. "The entire subtree moves together with its node." stays beside "Mouse drag-and-drop moves one node together with its subtree.", because the first names no input method. Lead "L946 and L933" stays (W8): the bullet "the source row stays in place with its gray drag highlight" and the paragraph "While a node is being dragged, its row displays a subtle gray background. The highlight clears when the drag ends." differ in "stays in place", "subtle", and the clearing of the highlight.
- Done on 2026-11-21: R12. It merged the §14 sentence "The final node contains the remainder of the original text." into "The remaining original text is moved to the final resulting node." of the same section (recorded differences under W8: "contains" against "is moved to", "final node" against "final resulting node", "remainder" against "remaining"; same subject, destination, and condition, judged identical), and held the §12 sentence "Existing attachment format and decoded-image limits still apply to images within this byte limit." verbatim (Owner Question Log entry 10). The leads of §12 stay (W8): "When a valid HTTP or HTTPS URL is pasted" and "Only `http` and `https` URLs are hyperlinks" differ, because the second adds that invalid URLs and other schemes are ordinary text; the 25 MiB statements of §12, §15.1, and §24.2 have different conditions. The malformed-break-tag sentence of §12 states a user-observable robustness requirement and is not process content; it stays verbatim (W1). "Into the existing node" in §14 names the node being edited and stays.
- Selected coding tool: Claude Code. The owner's model routing names Anthropic models (§9).
- Delegated decision areas after approval: wording of present-state statements; file placement inside the approved structure; merging of statements whose meaning is identical; removal of approval attributions and pure history notes (rule W5 in §7.1).
- Reserved for the owner: every Q9 candidate; every statement held under rule W7(c); every suspected inconsistency in §12; every move of a detail to tests only; any new, retired, or retitled section beyond those listed in §11.

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
| Positional references ("the rules above") whose target lands in another file under §5 | 1 found (L1785) |

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
6. A section is its number together with all its numbered subsections, in whatever files they are stored. The index states this. A phrase such as "in this section" in §20.2.2 (L1498) therefore keeps its meaning, all of §20.2, although three files hold parts of §20.2; T1 leaves it unchanged.

Residual risk: the index becomes the only map from number to file. T1 adds a `check:docs` rule that fails when the index and the headings under `docs/product/` disagree.

### 6.3 Tooling changes in T1

1. `check-requirement-coverage.mts` reads every `docs/product/*.md`, scans each file separately, and orders the merged sections by numeric ID before applying the existing parent, duplicate, exemption, and boundary rules. Messages keep the form `PRODUCT.md §N`.
2. `check-docs.mts` adds `docs/product/*.md` to the live documents, applies the block and section limits to each file, and exempts those files from the quantity-restatement check.
3. `check-docs.mts` rejects text before the first numbered heading of a specification file, other than its title, so no requirement can sit outside a numbered section.
4. `check-docs.mts` checks the index against the files (§6.2). The index maps section numbers to files and lists no titles. Retitling a heading therefore does not touch the index; adding or retiring a number does.
5. `--verbatim` reads the whole specification. Without `--file`, each side is the index `docs/PRODUCT.md` plus every `docs/product/*.md` that exists on that side; at a base commit before the split, the "before" side is the single old file. `--file <path>` narrows both sides to that one file. This replaces the current default, which reads only `docs/PRODUCT.md` and after the split would compare only the index. Required test: with the index unchanged, removing one requirement clause from `docs/product/vim.md` makes the default form exit 1. `docs/DEVELOPMENT.md` §12 documents the inputs of both forms.
6. The clause comparison of `--verbatim` ignores order by design (`docs/DEVELOPMENT.md` §12), so it cannot prove a mechanical split. T1 adds an ordered per-section comparison: for every numbered section, the lines from its heading to the next numbered heading equal, in the same order, the same range of `docs/PRODUCT.md` at the base commit. The comparison ignores the blank lines and `---` separators that end any section and reports every other difference, including every interior line.
7. `docs/DEVELOPMENT.md` §9 and §12 describe the changed checks. `docs/AGENT_WORKFLOW.md` §11 names the directory in its document list. `AGENTS.md` needs no change.
8. The seven anchor links into the specification are retargeted by hand to the new files.
9. The three outgoing links get their new relative paths: `../SECURITY.md` and `../VIM_CONFORMANCE.md` in `overview.md`, `../../src/web/README.md` in `browser.md`. Both comparisons report them, because a link target is part of its clause and of its line.
10. One positional reference crosses a file boundary after the split. §20.2.26 (L1785) says that four commands copy content to the system clipboard "under the rules above". Those rules are §20.2.22, which covers all four commands: character-wise Visual `y` (L1733), Normal `yy` (L1734–1735), `dd` (L1736), and whole-node Visual `y` (L1737–1738). The planning session read both sections. §20.2.26 moves to `search.md` and §20.2.22 stays in `vim.md`, so T1 replaces exactly "under the rules above" with "under the rules of §20.2.22".
11. T1 checks every other positional reference against the file layout: each antecedent phrase that the verbatim report lists, and each "above", "below", "preceding", "following", or "this section" that addresses text by position. The planning session searched these phrases and found no other reference whose target lands in a different file. If T1 finds one, it stops and reports it; it does not reword it.
12. The three link targets of item 9 and the one replacement of item 10 are the only permitted text differences in T1. The T1 evidence lists these four as the complete set of differences.

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
- **W9. Literals.** Every number, key name, UI string, and code span survives, or its removal is a recorded Merged or Moved disposition. A UI string is not always marked: the command registry of §20.2.30 gives labels as plain text in table cells. For tables the rule is by cell:
  - A cell that holds exact interface text keeps its text exactly. In the registry these are `Description` and `Active state`. The same holds for a cell that holds a name, an alias, a shortcut, or a value.
  - A cell that explains behavior, such as `Effect` in the registry, may be Reworded. The rewording must keep the commands, the values, the conditions, the exceptions, and the meaning of every reference (W12).
  - Every changed cell appears in the T2 report and gets a disposition in the statement map.
  - A literal that an approved retitle removes from a heading may take the disposition **Retitled heading** under decision D1 (§3): the number stays, the heading set no separate requirement, and the body still states the literal with its meaning. The task checks the references to the old heading title.
  - The index row that R01a extends by the number 9.4 follows decision D3 (§3). The index changes of R01c, which retires §1.4.1, follow decision D5 (§3).
- **W10. Structure.** Unnumbered headings stay inside their numbered section. Hard-wrapped paragraphs may be unwrapped. The 700-character and 8,000-character limits apply.
- **W11. Order.** Keep the order of statements wherever order carries meaning: the priority order of §1.1, numbered or lettered rule lists, steps, precedence lists, and any text that another sentence addresses by position ("rule 2", "the rule above"). Record every reordering in the statement map with its reason. The verbatim report does not detect reordering.
- **W12. Citation scope.** Keep the scope of a cross-reference. A task may narrow a citation only when the verifier shows that the new target covers every condition of the old rule, including its exceptions.
- **W13. Process content without an approved destination.** A task edits only the files in its row of §8. Process content whose destination the owner has not approved stays verbatim and goes to the Owner Question Log (section 16 of this plan).
- **W14. A merged rule keeps one full statement.** The Merge Ledger (section 17 of this plan) has one row for every merge between sections with different numbers, including two subsections of one section, and each row names the location where the full rule remains. Before rewriting a section, read the rows whose survivor is in that section. A survivor may be reworded with equal meaning. It may be replaced by a citation only when the same task moves the survivor role to another location that states the rule in full and updates the ledger row. A citation never points to another citation of the same rule.

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

> Tree and Agenda invoke the same named view commands as the command panel (§20.2.28), without additional shortcuts. Selecting the already open view does nothing. Switching views finishes buffered editing; the origin and the caret follow §23. These commands do nothing while no renderer is available or while its main frame is loading. The native Tree, Agenda, Export Notes… and Import Notes… items have text labels and show macOS symbols for connected nodes, a calendar, export and import. Other native items have the standard text and check-mark presentation.

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
| 11 | Switching views preserves the existing origin and caret behavior (§23) | Reworded | W7(a) and W12: only the word "existing" goes; the citation keeps its scope, all of §23. §23.1 L2377 defines the ordinary return. §23.7 L2478 defines the return location and the cursor when the originating parent or selection no longer exists. A citation of §23.1 alone would drop that case. |
| 12 | Native Tree, Agenda, export, and import items have labels and the four symbols | Reworded | "retain" becomes "have"; all four symbols listed |
| 13 | Other native items have the standard presentation | Reworded | "retain their" becomes "have the" |

Result: 13 statements; none lost, none changed, five merged with a cited survivor, none moved. A merge is valid only while the survivor exists, so the verifier of a later task that rewrites §16.1 must find statements 3–6 there.

Correction kept as a calibration case: the first version of this sample narrowed the citation of statement 11 to §23.1 and recorded the change as equivalent. A reviewer found that this lost the rule of §23.7. A narrower citation looks like a clarification and is a change; W12 exists because of this error.

### 7.3 Verification for each rewrite task

1. **Base.** Record the starting commit. Run `npm run check:requirements` and record the requirement count.
2. **Rewrite.** Apply §7.1 to the task's sections only.
3. **Clause inventory and T2 report.** Run `npm run check:docs -- --verbatim <base>` in its default form, which compares the whole specification (§6.3 item 5), so a clause moved to another file is reported as moved and not as lost. The command exits 1 for a rewrite; that is expected. Its report is the complete list of removed, added, and moved clauses. Then run the comparison mode that T2 adds, `npm run check:docs -- --details <base>`, against the same base; its default form also reads the whole specification. It exits 1 when it lists a removed, added, changed, or retargeted item. Its report has three classes: literals (numbers with their units, code spans, bold UI labels), every changed table cell with its column header, and section references. Save both reports in `.scratch/product-spec-<task>/`.
4. **Statement map.** In `.scratch/product-spec-<task>/`, give every removed clause a disposition under W2 and every added clause its source clauses. For Merged and Moved, name the surviving location. Give every item of the `--details` report a disposition, in each of its three classes; this explicitly includes every moved literal, moved row, and moved reference. A moved item shows only that an equal item left one section and appeared in another, so it is accepted only when the statement map shows the moved or merged clause that carries it. Dispositions: Merged or Moved for a literal, or Retitled heading under decision D1 (§3); for a table cell, Merged, Moved, or, for an explanatory cell only, Reworded with the five kept points of W9 named; for a section reference, the row of §8 that adds or retires the number, the Merge Ledger row of the merge that created the reference (decision D2), or the W12 evidence for a changed target. For R01a, the added literal, the removed row, and the added row of the index row of `application.md` take the disposition of decision D3 when the comparison confirms that the path, the order, and the other numbers are unchanged. For R01c, the items of the Section Map row of `browser.md` and of the Retired Numbers table take the disposition of decision D5 when the actual table changes meet its conditions.
5. **Question log and merge ledger.** Write the task's entries into this plan before validation and review, so the reviewer sees what the commit will contain. Copy into the Owner Question Log (section 16) every held sentence (W7(c), W13), every confirmed finding of §12, and every Q9 candidate the task verified. Each entry quotes the text and names its location, so it stays usable after the scratch directory is gone. Add to the Merge Ledger (section 17) every merge between sections with different numbers, including two subsections of one section, with the location where the full rule remains. Update the rows whose survivor the task reworded or moved.
6. **Validation.** Minimal Risk tier: `npm run format:check:changed`, `npm run check:docs`, `npm run check:requirements`, and `npm run check:opencode` when agent workflow documents change. A task that edits a marker line in a test file is Low Risk: also run lint and the focused tests for the touched files. Record the commands and results; this record is an input of the reviewer (`docs/AGENT_ROLES.md` §3).
7. **Independent verifier.** After validation, a reviewer in a fresh context receives the Git status, the full Git diff (old text on the removed side, new text on the added side; the diff includes the new log entries and ledger rows of this plan), the validation record, the rules of §7.1, the T2 report, the existing Merge Ledger rows for the changed sections, and read access to the new files. It does not receive the statement map. It produces its own statement-level table with the classes lost, changed, merged, moved, added, reordered. It audits literals and table cells under W9, confirms each moved item of the `--details` report against a moved or merged clause of the verbatim report, audits order under W11, citation scope under W12, and merge survivors under W14. It checks that the new log entries and ledger rows match the diff. The implementer saves the verifier's table unchanged in the task's scratch directory. For R01a and any task for which the owner directs it (§3), the verifier receives the statement map only after it has written its own table, and then reports every difference between the two.
8. **Reconcile.** The implementer compares the verifier's table with the map. Every lost, changed, added, or unrecorded reordered entry is corrected or becomes an owner question with the sentence held verbatim. If a correction changes the text, the log entries, or the ledger rows, update them and rerun the checks that the change invalidates. Repeat the verifier pass only when corrections are substantial (`AGENTS.md` §13).
9. **Commit** the rewrite with the plan status update, the log entries, and the ledger rows that the reviewer saw or that step 8 updated.
10. **Cleanup.** Remove the task's scratch directory after the commit. Exception: R09 kept its statement map, the verifier's table, and the T2 report in `.scratch/product-spec-R09/` until the owner decided the pilot checkpoint; the R01a session, which recorded that decision, removes the directory after its commit. Exception for R01c (owner instruction of 2026-11-20, §3): the transfer table of §1.4.1 and the reviewer's original table stay in `.scratch/product-spec-R01c/` until the owner accepts R01c; the session that records that acceptance removes the directory.

### 7.4 Evidence that counts as "no behavior change"

All eight conditions hold:

- **E1.** The diff touches only the files in the task's row of §8, and in each file only the kind of change the row names. Under `src/`, `e2e/`, `perf/`, and `scripts/` the permitted changes are: the marker lines the row names; the tooling files of T1 and T2; the one `BOUNDARY_SECTIONS` entry of R01a; and link targets in `src/web/README.md` where the row names them (T1, R01b, R01c). No production code, test assertion, or test title changes in any task.
- **E2.** The statement map covers every removed and every added clause of the verbatim report, with no clause unassigned.
- **E3.** The independent verifier's table has no unresolved lost, changed, or added entry.
- **E4.** The requirement count is unchanged, or each difference is a section addition or retirement named in §8.
- **E5.** The T2 report (`--details`) shows no removed, added, changed, retargeted, or moved item in any of its three classes without a recorded disposition (§7.3 step 4); a moved item's disposition names the clause that moved or merged. No cell of exact interface text, name, alias, shortcut, or value has changed. A changed explanatory cell is Reworded with its commands, values, conditions, exceptions, and reference meaning kept, and the verifier confirms it. A new section reference that a row of §8 names, such as §9.4 in R01a, is covered by that row. A new reference to an existing section that a merge creates is covered by the Merge Ledger row of that merge, and the verifier confirms that the referenced location states the full rule with all its conditions and exceptions (decision D2, §3). A literal removed from a heading by an approved retitle is covered by the disposition Retitled heading when the three conditions of decision D1 hold. In R01a, the change of the index row of `application.md` is covered by decision D3. In R01c, the changes of the Section Map and the Retired Numbers table are covered by decision D5, checked against the actual tables.
- **E6.** The checks of step 6 pass, including after the last correction.
- **E7.** Order is preserved wherever W11 applies, or each reordering is recorded in the map and confirmed by the verifier.
- **E8.** Every merge of the task between sections with different numbers has a Merge Ledger row that names the location of the full rule, and every existing row whose survivor is in a changed section still names a location that states the rule in full (W14). The reviewer saw these rows, or step 8 updated them and the affected checks ran again.

For T1, the evidence is stricter:

- The ordered per-section comparison of §6.3 item 6 reports exactly four differing lines: the three outgoing links of §6.3 item 9 and the line of §6.3 item 10 (L1785). It reports no other difference in content or order.
- The default verbatim comparison against the pre-split commit (§6.3 item 5) reports zero removed headings and zero moved clauses. Its removed and added clauses are those same four changes, plus added clauses from the index and the file titles.
- The control test of §6.3 item 5 passes: a clause removed from `docs/product/vim.md` with an unchanged index gives exit code 1.
- The positional-reference check of §6.3 item 11 found no further crossing.
- Every numbered heading of the base document, including §20.2, exists in exactly one file.
- Under `src/`, the diff changes only `src/web/README.md`, and there only the targets of its five anchor links into the specification (L57, L64, L94, L126, L136 at the base commit). Every other line of that file and every other file under `src/` is unchanged.
- The diff changes nothing under `e2e/` or `perf/`. Under `scripts/` it changes only the tooling files and tests in the T1 row.
- The requirement count stays 126.

These conditions prove that the text keeps its statements. They do not prove that the old text matched the implementation; that question is outside this initiative.

## 8. Tasks

Working-task count: 39 after the three merges of Q12: T1, T2, 35 rewrite tasks, F1, F2. Final owner acceptance under `AGENTS.md` §8 applies. Step P0 is administrative and is not counted.

A task edits only the files in its row. Where a row names a file with a condition ("only for a Q7 move"), the file changes only under that condition.

Evidence sets: **S** = T1 evidence of §7.4; **R** = E1–E8 of §7.4. Tiers follow `docs/DEVELOPMENT.md` §9. All specification files are under `docs/product/`. Every task, including T1, T2, F1, and F2, also updates this plan and `plans/README.md` in its commit with its status and the next task (`docs/AGENT_WORKFLOW.md` §12); these two files belong to every row. Routing: implementer / verifier (§9).

| ID | Outcome | Depends on | Files | Tier | Routing | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Record the owner's answers to §11 in this plan. Update every affected task row, file list, evidence condition, and the next-session prompt to match the answers. No other file changes. | Owner approval of the plan and answers to §11 | `plans/product-spec-refactoring.md`, `plans/README.md` | Minimal | Primary session, any model / none | Each answer is recorded in §11; each affected row cites the answer it follows; `npm run check:docs` passes | Done |
| T1 | Mechanical split into the files of §5, index, tooling of §6.3, seven incoming anchor links, three outgoing link paths, one positional reference (§6.3 item 10). No other text change and no reordering. | P0; owner authorization of 2026-11-20 | `docs/PRODUCT.md`, `docs/product/*.md`, `scripts/product-sections.mts`, `scripts/check-requirement-coverage.mts`, `scripts/check-docs.mts`, their tests, `docs/DEVELOPMENT.md`, `docs/AGENT_WORKFLOW.md`, `docs/SECURITY.md`, `src/web/README.md`, `docs/decisions/0024-desktop-notes-archive.md` | Low (`npm run check`) | Sonnet medium / Opus high | S | Done |
| T2 | Comparison report for rewrite verification as a `check:docs` mode, with tests (Q10). It reports three classes separately: literals (numbers with their units, code spans, bold UI labels); every changed table cell, with its column header and its old and new text; and section references. The tool shows cell changes and does not judge them; W9 and E5 say which are allowed. Every rewrite task uses its report (§7.3 step 3). | T1; owner authorization of 2026-11-20 | `scripts/check-docs.mts`, `scripts/check-docs.test.mts`, `docs/DEVELOPMENT.md` | Low (`npm run check`) | Opus high / Opus high | Tool tests pass, including these cases on the §20.2.30 registry. `find`: a change of the `Description` cell "Find in the current view" is reported with its column. `show-agenda`: a rewording of the `Effect` cell is reported with its column, while the unchanged `Description` "Show Agenda" and `Active state` "Agenda open" are not reported; a change of "Agenda open" is reported; the reference to §23 in the `Effect` cell appears in the reference class when it changes. Also: a changed numeric value is reported; an added, removed, or retargeted section reference is reported. The report on the §7.2 sample lists no unexplained item. | Done |
| R09 | Pilot: rewrite §9 and retitle its heading (Q3). Owner checkpoint follows (Q13): the work stops after this task. | T1, T2; owner authorization of 2026-11-20 | `application.md` | Minimal | Opus high / Fable high | R; the statement map, the verifier's table, and the T2 report stay available until the owner's pilot decision (§7.3 step 10) | Done |
| R01a | Rewrite §1, §1.1–§1.3. Create §9.4 About Tree as the single owner of the dialog (Q4) and add it to the index. §1.1 order and §1.2 rules unchanged. | R09 and the owner's pilot decision of 2026-11-20 (§3) | `overview.md`, `application.md`, `browser.md`; `docs/PRODUCT.md` (index entry for §9.4: only the number 9.4 is added to the `application.md` row, decision D3); `scripts/check-requirement-coverage.mts` (add `'9.4'` to `BOUNDARY_SECTIONS`, no other line); marker lines on tests that exercise only the About dialog: `e2e/electron/about-window.spec.ts:14` from §1.3 to §9.4, and any §1.4 marker of that kind, each listed in the task evidence | Low (`npm run check`) | Opus high, in the primary session that recorded the pilot decision / Fable high; the verifier receives the statement map only after its own table (§3) | R; §9.4 has an `e2e/` marker; the script diff is the one list entry; the index check passes; the requirement count rises by one, for §9.4 | Done |
| R01b | Rewrite §1.4 and §1.5 as browser behavior and retitle §1.4 (Q3). Update both references to the old §1.4 heading. | R01a; owner authorization of 2026-11-20 (§3) | `browser.md`; the two anchor targets that name the §1.4 heading: `docs/SECURITY.md` L214 and `src/web/README.md` L136 (line numbers at `396e094`) | Minimal | Fable high, in a new primary session / Fable high; the verifier does not receive the statement map; the implementer compares the verifier's table with its map (§3) | R; D1 for the literals that the retitle removes from the heading; both old-heading references updated and checked | Done |
| R01c | Move release and process content of §1.4, §1.4.1, §1.5 to its owners (Q5). Retire §1.4.1. Apply decisions D6 and D7 (§3) to §1.4. | R01b; owner authorization of 2026-11-20 (§3) | `browser.md`, `docs/PRODUCT.md` (Section Map, Retired Numbers, and the sentence "No number is retired." under decision D5), `docs/releasing.md`, `docs/SECURITY.md`, `docs/DEVELOPMENT.md`, `deployment/github-pages/README.md`, `src/web/README.md`, four marker lines in `scripts/release-source.test.mts` and `scripts/web-release/*.test.mts` | Low | The primary session that recorded the owner's decision of 2026-11-20 (Fable; the earlier plan named Opus high) / Fable high; the verifier writes its own table, and the implementer compares it with its map (§3) | R; per-sentence table "already stated at / moved to" for L169–210, naming for every sentence of §1.4.1 the exact location of the full rule; D5: only `1.4.1` leaves the `browser.md` row of the Section Map, with path, other numbers, and order kept; one Retired Numbers row for 1.4.1 that links every Q5 destination document; "No number is retired." removed; the actual table changes checked; D6 and D7 applied to §1.4; the transfer table and the reviewer's original table kept in `.scratch/product-spec-R01c/` until the owner's acceptance (§7.3 step 10) | Done; accepted 2026-11-21 |
| R02 | Rewrite §2. | R01c | `tree-model.md` | Minimal | Opus high / Opus high | R | Done |
| R03 | Rewrite §3, §18, and §19 (merged under Q12; 48 lines). | R02 | `tree-model.md` | Minimal | Opus high / Opus high | R | Done |
| R04 | Rewrite §4. | R03 | `editing.md` | Minimal | Opus high / Opus high | R | Done |
| R05 | Rewrite §5. | R04 | `editing.md` | Minimal | Opus high / Opus high | R | Done; no text change |
| R06 | Rewrite §6 and §7 (merged under Q12; 111 lines). The §6.1 bullet "`↑` moves the caret to the beginning of the parent's text" duplicates §4.1, which is the survivor of that merge (§3, R04 note). | R05 | `editing.md` | Minimal | Opus high / Opus high | R | Done |
| R08 | Rewrite §8. The §8.2 sentence "Empty nodes are never deleted automatically." repeats §19; a merge names §19 as the survivor, not §3, which is a citation since R03. | R06 | `editing.md` | Minimal | Opus high / Opus high | R | Done |
| R10 | Rewrite §10. | R08 | `editing.md` | Minimal | Opus high / Opus high | R | Done |
| R11 | Rewrite §11. | R10 | `editing.md` | Minimal | Opus high / Opus high | R | Done |
| R12 | Rewrite §12 and §14 (merged under Q12; 71 lines). | R11 | `clipboard-and-paste.md` | Minimal | Opus high / Opus high | R | Done |
| R13 | Rewrite §13. | R12 | `clipboard-and-paste.md` | Minimal | Opus high / Opus high | R | Planned |
| R15 | Rewrite §15. | R13 | `images.md`; `docs/DEVELOPMENT.md` only for a Q7 move (L1192–1193) | Minimal | Opus high / Opus high | R | Planned |
| R16 | Rewrite §16. | R15 | `persistence.md` | Minimal | Opus high / Opus high | R; statements 3–6 of §7.2 still present | Planned |
| R17 | Rewrite §17. | R16 | `images.md` | Minimal | Opus high / Opus high | R | Planned |
| R20a | Rewrite §20 own text, §20.1, §20.3, §20.4, §20.6, §20.7. | R17 | `interaction.md`; `docs/DEVELOPMENT.md` only for a Q7 move (L1469) | Minimal | Opus high / Opus high | R | Planned |
| R20b | Rewrite §20.5 and §20.8. | R20a | `interaction.md` | Minimal | Opus high / Opus high | R | Planned |
| R20c | Rewrite §20.2.1–§20.2.6, §20.2.8, §20.2.27. | R20b | `vim.md` | Minimal | Opus high / Opus high | R; rows M12 and M20 of `docs/VIM_CONFORMANCE.md` stay open | Planned |
| R20d | Rewrite §20.2.9. | R20c | `vim.md` | Minimal | Opus high / Opus high | R | Planned |
| R20e | Rewrite §20.2.10, 11, 16, 17, 18. Lead from R05: the `o` placement rule and the empty-leaf rule are stated in §5.1 (`editing.md`) and again in §20.2.10 (`vim.md`); §5.1 is the survivor of any merge. §20.2.10 keeps in full what only it states: the current-parent-heading case of `o`, Insert-mode entry, `O`, and its "visible outline" reason. Record the W8 details "displayed location" against "current location" and "otherwise" against "a collapsed node or a leaf". | R20d | `vim.md` | Minimal | Opus high / Opus high | R | Planned |
| R20f | Rewrite §20.2.12, 13, 21, 22. Lead from R06: §7.1 (`editing.md`) "In Vim Normal mode, `Ctrl+o` performs the same one-level navigation." and §20.2.12 "`Ctrl+o` to go back one parent level, with the same behavior as `Cmd+,`." state the same alias; §7.1 owns the navigation rule itself. | R20e | `vim.md` | Minimal | Opus high / Opus high | R | Planned |
| R20g | Rewrite §20.2.14, 15, 20, 23, 24, 25, then 19. | R20f | `vim.md` | Minimal | Opus high / Opus high | R | Planned |
| R20h | Rewrite §20.2.26. | R20g | `search.md` | Minimal | Opus high / Opus high | R | Planned |
| R20i | Rewrite §20.2.7, 28, 29, 30. Re-point the `Effect` cell of the `about-tree` registry row from "(§1.3, §1.4)" to §9.4 (left by R01a; see the note below this table). | R20h | `command-panel.md` | Minimal | Opus high / Opus high | R | Planned |
| R20j | Rewrite §20.9–§20.13. | R20i | `completion-and-tags.md`; `docs/DEVELOPMENT.md` only for a Q7 move (L2180, L2241) | Minimal | Opus high / Opus high | R | Planned |
| R20k | Rewrite §20.14. Afterwards the session sends the owner the round-3 summary of open log entries (§3, §10). | R20j | `search.md`; `docs/DEVELOPMENT.md` only for a Q7 move (L2284) | Minimal | Opus high / Opus high | R | Planned |
| R21 | Rewrite §21. | R20k | `application.md` | Minimal | Opus high / Opus high | R | Planned |
| R22 | Rewrite §22. Move procedure sentences to their owners (Q6); §22.1 and §22.2 keep their numbers. | R21 | `non-functional.md`, `docs/AGENT_WORKFLOW.md`, `docs/DEVELOPMENT.md` | Minimal, plus `npm run check:opencode` | Opus high / Opus high | R; `docs/ARCHITECTURE.md` and `AGENTS.md` citations of §22 still resolve to the cited content | Planned |
| R23a | Rewrite §23.1–§23.6. | R22 | `agenda.md` | Minimal | Opus high / Opus high | R | Planned |
| R23b | Rewrite §23.7–§23.15. | R23a | `agenda.md` | Minimal | Opus high / Opus high | R | Planned |
| R24 | Rewrite §24. | R23b | `browser.md` | Minimal | Opus high / Opus high | R | Planned |
| R25 | Rewrite §25. | R24 | `desktop-data.md` | Minimal | Opus high / Opus high | R | Planned |
| R26 | Rewrite §26. Afterwards the session sends the owner the round-4 summary of open log entries and confirmed Q9 candidates (§3, §10). | R25 | `application.md`; `docs/DEVELOPMENT.md` only for a Q7 move (L2811–2813) | Minimal | Opus high / Opus high | R | Planned |
| F1 | Apply only the owner's answers that keep implemented behavior. A held sentence (W7(c)) or a §12 finding is resolved by stating what the application already does, and the resolution cites a test or source location as evidence. An answer that would change behavior is not applied here: it is recorded as a separate product task outside this initiative, and both original statements stay. Also apply approved moves to tests (Q9). Skipped parts are recorded. Apply decision D4 (§3) as one change: fix the user-interface check rule in `docs/AGENT_WORKFLOW.md` §13, update its citations in `AGENTS.md` and `docs/AGENT_WORKFLOW.md`, refine the §1.3 reason in `EXEMPTIONS` if necessary, and remove the last paragraph of §1.3 while §1.3 keeps the guideline requirement and the precedence rule for recorded deliberate differences. Apply decision D8 (§3): clarify in §24.7 that Update App appears directly above About Tree, which ends the menu, and remove "below statuses" from §1.4, citing the evidence that D8 names. Entries that are still unanswered stay open and appear in the final report. | R26; the owner answers given by then (§3) | Files named by the answers; for D4: `overview.md`, `docs/AGENT_WORKFLOW.md`, `AGENTS.md`, and `scripts/check-requirement-coverage.mts` (the §1.3 `EXEMPTIONS` reason only); for D8: `browser.md` | By content; D4 is Low, plus `npm run check:opencode` | Opus high / Opus high | R per changed section; each resolution cites its implementation evidence; no production code and no test assertion changes | Planned |
| F2 | Final sweep: phrase search for remaining history-relative wording, index and retired-number table, every citation and anchor in the repository resolves, every Merge Ledger row checked against the final text, acceptance package. Re-point `docs/DEVELOPMENT.md` L40 ("specified in PRODUCT §1.3–§1.4") to §9.4 (left by R01a). The citation sweep also finds references without the `§` sign, such as "(see 8.2)" in §19 and "(see 8.2–8.3)" in §8.1, which the `--details` reference class does not detect. After the F2 commit the session sends the owner one final report (§3). | F1 | `docs/PRODUCT.md`, `docs/product/*.md`, citing documents | Minimal | Opus high / Opus high | Citation check listed per citing file; for each Merge Ledger row, the survivor location quoted from the final text and compared with the original phrase; R for changed text | Planned |

Dependencies between rewrite tasks are an order, not a technical constraint, with three exceptions: every rewrite needs T1 and T2; no rewrite after R09 starts before the owner's pilot decision; and a merge keeps its survivor (§7.2).

Marker edits in total: the About-dialog markers of R01a (two: `e2e/electron/about-window.spec.ts:14` from §1.3 and `e2e/web/menu-focus.spec.mts:6` from §1.4, both to §9.4), four in R01c, and those the owner approves in F1. No other task edits a marker.

Citations that R01a leaves for later tasks, because their files are outside its row: the `Effect` cell of the `about-tree` registry row in `docs/product/command-panel.md` §20.2.30 cites "(§1.3, §1.4)" for opening About, and `docs/DEVELOPMENT.md` L40 says the About dialog is "specified in PRODUCT §1.3–§1.4". Both still resolve, because §1.3 and §1.4 cite §9.4. R20i re-points the registry cell to §9.4 as a Reworded explanatory cell (W9, W12); F2 re-points the `docs/DEVELOPMENT.md` citation. The mid-test marker `e2e/web/menu.spec.mts:68` stays §1.4: the test also asserts the menu position of About Tree, which §1.4 keeps.

Q7 is accepted. It names six sentences in five tasks. Each task decides sentence by sentence whether the text is a user-visible commitment that stays or a measurement method or guard obligation that moves to `docs/DEVELOPMENT.md` §12. Process content that no accepted question covers follows W13.

## 9. Model Routing and Roles

| Function | Role in `docs/AGENT_ROLES.md` | Model and effort | How it is selected |
| --- | --- | --- | --- |
Routing for R02 to F2, owner decision of 2026-11-21 (§3):

| Function | Role in `docs/AGENT_ROLES.md` | Model and effort | How it is selected |
| --- | --- | --- | --- |
| Implementer, every remaining task | Primary (§1) | Opus, high | The owner selects Opus for the session with `/model` and sets high effort in the client. |
| Independent verifier, every remaining task | Reviewer (§3), fresh context | Opus, high | The primary launches the configured `reviewer` subagent without a model override; its adapter default is `claude-opus-5-5`, high effort. |

Routing used for T1 to R01c, kept as the record of those tasks:

| Function | Role in `docs/AGENT_ROLES.md` | Model and effort | How it is selected |
| --- | --- | --- | --- |
| T1 implementer | Primary (§1) | Sonnet, medium | `.claude/settings.json` already pins `sonnet` for a new session. The owner sets medium effort in the client. |
| Implementer, high-risk section | Primary (§1) | Fable, high | The owner selects the model for that session with `/model`. |
| Implementer, other section | Primary (§1) | Opus, high | The owner selects the model for that session with `/model`. |
| Independent verifier | Reviewer (§3), fresh context | Fable, high; Opus, high for the low-risk tasks R03, R06, R12 | The primary launches the configured `reviewer` subagent. Its adapter default is `claude-opus-5-5`, high effort. For a Fable pass the primary passes a per-invocation model override. |

High-risk sections, from the owner's list and the inventory: §1.4, §2, §5, §8, §15, §16, §20.2, §20.5, §20.8, §20.9–§20.14, §23, §24, §25. The risk class no longer selects the model; it still guides how closely the implementer and the reviewer read a section.

The verifier is never the session that wrote the rewrite: it is a separate reviewer context that receives the diff and the rules, and not the implementer's map.

Adapter configuration: no change is needed. `.claude/agents/reviewer.md` keeps `claude-opus-5-5`, which is the model of every remaining review. `docs/AGENT_ROLES.md` §6 keeps listing Opus as the reviewer default. The effort setting for a primary session is a client setting; this repository does not configure it, and this plan has not verified the client mechanism.

## 10. Owner Involvement and Budget

No task needs a manual application check: the initiative changes no runtime behavior.

| Round | When | Owner action | State |
| --- | --- | --- | --- |
| 1 | 2026-11-20 | Plan accepted; Q1–Q8 and Q10–Q13 answered; P0 done; T1, T2, and R09 authorized | Done |
| 2 | After R09 | Pilot checkpoint. The owner receives five deliverables: the rewritten §9; the statement map of old and new requirements; the independent reviewer's table; the T2 report; and the measured cost of the pilot (T1, T2, R09: total tokens per agent, tool calls, elapsed time). The first four stay in `.scratch/product-spec-R09/` until the decision. The owner then decides about R01a | Done 2026-11-20: the rewritten §9 is accepted; decisions D1–D3 recorded (§3); R01a only is authorized |
| 2a | After R01a | Decide about R01b | Done 2026-11-20: R01a accepted; D4 and D5 recorded (§3); R01b only is authorized |
| 2b | After R01b | Decide about R01c; answer Owner Question Log entries 4, 5, and 6 (§16) | Done 2026-11-20: R01b accepted; D6, D7, and D8 recorded (§3); R01c only is authorized |
| 2c | After R01c | Accept R01c, with the transfer table of §1.4.1 and the reviewer's original table kept in `.scratch/product-spec-R01c/`; decide about R02 | Done 2026-11-21: R01c accepted; R02 to F2 authorized on Opus, high effort (§3) |
| 3 | After R20k | The session sends one summary of the open entries of the Owner Question Log. The owner answers when ready; the work does not wait | Confirmed |
| 4 | After R26 | The session sends one summary of the remaining open entries and of each confirmed Q9 candidate. The owner answers when ready; the work does not wait | Confirmed |
| 5 | After F2 | One final report: the result, the remaining questions, and the request for final acceptance of the delivered specification | Confirmed |
| + | Any time | A rejected acceptance; a blocking product choice; a needed access; an exhausted budget; a mandatory check that still fails after the recovery attempts | Possible |

No per-task acceptance applies to R02 to F2; the owner does not confirm individual commits. A held sentence does not block its task: the sentence stays verbatim and the task completes. F1 applies only the answers given by then; an unanswered entry stays open and appears in the final report.

Budget:

- Execution: 39 primary sessions, one task each. The count was 43 before the three merges of Q12. From R02 on, one primary session may commit up to four tasks (§3); the ceiling below still counts sessions.
- Recovery: at most two correction cycles per task after verifier findings; then escalate. Reserve: 8 sessions, about 20% of the execution budget.
- Closure allowance: 1 session after final acceptance.
- Ceiling: 48 sessions (39 + 8 + 1). Reaching it requires an owner decision before further work.
- Token cost is not estimated here. T1, T2, and R09 record their measured usage in the table below, and round 2 revises the budget from those numbers.

Measured cost of the pilot (total tokens per agent, measured by the coordinating session from the harness, which does not split input and output):

| Agent | Model and effort | Tokens | Tool calls | Elapsed time |
| --- | --- | --- | --- | --- |
| T1 implementer | Sonnet, medium | about 464,000 | 207 | about 22 minutes, including the correction round |
| T1 reviewer | Opus, high | about 127,000 | 40 | about 3 minutes |
| T2 implementer | Opus, high | about 281,000 | 108 | about 25 minutes, including the correction round |
| T2 reviewer | Opus, high | about 94,000 | 29 | about 5 minutes |
| R09 implementer | Opus, high | about 181,000 | 52 | about 9 minutes, before the commit round |
| R09 verifier | Fable, high | about 101,000 | 23 | about 3 minutes |

The coordinating session's own usage is not measured by the harness and is not included.

Measured cost of R01a (the implementer was the primary session, so the harness reports no token count for it):

| Agent | Model and effort | Tokens | Tool calls | Elapsed time |
| --- | --- | --- | --- | --- |
| R01a implementer (primary session) | Opus; effort set in the client, not verified | Not available | about 115, counted by the session | about 30 minutes, including the plan update and the corrections after review |
| R01a verifier, first pass (own table) | Fable, high | 161,230 | 49 | about 8 minutes |
| R01a verifier, second pass (comparison with the map) | Fable, high | 168,851, a figure that includes the resumed context of the first pass | 1 | about 30 seconds |

Measured cost of R01b (the implementer was the primary session, so the harness reports no token count for it):

| Agent | Model and effort | Tokens | Tool calls | Elapsed time |
| --- | --- | --- | --- | --- |
| R01b implementer (primary session) | Fable; effort set in the client, not verified | Not available | about 100, counted by the session | about 25 minutes from the base commit to the R01b commit, including the plan update and the reconciliation; the session start was not measured |
| R01b verifier (own table, without the statement map) | Fable, high | 139,178 | 33 | 322 seconds |

The comparison of the verifier's table with the statement map (§7.3 step 8) ran in the primary session and is part of the implementer's figures.

Measured cost of R01c (the implementer was the same primary session as for R01b, so the harness reports no token count for it):

| Agent | Model and effort | Tokens | Tool calls | Elapsed time |
| --- | --- | --- | --- | --- |
| R01c implementer (primary session) | Fable; effort set in the client, not verified | Not available | about 110, counted by the session, including the plan commit that recorded the owner's decision | about 20 minutes from the owner's instruction to the R01c commit, including that plan commit and the reconciliation |
| R01c verifier (own tables, without the statement map and the transfer table) | Fable, high | 213,137 | 56 | 439 seconds |

Unresolved capabilities: none identified. `npm run check:docs` and `npm run check:requirements` ran in the planning session (52 live documents; 126 numbered requirements). The reviewer role's model override has not been exercised in this repository.

## 11. Owner Questions

Each question has a recommended default. The owner answered on 2026-11-20:

| Question | Owner answer |
| --- | --- |
| Q1 | Accepted: stable global numbers |
| Q2 | Accepted: the 16 files of §5 |
| Q3 | Accepted: a heading may be retitled; its number stays |
| Q4 | Accepted: §9.4 About Tree is the single owner of the dialog |
| Q5 | Accepted: the proposed owners; §1.4.1 is retired and four marker lines are deleted |
| Q6 | Accepted: commitments stay in §22.1; procedures move |
| Q7 | Accepted: decided sentence by sentence in the owning task |
| Q8 | Accepted: values, colors, and exact strings stay in the specification |
| Q9 | Deferred: the owner decides each confirmed candidate in round 4 |
| Q10 | Accepted: T2 is part of the plan and of every rewrite verification |
| Q11 | Accepted: the configured `reviewer` with a per-invocation Fable override |
| Q12 | Accepted: three merges, 39 tasks |
| Q13 | Accepted: owner checkpoint after R09 |

The question texts below are kept as the record of what was asked.

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
- **Q9. Candidates for "test only" (decided in round 4, not in round 1).** Round 1 decides only the policy of Q8. In round 4 the owner decides each candidate separately; the default for each is to keep it in the specification. A candidate is presented only when one test, carrying a marker for the same section, asserts the same UI element, the same property, the same value, and the same conditions as the phrase proposed for removal. "The same conditions" means that the test covers the whole scope of the sentence, not one case of it. The planning session checked the rows below against the specification and the tests at commit `396e094` for the element, the property, and the value. It applied the conditions point too loosely, as the 27px row showed, so every row is preliminary. No row is confirmed until the owning rewrite task has checked all four points against the text of that time and recorded the candidate in the Owner Question Log.

  | # | Section | Phrase proposed for removal | Test check | Match |
  | --- | --- | --- | --- | --- |
  | 1 | §2.1.1 | "Before hierarchy indentation, text begins 40px after its right edge." (L352–353) | `e2e/electron/line-numbers.spec.ts`, marker L119, assertion L201: on every numbered row in Tree and Agenda, the text start minus the right edge of the number column, minus depth times the indentation step, equals 40 | Excluded by R02: element, property, and value match, but the conditions do not. The sentence applies to every numbered row, with hierarchy indentation added after the 40px. The test seeds only top-level rows, so every measured row has depth 0. The value stays in the specification. |
  | 2 | §20.5 | "`#dddddd`" in "with a custom `#dddddd` background" (L2037) | `e2e/electron/gray-appearance.spec.ts`, marker L18, assertions L41–42: in Gray, the native window background is `#dddddd` and the document background is `rgb(221, 221, 221)` | Preliminary: element, property, and value match; the owning task confirms the conditions |
  | 3 | §20.5 | "(`#ffffff`)" in "a pure white (`#ffffff`) document and window background" (L2039) | Same file, marker L138, assertions L157–158, L182, L191: in White, the document, title bar, and native window backgrounds are white | Preliminary: element, property, and value match; the owning task confirms the conditions |
  | 4 | §20.13 | "Light foregrounds are `#76517d`, `#306b74`, and `#8a522e`; dark foregrounds are `#d3afd7`, `#8cd0d3`, and `#dfaf8f` respectively" (L2207–2209) | `e2e/electron/people-events.spec.ts`, marker L14, assertions L82–93: computed text color of tag, person, and event text, in light and dark, in Tree and Agenda; the six values as `rgb` | Preliminary: element, property, and value match; the owning task confirms the conditions |

  Not confirmed (owner decision of 2026-11-20); not a candidate unless R20b confirms all four points:
  - Context height "(25 px)" in "The context is the height of one single-line node (25 px)" (§20.8, L2070). `e2e/electron/scroll-selection.spec.ts`, marker L262, asserts at L274 that a row starts 25 below the content edge. The planning session did not read the geometry helper, so the element and the property are unverified, and the test covers one window size.

  Checked and excluded, because a point does not match:
  - Status-bar height "27px" in "the ordinary bar height stays 27px when they fit" (§20.2.7, L1542). The sentence covers every operation message that fits in one row, including save failures and browser messages. The test (`e2e/electron/summarize.spec.ts` L153) measures the height only during summarization in Electron: other conditions. The value stays in the specification.
  - Bullet size of 7px (§2.1, L278). The sentence states the size of the ordinary bullet. The test (`e2e/electron/node-gutter-alignment.spec.ts` L292–294) asserts the width of the selected-node marker and its centering within 0.5 px: another element.
  - `grabbing` cursor (§11, L933). The sentence says the cursor changes once drag mode activates. The test (`e2e/electron/drag-and-drop.spec.ts` L77, L84) finds `not-allowed` over the source row right after activation and `grabbing` only over a target: other conditions.
  - Date-like underline (§20.10, L2154). `src/renderer/styles.test.ts` L135–144 asserts stylesheet text, not a rendered element; the third color and Agenda are not asserted.
  - Search width of 960 px (§20.14, L2257). The test asserts one point of the width rule; the value cannot leave the sentence without the rest of the rule.

  Not proposed, although a test pins them: limits, counts, timers, and exact UI strings (for example the archive limits of §24.2, the three-attempt save lock, the wrap width, the update strings of §26). These are user-observable quantities or approved text, and `src/domain/AGENTS.md` names the specification as the owner of message text.

**Method and routing**

- **Q10. Literal comparison tool (T2).** Add it? It costs one session and catches a changed number, key, or string mechanically. Default: yes.
- **Q11. Verifier routing.** Use the configured `reviewer` role with a per-invocation Fable override, leaving the adapter default at Opus? Default: yes. Alternative: change `.claude/agents/reviewer.md` and the table in `docs/AGENT_ROLES.md` §6.
- **Q12. Small sections.** The plan follows "one top-level section per task and per session". Three merges would remove four sessions without mixing risk levels: R03 with R18 and R19 (48 lines, one file); R06 with R07 (111 lines, one file); R12 with R14 (71 lines, one file). Default: allow these three merges, giving 39 tasks. Applied in P0: the merged work keeps the IDs R03, R06, and R12; the rows R07, R14, R18, and R19 no longer exist.
- **Q13. Pilot checkpoint.** Stop after R09 for owner review before the remaining rewrite tasks (34 after the merges of Q12)? Default: yes.

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
3. **A merge survivor is later reworded away, or a chain of merges leaves only citations.** Example: "at most one image attachment" is stated in §1 (L14), §15 (L1116), and §17 (L1359); three tasks could each replace their copy by a citation of another. Statement maps are temporary, so a later task would not know which sentence is a survivor. Control: the Merge Ledger (section 17), W14, E8, and the F2 check of every ledger row.
4. **Anchors break silently**, because `check:docs` does not validate them. Control: seven known links fixed in T1; F2 lists every citation.
5. **Cost.** 39 sessions with a Fable verifier on most of them. Control: W1 keeps the verification surface small; the pilot checkpoint revises the budget; the merges of Q12 already removed four sessions.
6. **Concurrent feature work edits the specification.** Each rewrite task starts from the current commit and one section, so a conflict is local. A feature change that lands in a section already rewritten must follow §7.1; `docs/DEVELOPMENT.md` §12 should say so after T1.
7. **T1 on a smaller model changes checker semantics.** Control: evidence S, an independent review, and the unchanged requirement count.
8. **The inventory is partly second-hand.** Read-only subagents collected the duplicate and process entries of §4.2, §4.3, §12, and Appendix A; this session read §1, §9, §13, and parts of §16 and §23 itself, and it re-checked the Q9 rows against the specification and the tests. Control: each task confirms its own entries against the text before acting on them.

## 14. Next Task

R02 to R12 are done. R13 is the next task and is authorized (§3, owner decision of 2026-11-21). Every task from R02 to F2 is authorized; ordinary continuation starts the first task in the order of §8 whose status is not Done.

## 15. Prompt for the Next Session

The task that finishes updates this prompt when the next task needs context that the repository does not already give.

```text
Continue plans/product-spec-refactoring.md: execute the first task in §8 whose status is not Done. §3 records the owner's initiative-wide authorization of 2026-11-21 for R02 to F2; do not ask again. Model: Opus, effort high, for the implementer and for the reviewer.
For each task: follow its row in §8, the method decisions of §3, §7.3 step by step with the rules of §7.1 and the evidence E1–E8 of §7.4. Confirm each lead of §4.2 and §4.3 for the task's sections against the text before acting on it. Before rewriting, read the Merge Ledger rows (§17) whose survivor is in a changed section and the §12 findings for those sections. Step 3 runs both `npm run check:docs -- --verbatim <base>` and `npm run check:docs -- --details <base>`.
After validation, launch the configured `reviewer` role in a fresh context without a model override. Give it the inputs of §7.3 step 7 and not the statement map; it writes its own table. Compare its table with your map (§7.3 step 8), resolve the findings yourself, rerun the affected checks, commit with the plan update, and continue with the next task. At most four tasks per primary session.
After R20k and after R26, send the owner one summary of the open Owner Question Log entries and continue. Contact the owner before F2 only for the reasons listed in §3. After F2, send one final report and request final acceptance.
```

## 16. Owner Question Log

Each task writes its entries here before validation and independent review (§7.3 step 5), so the reviewer sees them, and updates them if the review changes them (§7.3 step 8). The owner answers the entries in rounds 3 and 4. An entry is closed only by an owner answer; F1 applies the answers under its limits.

| # | Task | Kind (held sentence, §12 finding, Q9 candidate) | Location and quoted text | Question and recommended default | Owner answer |
| --- | --- | --- | --- | --- | --- |
| 1 | R09 | Method question (not a held sentence) | `docs/product/application.md`, old heading "## 9. Cmd+0"; `--details` report item `Literal removed … "Cmd+0"` | May a literal that an approved heading retitle (Q3) removes from the heading take the disposition "Retitled heading", provided the verifier confirms that the heading is not normative and the literal is still stated in the section body or is not a requirement? Recommended default: yes; add this disposition to W9 and E5 before R01b, which retitles §1.4. | Closed 2026-11-20 by decision D1 (§3): yes, when the number stays, the heading set no separate requirement, and the body still states the literal with its meaning; references to the old heading title are checked. Added to W9, §7.3 step 4, and E5. Reference check for the R09 case: the R09 validation searched for links to the old §9 heading anchor and found none, and the R01a verifier found no reference to "9. Cmd+0" or to its anchor outside this plan. |
| 2 | R01a | Held sentence (W13: approved destination, but the citing files are outside the task's row) | `docs/product/overview.md` §1.3, last paragraph, unchanged: "Every change to user-visible behavior is checked against the guidelines before it is considered complete. A conflict that is not already recorded as a deliberate difference is reported to the Product Owner instead of being settled silently, under `AGENTS.md` §14." | Q5 names `docs/AGENT_WORKFLOW.md` §13 as the owner of this completion check, and that section states it. But `AGENTS.md` §13 ("the HIG check in `docs/PRODUCT.md` §1.3") and `docs/AGENT_WORKFLOW.md` §13 ("as `docs/PRODUCT.md` §1.3 requires") cite §1.3 as the source of the obligation, and the `EXEMPTIONS` reason for §1.3 in `scripts/check-requirement-coverage.mts` describes it. Removing the paragraph would leave three citations without their target statement, and none of those files is in the R01a row. Recommended default: keep the paragraph in §1.3 until a task whose row includes `AGENTS.md` and `docs/AGENT_WORKFLOW.md` re-points those citations; F1 applies the answer. | Closed 2026-11-20 by decision D4 (§3): the paragraph stays verbatim until F1; F1 fixes the rule in `docs/AGENT_WORKFLOW.md` §13, updates the citations in `AGENTS.md` and `docs/AGENT_WORKFLOW.md`, refines the §1.3 `EXEMPTIONS` reason if necessary, and keeps in §1.3 the guideline requirement and the precedence rule for recorded deliberate differences. Added to the F1 row. |
| 3 | R01a | Method question (not a held sentence) | Decision D3 (§3) covers only the index change of R01a. R01c retires §1.4.1: it removes `1.4.1` from the `browser.md` row of the Section Map in `docs/PRODUCT.md` and adds a row to its Retired Numbers table, so `--details` will report a removed literal and a removed and an added row with no recorded disposition. | May R01c treat these index changes as D3 does: accepted when the comparison confirms that the path, the order, and the other numbers of the row are unchanged, and that the retired-numbers row names the number and its new owner? Recommended default: yes; decide before R01c starts. | Closed 2026-11-20 by decision D5 (§3): only `1.4.1` leaves the `browser.md` row, with path, other numbers, and order kept; one Retired Numbers row for 1.4.1 links every Q5 destination document; "No number is retired." is removed; the actual table changes are checked. Added to W9, §7.3 step 4, E5, and the R01c row. Running R01c needs a separate owner decision. |
| 4 | R01b | Held sentence (W13: project-status content with no approved destination) | `docs/product/browser.md` §1.4, first paragraph, last sentence, unchanged: "It does not claim full browser parity or completion of the Browser Tree initiative." | The sentence states the status of an initiative and no behavior. Q5 names no owner for it. R01b reworded the sentence before it from "This checkpoint adds no synchronization or accounts" to "The browser version has no synchronization or accounts", so "It" now names the browser version and no longer "This checkpoint". Recommended default: remove the sentence in R01c as a status note without behavior (W5). Alternative: keep it. A rewording such as "The browser version does not provide every desktop feature" is not recommended, because the specification holds no list of those differences. | Closed 2026-11-20 by decision D6 (§3): R01c removes only this sentence, as Removed (non-normative); the neighboring requirement about synchronization and accounts and the reference to §24 stay. |
| 5 | R01b | §12 finding 1, confirmed against the text | `docs/product/browser.md` §1.4: "The browser's ellipsis menu ends with **About Tree** below statuses and the Update App button when present." §24.7: "When the new version is ready, **Update App** appears at the bottom of the ellipsis menu and a small dot appears on its trigger." | Both statements stay unchanged. They name different last items of the menu when an update is ready. Lead for F1: `e2e/web/menu.spec.mts` L71 asserts that the last child of the menu is the About Tree item; R01b did not check whether that test runs with Update App present. Recommended default: if the implementation places About Tree below Update App, F1 rewords §24.7 to say that Update App appears above About Tree, and cites the test or source location; otherwise both statements stay and the difference becomes a product task. | Closed 2026-11-20 by decision D8 (§3): Update App appears directly above About Tree, About Tree ends the menu, and status messages are in the bottom status bar of the window. F1 clarifies §24.7 and removes "below statuses" from §1.4, with the evidence that D8 names. Added to the F1 row. |
| 6 | R01b | Held sentences (W13: process content with no approved destination) | `docs/product/browser.md` §1.4, unchanged: "Before publication, explain that notes will not transfer automatically. The existing browser save and storage limitations are described in Browser version." In the specification the words "Browser version" are a link to `src/web/README.md`; the link syntax is left out of this quotation, because the link check of this plan would resolve its relative path from `plans/`. | The inventory (§4.2) classes these two sentences as process content, but Q5 names no owner for them and the R01c row does not list them. The second sentence still says "existing". Recommended default: R01c handles them with the other process content of §1.4. It moves the publication instruction to `deployment/github-pages/README.md`, which Appendix A.2 proposes as the owner of the storage-boundary step before publishing, unless that document already states it. It keeps the link sentence in §1.4 without the word "existing". | Closed 2026-11-20 by decision D7 (§3): `src/web/README.md` and `deployment/github-pages/README.md` already state the instruction and the limitation, so nothing is moved; R01c names both locations in the statement map, removes the publication instruction from §1.4, keeps the rule of separate storage per profile and origin and the link to `src/web/README.md`, and removes "existing" from the link sentence. |
| 7 | R01c | §12 finding 10, confirmed against the text as a difference of lists | §1.4.1 at `90b4f28`, removed from the specification by R01c: "Source maintainers and hosting administrators remain trusted." `docs/ARCHITECTURE.md` §2: "This protects against a stolen target publisher token, while source maintainers and GitHub/Sigstore remain trusted." `docs/SECURITY.md`, "Browser publication": "Source main maintainers, target workflow administrators, GitHub-hosted runners, GitHub and Sigstore remain trust roots". `deployment/github-pages/README.md`, "Failures and ordering", names the same parties as `docs/SECURITY.md`. | The three lists differ and do not contradict each other. `docs/SECURITY.md`, the owner under Q5, has the widest list; it contains both parties of the removed sentence. `docs/ARCHITECTURE.md` §2 does not name the hosting administrators or the hosted runners. R01c changed neither document. Recommended default: no change in this initiative; the shorter list of `docs/ARCHITECTURE.md` §2 goes to the follow-up of Appendix A.5, item 2. | Open |
| 8 | R02 | Suspected inconsistency (§12 category), found by the R02 reviewer | `docs/product/tree-model.md` §2.1: "The selected node has a separate visible focus indication, whether or not it has children: its bullet is drawn in the ordinary text color instead of the muted gutter color". Later in §2.1: "The selected node keeps its dark bullet and has no more-options or selection-dot ornament." | In the dark appearance the ordinary text color is light, so "dark bullet" contradicts the first statement there. Both statements stay unchanged. Recommended default: if the implementation draws the selected bullet in the text color in every appearance, F1 replaces "its dark bullet" with "its bullet in the ordinary text color" and cites the test or source location; otherwise the difference becomes a product task. | Open |
| 9 | R10 | Held sentence (W13: release-scope content with no approved destination) | `docs/product/editing.md` §10, first sentence, unchanged: "Undo and redo are mandatory in v1." (inventory §4.2, L869) | The requirement is that undo and redo exist; "in v1" names a release scope, and no document is named as the owner of release scope. No rule of §7.1 allows deleting a release-scope qualifier, so the owner decides; the current version is 0.7.0, so removing "in v1" makes the requirement apply without a release limit. Recommended default: F1 rewords the sentence to "Undo and redo are mandatory.", removing only "in v1"; undo and redo exist (`e2e/electron/history.spec.ts`). Alternative: keep the sentence verbatim. | Open |
| 10 | R12 | Held sentence (W7(c): asserts limits that no section states) | `docs/product/clipboard-and-paste.md` §12, unchanged: "Existing attachment format and decoded-image limits still apply to images within this byte limit." | No section of the specification states an attachment format or a decoded-image limit for pasted images. §17 states no limit, which is also §12 finding 5. `docs/ARCHITECTURE.md` §7 states that PNG attachment writes require PNG data and allow at most 32767 pixels per side and 64 megapixels in total; Appendix A.1 row 6 records that these pixel limits exist only there. §15.1 ("Each image is limited to 25 MiB and the normal decoded-image dimensions.") also names decoded-image dimensions without values. Recommended default: F1 states in §17 the limits the application applies (PNG data; at most 25 MiB per attachment, which `MAX_ATTACHMENT_BYTES` in `src/shared/attachment-limits.ts` defines as 25 × 1024 × 1024; at most 32,767 pixels per side and 67,108,864 pixels in total, which `MAX_ATTACHMENT_PIXELS` defines as 64 × 1024 × 1024), citing `src/shared/png-validation.ts` and `src/shared/png-validation.test.ts`, and rewords this sentence to cite §17; the same change gives "the attachment limit of §17" in §24.2 and "the attachment limits of §17" in §24.4 a target, and lets the §15.1 phrase cite §17 instead of being resolved separately in R15. Alternative: keep the sentence verbatim and leave the limits to the follow-up of Appendix A.5, item 2. | Open |

## 17. Merge Ledger

This ledger records every merge between sections with different numbers. Two subsections of one section count as different sections: a merge between §20.2.22 and §20.2.26 needs a row. Only a merge inside one numbered section, where both statements carry the same number, needs no row. Each row names the location where the full rule remains. Statement maps are temporary; the ledger is what later tasks and the final acceptance read. A task writes its rows before validation and independent review (§7.3 step 5) and updates them if the review changes them (§7.3 step 8). A task that rewords or moves a survivor updates the row (W14). F2 checks every row against the final text: the rule, as the original phrase states it, is present in full at the named location.

| # | Task | Rule: original phrase, quoted, with its location at the base commit | Removed from (now a citation) | Location of the full rule | Last confirmed by |
| --- | --- | --- | --- | --- | --- |
| 1 | R09 | "pending changes are flushed" (§9.2, `docs/product/application.md` L36 at `b9d9142`) | §9.2, which now cites §16.1 for the save-before-quit behavior of window close and `Cmd+Q` | §16.1, `docs/product/persistence.md`: "Every pending change is flushed before a normal quit completes." | R09 |
| 2 | R09 | "if saving cannot finish within the bounded time or reports an error, the application remains open and displays the failure so the user can retry" (§9.2, `docs/product/application.md` L36 at `b9d9142`) | §9.2, which now cites §16.1 | §16.1, `docs/product/persistence.md`: "If saving cannot finish within a bounded time or reports an error, the application remains open and displays the failure so the user can retry without silently losing changes." | R09 |
| 3 | R09 | "In the locked save-failure state, the user can instead explicitly confirm quitting without saving, as defined in §16.2." (§9.2, `docs/product/application.md` L36 at `b9d9142`) | §9.2, which now cites §16.2 for quitting in the locked save-failure state | §16.2, `docs/product/persistence.md`: "Quitting and closing the window from the locked state still attempt a final save", with its two list items, including "if the save fails, the application asks `Quit without saving? Changes made since the last successful save will be lost.` Confirming quits without saving". §16.1 also states the rule with "can also" in place of "can instead". | R09 |
| 4 | R02 | "Node movement begins when the primary mouse button is pressed and held on a node row for 200 ms." "A quick press and release still places the text cursor at the clicked position, and pressing and dragging selects text." "Moving the pointer by more than 4 pixels before the threshold cancels the pending drag so the gesture remains an ordinary text selection, and leaving the row while the button is still held also cancels it." (§2.1, `docs/product/tree-model.md` L54 at `0cb0acc`) | §2.1, which now says that pressing a node row places the text cursor, selects text, or starts node movement under the hold rules of §11 | §11, `docs/product/editing.md`: "Node movement begins when the primary mouse button is pressed and held on a node row for 200 ms. A quick press and release edits text and places the text cursor at the clicked position. Pointer movement within 4 pixels does not cancel the pending hold, but moving farther before the threshold cancels the pending drag so the gesture selects text instead; the pending hold also cancels if the pointer leaves the row." The survivor is wider: it adds "edits text" and states that movement within 4 pixels does not cancel the hold. | R02 |
| 5 | R03 | "Empty nodes are valid and must never be automatically deleted." (§3, `docs/product/tree-model.md` L262 at `a8126d0`) | §3, which now says "Empty nodes follow §19." | §19, `docs/product/tree-model.md`: "Empty nodes are valid." and "The application must never automatically delete an empty node." | R03 |
| 6 | R06 | "`↑` moves the caret to the beginning of the parent's text;" in the list for the selected editable current parent (§6.1, `docs/product/editing.md` L181 at `a5707c8`) | §6.1, whose bullet now says "`↑` follows §4.1;" | §4.1, `docs/product/editing.md`: "When the editable current parent is selected, pressing `↑` places the caret at the beginning of the current parent." Recorded differences (W8): "moves" against "places", and "the parent's text" against "the current parent". Both name caret position zero of the current parent, so the two are judged identical. | R06 |
| 7 | R08 | "This is an explicit user action. Empty nodes are never deleted automatically." (§8.2, `docs/product/editing.md` L301 at `dbb766a`; the second sentence is merged) | §8.2, which now says "This is an explicit user action; §19 forbids automatic deletion of empty nodes." | §19, `docs/product/tree-model.md`: "The application must never automatically delete an empty node." Recorded difference (W8): a statement of fact against an obligation of the application; judged identical. | R08 |
| 8 | R10 | "Stable node IDs must survive undo and redo." (§10, `docs/product/editing.md` L337 at `1d18845`) | §10, which now says "Node identity under undo and redo follows §18." | §18, `docs/product/tree-model.md`: "Every node has a stable unique ID." and "Node IDs must remain stable when a node is:" with the items "undone;" and "redone;". Recorded difference (W8): "survive undo and redo" against "remain stable when a node is undone or redone"; judged identical. | R10 |

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
