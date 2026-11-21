# Documentation Load and Ownership

**Authorization state:** Authorized by the Product Owner on 2026-11-21 for the whole initiative (Q6). Q1–Q5 are answered (see Owner Questions). In progress.

## Objective

1. Reduce the text that every session must read in `docs/DEVELOPMENT.md` §§8–10 by moving reference material out of that file into a separate reference document.
2. Remove the restatements of product behavior from `docs/ARCHITECTURE.md` for duplication rows 1, 4, 6, 7 and 15. The architecture document keeps the mechanism and cites the owning `docs/product/*.md` section.
3. Give each of the first four release rules one owning document.

Source recommendation: Appendix A of the retired plan `plans/product-spec-refactoring.md` (`git show bb427a3:plans/product-spec-refactoring.md`). This plan restates every row it uses, so no other file is needed to execute it.

## Scope Limits

* Documentation only. No product behavior changes. A specification edit only records implemented behavior after an owner answer (Q2, Q3).
* ADRs are historical and are not edited. Keep any text that an ADR cites at its cited location.
* `AGENTS.md` is not edited. Its routing to `docs/DEVELOPMENT.md` §§8, 9 and 10 stays valid. Its 24 KiB core limit is unaffected.
* Sections of `docs/DEVELOPMENT.md` are not renumbered, and moved headings keep their text in the reference document. Links to a moved heading are retargeted to `docs/DEVELOPMENT_REFERENCE.md`. A link in a document that this initiative must not edit (an ADR) keeps working through a one-line stub heading with the same text left in `docs/DEVELOPMENT.md`, which points to the reference document.
* Moves are verbatim. Text is deleted only when it is an exact duplicate resolved by T3. No text is reworded except citations and one pointer sentence per source section.
* Out of scope: duplication rows other than 1, 4, 6, 7 and 15; process-document rows 5–8; the placement of `ARCHITECTURE.md` §8 and §13 (Q4); new `check:docs` quantity patterns; any rewrite of `AGENTS.md` or `docs/AGENT_WORKFLOW.md`.

## Source-of-Truth Links

`AGENTS.md` §§8, 10, 11, 13; `docs/AGENT_WORKFLOW.md` §8, §11; `docs/DEVELOPMENT.md` §§8–12 and §11 (plan format); `docs/AGENT_ROLES.md`; `docs/ARCHITECTURE.md` §§2, 7, 9, 11, 13; `docs/product/persistence.md` §16.1; `docs/product/images.md` §17; `docs/product/editing.md` §10; `docs/releasing.md`; `deployment/github-pages/README.md`; `docs/SECURITY.md` "Browser publication".

## Authorization

* Approval scope: the whole initiative, authorized by the Product Owner on 2026-11-21. The authorization holds across task and session changes; a new session does not ask again. Final owner acceptance follows T5.
* Owner instruction of the same decision: T1 and T2 measure the mandatory reading before and after with the method of the Baseline section, and the final report includes both measurements.
* Selected coding tool: Claude Code.
* Priorities: T1, T2, T3, T4, T5.
* Delegated decisions and their principles:
  * The exact wording of pointer sentences, the numbering and order of sections inside `docs/DEVELOPMENT_REFERENCE.md`, and the form of the tooling change. Principle: one pointer sentence per source section, citing the reference document by section number and heading; the tooling treats the reference document like `docs/DEVELOPMENT.md` for every check that reads it today.
  * Whether a paragraph inside a moved subsection is reference material. Principle: a rule needed to choose validation, record evidence, check capabilities or write tests stays in §§8–10. CI, container, media, per-tool permission and historical-measurement text moves to the reference document.
* Reserved decisions:
  * Any difference between two documents that Q2 or Q3 does not settle.
  * Any deletion that is not an exact duplicate.

## Baseline (2026-11-21, commit 52e5485)

Mandatory reading, measured with the method of Appendix A.4 of the retired plan (`git show bb427a3:plans/product-spec-refactoring.md`): the bytes a session reads before a typical product-behavior change, excluding the task's own product and architecture sections. Measure each part with `sed -n '<first>,<last>p' <file> | wc -c` over the lines from the section heading to the line before the next `## ` heading, and the whole files with `wc -c -l`.

