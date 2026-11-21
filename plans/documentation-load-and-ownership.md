# Documentation Load and Ownership

**Authorization state:** Proposed; awaiting owner decision; no task authorized.

## Objective

1. Reduce the text that every session must read in `docs/DEVELOPMENT.md` §§8–10 by moving reference material out of those sections.
2. Remove the restatements of product behavior from `docs/ARCHITECTURE.md` for duplication rows 1, 4, 6, 7 and 15. The architecture document keeps the mechanism and cites the owning `docs/product/*.md` section.
3. Give each of the first four release rules one owning document.

Source recommendation: Appendix A of the retired plan `plans/product-spec-refactoring.md` (`git show bb427a3:plans/product-spec-refactoring.md`). This plan restates every row it uses, so no other file is needed to execute it.

## Scope Limits

* Documentation only. No product behavior changes. A specification edit only records implemented behavior after an owner answer (Q2, Q3).
* ADRs are historical and are not edited. Keep any text that an ADR cites at its cited location.
* `AGENTS.md` is not edited. Its routing to `docs/DEVELOPMENT.md` §§8, 9 and 10 stays valid. Its 24 KiB core limit is unaffected.
* Existing sections are not renumbered and moved headings are not renamed, so all `DEVELOPMENT.md#...` anchors stay valid.
* Moves are verbatim. Text is deleted only when it is an exact duplicate resolved by T3. No text is reworded except citations and one pointer sentence per source section.
* Out of scope: duplication rows other than 1, 4, 6, 7 and 15; process-document rows 5–8; the placement of `ARCHITECTURE.md` §8 and §13 (Q4); new `check:docs` quantity patterns; any rewrite of `AGENTS.md` or `docs/AGENT_WORKFLOW.md`.

## Source-of-Truth Links

`AGENTS.md` §§8, 10, 11, 13; `docs/AGENT_WORKFLOW.md` §8, §11; `docs/DEVELOPMENT.md` §§8–12 and §11 (plan format); `docs/AGENT_ROLES.md`; `docs/ARCHITECTURE.md` §§2, 7, 9, 11, 13; `docs/product/persistence.md` §16.1; `docs/product/images.md` §17; `docs/product/editing.md` §10; `docs/releasing.md`; `deployment/github-pages/README.md`; `docs/SECURITY.md` "Browser publication".

## Authorization

* Proposed approval scope: the whole initiative. T5 also waits for the answers to Q2 and Q3.
* Selected coding tool: chosen at authorization. The plan was prepared in Claude Code.
* Priorities: T1, T2, T3, T4, T5.
* Delegated decisions and their principles:
  * The exact wording of pointer sentences and the order of subsections inside §18. Principle: one sentence per source section, citing by section number and heading.
  * Whether a paragraph inside a moved subsection is reference material. Principle: a rule needed to choose validation, record evidence, check capabilities or write tests stays in §§8–10. CI, container, media, per-tool permission and historical-measurement text moves to §18.
* Reserved decisions:
  * Q1–Q6.
  * Any difference between two documents that Q2 or Q3 does not settle.
  * Any deletion that is not an exact duplicate.

## Baseline (2026-11-21, commit 421359d)

Line ranges are exact. Byte sizes are planner estimates from line-by-line reading, probably within about 10%. The executing session records the measured result in its task evidence.

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

## Citation Inventory (checked 2026-11-21)

`check:docs` checks only that a linked file exists, not its anchors. It does not check links in `docs/releasing.md` or `deployment/github-pages/README.md`. Check every row below by hand.

| Citation | Location | Action |
| --- | --- | --- |
| "§9 describes the smoke checks" | `e2e/AGENTS.md:7` | T1: change to §18 |
| "platform allocation … §9" | `e2e/electron/AGENTS.md:10` | T1: change to §18 |
| "Linux functional subset … as described in §9" | `docs/DEVELOPMENT.md:302` | T1: change to §18 |
| `DEVELOPMENT.md#9-full-validation` ("validation gates before publication") | `docs/PRODUCT.md:40` | T1: change to `#github-actions` |
| "§§3 and 9" (attribution check) | `docs/AGENT_WORKFLOW.md:398` | T1: keep the attribution paragraph in §9 |
| "§9" for screenshot repeat commands | ADR 0019; `e2e/electron/AGENTS.md:9` | Keep Screenshot Rendering Scale in §9 |
| `#risk-based-validation` | ADR 0006 | Do not rename that heading |
| "historical macOS measurements below" | `docs/DEVELOPMENT.md:344` | T2: change to §18 |
| "§8 for rule loading and restart requirements" | `e2e/electron/AGENTS.md:36` | T2: change to §18 |
| `#task-capability-check` for `npm run test:safari` | `src/web/README.md:271` | T2: change to the new §18 anchor |
| "Claude Code … Bash sandbox, see §10" (code comment) | `scripts/check-opencode-permissions.mts:418` | T2: change to §18 (Low Risk) |
| `#chromium-container-tests`, `#cross-platform-smoke-checks`, `#what-the-memory-suite-can-detect`, `#local-affected-spec-e2e-validation`, `#task-capability-check`, `#11-multi-session-initiatives` | various files | Valid while heading text is unchanged; recheck |

