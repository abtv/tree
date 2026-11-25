# Deferred performance investigations

Status: Deferred

## Scope and authorization

Investigate six selected desktop performance scenarios from the earlier audit. The original numbers are retained below. P5, the long mixed session, is the owner's highest priority and runs first. The previous rounds are recorded in `0c4b13b2`, `c1424148` and `a17ea48d`. Capture a new baseline from the checkout used when each investigation starts.

The owner authorized recording this plan only. No investigation, test run, application edit or scheduled work is authorized now. Generic continuation does not resume this plan. On an explicit request to resume this named plan, start P5 unless the owner names a different task. Do not start the remaining tasks unless authorized. Product changes, architecture changes and work outside the selected list require separate authorization. Dense highlights in formatted notes (original check 2) and 120 Hz testing (original check 8) are outside this plan.

Use Codex and the repository's [performance investigation skill](../.agents/skills/improve-perceived-performance/SKILL.md). The six working tasks are planned, none is ready or underway, and no execution or recovery allowance has been approved. Record the allowance for the authorized work at resumption. A separate closure allowance and final owner acceptance apply if the initiative proceeds through three or more substantive tasks.

## Task order and evidence

Each task is investigation-only. The file column gives a possible disposable diagnostic, not a file that exists or authorization to change production code. A diagnostic that changes only tests or tooling is Low Risk if retained and if it does not alter shared fixtures. Assess any separately authorized implementation by its actual risk under [Development §9](../docs/DEVELOPMENT.md#9-full-validation).

| Task | Status | Diagnostic location | Evidence to collect |
| --- | --- | --- | --- |
| **P5. Long mixed session** | Planned | `perf/electron/mixed-session.diagnostic.spec.ts` | Run roughly 30 minutes of repeatable search, edit, cancellation, Undo/Redo and navigation between branches on a synthetic large tree. Include real autosaves and check final text, selection and focus. Compare latency distributions, frame stalls and memory in equal early, middle and late windows plus a settled sample. Distinguish expected undo history or caches from memory that keeps growing. |
| P1. Peak memory during saves | Planned | `perf/electron/save-peak-memory.diagnostic.spec.ts` | Sample renderer and main during search alone, save alone and their overlap. Compare large and smaller fixtures across consecutive real saves. Record each process's peak and settled memory, verify written content, and check input latency. If reporting a combined peak, align samples and account for shared memory rather than adding separate maxima. The earlier roughly 100 MiB renderer increase was a working-set delta, not a peak or a leak. |
| P3. One very large note | Planned | `perf/electron/oversized-note.diagnostic.spec.ts` | Compare a wrapped note of several hundred thousand characters with the previous roughly 50,000-character workload. Measure cursor movement, paging and local search at representative offsets. Verify final positions, selection and matches rather than treating received input as proof of successful navigation. |
| P4. Early input on opening a large tree | Planned | `perf/electron/early-search-input.diagnostic.spec.ts` | In separate cold launches, compare the first accepted Find and completion input while the initial view settles with a warmed control. Record availability, input-to-correct-result latency, dropped input and focus or viewport changes. Keep startup time separate from response after the control accepts input. |
| P6. Navigation during image readiness | Planned | `e2e/electron/_image-readiness-navigation.spec.ts` | Navigate by keyboard and reveal a Find hit while synthetic attachments become ready and change row height. Observe the intended row and caret before, during and after the layout change. Verify that a later manual scroll or selection is not overridden. Inspect real Electron captures. |
| P7. Composition and Unicode search | Planned | `e2e/electron/_search-composition.spec.ts` | Exercise active composition, confirmation, cancellation and rapid refinement. Test emoji and combining characters separately. Verify that the query, focus and highlights agree and that obsolete work cannot replace the confirmed result. Keep real IME evidence separate from simulated composition events. |

For each task, record the fixture, sequence, revision, environment and measurement endpoints. Use isolated synthetic data, real Electron boundaries where applicable and serial validation. Prefer existing relevant scenarios in `perf/electron/` and `e2e/electron/` before adding a diagnostic. Check correctness and visible state as well as timing. Report observations and limitations without retaining a production change merely because a proxy improves. See [search behavior](../docs/product/search.md), [editing behavior](../docs/product/editing.md), [images](../docs/product/images.md), [persistence](../docs/product/persistence.md) and [performance requirements](../docs/product/non-functional.md).

## Owner involvement

- Now: no owner verification rounds and no runtime work. Keep the plan listed as deferred.
- Start: the owner explicitly resumes the named plan. The next task is P5. Fix the workload and confirm current runtime capabilities before collecting its baseline.
- P1, P3, P4, P5 and P6: automate the main workload and correctness checks. Use the real Electron renderer for visual claims. No separate owner check is currently planned. If a necessary visible-console capability is missing, identify the specific blocked check and request only the action needed.
- P7: Playwright can check composed-input contracts, but not real native IME. Check for a supported native input path when resumed. If none is available, request one owner verification round with a concrete IME sequence and expected result, or report native verification as blocked.
- Closure: no substantive task is complete. If three or more are carried out, retain the initiative until the owner accepts the delivered result under [workflow §8](../docs/AGENT_WORKFLOW.md#8-plans-and-architecture-decisions).
