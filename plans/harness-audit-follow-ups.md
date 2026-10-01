# Harness Audit Follow-ups

## Objective and authorization

This plan tracks a review follow-up batch from the agentic development harness audit of 2026-10-02, performed read-only in a Claude Code session at `HEAD` `89e082b`. The audit report itself was delivered in conversation; the findings each task depends on are restated below so that no task needs that conversation.

On 2026-10-02 the Product Owner asked to plan audit recommendations A, B, and C. Each task is implemented when the Product Owner asks to continue this plan, one ready task at a time under `AGENTS.md` §8. Planning does not authorize implementation.

| Audit item | Finding | Tasks |
| --- | --- | --- |
| A | Mutation testing covers only `src/domain` and `src/application`, while 64 of 98 conventional `fix` commits have the `renderer` or `vim` scope. The pure renderer Vim modules have near-complete line coverage, so coverage cannot show their assertion strength | A1-A4 |
| B | `docs/VIM_CONFORMANCE.md` cites about 230 test names, kept current only by prose in `docs/DEVELOPMENT.md` §8. About nine citations no longer match any test; `git log -S` shows two of them were removed or renamed in `af197b3` (2026-09-30) without a matrix update | B1 |
| C | Each session sees only its own fix. A cluster of fixes in the same code (about 43 fixes, 2026-09-22 to 2026-09-27, per ADR 0014) was answered by two prose rules before a structural refactor ended it, and the Product Owner requested the 2026-10-01 caret initiative. No tool shows an agent the earlier fixes in the code it is fixing | C1 |

Unverified remainder: the audit also named two items the Product Owner has not authorized and that this plan does not track: D, closing the loop on scheduled CI results (push cadence and whether agents can read workflow results; a Product Owner decision because pushing is outward-facing), and E, a differential Vim oracle against headless Neovim (optional, limited evidence). Add them only on a Product Owner request.

## Scope and boundaries

* Test code, validation tooling, the `npm` scripts that expose it, agent-tool allowlists for those scripts, `docs/DEVELOPMENT.md`, `docs/VIM_CONFORMANCE.md`, and one handoff line in `AGENTS.md` §12 (C1 only).
* Production code changes only as defect fixes that a new assertion exposes, under the defect-first workflow in `AGENTS.md` §9, each in its own commit.
* No product behavior change, and no `docs/PRODUCT.md` change.
* No new prose rule in `AGENTS.md` other than the C1 handoff line, which reports the output of a script rather than asking an agent to remember something. Rationale: open question TD-001 in [OPEN_QUESTIONS.md](../docs/OPEN_QUESTIONS.md).
* Never lower `thresholds.break` in `stryker.config.mjs` or a coverage floor in `vitest.config.ts` to make a run pass.

Sources of truth: [AGENTS.md](../AGENTS.md) §§8, 9, 12; [DEVELOPMENT.md](../docs/DEVELOPMENT.md) §§8, 9, 10, 12; [VIM_CONFORMANCE.md](../docs/VIM_CONFORMANCE.md); [ADR 0014](../docs/decisions/0014-single-owner-for-renderer-interaction-state.md).

Decisions reserved for the Product Owner: none known. Ask if a task reveals a material requirement gap, if a stale conformance citation turns out to hide an untested product behavior with no remaining evidence, or if A4's full-run score stays below 93 after A2 and A3.

## Tasks

| ID | Outcome | Depends on | Validation tier | Status |
| --- | --- | --- | --- | --- |
| B1 | Executable check of `VIM_CONFORMANCE.md` test citations; stale citations repaired | — | Low Risk | Ready |
| C1 | Fix-history script and its handoff line | — | Low Risk | Planned |
| A1 | Mutation baseline for the pure renderer modules | — | Minimal Risk | Planned |
| A2 | Survivor triage: Vim text-command modules | A1 | Low Risk (Moderate for a fix commit) | Planned |
| A3 | Survivor triage: caret and session owner modules | A2 | Low Risk (Moderate for a fix commit) | Planned |
| A4 | Survivor triage: drag and list modules; add the renderer modules to the mutation scope; close the batch | A3 | Low Risk | Planned |

Order rationale: B1 and C1 are small and independent and repair or prevent current harness drift, so they go first. A1-A4 are sequential because each triage task reads the A1 baseline and A4 changes the shared configuration only after the score is high enough not to break the weekly run.

The renderer modules in scope for A are the twelve modules with no React, DOM, or Electron imports (checked on 2026-10-02): `vim-editing.ts`, `vim-text-commands.ts`, `vim-surround.ts`, `vim-caret-transition.ts`, `vim-vertical-navigation.ts`, `vim-command-state.ts`, `vim-edit-session.ts`, `link-caret.ts`, `drag-caret-freeze.ts`, `node-drag.ts`, `visible-tree.ts`, and `list-window.ts`, all under `src/renderer/`. Hooks, components, `editor-dom.ts`, `vim-keyboard-handler.ts`, and `editor-input-handlers.ts` stay out of scope: their defects were wiring and timing defects, which the production-hook property test in `use-node-input-bindings.property.test.tsx` guards instead.