All other `DEVELOPMENT.md` §8/§9/§10 citations name content that stays in place. These include the risk tier, evidence rules, lifecycle verification, fixture teardown, diagnostic options, the editing-mode categories and the memory-suite limits. Each task must search the repository for `DEVELOPMENT.md` again and resolve any new match.

## Tasks

| ID | Outcome | Depends on | Files | Tier | Acceptance evidence | Reviewer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | §9 reference material moved to new §18 | Q1 | `docs/DEVELOPMENT.md`, `e2e/AGENTS.md`, `e2e/electron/AGENTS.md`, `docs/PRODUCT.md`, this plan | Minimal + `check:opencode` | Verbatim report shows `removed 0`; inventory rows resolved; new §9 line span | None required | Planned |
| T2 | §8 and §10 reference material moved to §18 | T1 | `docs/DEVELOPMENT.md`, `e2e/electron/AGENTS.md`, `src/web/README.md`, `scripts/check-opencode-permissions.mts` (comment only), this plan | Low (`npm run check`) | Verbatim report shows `removed 0`; inventory rows resolved | None required | Planned |
| T3 | One owner for each of release rules 1–4 | T1, Q5 | `docs/DEVELOPMENT.md`, `docs/releasing.md`, `deployment/github-pages/README.md`, `docs/ARCHITECTURE.md` §2, this plan | Minimal + `check:opencode` | Each rule appears in full once; other copies cite it; manual link check | None required | Planned |
| T4 | Rows 6, 7 and 15 resolved | none | `docs/ARCHITECTURE.md` §§2, 7, 11, this plan | Minimal | Code constants match the specification; diff contains only the citation sentences | None required | Planned |
| T5 | Rows 1 and 4 resolved | Q2, Q3 | `docs/ARCHITECTURE.md` §§7, 9, 13, `docs/product/persistence.md`, this plan | Minimal | Owner answers applied; existing automated coverage named | None required | Planned |
| T6 | Closure after acceptance | Acceptance | this plan, `plans/README.md` | Minimal | Plan and index row removed | None | Planned |

Validation commands for each tier:

* Minimal Risk: `npm run format:check:changed` and `npm run check:docs`.
* `+ check:opencode`: also run `npm run check:opencode`. It scans `docs/DEVELOPMENT.md` for `npm run` names, and T1 also changes agent instruction files.
* Low Risk: `npm run check`.

No task needs an independent reviewer or product verifier under `AGENTS.md` §13. All tasks are contained documentation changes with no user-visible behavior change. The primary agent reviews each diff. Each task commits its plan status and next-task update with the change.

### T1. Move §9 reference material into a new §18

1. Append `## 18. Reference Material` after §17. Add one introduction sentence saying that the section is read on demand and covers CI, Linux containers, README media, agent tool configuration and historical measurements.
2. Move these blocks verbatim, keeping their heading text. A heading level may change.
   * `### Chromium container tests`
   * `### GitHub Actions`, with `#### Scroll rendering regressions`, `#### Cross-platform smoke checks` and `#### Workflow and job naming policy`
   * `### README Screenshot Maintenance`
   * `### Demo Video Generation`
   * The build-configuration paragraph at the start of Risk-Based Validation (lines 862–870), under a new `### Build and test configuration` heading
3. Move the paragraph that begins "The `Enforce agent attribution policy` workflow" out of the smoke subsection to the end of the §9 introduction. It stays in §9.
4. Keep these in §9: the introduction, Risk-Based Validation, Local affected-spec E2E validation, Screenshot Rendering Scale, and Validation Evidence and Reuse.
5. Add one pointer sentence after the §9 parity paragraph that names the §18 subsections.
6. Run `npm run check:docs -- --verbatim HEAD --file docs/DEVELOPMENT.md --allow-added <n>` after the pure move and before any citation edit. It must report `removed 0`. Record the report.
7. Apply the T1 rows of the citation inventory. Check every `§8`, `§9`, `§10` and `#` reference inside `docs/DEVELOPMENT.md`.