| Text | Bytes |
| --- | --- |
| `AGENTS.md` (whole) | 22,105 |
| `docs/AGENT_WORKFLOW.md` §§4, 5, 9, 10, 12, 13, 14 | 48,186 |
| `docs/DEVELOPMENT.md` §9 Full Validation (lines 496–1006) | 65,090 |
| `docs/DEVELOPMENT.md` §10 Development Workflow (lines 1007–1075) | 15,067 |
| Total by section (A.4 method) | 150,448 |
| Conditional: `docs/DEVELOPMENT.md` §8 Tests (lines 209–495) | 61,635 |
| Whole `docs/DEVELOPMENT.md` (read without a line range) | 207,541 bytes, 1,516 lines |
| Total when `docs/DEVELOPMENT.md` is read whole | 277,832 |

The last two rows record the Product Owner's reason for Q1: an agent that reads `docs/DEVELOPMENT.md` without a line range loads it whole, so only a move to another file reduces that reading. T1 and T2 each record the same rows after their change; the final report shows before and after.

After T1 and after T2 (each measured on its task's working tree, same method):

| Text | Before | After T1 | After T2 |
| --- | --- | --- | --- |
| `AGENTS.md` (whole) | 22,105 | 22,105 | 22,105 |
| `docs/AGENT_WORKFLOW.md` §§4, 5, 9, 10, 12, 13, 14 | 48,186 | 48,200 | 48,200 |
| `docs/DEVELOPMENT.md` §9 Full Validation | 65,090 (lines 496–1006) | 26,132 (lines 496–666) | 26,132 (lines 463–633) |
| `docs/DEVELOPMENT.md` §10 Development Workflow | 15,067 | 15,067 (lines 667–735) | 4,916 (lines 634–659) |
| Total by section (A.4 method) | 150,448 | 111,504 | 101,353 |
| Conditional: `docs/DEVELOPMENT.md` §8 Tests | 61,635 | 61,734 (lines 209–495) | 54,795 (lines 209–462) |
| Whole `docs/DEVELOPMENT.md` | 207,541 bytes, 1,516 lines | 168,748 bytes, 1,176 lines | 151,658 bytes, 1,100 lines |
| Total when `docs/DEVELOPMENT.md` is read whole | 277,832 | 239,053 | 221,963 |
| `docs/DEVELOPMENT_REFERENCE.md` (read on demand) | — | 39,709 bytes, 351 lines | 57,955 bytes, 437 lines |

The `docs/AGENT_WORKFLOW.md` and §8 increases after T1 are the retargeted links.

Planner estimates of the subsections at commit 421359d (line ranges exact, sizes within about 10%):

| Text | Lines | Est. size |
| --- | --- | --- |
| DEVELOPMENT §8 Tests | 209–494 | 61–68 KB |
| §8 "Historical macOS memory evidence" | 350–394 | 9.5 KB |
| §8 tool-permission paragraphs | 396, 400, 402 | 2.3 KB |
| DEVELOPMENT §9 Full Validation | 496–1005 | 64–68 KB |
| §9 introduction | 496–550 | 4.4 KB |
| §9 Chromium container tests | 552–645 | 12 KB |
| §9 GitHub Actions (with three h4 subsections) | 647–858 | 22 KB |
| §9 Risk-Based Validation | 860–883 | 3.9 KB |
| §9 Local affected-spec E2E validation | 885–897 | 3.3 KB |
| §9 README Screenshot Maintenance | 899–907 | 2.5 KB |
| §9 Demo Video Generation | 909–923 | 4.7 KB |
| §9 Screenshot Rendering Scale | 925–949 | 4.2 KB |
| §9 Validation Evidence and Reuse | 951–1003 | 11.4 KB |
| DEVELOPMENT §10 Development Workflow | 1007–1072 | 15 KB |
| §10 capability-check rules | 1029–1037 | 3.1 KB |
| §10 per-tool configuration | 1039–1068 | 9.5 KB |
| ARCHITECTURE §8 UI Layer | 496–669 | 51–54 KB |
| ARCHITECTURE §13 Persistence | 803–1104 | 65–71 KB |

Expected result after T1 and T2:

* §9 shrinks by about 42 KB, to about 25 KB.
* §10 shrinks by about 10 KB, to about 5 KB.
* §8 shrinks by about 12 KB.
* The whole `docs/DEVELOPMENT.md` shrinks by about 64 KB, to about 144 KB.

## Citation Inventory (checked 2026-11-21)

`check:docs` checks only that a linked file exists, not its anchors. It does not check links in `docs/releasing.md` or `deployment/github-pages/README.md`. Check every row below by hand.

| Citation | Location | Action |
| --- | --- | --- |
| "§9 describes the smoke checks" | `e2e/AGENTS.md:7` | T1: cite `docs/DEVELOPMENT_REFERENCE.md` and its section |
| "platform allocation … §9" | `e2e/electron/AGENTS.md:10` | T1: cite the reference document |
| "Linux functional subset … as described in §9" | `docs/DEVELOPMENT.md:302` | T1: cite the reference document |
| `DEVELOPMENT.md#9-full-validation` ("validation gates before publication") | `docs/PRODUCT.md:40` | T1: retarget to the GitHub Actions heading of the reference document |
| "§§3 and 9" (attribution check) | `docs/AGENT_WORKFLOW.md:398` | T1: keep the attribution paragraph in §9 |
| "§9" for screenshot repeat commands | ADR 0019; `e2e/electron/AGENTS.md:9` | Keep Screenshot Rendering Scale in §9 |
| `#risk-based-validation` | ADR 0006 | Keep that heading in `docs/DEVELOPMENT.md` and do not rename it |
| `DEVELOPMENT.md#chromium-container-tests`, `#cross-platform-smoke-checks`, `#github-actions` or any other anchor of a moved heading | search all files, including `docs/AGENT_WORKFLOW.md`, `README.md`, `src/web/README.md`, `deployment/`, `.codex/`, `.claude/`, `opencode.json`, nested `AGENTS.md`, ADRs | T1/T2: retarget to the reference document; for an ADR, leave a stub heading (Scope Limits) |
| "historical macOS measurements below" | `docs/DEVELOPMENT.md:344` | T2: cite the reference document |
| "§8 for rule loading and restart requirements" | `e2e/electron/AGENTS.md:36` | T2: cite the reference document |
| `#task-capability-check` for `npm run test:safari` | `src/web/README.md:271` | T2: retarget if the cited text moves; the capability-check rules stay |
| "Claude Code … Bash sandbox, see §10" (code comment) | `scripts/check-opencode-permissions.mts:418` | T2: cite the reference document |
| `#what-the-memory-suite-can-detect`, `#local-affected-spec-e2e-validation`, `#task-capability-check`, `#11-multi-session-initiatives` | various files | Stay valid: these headings stay in `docs/DEVELOPMENT.md`; recheck |

All other `DEVELOPMENT.md` §8/§9/§10 citations name content that stays in place. These include the risk tier, evidence rules, lifecycle verification, fixture teardown, diagnostic options, the editing-mode categories and the memory-suite limits. Each task must search the repository for `DEVELOPMENT.md` again and resolve any new match.

## Tasks

| ID | Outcome | Depends on | Files | Tier | Acceptance evidence | Reviewer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | New `docs/DEVELOPMENT_REFERENCE.md` covered by `check:docs` and `check:opencode`; §9 reference material moved into it | Q1 (answered) | `docs/DEVELOPMENT_REFERENCE.md` (new), `docs/DEVELOPMENT.md`, `scripts/check-docs.mts`, `scripts/check-docs.test.mts`, `scripts/check-opencode-permissions.mts` and its test, `e2e/AGENTS.md`, `e2e/electron/AGENTS.md`, `docs/PRODUCT.md`, `docs/AGENT_WORKFLOW.md` §11 (document list) only if it lists development documents, other files whose links target a moved heading, this plan | Low (`npm run check`, plus `npm run check:opencode`) | Tool tests show both documents are checked; every removed paragraph unit of `docs/DEVELOPMENT.md` occurs verbatim in the reference document; inventory rows resolved; mandatory-reading measurement before and after | None required | Done |
| T2 | §8 and §10 reference material moved to the reference document | T1 | `docs/DEVELOPMENT_REFERENCE.md`, `docs/DEVELOPMENT.md`, `e2e/electron/AGENTS.md`, `src/web/README.md`, `scripts/check-opencode-permissions.mts` (comment only), this plan | Low (`npm run check`, plus `npm run check:opencode`) | Every removed paragraph unit occurs verbatim in the reference document; inventory rows resolved; mandatory-reading measurement after | None required | Done |
| T3 | One owner for each of release rules 1–4 | T1, Q5 (answered) | `docs/DEVELOPMENT_REFERENCE.md`, `docs/DEVELOPMENT.md`, `docs/releasing.md`, `deployment/github-pages/README.md`, `docs/ARCHITECTURE.md` §2, this plan | Minimal + `check:opencode` | Each rule appears in full once; other copies cite it; manual link check | None required | Done |
| T4 | Rows 6, 7 and 15 resolved | none | `docs/ARCHITECTURE.md` §§2, 7, 11, this plan | Minimal | Code constants match the specification; diff contains only the citation sentences | None required | Done |
| T5 | Rows 1 and 4 resolved | Q2, Q3 | `docs/ARCHITECTURE.md` §§7, 9, 13, `docs/product/persistence.md`, this plan | Minimal | Owner answers applied; existing automated coverage named | None required | Planned |
| T6 | Closure after acceptance | Acceptance | this plan, `plans/README.md` | Minimal | Plan and index row removed | None | Planned |

Validation commands for each tier:

* Minimal Risk: `npm run format:check:changed` and `npm run check:docs`.
* `+ check:opencode`: also run `npm run check:opencode`. It scans `docs/DEVELOPMENT.md` for `npm run` names, and T1 also changes agent instruction files.
* Low Risk: `npm run check`.

No task needs an independent reviewer or product verifier under `AGENTS.md` §13. All tasks are contained documentation changes with no user-visible behavior change. The primary agent reviews each diff. Each task commits its plan status and next-task update with the change.

### T1. Create the reference document and move §9 reference material into it

1. Record the "before" rows of the Baseline table at the starting commit (they are already recorded for `52e5485`; re-measure if `docs/DEVELOPMENT.md` or `docs/AGENT_WORKFLOW.md` changed since).
2. Create `docs/DEVELOPMENT_REFERENCE.md` with the title `# Development Reference` and one introduction sentence: it is read on demand, it holds CI, Linux container, README media, agent tool configuration and historical-measurement material, and `docs/DEVELOPMENT.md` owns the rules every session needs. Number its sections from 1.
3. Tooling. Make `scripts/check-docs.mts` treat the new file as a live document (`collectLiveDocuments`) with the same checks that apply to `docs/DEVELOPMENT.md`, and make `scripts/check-opencode-permissions.mts` scan the new file for `npm run` names exactly as it scans `docs/DEVELOPMENT.md`. Add a test for each change in the existing test files (a missing approval rule for an `npm run` name that appears only in the reference document fails; a broken link in the reference document fails). Do not weaken any existing check.
4. Move these blocks verbatim from §9, keeping their heading text. A heading level may change.
   * `### Chromium container tests`
   * `### GitHub Actions`, with `#### Scroll rendering regressions`, `#### Cross-platform smoke checks` and `#### Workflow and job naming policy`
   * `### README Screenshot Maintenance`
   * `### Demo Video Generation`
   * The build-configuration paragraph at the start of Risk-Based Validation (lines 862–870), under a new `### Build and test configuration` heading
5. Move the paragraph that begins "The `Enforce agent attribution policy` workflow" out of the smoke subsection to the end of the §9 introduction. It stays in §9.
6. Keep these in §9: the introduction, Risk-Based Validation (heading unchanged; ADR 0006 links it), Local affected-spec E2E validation, Screenshot Rendering Scale (ADR 0019 cites it), and Validation Evidence and Reuse.
7. Add one pointer sentence after the §9 parity paragraph that names the moved subsections and links `docs/DEVELOPMENT_REFERENCE.md`.
8. Prove the move lost no text: run `npm run check:docs -- --verbatim HEAD --file docs/DEVELOPMENT.md` and confirm that every removed paragraph unit it lists occurs verbatim in `docs/DEVELOPMENT_REFERENCE.md` (search each with a fixed-string search). Record the report and the result.
9. Apply the T1 rows of the citation inventory. Search the repository for `DEVELOPMENT.md#` and for `§9` citations of `docs/DEVELOPMENT.md`, and check every `§8`, `§9`, `§10` and `#` reference inside both documents. A moved heading that an ADR links keeps a stub heading in `docs/DEVELOPMENT.md` (Scope Limits).
10. Measure the "after T1" rows of the Baseline table and record them in this plan.

### T2. Move §8 and §10 reference material into the reference document

1. Move `#### Historical macOS memory evidence` (§8) to the reference document.
2. Create an `Agent tool configuration` section in the reference document. Move into it:
   * the §8 paragraphs on Codex project rules, process inspection and live tool checks (lines 396, 400, 402);
   * the §10 paragraphs from "The root `CLAUDE.md` imports" through "Allowed npm scripts and Git hooks execute" (lines 1039–1068).
3. Move `### On-device summarization` (§10) to the reference document.
4. Keep these in place:
   * §8 lines 324 and 398: the command forms and the diagnostic options that `docs/AGENT_WORKFLOW.md` §4 cites;
   * "What the memory suite can detect", which `docs/product/non-functional.md` and two anchors cite;
   * the §10 Shared agent instructions;
   * the capability-check rules (lines 1029–1037);
   * the `fix:history` and handoff paragraphs.
5. Run the same lost-text proof as T1, then apply the T2 rows of the citation inventory.
6. Measure the "after T2" rows of the Baseline table and record them in this plan; the final report shows the before, after-T1 and after-T2 values.

### T3. One owner for each release rule

| Rule | Owner | Copies to replace with a one-sentence citation (line numbers at 421359d; find them by text) |
| --- | --- | --- |
| 1. Release gate composition | "GitHub Actions" in `docs/DEVELOPMENT_REFERENCE.md` (after T1) | `docs/releasing.md:33–34, 122–123`; `deployment/github-pages/README.md:10–18`; DEVELOPMENT §12 "Preparing a macOS release" (1367–1369, 1392); `ARCHITECTURE.md` §2 lines 56–58 (Q5) |
| 2. Tag reservation and same-version skip | `docs/releasing.md` "Create a release" | DEVELOPMENT GitHub Actions (654–655); DEVELOPMENT §12 (1370–1378, 1390); deployment README 297–302; `ARCHITECTURE.md` §2 lines 62–65 (Q5) |
| 3. Failed-job retry and artifact reuse | `docs/releasing.md` (lines 55–72 and 127–135) | DEVELOPMENT GitHub Actions (673–680); DEVELOPMENT §12 (1385–1386); deployment README 290–295. Keep the Web-only target-deployment retry in the deployment README. |
| 4. `npm run release` usage | `docs/releasing.md` "Create a release" | DEVELOPMENT §12 (1357–1365) |

* Before you replace a copy, compare it with the owner text. Move any fact that only the copy states into the owner.
* If two copies contradict each other, leave both unchanged for that fact and raise an owner question.
* `ARCHITECTURE.md` §2 keeps the pipeline mechanism (jobs, tokens, attestation).
* Removing `npm run release` from DEVELOPMENT.md does not weaken `check:opencode`. Its `package.json` loop still requires `ask` for `release`.
* Check every link and anchor in the two files that `check:docs` does not cover.

### T4. Rows 6, 7 and 15 (no owner question)

* Row 6:
  * At 421359d, `ARCHITECTURE.md` §7 line 456 states "32767 pixels per side and 64 megapixels in total".
  * Confirm that `src/shared/png-validation.ts` equals `docs/product/images.md` §17 (32,767 per side; 67,108,864 total). At 421359d the code has `32_767` and `64 * 1024 * 1024`.
  * Replace the numbers with "the pixel limits of `docs/PRODUCT.md` §17". If the code and the specification differ, stop and report a defect. Do not fix the code in this initiative.
* Row 7:
  * Replace the restated entry definition and discard rule in §11 line 773 with a citation of `docs/PRODUCT.md` §10.
  * Keep "The redo stack is bounded by the same limit" as mechanism. `src/application/editor-history.ts` bounds `future` by `HISTORY_LIMIT`.
* Row 15: confirm that §2 cites `SECURITY.md#browser-publication` and lists no trusted parties. No edit is needed.

### T5. Rows 1 and 4 (after Q2 and Q3)

* Row 1 (Q2):
  * Apply the answer to `docs/product/persistence.md` §16.1 ("within a bounded time").
  * In `ARCHITECTURE.md`, replace the restated policy with citations and keep the mechanism:
    * §7 line 458 ("times out after five seconds");
    * §13 lines 915 and 938 (flush before quit, save-trigger list);
    * line 936 (window close).
  * Name the existing test of the timeout (`src/electron/main/quit-handshake.test.ts` or `captureQuitTimer` in E2E).
* Row 4 (Q3):
  * Apply the answer to §16.1, near "Scrolling by the user is a pending change like a selection change".
  * Replace the restated rule in `ARCHITECTURE.md` §13 line 901 with a citation. Keep `noteViewportChange` and `markPersistedChangeWithoutDelay` as mechanism.
  * Replace the restated persisted-state list in §9 line 711 with a citation.
* Name the existing automated test for each rule that the specification now states. If there is none, stop and ask the owner. Adding a test is a scope expansion and changes the tier.
* Product files must pass the `check:docs` size limits (700 characters per paragraph).

## Working-Task Count and Final Owner Acceptance

* Working tasks: 5 (T1–T5). T6 is closure and is not counted.
* The three-task threshold applies. After T5, set the initiative and its index row to `Awaiting owner acceptance` and present the five commits. One final acceptance round is required before T6.

## Owner Involvement

| When | Action | Rounds |
| --- | --- | --- |
| Before authorization | Answer Q1–Q6 together | Done 2026-11-21 |
| Before each commit | None. All evidence is automated or comes from the primary agent's diff review. | 0 |
| After T5 | Read `docs/DEVELOPMENT.md` §§8–10 and `docs/DEVELOPMENT_REFERENCE.md`, the before/after measurements, the T3 release texts, and the `ARCHITECTURE.md` and `persistence.md` diffs. Then accept or reject. | 1 acceptance round |
| Possible extra rounds | T3 finds contradictory release statements; T5 finds a newly stated rule without automated coverage | 0–2 |

Unresolved capabilities: none known. Tasks need file editing and the named npm scripts. The `npm run check` of T1 and T2 needs the normal local toolchain but not Electron, a display or network access.

## Budget

* Execution: 3 primary sessions. Session 1: T1. Session 2: T2, T3 and T4. Session 3: T5 after the Q2 and Q3 answers.
* Recovery: at most 1 additional primary session for the whole initiative. The two-attempt limit per blocker in procedure §12 still applies.
* Closure allowance: 1 short session for T6 after acceptance. Repairs after a rejection use the remaining recovery allowance.

## Owner Questions

Owner answers of 2026-11-21:

| Question | Answer |
| --- | --- |
| Q1 | Not a §18 of the same file. Move the reference material to a separate document (for example `docs/DEVELOPMENT_REFERENCE.md`) and update `check:docs` and `check:opencode`. Reason: `docs/DEVELOPMENT.md` has 1,516 lines; an agent that reads the file without a line range loads it whole, so a move inside the file saves nothing. T1 and T2 are therefore Low Risk. |
| Q2 | Yes: state "five seconds" in §16.1. |
| Q3 | Yes: state the implemented rule in §16.1. |
| Q4 | Yes: defer the placement work of `docs/ARCHITECTURE.md` §8 and §13. |
| Q5 | Yes: include `docs/ARCHITECTURE.md` §2 in T3. |
| Q6 | Whole-initiative approval. |

The question texts below are kept as the record of what was asked.

* **Q1 (reserved: document structure).** How should reference material be separated?
  * Recommended: append `## 18. Reference Material` to `docs/DEVELOPMENT.md`. No section is renumbered and every anchor stays valid. `check:docs` and `check:opencode` keep covering the moved text with no tooling change. The file's total size stays the same; the per-session reading drops.
  * Alternative: a new file such as `docs/DEVELOPMENT_REFERENCE.md`. It gives a clearer boundary and a smaller file. It requires adding the file to `collectLiveDocuments` in `scripts/check-docs.mts` and to the `npm run` scan in `scripts/check-opencode-permissions.mts`, so T1–T3 become Low Risk. About six cross-file anchors would also change.
  * Changing course later is one mechanical task that moves §18 into its own file.
* **Q2 (row 1).** The quit-save timeout of 5,000 ms (`src/electron/main/quit-handshake.ts`) appears only in `ARCHITECTURE.md` §7. The specification says "within a bounded time".
  * Recommended: state "five seconds" in `docs/product/persistence.md` §16.1 and have `ARCHITECTURE.md` cite it.
  * Alternative: keep the value unspecified in the specification, treat it as implementation detail, and leave it in the architecture document.
* **Q3 (row 4).** The specification says that scrolling is "a pending change like a selection change" and that other changes reset the idle timer. `ARCHITECTURE.md` §13 and the code (`markPersistedChangeWithoutDelay`) say that scrolling never resets an idle timer that is already armed.
  * Recommended: add the implemented rule to §16.1.
  * Alternative: the specification wins as written. That requires an implementation change, which belongs to a separate defect task with tests.
* **Q4.** `ARCHITECTURE.md` §13 (about 65–71 KB) contains search, emoji, command-history, recent-node and finished-task text (lines 805–855) beside persistence. §8 is about 51–54 KB.
  * Recommended: defer the placement work to a separate initiative.
  * Reasons: the architecture document is read by section on demand, not at every session; regrouping needs your choice of section boundaries; renumbering §13 would make ADR 0004's citation wrong.
* **Q5.** `ARCHITECTURE.md` §2 lines 56–65 also restate release rules 1 and 2.
  * Recommended: include them in T3. Replace the suite list and the tag rules with citations and keep the pipeline mechanism.
  * Alternative: leave §2 unchanged.
* **Q6.** Approval scope.
  * Recommended: whole-initiative approval, with T5 starting only after Q2 and Q3 are answered.
  * Alternative: task-by-task approval.

## Decisions and Findings

* `scripts/check-opencode-permissions.mts` requires an approval rule for every `npm run` name in `docs/DEVELOPMENT.md`. `scripts/check-docs.mts` uses a fixed live-document list. Because the owner chose a separate document (Q1), T1 extends both scripts to the new file.
* `npm run check:docs -- --verbatim <ref> --file <file>` reports removed, added and moved paragraph units of one file. A move to another file appears as removed units; T1 and T2 prove that no text was lost by finding every removed unit verbatim in `docs/DEVELOPMENT_REFERENCE.md`.
* The specification already owns the limits of row 6 (commit 4153d93). Row 15's trusted parties are cited, not restated (commit 421359d).
* The scoped audit acceptances in §9 (2026-11-05, 2026-11-07, 2026-11-10) and §12 (2026-11-08) cover completed work. They move verbatim. Removing them is not in scope.
* T1 results:
  * `docs/DEVELOPMENT_REFERENCE.md` §1 Validation Infrastructure holds Chromium container tests, GitHub Actions (with its three h4 subsections) and Build and test configuration; §2 README Media holds README Screenshot Maintenance and Demo Video Generation. Moved headings keep their text and level, so their anchors are unchanged in the new file. No ADR links a moved heading, so no stub heading was needed. T2 appends §3 and later sections.
  * `scripts/check-docs.mts` lists the reference document in `collectLiveDocuments`. The `npm run` scan of `check:opencode` moved into `scripts/documented-npm-workflows.mts`, which scans both documents and has its own test file; `check-opencode-permissions.mts` had no test file.
  * Lost-text proof. `check:docs --verbatim` reports clause units, which a fixed-string search cannot find across wrapped lines, and running a scratch comparison script through `node` was denied. The proof used Git instead: every line removed from `docs/DEVELOPMENT.md` (`git diff --unified=0 HEAD -- docs/DEVELOPMENT.md`) occurs as a whole line in the reference document (`grep -F -x -v -f`), except the five lines whose citations were retargeted. A `git diff --diff-algorithm=patience` of the old guide against a blob of the reference document (`git hash-object -w`) showed only the title, the introduction, two section headings, the Build and test configuration heading and the retargeted memory-suite link as added lines. Use the same method in T2.
  * Additional citations retargeted beyond the inventory: `docs/DEVELOPMENT.md` §4 (`make setup` row), §8 (memory suite), §15 ("as described under Full Validation"), `docs/AGENT_WORKFLOW.md` §4 and §11, and the documentation lists in `README.md` and `docs/AGENT_WORKFLOW.md` §11.
  * For T2: the §10 OpenCode paragraph says that `check:opencode` "covers workflows named in this document". After the move, change "this document" to name both documents; that is a citation change.
* T2 results:
  * The reference document gained `### On-device summarization` at the end of §1, `## 3. Agent Tool Configuration` (the three §8 paragraphs, then the §10 paragraphs from "The root `CLAUDE.md` imports" through "Allowed npm scripts and Git hooks execute") and `## 4. Historical Measurements` with `### Historical macOS memory evidence` (one level higher than before).
  * In `docs/DEVELOPMENT.md` §8, the paragraphs that followed the moved historical subsection (diagnostic workflow options through native context-menu verification) would otherwise have fallen under "What the memory suite can detect", which `docs/releasing.md` and the deployment README link as the memory detection limits. They now sit under a new `#### E2E diagnostics and fixtures` heading. Their text is unchanged.
  * ADR 0021 states that "Development §8 records full-suite measurements" of the reuse rollout and owns its supported commands. Under the Scope Limits rule that ADR-cited text stays at its cited location, the matched-pair command paragraph, the 2026-10-11 rollout table and its two result paragraphs stay in §8. They now follow the ADR 0021 memory-workflow paragraph. The 2026-10-15 memory separation and the 2026-11-06 test-cost investigation moved. The planner inventory had missed this citation.
  * Citation changes in moved text: "these named Electron workflows" now cites Development Guide §8; "§9", "§16", "the coverage ownership described above" and "the reuse rollout measured below" cite the Development Guide; "workflows named in this document" names both documents. §8 line "historical macOS measurements below" now reads "above and in" reference §4. One pointer sentence was added in §8 and one in §10.
  * Lost-text proof: `git diff HEAD --color=always --color-moved=plain -- docs/DEVELOPMENT.md docs/DEVELOPMENT_REFERENCE.md`, filtered to deleted or added lines that Git did not color as moved (19 lines). They are the six citation-changed lines (old and new form), the two pointer sentences, the removed historical heading and the four new headings. This replaces the `grep -F -x -v -f` method of T1, which needs a pattern file that the redirection hook prevents writing.
  * Inventory rows resolved: `e2e/electron/AGENTS.md` and the `scripts/check-opencode-permissions.mts` comment cite reference §3; `src/web/README.md` links `DEVELOPMENT_REFERENCE.md#3-agent-tool-configuration`. The remaining `DEVELOPMENT.md` §8/§10 citations (diagnostic options, editing-mode categories, idle-save helpers, `fix:history`, capability check, memory-suite anchor) name text that stayed in place.
* T3 results:
  * No copy contradicted its owner, so no owner question arose.
  * Facts that only a copy stated moved to the owner. Rule 4: the clean-tree requirement, the exact version fields and commit subject, "pushes nothing", the rejected-hook behavior and the `--help` forms (from `docs/DEVELOPMENT.md` §12). Rule 2: build metadata precedence, the eligibility comparison, release of the same version after a failure before reservation, the skip without writes, and the Web hosting-parent recheck (from §12). Rule 1: the high-severity audit level (from the deployment README, confirmed in `.github/workflows/audit-dependencies.yml`) and "Property soak and mutation testing remain separate".
  * Copies replaced with citations: `docs/releasing.md` (gate composition twice), `deployment/github-pages/README.md` (gate composition, validation retry, tag rules), `docs/DEVELOPMENT.md` §12 (version command, gate, eligibility, retry sentence, precedence, CI gate), `docs/DEVELOPMENT_REFERENCE.md` GitHub Actions (tag eligibility, retry) and `docs/ARCHITECTURE.md` §2 (suite list, tag rules). The deployment README keeps its Web-specific statements: the Web target-deployment retry, the tag match of Web candidate checks, the Chromium browser gate and its later work. `ARCHITECTURE.md` §2 keeps the dispatch, provenance, reservation-job and recheck mechanism.
  * Manual link check: every added link targets an existing file and heading (`#github-actions`, `#create-a-release`, `#signing-and-packaging`) from its file's directory.
* T4 results:
  * Row 6: `src/shared/png-validation.ts` sets `MAX_ATTACHMENT_DIMENSION = 32_767` and `MAX_ATTACHMENT_PIXELS = 64 * 1024 * 1024` (67,108,864), equal to `docs/product/images.md` §17. `ARCHITECTURE.md` §7 now cites the §17 pixel limits.
  * Row 7: `docs/product/editing.md` §10 defines the history limit, the history entry and the discard rule. `ARCHITECTURE.md` §11 now cites them and keeps the redo-stack bound, which `src/application/editor-history.ts` enforces on `future` with `HISTORY_LIMIT`.
  * Row 15: `ARCHITECTURE.md` §2 cites `SECURITY.md#browser-publication` and lists no trusted parties. No edit.
* The primary planning session confirmed at 421359d: `src/electron/main/quit-handshake.ts:23` sets `timeoutMilliseconds = 5_000`; `docs/ARCHITECTURE.md` line 456 states "32767 pixels per side and 64 megapixels in total"; line 901 states that a scroll "never resets an idle timer that is already armed".

## Next Task

T5. It is authorized (whole-initiative approval of 2026-11-21) and ready; Q2 and Q3 are answered.

## Next-Session Prompt

```text
Continue plans/documentation-load-and-ownership.md: execute the first task in the Tasks table whose status is not Done. The Product Owner authorized the whole initiative on 2026-11-21 and answered Q1–Q6; do not ask again. Follow the task's section, the Scope Limits, and the Citation Inventory; record the Baseline measurements that T1 and T2 require. Validate at the task's tier, review the diff, commit with the plan status and next-task update, and continue while the budget allows. After T5, set the plan and its index row to Awaiting owner acceptance and send the final report with the before and after measurements.
```