### B1 — Conformance citation check

Add a check that every test name cited in `docs/VIM_CONFORMANCE.md` names an existing test or suite in the file it is cited under, and repair the citations that fail it.

* Citation format in the matrix: a backticked repository path followed by a colon and one or more names in curly quotes, for example `` `e2e/vim-text-editing.spec.ts`: “I enters Insert mode”, “A enters Insert mode” ``. A name belongs to the nearest preceding backticked path in the same table cell. Curly-quoted text not preceded by a path (for example “Covered” in the introduction) is not a citation.
* A citation matches when the cited file contains a `describe`, `it`, or `test` title (including `.each`, `.only`-free forms, and `test.describe`) equal to the name. Titles from `.each` contain placeholders such as `$name`, `$command`, `$keys`, or `%s`; treat each placeholder as matching any non-empty text. Normalize straight and curly apostrophes before comparing.
* Report every failing citation with its file and name, and exit nonzero. Report a cited path that does not exist.
* Implement it as an exported, unit-tested function in `scripts/check-docs.mjs` (which `npm run check:docs` already runs inside `npm run check`), with tests in `scripts/check-docs.test.mjs`. A separate script is acceptable only if the parsing makes `check-docs.mjs` hard to read; then add it to `npm run check` and `opencode.json` the same way `check:requirements` is.
* Repair each failing citation: cite the test that now covers the row under its current name, or remove the citation. If a row would be left with no real-Electron evidence that `docs/DEVELOPMENT.md` §8 requires, record that in the handoff rather than inventing a test.
* Replace the prose instruction in `docs/DEVELOPMENT.md` §8 to keep citations honest with one sentence saying `npm run check:docs` verifies them.

Citations that grep did not find at `89e082b` (the check, not this list, is authoritative): “activates the image caret when a Replace session commits on blur at the terminal position”; “activates the image caret when a same-node pointer click commits a Replace session at the terminal position” (the current E2E title omits “at the terminal position”); “anchors the next character Visual motion at the reached caret after Cmd+.”; “clears character Visual endpoints when blur ends the session and re-anchors the next motion” (current title: “clears character Visual endpoints through %s and re-anchors the next motion”); “commits a pending Replace session before context-menu Cut and preserves the selection”; “commits a pending Replace session before the native onPaste fallback”; “commits a pending Replace session when the shutdown finisher runs and consumes it once”; “keeps a block selection when Normal mode focuses another node”; “returns an empty Replace session to Normal without a store edit when the shutdown finisher runs”. Use `git log -S '<name>' -- src e2e` to find what replaced each one.

Files: `scripts/check-docs.mjs`, `scripts/check-docs.test.mjs`, `docs/VIM_CONFORMANCE.md`, `docs/DEVELOPMENT.md` §8, this plan and `plans/README.md`.

Acceptance: before the repairs, `npm run check:docs` fails and lists the stale citations; after them it passes. Unit tests cover a matching title, an `.each` placeholder title, an apostrophe variant, a renamed test, a missing file, and non-citation curly-quoted text.

Validation: Low Risk with validation tooling changed, so `npm run check`.

### C1 — Fix-history signal

Give an agent fixing a defect the earlier fixes in the same code, as a script whose output goes into the handoff.

* Add `scripts/fix-history.mjs` and `npm run fix:history`. Input: repository-relative file paths as arguments; when none are given, the files changed in `HEAD` when `HEAD` is a `fix` commit, otherwise the files in the working-tree diff against `HEAD`. Output, per file: the `fix` commits (subject matching `^fix(\(|:)` or a capitalized `Fix `) in the last 14 days that touched it, excluding `HEAD` itself, as `<short hash> <date> <subject>`, newest first. Exclude test files, documentation, and `e2e/` from the default file set, since the signal concerns production code.
* When any file has three or more such commits, end the output with one line naming those files and stating that the fixes may share a design cause. The script always exits zero: it is a signal, not a gate.
* Use `git` through `child_process.execFileSync` with argument arrays, no shell. Accept `--days`, `--since`, and `--until` options for tests and investigation of past history.
* Add the script to the `develop` agent allowlist in `opencode.json` and to `.claude/settings.json` `allow` as `Bash(npm run fix:history*)`, then run `npm run check:opencode`.
* Add one item to the handoff list in `AGENTS.md` §12: for a defect fix, the output of `npm run fix:history`, and when it reports a possible shared cause, a proposed structural initiative under §8 or a stated reason why none is needed. Add one usage sentence to `docs/DEVELOPMENT.md` §10.

