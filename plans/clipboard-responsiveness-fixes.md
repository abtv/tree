# Clipboard responsiveness follow-ups

Status: In progress

## Authorization and scope

On 2026-11-15 the owner authorized both corrections recommended after the clipboard investigation: improve long-row Vim navigation in Tree and Agenda, and keep the intended final-node focus after multiline paste introduces date decorations. No new node or clipboard text-length limits. This approval covers implementation, regression coverage, required documentation, validation and normal validated commits under repository policy.

This follow-up batch contains two substantive working tasks. The preceding investigation was a separate completed research task. No additional fixes are in this batch. Review-batch closure still requires owner confirmation that no tasks remain under `docs/AGENT_WORKFLOW.md` §8. No manual pre-commit owner check is currently required; native Electron automation and screenshot inspection are available. Do not publish or push.

## T1: Bound long-row character-position lookup cost

Status: Complete; recorded in the commit that first marks this task complete

- Files: `src/domain/text-characters.ts`, its focused/property/performance tests, a maintained `perf/electron/` long-row navigation scenario, and the owning performance requirement in `docs/PRODUCT.md`.
- Preserve UTF-16 offsets, whole-grapheme motion, count/clamp behavior and the existing bounded segmentation cache. Replace repeated linear boundary searches with logarithmic lookup. Do not add persistent state, dependencies or content limits.
- Acceptance: original implementation fails the new cost guard; existing and generated Unicode/count/offset invariants pass; native repeated vertical motion through a long wrapped row in Tree and Agenda remains responsive at beginning, middle and end, without changing content, focus or caret semantics.
- Validation: focused unit/property and serial timing checks, `npm run check`, affected native navigation/Unicode/image/selection/history E2E, and focused Electron performance before/after evidence. Final batch validation uses the High Risk tier because it combines scale-sensitive navigation and shared focus projection: full local Electron E2E and `npm run audit` in addition to the above.
- Review: independent implementation review and product verification for the shared navigation path. No unresolved product decision.

## T2: Preserve the current focus intent during plain-to-rich conversion

Status: In progress

- Files: `src/renderer/NodeInput.tsx` and/or existing caret projection owners as established by focused diagnosis, corresponding component/store integration tests, `e2e/electron/clipboard.spec.ts`, and `docs/PRODUCT.md` §14.
- Honor the current selected-node/focus request when converting the old row to a decorated editor. Preserve same-node typing, URL/date decoration, selection and composition behavior; do not introduce a second focus authority.
- Acceptance: a failing regression reproduces three dated lines pasted into an empty plain row; both standard editing and Vim Insert end in the final pasted node with the caret after the final inserted line. Subsequent typing edits that node. Plain and already-rich controls, undo/redo, same-node conversion and windowed destinations remain correct.
- Validation: component/integration regressions, real native clipboard E2E in both modes, inspected Electron screenshots of final and neighboring rows, retained composition/selection/Agenda coverage, final full tier as above.
- Review: fresh independent review and product verification trace the transition inventory in `WORKING_PLAN.md`. No unresolved product decision.

## Evidence and continuation

The original findings and controlled baseline/candidate/baseline measurements are summarized in `.scratch/clipboard-lag/evidence.md`. Temporary implementation evidence lives in `.scratch/clipboard-fixes/validation.md`; `WORKING_PLAN.md` owns the active transition inventory and exact next action. These references are temporary and must be removed before plan closure.

Both fixes passed the full functional tier, affected performance checks, independent implementation review and product verification. T1 is ready for its separate validated commit. Next: commit T2 with the final batch status, then request the owner's no-further-tasks confirmation before retiring this plan.
