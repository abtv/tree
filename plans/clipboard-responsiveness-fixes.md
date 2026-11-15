# Clipboard responsiveness follow-ups

Status: Awaiting owner confirmation

## Authorization and scope

On 2026-11-15 the owner authorized both corrections recommended after the clipboard investigation: improve long-row Vim navigation in Tree and Agenda, and keep the intended final-node focus after multiline paste introduces date decorations. No new node or clipboard text-length limits. This approval covers implementation, regression coverage, required documentation, validation and normal validated commits under repository policy.

This follow-up batch contains two substantive working tasks. The preceding investigation was a separate completed research task. No additional fixes are in this batch. Review-batch closure still requires owner confirmation that no tasks remain under `docs/AGENT_WORKFLOW.md` §8. No manual pre-commit owner check is currently required; native Electron automation and screenshot inspection are available. Do not publish or push.

## T1: Bound long-row character-position lookup cost

Status: Complete in `d305b3b`

- Files: `src/domain/text-characters.ts`, its focused/property/performance tests, a maintained `perf/electron/` long-row navigation scenario, and the owning performance requirement in `docs/PRODUCT.md`.
- Preserve UTF-16 offsets, whole-grapheme motion, count/clamp behavior and the existing bounded segmentation cache. Replace repeated linear boundary searches with logarithmic lookup. Do not add persistent state, dependencies or content limits.
- Acceptance: original implementation fails the new cost guard; existing and generated Unicode/count/offset invariants pass; native repeated vertical motion through a long wrapped row in Tree and Agenda remains responsive at beginning, middle and end, without changing content, focus or caret semantics.
- Validation: focused unit/property and serial timing checks, `npm run check`, affected native navigation/Unicode/image/selection/history E2E, and focused Electron performance before/after evidence. Final batch validation uses the High Risk tier because it combines scale-sensitive navigation and shared focus projection: full local Electron E2E and `npm run audit` in addition to the above.
- Review: independent implementation review and product verification for the shared navigation path. No unresolved product decision.

## T2: Preserve the current focus intent during plain-to-rich conversion

Status: Complete; recorded in the commit that marks this task complete

- Files: `src/renderer/NodeInput.tsx` and/or existing caret projection owners as established by focused diagnosis, corresponding component/store integration tests, `e2e/electron/clipboard.spec.ts`, and `docs/PRODUCT.md` §14.
- Honor the current selected-node/focus request when converting the old row to a decorated editor. Preserve same-node typing, URL/date decoration, selection and composition behavior; do not introduce a second focus authority.
- Acceptance: a failing regression reproduces three dated lines pasted into an empty plain row; both standard editing and Vim Insert end in the final pasted node with the caret after the final inserted line. Subsequent typing edits that node. Plain and already-rich controls, undo/redo, same-node conversion and windowed destinations remain correct.
- Validation: component/integration regressions, real native clipboard E2E in both modes, inspected Electron screenshots of final and neighboring rows, retained composition/selection/Agenda coverage, final full tier as above.
- Review: fresh independent review and product verification trace the transition inventory in `WORKING_PLAN.md`. No unresolved product decision.

## Delivered result and next action

Both corrections and maintained regression guards are complete. Long-row navigation uses logarithmic lookup without changing Unicode boundaries or imposing text limits. Replacement editors preserve the current focus intent through the existing caret owner. The owning requirements are in `docs/PRODUCT.md` §§14 and 22.2; focus ownership is documented in `docs/ARCHITECTURE.md`.

Full functional validation, affected performance checks, independent implementation review and product verification passed. The full dependency audit still reports existing moderate development-only minimatch findings; the production-only audit reports none. This is the standing exception in `docs/AGENT_WORKFLOW.md` §10, not a passing full audit.

No implementation task remains in the authorized two-task batch. Await the owner's confirmation that no further follow-ups remain, as required for report follow-up batches by `docs/AGENT_WORKFLOW.md` §8. That confirmation authorizes removal of this plan and its index entry. No additional manual application check or renewed implementation approval is required.
