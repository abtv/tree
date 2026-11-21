# Documentation Consistency and Policy Load

**Authorization state:** Authorized by the Product Owner on 2026-11-21 for the whole initiative (Q1). Q1–Q11 are answered (see Owner Questions). Order of work: T1, T2, T10, T11, T0, then T3, T6, T7, T8, then T4 and T5 only if T0 shows an effect, then T9.

## Objective

1. Correct the statements in the documentation and agent settings that this audit confirmed to be wrong, stale or contradictory.
2. Give each duplicated workflow rule one owning document, so that copies cannot diverge again.
3. Reduce the text that a session must read before a typical task, by moving material that the routed decision does not need and by moving tool-specific text out of sections that every tool reads.
4. Record the evidence that the Product Owner needs for two later decisions: whether written rules work (TD-001) and which features to remove (Appendix A).

The audit ran on 2026-11-21 at commit `bba6aa1`. It answers the Product Owner's hypothesis that the documents are many, large, duplicated, confusing and contradictory. Result: size and duplication are confirmed; contradictions are few and local; broken references and staleness against code are not confirmed.

## Scope Limits

* Documentation, agent adapter text and documentation checks only, plus the removal of OpenCode support (T10). No product behavior changes and no production code changes.
* No rule is added, removed or changed in meaning unless an Owner Question below settles it. A task that finds a difference in meaning between two copies stops and reports it.
* No rewrite of `AGENTS.md` or `docs/AGENT_WORKFLOW.md`. Sections keep their numbers. `AGENTS.md` stays within its 24 KiB limit. T11 replaces one rule by the owner's text.
* Implementation is not delegated to subagents (owner instruction of 2026-11-21). Review and verification roles remain available under procedure §13.
* `docs/product/` is not edited. It was restructured by the initiative closed in `526706e`.
* Existing ADRs are not edited. A changed decision is recorded by a new ADR (Q7).
* `docs/ARCHITECTURE.md` is not regrouped. TD-003 stays deferred (Q8).
* No feature is removed. Appendix A only measures.
* Moves are verbatim. A deletion is allowed only for an exact duplicate, for text that an Owner Question names, or for the stale items listed in T1.

## Source-of-Truth Links

`AGENTS.md` (whole); `docs/AGENT_WORKFLOW.md` §§4, 5, 8–13; `docs/DEVELOPMENT.md` §§8–12, 16, 17; `docs/DEVELOPMENT_REFERENCE.md` §§1, 3, 4; `docs/AGENT_ROLES.md`; `docs/WORKING_WITH_AGENT.md`; `docs/OPEN_QUESTIONS.md` TD-001 and TD-003; `docs/decisions/README.md`; `scripts/check-docs.mts`; `scripts/check-opencode-permissions.mts`; `opencode.json`; `.claude/`, `.codex/`, `.opencode/`.

Earlier work: `git show bb427a3:plans/product-spec-refactoring.md` (Appendix A.4 measurement method) and `git show c4c4821:plans/documentation-load-and-ownership.md`.

## Authorization

* Approval scope: the whole initiative, authorized by the Product Owner on 2026-11-21 (Q1). The authorization holds across task and session changes; a new session does not ask again. Final owner acceptance follows T9.
* Selected coding tool: Claude Code.
* Order: T1, T2, T10, T11, T0, T3, T6, T7, T8, then T4 and T5 only if T0 shows that moving text reduces what sessions read; otherwise T4 and T5 are marked `Cancelled` with the T0 result as the reason. T9 last.
* Delegated decisions and their principles:
  * The wording of pointer sentences. Principle: one sentence that names the owning document and section.
  * Whether a paragraph is decision material. Principle: a rule needed to choose validation, record evidence, check capabilities or write tests stays in the routed section. Fixture internals, tool internals, dated investigations and per-tool permission mechanics move to `docs/DEVELOPMENT_REFERENCE.md`.
  * The rule-size budget of Q4. Principle: the budget covers the binding agent rules, `AGENTS.md` + `docs/AGENT_WORKFLOW.md` + `docs/AGENT_ROLES.md`, as one total, because a budget on one file moved growth to another file once already (L2). Until T7 sets the number, the total is held at 107,102 bytes (commit `0e6517e`): T1 adds 233 bytes for two corrections, T10 must end below that baseline, and T11 must not increase the total it receives.
* Reserved decisions: any difference in meaning between copies that Q2 does not settle; any deletion outside the Scope Limits; any permission change in `.codex/` or `.claude/settings.json` beyond what T10 needs to keep the documented-command check working.

## Evidence Labels

Each claim carries its basis, as in `docs/OPEN_QUESTIONS.md` §1.

* **[RF]** Repository fact: a file and line, a command, or a commit at `bba6aa1`.
* **[AI]** Agent inference.
* **[UV]** Unverified: reported by one independent audit pass and not re-checked by the planning session, or not observable from the repository.

Independent passes: a reviewer and a planner in fresh contexts audited the workflow policy and the development documents without the planning session's conclusions. Three further fresh sessions measured the Git history, the architecture slice and the feature costs. The planning session re-checked every finding below against the text or re-ran its command unless the row is labeled [UV].

## Baseline (2026-11-21, commit `bba6aa1`)

Method: bytes from `wc -c`; section bytes from the heading offsets of `grep -b -n '^## ' <file>`, subtracted; line blocks from `sed -n '<first>,<last>p' <file> | wc -c`. Tokens are an estimate at four bytes per token.

### Corpus [RF]

| Text | Bytes |
| --- | --- |
| All tracked Markdown (90 files, `git ls-files '*.md'`) | 1,220,251 |
| `docs/product/*.md` (16 files) | 286,719 |
| `docs/ARCHITECTURE.md` | 211,377 |
| `docs/DEVELOPMENT.md` + `docs/DEVELOPMENT_REFERENCE.md` | 150,182 + 57,622 |
| `docs/decisions/*.md` (29 ADRs and the index) | 93,090 |
| `docs/VIM_CONFORMANCE.md` | 85,928 |
| Workflow policy: `AGENTS.md` + `docs/AGENT_WORKFLOW.md` | 22,105 + 67,883 |
| `docs/AGENT_ROLES.md`, `docs/WORKING_WITH_AGENT.md` | 17,114, 15,071 |
| `scripts/check-docs.mts` and its test | 67,342 + 72,141 |

### Mandatory reading by work type [RF for bytes, AI for the route reading]

Routes are the action table and section text of `AGENTS.md`. The task's own product and architecture sections are excluded.

| Text | Bytes | Product change | Defect fix | Documentation only |
| --- | --- | --- | --- | --- |
| `AGENTS.md` (loaded by `CLAUDE.md`) | 22,105 | yes | yes | yes |
| Procedures §4 General Working Rules | 9,877 | yes | yes | yes |
| Procedures §5 Product Changes | 7,211 | yes | no | no |
| Procedures §9 Tests | 9,837 | yes | yes | no |
| Procedures §10 Validation | 6,718 | yes | yes | yes |
| Procedures §11 Documentation | 3,895 | yes | no | yes |
| Procedures §12 Git | 10,037 | yes | yes | yes |
| Procedures §13 Completion Criteria | 2,423 | yes | yes | yes |
| `docs/DEVELOPMENT.md` §9 Full Validation | 26,160 | yes | yes | yes |
| `docs/DEVELOPMENT.md` §10 Development Workflow | 4,916 | yes | yes | yes |
| **Total** | | **103,179** | **92,073** | **86,131** |
| Estimated tokens | | about 25,800 | about 23,000 | about 21,500 |

