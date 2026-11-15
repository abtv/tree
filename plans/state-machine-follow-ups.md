# State-machine audit follow-ups

Status: Awaiting owner acceptance

## Objective and authorization

Implement the three follow-ups from the 2026-11-15 state-machine audit, one at a time.
The owner authorized the whole known batch with “work on them one by one”.
Use Codex. The audit's 30-minute limit applied to investigation; no implementation
time limit was specified. Keep the work to these three substantive tasks, with the
two-attempt recovery limit in AGENT_WORKFLOW §12. Closure has one administrative
plan-retirement commit after owner acceptance; waiting does not consume execution.

Preserve observable behavior except for the two demonstrated cancellation/retry
defects. Do not introduce dependencies, change IPC or persisted formats, change
native OCR cancellation, or redesign domain state. Material changes to those
boundaries remain reserved for the owner. There are no known additional audit
items; the owner must confirm that the batch has no further tasks before closure.

Sources: [Product](../docs/PRODUCT.md) §§11, 15.1, 16, 20.1, 22, 26;
[Architecture](../docs/ARCHITECTURE.md) §§7–8;
[renderer ownership](../docs/decisions/0014-single-owner-for-renderer-interaction-state.md).
Maintained regressions now cover the audit findings in `NodeList.test.tsx`,
`persistence-lock.spec.ts`, renderer `app-updates.test.ts` and Electron
`app-updates.spec.ts`. Queue transition tests live in `image-to-text-queue.test.ts`.

## Ordered tasks

| ID | Outcome | Dependencies | Validation tier and acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| SM1 | Stop drag autoscroll when a lock or missing source cancels the gesture | None | Moderate; failing component regression, real Electron cancellation/scroll and caret checks, inspected renderer image, `npm run check`, independent review and product verification | Done |
| SM2 | Verify and repair stale update completion releasing a newer attempt | SM1 committed | High; real delayed IPC regression before fixing, focused attempt-identity tests, existing protocol/failure coverage, `npm run check`, full local E2E, audit, independent review and product verification | Done |
| SM3 | Give image-recognition queue transitions one application owner | SM2 resolved and committed if changed | High; preserve queue admission, cancellation, flush nesting, result/status and undo behavior; owner/store tests, existing native boundary tests, `npm run check`, full local E2E, audit, independent review and product verification | Done |

SM1 expected files: `src/renderer/use-node-list-drag.ts`,
`src/renderer/NodeList.test.tsx`, focused drag/persistence-lock Electron tests,
and the relevant existing Product/Architecture paragraphs. Keep caret-freeze
release with its existing owner until the pointer is released. Derive animation
eligibility from the resolved gesture; reset target and scroll intent on a new press.

SM2 expected files: `src/renderer/app-updates.ts`, its unit tests,
`e2e/electron/app-updates.spec.ts`, and relevant ownership documentation.
The fake-transport probe demonstrated: failed attempt A sends `finished`, retry B
starts, then A's delayed negative-confirmation acknowledgment unlocks B and stops
B from confirming its save. Verify that sequence through real Electron IPC before
calling it a production defect. Scope asynchronous completion to its owning attempt.
Keep main/preload/shared contracts unchanged unless evidence requires an owner decision.

SM3 expected files: `src/application/editor-store.ts`, a focused application
image-recognition queue module and tests, existing image-to-text/image-search store
tests, and Architecture's application ownership description. Keep platform effects
and document/history updates in their existing layers. Preserve sequential native
work, the 20 explicit-job limit, hidden indexing, permanent source invalidation,
reindex owner transfer, partial failure reporting, and nested flush suspension.
This is a behavior-preserving structural improvement, not a claim of a third bug.

## Verification and costs

Use failing regressions before defect fixes. Reuse valid results for unchanged inputs.
Do not run E2E/performance alongside another test suite. Select timing checks from
actual changed costs; High Risk alone does not require the full performance suite.
Assess writes/syncs, interactive CPU and retained memory for each task under Product §22.
SM1 adds no work per frame; it removes frames after cancellation. SM2 should retain
one attempt and add constant-time identity checks. SM3 must not add document scans,
save operations or retained jobs compared with the existing queue.

## Owner involvement

Working-task count: 3. One final owner-acceptance round is required after all tasks.
No pre-commit manual owner checks were required. Automated Electron interaction,
screenshot inspection, native Apple Vision recognition and the configured independent
roles all completed successfully. No mandatory capability remains unresolved.

| Task/check | Actor and action | Gate |
| --- | --- | --- |
| Each task's regressions, boundary checks and review | Agent runs documented checks and configured independent roles | Before its commit |
| Completed batch | Owner accepts the delivered result and confirms no further audit items remain | Before plan retirement |

## Delivered result

SM1 landed as `82d5de6`: resolved drag phase owns autoscroll; a new press
clears stale targets. Component and real Electron regressions demonstrated the old
failure and now pass. Caret-freeze release remains unchanged. Both independent
roles found no meaningful issues.

SM2 landed as `a8b5f78`. Controlled delay of an actual Electron negative
acknowledgment reproduced the retry losing its input lock. One renderer attempt now
owns request identity, focus and release; stale completions cannot retire a retry.
Main/preload/IPC contracts are unchanged. Full functional validation and both
independent roles passed. Audit reported 16 moderate development-only findings;
production dependencies had none. This is accepted under the existing audit policy,
not a clean audit result.

SM3 is delivered by the commit introducing this `Awaiting owner acceptance` status,
`refactor(ocr): centralize image recognition queue ownership`. It gives pending work,
the active job, source invalidation and nested suspension one application owner.
Native execution, metadata/history, saving and visible status retain their behavior.
Both independent roles found no meaningful issues.

The final result passed `npm run check` (6722 tests) and the full
`npm run test:e2e -- --reporter=dot` (1015 cases, no skips), including real Apple Vision
and the earlier drag/update regressions. The development-only audit findings above
are the remaining known validation limitation. No implementation blocker remains.

## Next task

No implementation task remains. The owner reviews the three delivered outcomes and
their maintained regressions against the task table, accepts the final commit named
in the delivery message, and confirms that no further audit follow-ups remain.
No additional manual application check is required. After that acceptance, retire
this plan and its index entry in the reserved documentation-only closure step.

## Resume prompt

All three authorized state-machine follow-ups are delivered. This plan awaits final
owner acceptance and confirmation that no further batch tasks remain. Check the
accepted result against Git before retirement; preserve unrelated changes. If the
owner reports a defect, retain the plan and follow the immediate-follow-up procedure.
