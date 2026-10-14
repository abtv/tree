# E2E Coverage Efficiency

**Status: Broader initiative remains deferred.** On 2026-10-15 the owner authorized only separating the two long memory measurements, measuring their cost, validating both sets and committing the result. This single bounded task does not resume runner/readiness, reuse changes, other test families or the remaining directions below. No other next task is ready.

## Bounded memory separation

**Completed.** The ordinary and memory configurations select disjoint sets of 785 and 2 cases with the same combined coverage as the original 787. All 16 ordinary shared-application infrastructure cases remain. The standalone controls retain their original sample helper, loops, assertions, timeouts and attachments; both execute successfully. Development §8 owns the commands and CI ownership. The remaining initiative directions stay deferred; this one working task does not close the broader initiative.

The authorized task preserves both twelve-burst controls and every ordinary reset/recovery test. Its files are the shared-application specs, ordinary and memory Playwright configurations, npm entry, E2E typecheck inclusion, dedicated CI workflow and development instructions. Acceptance requires disjoint ordinary/memory discovery with unchanged combined coverage, both controls executing with their sample artifacts, required Low Risk checks, a same-host six-worker ordinary before/after comparison and primary diff review. No product decision or owner verification is required. All other initiative work remains deferred after this task.

The owner authorized shortening this record on 2026-10-14. That preserved the unresolved objective and evidence without authorizing implementation. The later bounded memory request above is the only implementation authority. The former six-task runner proposal is historical, not the current execution plan.

## Objective

Reduce the cost of validating ordinary changes as the editor grows. Keep exhaustive rules and state combinations at the lowest faithful test layer, and retain real Electron coverage for behavior that cheaper tests cannot reproduce. The owner's desired direction is approximately one minute of relevant local feedback and lower macOS CI cost, not a numerical test-count quota.

The completed Fold/Expand Test Pilot transferred one nested expansion round trip to an App composition test and retained the remaining Electron coverage. Its result can inform this initiative; it cannot establish that the broader objective is complete. Its separate budget did not fund this initiative; Git history retains the pilot plan and result.

## Established evidence

- Historical measurements recorded by `abtv` on 2026-10-11 in `95e8b7f:plans/e2e-suite-time.md`: 746 cases, 795 launches; launch plus teardown accounted for 62.8% and 64.3% of summed test time. These are historical cost shares, not current wall-time savings.
- The completed bounded reuse rollout at runtime commit `3dff3bf` passed 773 cases in 254.01/257.30 seconds versus 280.51/280.37-second fresh controls: an 8.2–9.4% wall-time reduction, excluding builds. [Development §8](../docs/DEVELOPMENT.md#8-tests) owns the measurements; [ADR 0021](../docs/decisions/0021-worker-owned-e2e-application-reuse.md) owns the isolation decision.
- [Development §9](../docs/DEVELOPMENT.md#9-full-validation) already permits focused local E2E below High Risk. Whether its remaining full-local triggers impose disproportionate cost needs assessment; actual agent rerun frequency has not been measured.
- The bounded separation on 2026-10-15 measured the original shared and fresh memory controls at 32.12 s and 74.55 s, respectively (106.67 s summed test time). One sequential same-host hidden six-worker comparison passed 787 original cases in 219.31 s and 785 ordinary cases in 195.45 s: 23.86 s / 10.9% less wall time, excluding builds (0.61 s and 0.70 s). Ordinary launches fell from 802 to 705. This is one local pair with host variance, not a portable saving. Both controls remain in [shared-application-memory.spec.ts](../e2e/shared-application-memory.spec.ts); moving their schedule reduces ordinary-run cost rather than eliminating their work.
- Vim text-command and Agenda command-matrix overlap was identified as a candidate, not proven redundant coverage. A similar title, requirement marker or mocked handler test does not establish equivalence.

General launch cost has already been investigated. Reuse this evidence rather than restarting a full audit; obtain fresh focused measurements only where a new decision needs them.

## Unresolved directions

These are questions for a future bounded proposal, not ready implementation tasks.

| Direction | What must be established before a change |
| --- | --- |
| Local validation scope (former EC-2) | Which concrete changes can safely use focused checks, which still need complete local validation, and how agents select the affected tests. Keep changed-boundary coverage and report untested scope. |
| Long diagnostics (former EC-3) | The two shared/fresh controls now have separate local and scheduled/manual/infrastructure CI ownership. Any further diagnostic relocation needs separate authorization. Relocation alone does not reduce total work. |
| Larger test transfers (former EC-4/EC-5) | Find a bounded, worthwhile group in Vim or Agenda; map actual assertions to faithful fast replacements and retained Electron paths. Keyboard, focus, caret, prefixes and persistence can invalidate apparent overlap. |
| Evidence and outcome (former EC-1/EC-6) | Use candidate-level inspection and matched measurements, including build and required-check costs. Decide the next step from measured benefit and protection retained, not removed-case counts. |

Do not restore the former exhaustive audit, fixed task order, eight-hour estimate or runner projection automatically. Define scope, expected files, acceptance evidence, validation, owner involvement and a finite budget for the next proposal using the then-current repository rules.

## Boundaries to preserve

- Current validation policy remains in force until an authorized change is committed. This record does not replace [AGENTS.md](../AGENTS.md), [Development](../docs/DEVELOPMENT.md) or [E2E instructions](../e2e/AGENTS.md).
- Editing-mode reductions were declined; duration gates/reporting and broader reuse were not authorized by this initiative. Preserve ADR 0021 eligibility and isolation.
- Retain real keyboard routes, native focus/pointer timing, browser behavior, caret/selection, visual states and process/persistence boundaries. Verify replacement assertions and historical regressions; do not use mocks that bypass the protected mechanism.
- Production refactoring, a new browser/component runner, dependencies, product changes or broader architecture need a separate proposal. Do not merge unrelated scenarios merely to lower the count.
- No broader implementation or closure budget is approved here. The single memory separation is authorized above; the former six-task proposal never executed.

## Historical record and resumption

The complete pre-shortening plan, proposed EC-1–EC-6 tasks, runner projection and readiness/recovery history are preserved at `b7bbb1e:plans/e2e-coverage-efficiency.md`. Inspect them with:

```sh
git show b7bbb1e:plans/e2e-coverage-efficiency.md
```

Earlier milestones: `42cf3b9` recorded the original analysis; `3af2a26` added runner preparation; `d29b8ec` recorded the bounded preflight correction. Runner Readiness was accepted and closed separately; do not reopen it. Its success did not establish complete initiative-specific readiness.

The owner canceled terminal-input permission for Ctrl+C and a repeated-command approval during earlier preparation. Shortening this record does not authorize retrying or bypassing those actions. Raw preflight scratch artifacts were authorized for deletion on 2026-10-14; do not claim they remain available or reuse expired proof windows as current access evidence. Detailed constraints and observations remain in the historical plan.

**Next action: none while deferred.** After an explicit request naming this initiative, review the pilot outcome and current evidence, then recommend the next bounded step. Resuming discussion alone does not authorize implementation, readiness probes, canceled actions or a new budget.

Optional future discussion prompt:

> Resume discussion of E2E Coverage Efficiency. Use the retained evidence and any completed Fold/Expand pilot result to recommend one worthwhile bounded next step. This authorizes analysis only, not implementation or deferred runner work.