* Conditional additions [RF]: Procedures §8 (9,944) and §14 (2,622), which §5 cites for planning and gaps; `docs/DEVELOPMENT.md` §8 Tests (54,795) for the navigation matrix and test-level examples; Procedures §1 (3,901) and `docs/AGENT_ROLES.md` (17,114) before delegation; `e2e/electron/AGENTS.md` (8,432) for E2E work; `docs/DEVELOPMENT.md` §11 (5,163) for an initiative.
* Release work has no route in `AGENTS.md` [RF: `grep -n -i -E "release|releasing" AGENTS.md` prints nothing]. The texts that describe it are `docs/releasing.md` (18,157) and "Preparing a macOS release" in `docs/DEVELOPMENT.md` §12 (12,190 of the section's 39,147).
* A reviewer subagent is told to read `docs/AGENT_ROLES.md` §3 (1,176 bytes) by its adapter. Whether it also receives `AGENTS.md` is [UV].
* By the A.4 method of the earlier plan (`AGENTS.md`, Procedures §§4, 5, 9, 10, 12, 13, 14, `docs/DEVELOPMENT.md` §§9–10) the total is 101,906 bytes. The earlier values were 148,713 (`bb427a3`) and 150,448 (`52e5485`). The workflow policy is now 70,830 of those bytes (70%).
* When the three files are read without line ranges, the total is 240,170 bytes (`AGENTS.md`, `docs/AGENT_WORKFLOW.md`, `docs/DEVELOPMENT.md`), about 60,000 tokens (estimate). Which of the two a real session does is [UV]; the repository holds no session transcripts (Q10).

## Confirmed Findings

### Load

| ID | Finding | Basis |
| --- | --- | --- |
| L1 | The load is almost the same for every work type: 86–103 KB. Procedures §4, §10, §12, §13 and `docs/DEVELOPMENT.md` §§9–10 are routed for any change that ends in a commit. Selective loading saves text only for documentation-only work. | [RF] table above; [AI] both independent passes reached the same reading of the routes |
| L2 | The 24 KiB limit covers only `AGENTS.md`. The policy total grew from 36,810 bytes (`02242a3`, 2026-09-29) to 59,556 (`966c785`), to 80,047 at the split (`daa8414`, 2026-10-14), fell to 71,845 (`0ec38d9`), and is 89,988 now. `docs/AGENT_WORKFLOW.md` grew from 63,598 (2026-11-15) to 67,883. | [RF] `scripts/check-docs.mts:152,175-178`; `git cat-file -s <rev>:<path>` |
| L3 | 8,593 of the 26,160 bytes of `docs/DEVELOPMENT.md` §9 are not validation-selection rules: Screenshot Rendering Scale with a dated investigation (3,987), fixture mechanics at lines 622–630 (3,013), and `check:docs` internals at lines 497–499 (1,593). | [RF] `sed -n` byte counts |
| L4 | 5,342 of the 9,877 bytes of Procedures §4 are per-tool permission mechanics (lines 59–67). 1,840 bytes are Codex-only bullets (lines 59, 61, 65, 66). Every tool's session reads them before any edit. | [RF] `sed -n "59,67p" docs/AGENT_WORKFLOW.md \| wc -c` |
| L5 | `docs/DEVELOPMENT.md` §8 (54,795) is routed for the navigation matrix (4,051). §12 "Testing Strategy" (39,147) also holds the specification-restructuring tooling (lines 759–871, 8,329) and release preparation (12,190). | [RF] heading offsets and `sed -n` byte counts |
| L6 | `docs/ARCHITECTURE.md` §8 (50,956) and §13 (68,067) are 56% of the file. §4 "Domain Layer", §7 "Application Layer" and §21 "Module Structure" also hold other subjects (search, desktop updates, Vim and caret mechanics). | [RF] section sizes; [UV] the subject split inside sections |

### Duplication

| ID | Rule | Locations | State |
| --- | --- | --- | --- |
| D1 | Delivery report and handoff contents | `AGENTS.md:179`; `docs/AGENT_WORKFLOW.md:435-448`; `docs/WORKING_WITH_AGENT.md:92`; `docs/DEVELOPMENT.md:656` | Diverged [RF]. The core says at most three lines. The procedure allows added lines. The guide names the list that the procedure keeps out of the conversation. |
| D2 | Working plan for an initiative task | `docs/DEVELOPMENT.md:677`; `docs/AGENT_WORKFLOW.md:167` | Diverged [RF]. "Each initiative task uses the temporary working plan" against "most individual tasks of an initiative" use a conversation plan. |
| D3 | Repeat validation after a fix | `AGENTS.md:187`; `docs/AGENT_WORKFLOW.md:328,480`; `docs/DEVELOPMENT.md:614` | Agree [RF] |
| D4 | A suite that cannot run its boundary is not a pass | `AGENTS.md:147`; `docs/AGENT_WORKFLOW.md:338`; `docs/DEVELOPMENT.md:534,616` | Agree [RF] |
| D5 | Geometry assertion for alignment | `docs/AGENT_WORKFLOW.md:244`; `docs/DEVELOPMENT.md:602` | Same sentence [RF] |
| D6 | Owner verification rounds for an initiative | `docs/AGENT_ROLES.md:30`; `docs/DEVELOPMENT.md:646,674`; `docs/AGENT_WORKFLOW.md:157`; `docs/WORKING_WITH_AGENT.md:74` | Agree [RF] |
| D7 | Final owner acceptance | `AGENTS.md:123`; `docs/AGENT_WORKFLOW.md:161-165`; `plans/README.md:11`; `docs/DEVELOPMENT.md:683-685`; `docs/WORKING_WITH_AGENT.md:72` | Agree [RF] |
| D8 | Scratch directory rules | `AGENTS.md:82`; `docs/AGENT_WORKFLOW.md:66,68`; `docs/DEVELOPMENT.md:1058-1066` | Agree [RF] |
| D9 | Process interruption | `AGENTS.md:82` ("in Codex use standalone `kill -INT`"); `docs/AGENT_WORKFLOW.md:64` (all tools) | Diverged in scope [RF] |
| D10 | Visible E2E run command | `docs/DEVELOPMENT.md:324` (wrapper for all three tools); `e2e/electron/AGENTS.md:34-36` (prefixed forms; wrapper "In Codex") | Diverged [RF] |
| D11 | History rewriting | `AGENTS.md:163` and `docs/AGENT_WORKFLOW.md:393` (never); `docs/DEVELOPMENT.md:1083` ("unless explicitly requested") | Diverged [RF] |
| D12 | Questions shown by the `ideas` call | `docs/WORKING_WITH_AGENT.md:14` (PD-001, PD-002, PD-004, TD-001); `docs/OPEN_QUESTIONS.md` also holds TD-003 and TD-004 | Diverged [RF] |
| D13 | Release pipeline and the `Release-Note` field | `docs/DEVELOPMENT.md:62-69,943-957`; `docs/releasing.md`; `docs/DEVELOPMENT_REFERENCE.md:104-135`; `deployment/github-pages/README.md`; `docs/SECURITY.md:92-108`; `docs/AGENT_WORKFLOW.md:401-405` | Agree [UV: line ranges outside `docs/DEVELOPMENT.md` not re-checked] |
| D14 | Product quantities restated in `docs/ARCHITECTURE.md` | 17 passages compared with `docs/product/` | All agree [UV]. `scripts/check-docs.mts:136-145` guards five other quantities [RF]. |

### Contradictions, wrong references and stale statements

| ID | Finding | Basis |
| --- | --- | --- |
| C1 | The scenario-spec handoff (`docs/AGENT_ROLES.md:56`, added in `bba6aa1`) needs `npm run test:e2e -- <spec>`. The OpenCode verifier allows only the exact `npm run test:e2e` (`opencode.json:359-366`), and `scripts/check-opencode-permissions.mts:333-336` asserts that an argument form is denied. | [RF] for the configuration; [AI] that the handoff is denied in OpenCode |
| C2 | `docs/DEVELOPMENT.md:608` prescribes `TREE_E2E_VISIBLE=1 npx playwright test …`. No allow rule in `.claude/settings.json` or `.codex/rules/` matches that prefixed form, and `AGENTS.md` §4 requires named workflows. The form also skips the build that `npm run test:e2e` runs. | [RF] |
| C3 | `docs/decisions/0020-agenda-derived-projection-and-runtime-view-state.md:16` says Agenda folds never enter the persisted schema. `docs/product/agenda.md:90` and `docs/ARCHITECTURE.md:901` (`view.agendaFolds`) say fold choices are saved. The ADR status is still `Accepted`. | [RF] |
| C4 | Other ADRs describe a state that has passed: 0018 cites `Cmd+Y` for §2.5, which now says `Cmd+Enter` [RF]; 0002 and 0011 (macOS-only E2E), 0007 (no nested scroll container), 0012 (five parallel specs), 0003 (menu with Quit only), 0010 (§22.1 wording) [UV]. | [RF] for 0018; [UV] for the rest |
| C5 | `docs/DEVELOPMENT.md:452` says `check:e2e-modes` covers `e2e/electron/*.spec.ts`. The script walks all of `e2e/` (`scripts/check-e2e-editing-modes.mts:62`). | [RF] |
| C6 | Citations that name `AGENTS.md` for rules that now live in the procedures: `docs/DEVELOPMENT.md:405,592,670,729,1060`; `docs/WORKING_WITH_AGENT.md:70`. | [RF] |
| C7 | `.claude/agents/planner.md:11` and `.codex/agents/planner.toml:9` say "report the omission per §2". `docs/AGENT_ROLES.md` §2 has no omission rule; §3 has one. | [RF] |
| C8 | `docs/AGENT_ROLES.md:18,64` send the Product Researcher trigger to `AGENTS.md` §5. Neither `AGENTS.md` §5 nor Procedures §5 names the role. | [RF] `git grep -n -i researcher` |
| C9 | `docs/AGENT_ROLES.md:46` cites `docs/DEVELOPMENT.md` §9 for "test/build/lint commands"; `npm test` is defined in §8 and the list has no lint command. | [RF] |
| C10 | `docs/ARCHITECTURE.md:583` names `activeOccurrence`; no such identifier exists in non-test `src`. The function reads `activeAgendaOccurrence(agenda)` (`src/renderer/agenda-labels.ts:25-30`). This is the only wrong name among about 320 checked [UV for the count]. | [RF] |
| C11 | `docs/ARCHITECTURE.md` §21 shows a directory tree with directories that do not exist (`src/domain/model`, `src/application/commands`, `src/renderer/components` checked). The text calls it a guideline. | [RF] for three directories |
| C12 | `docs/AGENT_WORKFLOW.md:196` says to create the ADR directory "only when first needed". `docs/decisions/` holds 29 ADRs. | [RF] |
| C13 | `docs/AGENT_ROLES.md:96` cites PD-007, which no longer exists in `docs/OPEN_QUESTIONS.md`. | [RF] |
| C14 | The attribution workflow runs on `pull_request` only (`.github/workflows/enforce-agent-attribution-policy.yml:3-4`). `docs/AGENT_WORKFLOW.md:399` says the hook and the CI check enforce the rule "at the repository level". History has two merge commits, both local merges, so ordinary work does not pass the CI check. | [RF]; [AI] for the consequence |
| C15 | Empty gaps left by removed text: `AGENTS.md:83-84`; `docs/AGENT_WORKFLOW.md:424-426`; `docs/DEVELOPMENT.md:680-682`. | [RF] |
| C16 | `docs/DEVELOPMENT.md:931` describes a failure on Electron 45.2.1 and 45.2.3; `package.json` pins 44.10.2. Four one-time acceptances of one advisory remain (`docs/DEVELOPMENT_REFERENCE.md:18-32`, `docs/DEVELOPMENT.md:937`). | [RF] for line 931; [UV] for the acceptances |

Not confirmed [RF]: `npm run check:docs` passes on 69 live documents. Every anchored link in the process and development documents resolves (checked by hand; the check does not validate anchors). Every `§` citation into `docs/product/` that was checked resolves. The model and effort values of `docs/AGENT_ROLES.md` §6 match the three tools' configuration files.

### Unclear ownership and rules that are hard to apply

| ID | Finding | Basis |
| --- | --- | --- |
| U1 | Workflow policy for initiatives, continuation and handoff lives in `docs/DEVELOPMENT.md` §§10–11, although `AGENTS.md` owns workflow policy and `check:docs` enforces that marker. D1 and D2 diverged there. | [RF] |
| U2 | "Handoff" is not defined. It names both the conversation report and the evidence record (`docs/AGENT_WORKFLOW.md:318` against `:437`). | [RF] |
| U3 | The routing row for resuming work points to Procedures §12. The continuation rule is in §8 (`docs/AGENT_WORKFLOW.md:169`) and the no-ready-task rule in §5 (`:135`). The `continue` and `status` calls and release work have no routing row. | [RF] |
| U4 | Two defect-fix obligations sit outside the defect-first steps (`docs/AGENT_WORKFLOW.md:256-263`): `npm run fix:history` and "name the test level that should have caught it" (`docs/DEVELOPMENT.md:604`). | [RF] |
| U5 | `docs/DEVELOPMENT.md:679` requires measuring input, cached input and output tokens. It names no recorder and no place, and an agent usually cannot see those numbers. | [RF]; [AI] |
| U6 | Manual checks without a named actor: real-keyboard input (`docs/DEVELOPMENT.md:604`) and Retina presentation (`:576`). | [RF] |
| U7 | `scripts/check-docs.mts:695-739` does not include `docs/AGENT_ROLES.md`, `docs/releasing.md`, `docs/SECURITY_AUDIT.md`, `deployment/github-pages/README.md`, `src/web/README.md` or the skills in its link and ADR-reference checks. Section-number citations and anchors are not checked anywhere. | [RF] |
| U8 | `docs/DEVELOPMENT.md` has "8. Tests" and "12. Testing Strategy" with overlapping subjects, a release subsection inside the second, and an unnumbered `## Formatting` heading. | [RF] |

### Unused or weakly used mechanisms

| ID | Mechanism | Evidence |
| --- | --- | --- |
| W1 | `Exploratory` marker (defined in `96f019b`, 2026-09-29) | [RF] No section has ever carried it: `git grep -n -i exploratory -- docs/product` finds only the definition. Agent rules for it take 813 bytes of Procedures §5. |
| W2 | Scratch retirement rule (`879be92`, 2026-10-14) | [RF] `.scratch/` holds 73 directories. [UV] All are newer than the rule; which belong to finished tasks is not observable. |
| W3 | README-imagery question (`4df2c42`, 2026-10-06) | [UV] One recorded use (Agenda plan, 2026-10-09). Conversations are not in Git. |
| W4 | Token-measurement obligation (U5) | [AI] Cannot be carried out by an agent. |
| W5 | Migration modes of `scripts/check-docs.mts` (`--verbatim`, `--ordered`, `--details`) | [RF] Lines 837–1677 of 1,725. Built for the two closed initiatives. This initiative uses `--verbatim` again, so they are not dead. |

### What works and should not be changed

* The core, its route table and the mechanical checks of both (`scripts/check-docs.mts:154-193`).
* Stable `§` numbers, the `docs/PRODUCT.md` index and `npm run check:requirements` (1,387 markers [UV]).
* Role definitions owned by `docs/AGENT_ROLES.md` with thin adapters.
* The risk-tier table, the affected-spec E2E rules, the evidence record and its reuse rules (`docs/DEVELOPMENT.md:527-550,580-612`).
* The gap rule and its test (`docs/AGENT_WORKFLOW.md:100-107`), the discussion boundary and the command menu.
* Mechanical enforcement: the `commit-msg` hook, the `Release-Note` check, the Claude Code hooks, `npm run check:opencode`.
* `docs/releasing.md`, `docs/SECURITY_AUDIT.md`, the nested `AGENTS.md` files, the table contract of `docs/VIM_CONFORMANCE.md`.
* The accuracy of `docs/ARCHITECTURE.md` against code.

## Tasks

Working-task count: 11 (T0–T8, T10, T11; T4 and T5 may be cancelled). Final owner acceptance applies. The table lists tasks by ID; the order of work is in Authorization. Every task also updates this plan and `plans/README.md` in its commit. Tiers follow `docs/DEVELOPMENT.md` §9; "Minimal+" means Minimal Risk plus `npm run check:opencode`.

| ID | Outcome | Depends on | Files expected to change | Tier | Acceptance evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T0 | Investigation: from the session logs of this project, measure separately for Claude Code (`~/.claude/projects/`) and Codex (its session directory, found and reported to the owner) whether agents read the policy and `docs/DEVELOPMENT.md` by section or whole, and how many bytes. Only reading figures enter the report and the repository, never conversation content. | T11 | this plan | Minimal | A table per tool: sessions, files read, ranges, bytes; the command or method behind each number | Planned |
| T1 | Correct C5–C13, C15 and the wording of C14. Add the omission rule to `docs/AGENT_ROLES.md` §2 so that C7 becomes true. Delete the four one-time advisory acceptances of C16 (Q6). No rule changes. The comment at `scripts/check-requirement-coverage.mts:19` moves to T7, which already changes scripts. | none | `docs/DEVELOPMENT.md`, `docs/DEVELOPMENT_REFERENCE.md`, `docs/AGENT_WORKFLOW.md`, `docs/AGENT_ROLES.md`, `docs/WORKING_WITH_AGENT.md`, `docs/ARCHITECTURE.md`, `AGENTS.md` | Minimal+ | Each row quoted before and after; `npm run check:docs` passes; `AGENTS.md` within its limit | Done |
| T2 | Record the TD-001 evidence of Appendix B and the TD-003 evidence of L6 in `docs/OPEN_QUESTIONS.md`, with basis labels and without a status change. | none | `docs/OPEN_QUESTIONS.md` | Minimal | Each new evidence line names its commit or command | Done |
| T3 | One owner per duplicated rule: resolve D1, D2, D9–D12, U1 and U2 by the Q2 answers; replace the restatements of D3–D8 outside the owner with one pointer sentence each. Apply Q5: delete the token-measurement sentence (U5); name the Product Owner as the actor of the two manual checks of U6 and list them in the owner-involvement inventory of procedure §8. | T11 | `docs/DEVELOPMENT.md`, `docs/AGENT_WORKFLOW.md`, `AGENTS.md`, `docs/WORKING_WITH_AGENT.md`, `docs/AGENT_ROLES.md`, `e2e/electron/AGENTS.md`, `plans/README.md` | Minimal+ | For each D row, the one remaining full statement and its pointers; `npm run check:docs -- --verbatim <ref> --file <file>` for each file, with every removed unit found in the owner text or listed for the owner | Planned |
| T4 | Move the L3 material out of `docs/DEVELOPMENT.md` §9 and the restructuring tooling out of §12 into `docs/DEVELOPMENT_REFERENCE.md`, verbatim, with one pointer sentence per source section. Retarget every citation, including the error messages at `scripts/check-docs.mts:122,128`. | T0, T3 | `docs/DEVELOPMENT.md`, `docs/DEVELOPMENT_REFERENCE.md`, citing documents, `scripts/check-docs.mts` and its test | Low (`npm run check`) | Lost-text proof by the Git method of the earlier plan; section sizes before and after | Planned |
| T5 | Move the per-tool permission bullets of Procedures §4 (Codex and Claude Code after T10) to `docs/DEVELOPMENT_REFERENCE.md` §3 and leave one routing sentence per tool. | T0, T10 | `docs/AGENT_WORKFLOW.md`, `docs/DEVELOPMENT_REFERENCE.md`, `AGENTS.md` | Minimal+ | Lost-text proof; §4 size before and after; each tool's sentence names its section | Planned |
| T6 | Add routing rows for release work and for the `continue` and `status` calls. Place the two defect-fix obligations of U4 in the defect-first steps. | Q2 | `AGENTS.md`, `docs/AGENT_WORKFLOW.md` | Minimal+ | `AGENTS.md` byte size within the limit; `npm run check:docs` passes | Planned |
| T7 | Tooling: add the documents of U7 to the link and ADR-reference checks; add a byte budget on the total of `AGENTS.md`, `docs/AGENT_WORKFLOW.md` and `docs/AGENT_ROLES.md`, set at their total when T7 starts (Q4); add to procedure §9 or §12 the rule that a mechanically checkable failure first gets a check, not prose (Q4), within that budget; correct the comment at `scripts/check-requirement-coverage.mts:19` (C6). Tests for the checks. | T3 | `scripts/check-docs.mts`, `scripts/check-docs.test.mts`, `scripts/check-requirement-coverage.mts`, `docs/DEVELOPMENT.md` §9, `docs/AGENT_WORKFLOW.md` | Low (`npm run check`) | New tests fail without the change; `npm run check` passes | Planned |
| T8 | Record the persisted Agenda fold choices in a new ADR that amends ADR 0020, and index it. | none | `docs/decisions/` (new file), `docs/decisions/README.md` | Minimal | The ADR cites `docs/product/agenda.md` §23 and `docs/ARCHITECTURE.md` §13; `npm run check:docs` passes | Planned |
| T9 | Final measurement with the Baseline method, acceptance package, plan status `Awaiting owner acceptance`. | all other tasks | this plan, `plans/README.md` | Minimal | The Baseline tables repeated at the final commit | Planned |
| T10 | Remove OpenCode support (Q3): `opencode.json`, `.opencode/`, `npm run check:opencode` and its script and tests, its stage in `npm run check` and CI, `package.json`, and every mention in documents, including the model routing of `AGENTS.md` §1 and `docs/AGENT_ROLES.md` §§6–7. Keep the documented-command check of `scripts/documented-npm-workflows.mts`: it now requires that every `npm run` command named in `docs/DEVELOPMENT.md` and `docs/DEVELOPMENT_REFERENCE.md` has an allow rule in `.claude/settings.json` and a matching rule in `.codex/rules/`, with tests. Keep the Claude Code interpreter-deny assertions that the OpenCode check made, under the new check's name. C1 and Q11 end with this task. | T2 | `opencode.json`, `.opencode/`, `scripts/check-opencode-permissions.mts` and its replacement with tests, `scripts/documented-npm-workflows.mts`, `package.json`, `.github/workflows/*`, `.claude/settings.json` (only the renamed npm script), `.gitignore` if needed, `AGENTS.md`, `docs/*.md`, nested `AGENTS.md`, skills | Low (`npm run check`) | `git grep -i opencode` finds only history-neutral mentions that the task lists; the new check fails when a documented command lacks a Claude Code or Codex rule (test); `npm run check` passes | Done |
| T11 | Replace the "at most four tasks per primary session" rule of `AGENTS.md` §12 and procedure §12 with the owner's session rule (Owner Questions, "Session rule"). Count plan budgets in tasks and fix cycles instead of sessions in procedures §8 and §12, `docs/DEVELOPMENT.md` §11 and this plan. Remove the next-session prompt requirement where the rule makes it unnecessary. The total of `AGENTS.md`, `docs/AGENT_WORKFLOW.md` and `docs/AGENT_ROLES.md` must not grow (Q4). Not delegated to subagents. | T10 | `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, `docs/DEVELOPMENT.md`, `docs/WORKING_WITH_AGENT.md`, this plan | Minimal | The three rule points of the owner's text are each traceable to one sentence; the byte total before and after; `npm run check:docs` passes | Planned |

Expected effect [AI, estimate]: mandatory reading for a product change falls from 103,179 to about 86,000 bytes by section (L3, L4 and about 3 KB of restatements), about 16%. Read as whole files, the three documents fall from 240,170 to about 218,000 bytes, about 9%. The remaining text is rule text; reducing it further means removing rules, which is the Product Owner's decision (Q4, Q5).

## Owner Involvement

| Round | When | Owner action |
| --- | --- | --- |
| 1 | Before authorization | Done on 2026-11-21: Q1–Q11 answered. |
| 2 | After T9 | Read the final report and the Baseline comparison. Accept or reject. |
| Possible extra rounds | T3 finds a difference in meaning that Q2 does not settle; T10 finds a permission that the documented-command check cannot express without a new rule | 0–2 |

No task needs a manual application check: no product behavior changes. Capabilities: T0 reads session logs outside the repository with the owner's permission of 2026-11-21 (Q10); the sandbox of this session does not allow reading `~/.claude/projects/`, so T0 needs one approved command outside the sandbox per directory listing or read. Unverified until T0 runs.

## Budget

Counted in tasks and fix cycles, not in sessions (owner instruction of 2026-11-21).

* Execution: 11 working tasks plus T9.
* Recovery: at most 2 fix cycles per task for the same blocker (procedure §12) and at most 6 fix cycles in the whole initiative. A fix cycle is one repair of a failed check, a review finding or a rejected result followed by the rerun of the invalidated checks.
* Closure allowance: 1 task after acceptance.

## Owner Questions

Answers of the Product Owner, 2026-11-21:

* **Q1.** The whole initiative is authorized. T1 and T2 first; the rest in the order of Authorization.
* **Q2.** All recommendations accepted (D1, U2, D2, D9–D12, U1).
* **Q3.** Codex and Claude Code stay supported. OpenCode support is removed (T10). The documented-command check is kept and moved to `.claude/settings.json` and the Codex rules, so that every documented command is still checked for a permission.
* **Q4.** Yes: a budget on the total size of the rules in `check:docs`, and the rule that a mechanically checkable failure first gets a check, not prose (T7).
* **Q5.** W1 and W3 stay. W4 and U5 are deleted (T3). U6: the actor is the Product Owner (T3). W2: no tool; the Product Owner deletes old `.scratch` directories.
* **Q6, Q7, Q8, Q9.** Recommendations accepted: delete the four one-time acceptances and keep the Electron 45 note (T1); one new ADR amends ADR 0020 (T8); TD-003 stays deferred; the §8 measurement block stays.
* **Q10.** Yes. T0 may read the session logs of this project for Claude Code (`~/.claude/projects/`) and Codex (the agent finds and reports the path). Reading is measured separately per tool. Only reading figures enter the report and the repository, never conversation content.
* **Q11.** Withdrawn with OpenCode (T10).
* **Session rule (T11).** Replace the "at most four tasks per primary session" limit in `AGENTS.md` §12 with this rule, in the owner's words translated:
  1. Each task starts from the state in the plan (or `WORKING_PLAN.md` for work without a plan) and Git, not from conversation memory. It is finished when the plan records the next task and what cannot be recovered from the repository: decisions from the conversation and unverified observations. A summary of what was done is not written; Git holds it.
  2. After a context compaction the agent rereads the task row and the procedures for the next action. If the compaction happened in the middle of a task, it reviews the whole diff against the task row again before checks and commit.
  3. There is no limit on the number of tasks. The agent stops only for an owner decision or permission, an exhausted plan budget, or when the tool cannot continue. No continuation text is needed: a new session continues from the plan on the command "continue".
  Plan budgets are counted in tasks and fix cycles, not in sessions, in procedures §8 and §12 and in this plan. Implementation is not delegated to subagents. The rule must fit the rule-size budget of Q4.

The questions as proposed:

* **Q1. Approval scope.**
  * Recommended: authorize T1 and T2 now, and the rest as one initiative after Q2–Q11.
  * Alternative: task-by-task approval.
* **Q2. Diverged copies: which text wins?**
  * D1 and U2. Recommended: "delivery report" is the conversation summary of at most three lines with the added lines that `docs/AGENT_WORKFLOW.md:435` names; "handoff" is the evidence record kept in `WORKING_PLAN.md` or the task's scratch directory. `AGENTS.md:179` names the exceptions; `docs/DEVELOPMENT.md:656` becomes a pointer.
  * D2. Recommended: `docs/AGENT_WORKFLOW.md:167` wins; a working plan only when its criteria apply.
  * D9. Recommended: the rule applies to every tool; `AGENTS.md:82` drops "in Codex".
  * D10. Recommended: `npm run test:e2e:visible -- <spec>` for every tool, because it matches the permission prefixes.
  * D11. Recommended: the absolute rule of `AGENTS.md:163` wins; `docs/DEVELOPMENT.md:1083` becomes a pointer.
  * D12. Recommended: `ideas` lists every entry under Active Questions.
  * U1. Recommended: `docs/AGENT_WORKFLOW.md` §8 and §12 own the rules; `docs/DEVELOPMENT.md` §11 keeps the plan format list and the resume steps; §10 keeps the capability check.
  * Changing course later costs one documentation task per row.
* **Q3. Which coding tools stay supported?** Codex and OpenCode adapters were last changed on 2026-11-18. Their cost is the row "Three-tool support" in Appendix A.
  * Recommended: answer for each tool. T5 then moves the per-tool text of a kept tool to the reference document. Removal of a tool's support is a separate task that this plan does not include.
* **Q4. Control of policy growth (TD-001).** Appendix B shows that classes guarded by a hook or check did not recur, and that prose rules about permissions and report format were patched four to five times.
  * Recommended: a byte budget in `check:docs` for `docs/AGENT_WORKFLOW.md` and for the policy total, set at the size after T5, so that a new rule replaces or shortens an old one; and a working rule that a mechanically checkable failure gets a check before prose.
  * Tradeoff: a budget on one file moved growth to another file once already (L2), so the budget must cover the total.
  * Alternative: no budget; repeat this audit periodically.
* **Q5. Unused or weakly used mechanisms.**
  * W1 `Exploratory` marker. Recommended: keep. It is your tool and costs under 1 KB.
  * W2 scratch retirement. Recommended: you decide whether old directories matter. If they do, a listing of directories older than a chosen age in `npm run doctor` replaces reliance on the rule.
  * W3 README-imagery question. Recommended: keep; no evidence either way.
  * W4 and U5 token measurement sentence. Recommended: delete it.
  * U6 manual checks. Recommended: name the Product Owner as the actor and list both checks in the owner-involvement inventory of Procedures §8.
* **Q6. Spent acceptances and dated narration (C16).**
  * Recommended: delete the four one-time advisory acceptances; Git keeps them. Keep the Electron 45 note while the runtime is pinned below 45.
  * Alternative: move them to `docs/DEVELOPMENT_REFERENCE.md` §4.
* **Q7. ADRs that the current state contradicts (C3, C4).**
  * Recommended: one new ADR for persisted Agenda fold choices that amends ADR 0020 (T8). Leave the other ADRs unchanged: their decisions stand and only their context has aged.
  * Alternative: allow a one-line "Amended by ADR NNNN" note in an old ADR; this needs a change to the status rule in `check:docs`.
* **Q8. `docs/ARCHITECTURE.md` regrouping (TD-003, deferred on 2026-11-21).**
  * Recommended: keep it deferred until the feature-removal decision. Agenda, the browser version and the notes archives hold a large part of §8 and §13 [UV], so removal would change what there is to regroup. T2 records the new evidence.
* **Q9. The measurement block in `docs/DEVELOPMENT.md` §8 (lines 312–347, 11,966 bytes).** ADR 0021 cites §8 for these measurements, so the earlier initiative left it in place.
  * Recommended: leave it. It is not in T4.
  * Alternative: move it and leave a stub heading for the ADR citation.
* **Q10. Measurement of real reading (T0).**
  * Recommended: yes, before T4 and T5. If sessions read whole files, a move inside one file saves nothing and only a move to another file helps.
  * It needs your permission to read session transcripts, or exported transcripts from you.
* **Q11. OpenCode verifier and the scenario-spec handoff (C1).** A permission change is reserved.
  * Recommended: record the limitation in `docs/AGENT_ROLES.md` §7 and leave the allowlist unchanged, unless you use the OpenCode verifier.
  * Alternative: allow the one argument form for `_verify-` specs in `opencode.json`; this is Low Risk and changes `scripts/check-opencode-permissions.mts`.

## Decisions and Findings

* The earlier conclusion "do not rewrite `AGENTS.md` or `docs/AGENT_WORKFLOW.md`" was checked again. Its stated reason, a size limit enforced by `check:docs`, holds for the core only (L2). The independent reviewer still judged a rewrite unwarranted: the main rules are coherent and the contradictions are local. This plan follows that judgment and proposes targeted corrections, single ownership and a growth control instead.
* `check:docs` ignores `*.md` in formatting (`.prettierignore`), validates link targets but not anchors, and checks only its live-document list (U7).
* The earlier plan's lost-text method applies to T3–T5: every line removed from a file (`git diff --unified=0`) must occur in the destination file, except retargeted citations.
* `AGENTS.md` has 2,471 bytes of headroom under its limit. T1, T3 and T6 must fit in it.
* T1 results (2026-11-21):
  * C5: the editing-mode paragraph of `docs/DEVELOPMENT.md` §8 names every spec file under `e2e/`.
  * C6: five citations in `docs/DEVELOPMENT.md` (§8 defect-first rules and coverage policy, §9 rendering-sensitive change, §11 plan contents, §12 boundary list, §16 plan locations) and one in `docs/WORKING_WITH_AGENT.md` now name procedure §8 or §9. The comment at `scripts/check-requirement-coverage.mts:19` is left for T7.
  * C7: `docs/AGENT_ROLES.md` §2 states the omission rule that the planner adapters cite.
  * C8: `docs/AGENT_ROLES.md` §§1 and 5 cite the Open Questions rules of procedure §5, which now name the product researcher.
  * C9: the verifier command list cites `docs/DEVELOPMENT.md` §§8–9 and no longer says "lint".
  * C10: `docs/ARCHITECTURE.md` §8 names `activeAgendaOccurrence`.
  * C11: `docs/ARCHITECTURE.md` §21 shows the actual directories (`find src -mindepth 1 -maxdepth 2 -type d`).
  * C12: the sentence about creating the ADR directory is deleted from procedure §8.
  * C13: `docs/AGENT_ROLES.md` §7 cites commit `5cabe49` instead of PD-007.
  * C14: `docs/DEVELOPMENT.md` §§3 and 9 and procedure §12 state that the CI attribution check runs only on pull requests.
  * C15: the three empty gaps are closed.
  * C16 (Q6): the three acceptances in `docs/DEVELOPMENT_REFERENCE.md` §1 and the one in `docs/DEVELOPMENT.md` §12 are deleted; the standing `test:e2e:linux` authorization and the Electron 45 note stay.
  * Rule total (`AGENTS.md` + `docs/AGENT_WORKFLOW.md` + `docs/AGENT_ROLES.md`): 107,102 bytes before, 107,335 after T1 (+233, the two sentences of C7 and C8).
  * Validation: `npm run check:docs`, `npm run check:opencode` and `npm run format:check:changed` passed.
* T10 results (2026-11-21):
  * Removed `opencode.json`, `.opencode/agents/*` and `scripts/check-opencode-permissions.mts`. The ignored local files under `.opencode/` (`node_modules`, `package.json`, `package-lock.json`, `.gitignore`) are not tracked and were left for the Product Owner to delete.
  * `npm run check:opencode` became `npm run check:permissions` (`scripts/check-agent-permissions.mts`), in `npm run check`, the CI check job and `scripts/web-release/workflows.test.mts`. It requires that every `npm run` command named in `docs/DEVELOPMENT.md` and `docs/DEVELOPMENT_REFERENCE.md` is a package script, and that Claude Code and Codex run every standalone package workflow without a new approval, except `npm run release`. It keeps the Claude Code Safari and mutation host checks and the shell-editing deny category.
  * Claude Code decision model (`scripts/claude-permissions.mts`, tested): deny, ask and allow rules in that precedence, then sandbox exclusions (prompt without an allow rule), then the sandbox auto-allow. Codex rule parsing moved into `scripts/codex-rules.mts`, shared with `scripts/codex-permissions.test.mts`.
  * The first run of the new check found that Claude Code would run `npm run release` in the sandbox without a prompt. `.claude/settings.json` gained `Bash(npm run release*)` under `ask`, matching the documented owner-invoked boundary; the `check:opencode` allow entry was removed.
  * Kept on purpose: `opencode` in the agent-name patterns of `.githooks/commit-msg` and `scripts/check-attribution.mts`. They reject attribution lines of any agent tool and are not OpenCode support.
  * Documents: OpenCode text removed from `AGENTS.md` §1, `docs/AGENT_ROLES.md` (§§1, 6, 7 and the adapter list), procedure §4, `docs/DEVELOPMENT.md` §§8–10, 16, `docs/DEVELOPMENT_REFERENCE.md` §3, `docs/SECURITY.md`, `docs/WORKING_WITH_AGENT.md`, `e2e/electron/AGENTS.md` and the Claude Code verifier adapter. C1 and Q11 are closed.
  * Rule total: 106,750 bytes, below the 107,102 baseline.
  * Validation: `npm run check` passed (381 test files, 7,516 tests); `npm run check:permissions` checked 188 expectations.
* T2 results (2026-11-21): TD-001 has four new evidence lines (size history, mechanical against prose enforcement, prose rules re-patched, the inference and its limits). TD-003 has an Evidence section with three lines and records that Q8 keeps it deferred. Statuses unchanged. The §4, §7 and §21 subject claims were re-checked against the text. `npm run check:docs` passed.

## Next Task

T11.

## Next-Session Prompt

```text
Continue plans/documentation-consistency-and-policy-load.md. Read the plan. Check that its authorization state records the Product Owner's approval and the answers to the Owner Questions that the next task depends on. Then take the task named under "Next Task". If the plan still says "no task authorized", stop and report that instead of starting work.
```

## Appendix A. Feature Cost Map

Purpose: input for the Product Owner's later decision about removing features. This appendix makes no recommendation.

Method [RF unless marked]: measured at `bba6aa1` by two fresh sessions. Lines come from `git ls-files <paths> | grep <name pattern> | xargs wc -l`; section bytes from `grep -b -n '^#' <file>` offsets; declared tests from `git grep -c 'test('`; baselines from `git ls-files e2e | grep '\.png$'`. The planning session re-ran nine of the commands (Agenda and Vim E2E lines, Vim source lines, baseline total, search E2E lines, emoji files, non-test source total, `Release-Note` counts, scratch count); all matched. The other numbers are [UV] by the planning session.

Reading the numbers:

* "Code by name" counts non-test files whose path names the feature. It is a lower bound. Feature code inside shared files (`editor-store.ts`, `App.tsx`, `use-node-input-bindings.ts`, `editor-input-handlers.ts`, `styles.css`, `ipc-handlers.ts`) is not attributed; "Shared files" gives the number of other non-test files that mention the feature.
* Rows overlap. `agenda-vim.spec.ts` is in Agenda and Vim. Browser data is part of the browser version. Do not sum the rows.
* Declared tests are not executed tests: a body under `describeForEachEditingMode` runs once per editing mode.
* Not measured: run time and CI minutes per feature.

Repository totals: non-test `.ts` and `.tsx` under `src` 36,974 lines; `src` tests about 99,200 lines; `e2e` without images 45,783 lines, 927 declared tests in `e2e` and `perf`, 284 screenshot baselines; `perf` 7,233 lines; `scripts` 17,302 lines.

### Large features

| Feature | Specification | Other documents | Code by name | Shared files | Unit tests | E2E | Performance tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agenda (§23) | `agenda.md` 26,257 B | ADR 0020 2,481 B; 67 lines in `ARCHITECTURE.md`; 12 in `DEVELOPMENT.md` | 23 files, 3,266 lines | 43 | 36 files, 8,873 lines | 12 specs, 4,729 lines, 68 tests, 37 baselines | 7 specs, 1,284 lines |
| Browser version (§1.4, §1.5, §24) | `browser.md` 27,763 B | `src/web/README.md` 17,301 B; `deployment/github-pages/README.md` 21,581 B; `SECURITY.md` browser sections 10,792 B; reference sections for container and smoke checks 20,305 B; two nested `AGENTS.md` | `src/web` 27 files, 2,631 lines | 28 (noisy upper bound) | `src/web` 26 files, 7,059 lines; script tests 24 files, 3,565 lines | `e2e/web` 27 specs, 6,059 lines, 82 tests | 3 specs, 479 lines; Safari comparison 454 lines |
| Vim mode (§20.2) | `vim.md` 45,347 B; §20.2.26 8,022 B; §22.2 1,431 B | `VIM_CONFORMANCE.md` 85,928 B; two `DEVELOPMENT.md` subsections 7,180 B; 33 lines in `ARCHITECTURE.md` | 18 files, 4,111 lines | 42, with 707 matching lines | 31 files, 7,971 lines | 10 specs, 10,179 lines, 224 tests, 71 baselines | 1 spec, 1,063 lines |
| Image to Text (§15.1) | 4,723 B | ADR 0025 2,229 B | 3 files, 238 lines (one Swift) | 10 | 4 files, 914 lines | 1 spec, 253 lines | none |
| Summarize (§15.2) | 2,937 B | ADR 0026 1,743 B; reference section 866 B | 4 files, 375 lines (one Swift) | 10 | 2 files, 1,172 lines | 1 spec, 255 lines, 1 baseline | 1 spec, 112 lines |
| Desktop export and import (§25) | `desktop-data.md` 6,360 B | ADR 0024 5,928 B; `ARCHITECTURE.md` sections 12,153 B | 9 files, 1,680 lines | 7, with 67 matching lines | 11 files, 3,847 lines | 5 specs, 1,372 lines, 19 tests, 10 baselines | 1 spec, 240 lines |
| Browser export, import and folder backup (§24.2–§24.6) | 14,931 B of `browser.md` | ADR 0023 3,363 B; `ARCHITECTURE.md` sections 9,294 B | 13 files, 1,304 lines (inside `src/web`) | contained in `src/web` | 14 files, 3,360 lines | 4 specs, 1,559 lines, 21 tests | 3 specs, 380 lines |
| Shared notes-archive core | none of its own | ADR 0022 4,269 B | 8 files, 857 lines | imported by both data features | 7 files, 1,666 lines | with the two rows above | with the two rows above |
| Search (§20.14, §20.2.26) | `search.md` 24,070 B | 62 lines in `ARCHITECTURE.md`; 11 in `VIM_CONFORMANCE.md` | 19 files, 2,746 lines | 38 | 27 files, 4,670 lines | 6 specs, 1,843 lines, 36 tests, 10 baselines | 2 specs, 541 lines |

### Smaller features

| Feature | Specification | Code by name | Shared files | Unit tests | E2E |
| --- | --- | --- | --- | --- | --- |
| Emoji completion (§20.12) | 4,499 B | 3 files, 127 lines, plus a 1,915-line catalog | 13 | 8 files, 498 lines | 3 specs, 768 lines, 9 tests |
| Tags (§20.13) | 4,869 B | 4 files, 302 lines | with completion | 8 files, 746 lines | 1 spec, 285 lines, 3 tests |
| Dates and date completion (§20.9–§20.11) | 12,054 B | 3 files, 389 lines | with completion | 6 files, 1,365 lines | 2 specs, 456 lines, 7 tests, 14 baselines |
| Shared completion machinery | none of its own | 6 files, 643 lines | n/a | 7 files, 964 lines | 2 specs, 362 lines, 5 tests |
| Recent nodes (inside §20.14) | about 4,057 B (estimate) | 3 files, 237 lines | 20 (upper bound) | 6 files, 738 lines | 2 specs, 1,236 lines, 19 tests, 6 baselines |
| Command panel and registry (§20.2.7, §20.2.28–§20.2.30) | `command-panel.md` 13,035 B | 4 files, 692 lines | 13 | 6 files, 1,015 lines | 1 spec, 757 lines, 14 tests |
| Images and attachments (§15, §17) | 7,504 B | 11 files, 910 lines | 67 | 16 files, 1,956 lines | 4 specs, 1,047 lines, 27 tests, 9 baselines |
| Clipboard, paste and links (§12–§14) | 7,430 B | 8 files, 803 lines | 35 | 14 files, 2,298 lines | 6 specs, 1,825 lines, 52 tests |
| Node states: struck through, starred, marked (§2.5–§2.7) | 9,297 B; ADRs 0018, 0027, 0028, 0029 10,054 B | 6 files, 247 lines | 52 (upper bound) | 16 files, 2,357 lines | 5 specs, 818 lines, 18 tests, 30 baselines |
| Drag and drop (§11) | 5,203 B | 6 files, 777 lines | 13 | 9 files, 1,259 lines | 5 specs, 1,649 lines, 37 tests, 12 baselines |
| Desktop updates (§26) | 4,210 B | 4 files, 368 lines | n/a | 4 files, 907 lines | 1 spec, 670 lines, 15 tests |
| About window (§9.4) | 2,468 B | 2 files, 140 lines | n/a | 1 file, 57 lines | 1 spec, 150 lines |
| Appearance (§20.5) | 6,250 B | 3 files, 165 lines | n/a | 1 file, 68 lines | 5 specs, 588 lines, 10 tests, 15 baselines |
| Inline expansion (§2.4) | 4,983 B; ADRs 0016, 0017 3,638 B | 1 file, 212 lines | n/a | 345 lines | 1 spec, 1,244 lines, 30 tests |

### Infrastructure and dependents

| Feature | CI, scripts and tooling that exist for it | What depends on it |
| --- | --- | --- |
| Agenda | No workflow of its own. `test:perf:profile` npm script; entries in the mutation and platform configuration; README screenshot and demo video scenes. | 11 non-Agenda modules import Agenda modules, and `vim-keyboard-handler.ts` does too. The persisted view field `agendaFolds`. A command, a menu item, an IPC command and a browser button. Marked nodes appear under Today. Date recognition and date decoration are shared with date completion. |
| Browser version | `run-web-e2e-tests.yml` (whole); the web jobs of `release-new-app-version.yml`, `test-and-build-app.yml` and `run-smoke-tests.yml`; `deployment/github-pages/deploy-web-app.yml`; `scripts/web` (29 files, 2,101 lines) and `scripts/web-release` (31 files, 3,838 lines); 11 npm scripts; a GitHub environment and App for publication; `safaridriver`; the Chromium container image; the `parse5` development dependency. | The Chromium container tooling also runs the Linux Electron, memory and smoke suites. `tsconfig.web.json` is the renderer typecheck project. `test:perf` builds the web application. Release-source reservation shares code with web publication. Shared code has touch and shortcut-profile branches for the browser. |
| Vim mode | `check:e2e-modes` and its script; the conformance citation check in `check-docs.mts`; a project-scoped snapshot path. | Agenda keyboard code and 10 shared modules import Vim modules. Standard editing is specified as Vim Insert without the key handler. Test fixtures start with Vim enabled; 58 specs run in both editing modes. Summarize takes its multi-node selection from Vim Visual mode. The smoke scenario, README screenshots and demo video run with Vim enabled. |
| Image to Text | `scripts/build-image-to-text.mts` in `predev` and `build`; a packaged helper and its signature checks in the release workflow; the `swiftc` toolchain; the CodeQL `swift` entry [AI]. | `image-search.spec.ts` and one store test use its IPC channel as setup. A command-registry entry. A smoke-scenario phase. |
| Summarize | `scripts/build-summarize.mts`; an Xcode 26.2 selection step in four workflows; the macOS 26 SDK. | A command-registry entry and five IPC channels. Desktop import cancels a running summary. |
| Notes export and import | No workflow of its own. The `fflate` runtime dependency (one of two) and an ESLint rule for its API. | 11 IPC channels and events, menu items, and command-registry entries. The shared core is freed only if both the desktop and the browser data features go. |
| Search | Platform-list entries; a README screenshot. | Menu items and registry entries. `GlobalSearchPopup.tsx` also renders Recent Nodes. The smoke scenario uses Vim search and the Search popup. Image search text serves Image to Text. |
| Emoji, tags, dates | A platform-list entry for emoji. | Emoji history IPC. Tag modules are imported by search and completion. `completion-ranking.ts` serves emoji and tags. The smoke scenario accepts an emoji and a date. |
| Command panel | A README screenshot. | The registry holds the commands of most other features. Command history IPC. The smoke scenario opens the panel. |
| Images and attachments | None of its own. | Attachment modules are imported by the notes archive, image search, clipboard, serialization and browser paste. |
| Clipboard and links | The machine-wide clipboard lock for E2E and a Linux clipboard project. | Links are part of the stored document model, not only of paste [AI]. |
| Node states | None. | The persisted schema version (6). Search ordering, Agenda's Today list and Recent Nodes read these states. |
| Desktop updates | The `electron-updater` runtime dependency; `latest-mac.yml` handling in the release scripts and workflow. | Nine IPC channels and two menu items. |
| Appearance | None. | 118 of the 284 baselines are dark variants, so appearance multiplies the screenshots of other features. |
| Any section | n/a | A removed section's number is retired, not reused (`docs/PRODUCT.md`). Tests cite sections with `@requirement` markers that `npm run check:requirements` checks. The shared smoke scenario uses date completion, emoji, Vim search, the command panel and Search on every platform. |

### Process infrastructure (not a product feature)

| Item | Size | What depends on it |
| --- | --- | --- |
| Three-tool support (Claude Code, Codex, OpenCode) [RF] | `opencode.json` 13,584 B; `.opencode/agents/` 4,008 B; `.codex/` 12,321 B; `.claude/settings.json` and agents 8,892 B; `scripts/check-opencode-permissions.mts` 20,585 B; `docs/DEVELOPMENT_REFERENCE.md` §3 12,085 B; per-tool bullets of Procedures §4 5,342 B; `docs/AGENT_ROLES.md` §§6–7 5,916 B | `npm run check:opencode` is a stage of `npm run check`. It also asserts that Claude Code denies the same interpreters. |
| Documentation checks [RF] | `scripts/check-docs.mts` 67,342 B and its test 72,141 B; `check-requirement-coverage.mts` 8,076 B; `check-e2e-editing-modes.mts` 3,162 B | Stages of `npm run check`; the two error messages of the size check cite `docs/DEVELOPMENT.md` §12. |

## Appendix B. Evidence for TD-001 (to be recorded by T2)

Method of TD-001: for a rule added after a defect or a process failure, did that class recur? Source: `git log` at `bba6aa1`; classes were matched by commit subject and by reading the rule-adding diffs. The planning session re-ran the commands for the rows marked [RF]; the other rows are [UV].

| Rule and commit | Form | Later record | Result |
| --- | --- | --- | --- |
| No agent attribution (`f5257c0`, 2026-09-25) | Prose | 7 commits with a Claude co-author trailer on 2026-09-26 to 09-28 [RF] | Recurred |
| The same rule (`71290b6`, 2026-09-29) | `commit-msg` hook | No agent trailer in later commits [UV] | Did not recur |
| `Release-Note` field (`34783b3`, 2026-11-07) | Hook and CI | 102 of 102 later `feat`, `fix` and `perf` commits carry it [RF] | Did not recur |
| Process interruption targets (`8a9ea77`, `90fcc00`, 2026-10-19) | Permission rules | No later commit in the class [UV] | Did not recur |
| Window flash verification (`ab2a7bb`, 2026-10-03) | Prose | No later `fix` subject names a flash [UV] | Did not recur |
| Commit subject format (`87800b7`, 2026-09-24) | Prose | 4 non-matching subjects of 1,247 [UV] | Did not recur materially |
| Permission prompts and sandbox use (`06ac7eb` and others, 2026-10-11) | Prose | 5 further prose rules and 9 permission-configuration commits [UV] | Recurred |
| Delivery report shape (`53c9cf3`, 2026-10-11) | Prose | Re-addressed in `53bf5f3`, `7cbfa2b`, `d3b43cc`, `43e9c53` [UV] | Recurred |
| Scratch retirement (`879be92`, 2026-10-14) | Prose and a script | 73 directories remain [RF] | Not followed consistently |
| More than three minor gaps (`03a150c`, 2026-09-29) | Prose | Strengthened in `43e9c53` on 2026-11-21 [RF for the commit; AI for its trigger] | Recurred once |
| Navigation and caret matrices (`576cf41`, `bdf073b`) | Prose, then ADR 0014 and a decomposition | `fix` subjects with "caret": 22 from 2026-09-19 to 09-28, 12 from 2026-09-29 to 11-21 [UV] | Rate fell after the structural work; the class did not end |
| Geometry assertion for alignment (`4f3f365`, 2026-09-28) | Prose | 4 later fixes by subject match [UV] | Recurred at a low rate |

What this establishes [AI]: where a hook, a check or a permission rule exists, Git shows no later violation; the attribution rule failed as prose first. Prose-only rules have a mixed record. It does not establish a causal link between policy size and adherence, and it says nothing about rules whose compliance is visible only in conversations.

Further facts for TD-001 [RF]: the policy total at the dates of L2; `AGENTS.md` has stayed between 20.5 and 23.5 KB since the split while the uncapped procedures grew. [UV]: Procedures §4 received 20 of the file's 45 commits; three mechanisms were added and removed within days (the owner-intervention journal, the permission log and the initiative runner).