Files: `scripts/fix-history.mjs` (new), `scripts/fix-history.test.mjs` (new), `package.json`, `opencode.json`, `.claude/settings.json`, `AGENTS.md` §12, `docs/DEVELOPMENT.md` §10, this plan and `plans/README.md`.

Acceptance: unit tests against a temporary Git repository cover the window boundary, `HEAD` exclusion, default file selection for a fix commit and for a dirty working tree, the three-commit signal line, and a file with no fixes. Run against real history, `npm run fix:history -- --since 2026-09-13 --until 2026-09-28 src/renderer/use-node-input-bindings.ts` reports the 2026-09-26/27 Vim caret fixes and the signal line; record the output in this plan.

Validation: Low Risk with validation tooling and agent policy changed, so `npm run check` (which includes `check:opencode`).

### A1 — Renderer mutation baseline

Measure the twelve modules without changing configuration.

* Run `npm run test:mutation -- --mutate <the twelve paths, comma-separated in one value> --force` (a repeated `--mutate` keeps only the last one; see `docs/DEVELOPMENT.md` §12). Afterwards run nothing else with Vitest until Stryker has removed `.stryker-tmp/`.
* Record in this plan: date, `HEAD`, run time, total score, and per-file score and survivor count, in a table like the domain/application baseline in the closed Test Oracle Hardening plan (`git show 89e082b^:plans/test-oracle-hardening.md`).
* Do not change tests or configuration in this task.

Files: this plan and `plans/README.md`.

Acceptance: the baseline table is recorded and the run completed. If Stryker cannot run these modules (for example a jsdom test it needs fails in the sandbox), record the error and the versions, set A1 to `Blocked`, and stop.

Validation: Minimal Risk (plan update only): `npm run format:check:changed` and `npm run check:docs`.

### A2, A3, A4 — Survivor triage

Each task reads the surviving mutants for its modules in `reports/mutation/mutation.html` after a narrow run (`npm run test:mutation -- --mutate <its modules>`), and treats each survivor as a question about a missing assertion, following `docs/DEVELOPMENT.md` §12: kill it with an assertion on behavior in the module's colocated test, or leave an equivalent mutant with a Stryker disable comment stating why. When a survivor reveals a real defect, fix it defect-first in a separate commit. Record per-file score before and after in this plan.

* A2 modules: `vim-editing.ts`, `vim-text-commands.ts`, `vim-surround.ts`. Tests: `vim-editing.test.ts`, `vim-text-commands.test.ts`, `vim-surround.test.ts`, and their property tests where they exist.
* A3 modules: `vim-caret-transition.ts`, `vim-vertical-navigation.ts`, `vim-command-state.ts`, `vim-edit-session.ts`, `link-caret.ts`. Tests: their colocated `*.test.ts` and `*.property.test.ts`.
* A4 modules: `drag-caret-freeze.ts`, `node-drag.ts`, `visible-tree.ts`, `list-window.ts`. Then close the batch:
  * run the full configured scope plus the twelve modules with `--force`; when the combined score is at least the current `thresholds.break` (93), add the twelve paths to `mutate` in `stryker.config.mjs` and record the new full-run score; raise `break` only if the measured score supports it under §12's rule; if the score is below 93, set A4 to `Blocked` and ask the Product Owner instead of lowering the threshold;
  * update `docs/DEVELOPMENT.md` §12 so the mutation scope and the "run mutation testing on changed files" rule name these renderer modules;
  * confirm the weekly workflow's 90-minute limit still fits the measured full-run time, and raise it in `.github/workflows/mutation.yml` only if needed;
  * when the Product Owner confirms no further tasks remain, remove this plan and its index row in the closing commit (`AGENTS.md` §8).

Assertions must check behavior (resulting text, caret, range, or state), not which helper was called. Do not edit production code to make a mutant easier to kill.

Files: the named modules' colocated tests; the modules themselves only for disable comments or defect fixes; A4 also `stryker.config.mjs`, `docs/DEVELOPMENT.md` §12, possibly `.github/workflows/mutation.yml`; this plan and `plans/README.md`.

Acceptance: every survivor in the task's modules is killed or documented as equivalent; per-file scores recorded. A4 additionally: the full configured run passes its `break` threshold with the renderer modules included.

Validation: Low Risk (tests): affected focused tests and `npm run check`. A defect-fix commit is Moderate Risk: `npm run check`, the affected unit or property tests, and focused E2E coverage for the affected requirement (for Vim behavior, the relevant `e2e/vim-*.spec.ts`).

## Next task and resume prompt

B1 is the next ready task. No task of this plan has started.

```text
Continue the Harness Audit Follow-ups plan in plans/harness-audit-follow-ups.md: execute the next ready task.
```