### T2. Move §8 and §10 reference material into §18

1. Move `#### Historical macOS memory evidence` (§8) to §18.
2. Create `### Agent tool configuration` in §18. Move into it:
   * the §8 paragraphs on Codex project rules, process inspection and live tool checks (lines 396, 400, 402);
   * the §10 paragraphs from "The root `CLAUDE.md` imports" through "Allowed npm scripts and Git hooks execute" (lines 1039–1068).
3. Move `### On-device summarization` (§10) to §18.
4. Keep these in place:
   * §8 lines 324 and 398: the command forms and the diagnostic options that `docs/AGENT_WORKFLOW.md` §4 cites;
   * "What the memory suite can detect", which `docs/product/non-functional.md` and two anchors cite;
   * the §10 Shared agent instructions;
   * the capability-check rules (lines 1029–1037);
   * the `fix:history` and handoff paragraphs.
5. Run the same verbatim check as T1, then apply the T2 rows of the citation inventory.

### T3. One owner for each release rule

| Rule | Owner | Copies to replace with a one-sentence citation (line numbers at 421359d; find them by text) |
| --- | --- | --- |
| 1. Release gate composition | `docs/DEVELOPMENT.md` "GitHub Actions" (§18 after T1) | `docs/releasing.md:33–34, 122–123`; `deployment/github-pages/README.md:10–18`; DEVELOPMENT §12 "Preparing a macOS release" (1367–1369, 1392); `ARCHITECTURE.md` §2 lines 56–58 (Q5) |
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
| Before authorization | Answer Q1–Q6 together | 1 decision round |
| Before each commit | None. All evidence is automated or comes from the primary agent's diff review. | 0 |
| After T5 | Read `docs/DEVELOPMENT.md` §§8–10 and §18, the T3 release texts, and the `ARCHITECTURE.md` and `persistence.md` diffs. Then accept or reject. | 1 acceptance round |
| Possible extra rounds | T3 finds contradictory release statements; T5 finds a newly stated rule without automated coverage | 0–2 |

Unresolved capabilities: none known. Tasks need file editing and the named npm scripts. T2's `npm run check` needs the normal local toolchain but not Electron, a display or network access.

## Budget

* Execution: 3 primary sessions. Session 1: T1. Session 2: T2, T3 and T4. Session 3: T5 after the Q2 and Q3 answers.
* Recovery: at most 1 additional primary session for the whole initiative. The two-attempt limit per blocker in procedure §12 still applies.
* Closure allowance: 1 short session for T6 after acceptance. Repairs after a rejection use the remaining recovery allowance.

## Owner Questions

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

* `scripts/check-opencode-permissions.mts` requires an approval rule for every `npm run` name in `docs/DEVELOPMENT.md`. `scripts/check-docs.mts` uses a fixed live-document list. This is why Q1 recommends keeping the moved text in the same file.
* `npm run check:docs -- --verbatim <ref> --file <file> --allow-added <n>` reports removed, added and moved paragraph units. It fails only on removed units or too many added units. T1 and T2 use it as proof that a move deleted no text.
* The specification already owns the limits of row 6 (commit 4153d93). Row 15's trusted parties are cited, not restated (commit 421359d).
* The scoped audit acceptances in §9 (2026-11-05, 2026-11-07, 2026-11-10) and §12 (2026-11-08) cover completed work. They move verbatim. Removing them is not in scope.
* The primary planning session confirmed at 421359d: `src/electron/main/quit-handshake.ts:23` sets `timeoutMilliseconds = 5_000`; `docs/ARCHITECTURE.md` line 456 states "32767 pixels per side and 64 megapixels in total"; line 901 states that a scroll "never resets an idle timer that is already armed".

## Next Task

None. No task is authorized. After authorization and the Q1 answer, the next task is T1.

## Next-Session Prompt

```text
Continue plans/documentation-load-and-ownership.md. Read the plan. Check that its authorization state records the Product Owner's approval and the answers to Q1–Q6. Then take the task named under "Next Task". If the plan still says "no task authorized", stop and report that instead of starting work.
```
