# Inline Node Expansion

## Objective and authority

Implement pointer-controlled inline expansion and collapse of nodes with children, while preserving location-based navigation. The Product Owner approved transient expansion, editable visible descendants, existing keyboard commands scoped to actual siblings, no new Vim keys, and a focus indication separate from disclosure. The behavior contract is [Product Requirements §§2.1, 2.4, 11, 20](../docs/PRODUCT.md); architecture and validation rules are in [Architecture §§8–9](../docs/ARCHITECTURE.md) and [Development Guide §§8–9](../docs/DEVELOPMENT.md).

This is a multi-session initiative because the visible-tree projection touches list windowing, focus and caret ownership, editing, selection, and drag behavior. Implementation is authorized within the product contract. No new persisted field, domain-model change, cross-level drag operation, or Vim command is authorized. Ask the Product Owner if implementation reveals a material behavior choice outside that contract.

## Tasks

| ID | Outcome and dependencies | Expected files | Acceptance evidence | Validation tier | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the approved behavior and implementation contract. | `docs/PRODUCT.md`, `plans/README.md`, `plans/inline-expansion.md`; temporary `WORKING_PLAN.md` | Product rules cover disclosure, editable descendants, focus, location lifetime, drag boundary, and windowing; the plan names an exact next task. | Minimal Risk: `npm run format:check:changed`, `npm run check:docs` | Done |
| 2 | Add a pure visible-tree projection and transient expansion owner; depends on 1. Keep this stage internal, with no active disclosure UI. | `src/renderer/visible-tree.ts`, `src/renderer/visible-tree.test.ts`, `src/renderer/visible-tree.property.test.ts`, `src/renderer/expansion-state.ts`, `src/renderer/expansion-state.test.ts`, `docs/ARCHITECTURE.md`, `WORKING_PLAN.md`, and this plan | Projection preserves preorder, identity, depth and actual sibling context (verified by property test); nested collapse retains child choices during a visit; a collapsed subtree costs one row regardless of size, so no full-tree traversal is introduced; no disk write or sync is introduced. Neither module is wired into any rendering or interaction path yet, so no existing scale-sensitive input changes and no new performance baseline is required at this stage — see `WORKING_PLAN.md`'s performance assessment for the reasoning. | High Risk: focused unit/property checks and `npm run check:full` to confirm no regression | Done |
| 3 | Connect disclosure, editable descendants, focus/keyboard/drag behavior, and visual presentation; depends on 2. | Likely `src/renderer/NodeRow.tsx`, `src/renderer/NodeList.tsx`, `src/renderer/App.tsx`, `src/renderer/styles.css`, `src/renderer/use-node-input-bindings.ts`, `src/application/editor-store.ts` if selection rules require it, adjacent unit/property tests, `e2e/navigation.spec.ts`, `e2e/windowed-list.spec.ts`, `e2e/vim-navigation-and-visual.spec.ts`, visual test/baseline, `docs/ARCHITECTURE.md` if needed, `plans/README.md`, `WORKING_PLAN.md`, and this plan | Disclosure has accessible expanded state and does not enter, edit, drag, or steal focus; descendants edit normally; collapse restores valid focus; keyboard commands and drag stay within real sibling lists; existing circle-to-enter behavior survives. Inspect real Electron screenshots of collapsed, expanded, nested, focused, and leaf rows in affected appearances. Independent review traces the full affected-path matrix; separate product verification exercises realistic flows. Move lasting knowledge to durable documentation and remove the temporary and active plans in the completion commit. | High Risk: focused tests/E2E and `npm run check:full`; repeat performance comparison if projection or list layout changes | Planned |

## Interaction inventory for implementation

Task 2 must start a `WORKING_PLAN.md` and enumerate affected state and transitions before changing interaction code, following [Development Guide §8](../docs/DEVELOPMENT.md). The inventory must trace selected node, current parent, text caret, image caret and saved return position, whole-node and character selection, Vim mode and pending edit sessions, focus intent, drag freeze, and mounted-row pinning through: disclosure click, collapse of the selected node's ancestor, collapse of another branch, nested re-expansion, descendant pointer focus/edit, enter/leave/location path, keyboard movement and structural commands at descendant depth, undo/redo and deletion of expanded nodes, drag start/drop/cancel, and list windowing. Record transitions that keep the selected node unchanged. Each row needs starting state, action, expected selected node and caret, mode, and focused test/Electron evidence or an inapplicability reason.

## Performance and validation notes

Expansion state belongs to the renderer view and is never persisted, so it should add no disk writes or syncs. Store only expanded node IDs for the current visit. Flatten only the displayed projection when expansion or relevant structure changes; avoid document-wide work during typing. Virtualization must use the total visible row count and keep the focused row mounted. Add an automated scale guard for a large expanded tree and record CPU and memory impact alongside the existing wide-sibling baseline. Each task records exact commands, snapshot digest, artifacts, and invalidation notes in its temporary `WORKING_PLAN.md`; delete that file before its commit.

## Current state and next task

Task 2 is complete: `src/renderer/visible-tree.ts` and `src/renderer/expansion-state.ts` provide the pure
projection and transient expansion owner, with unit and property coverage, but neither is wired into any
rendering or interaction path yet. The exact next task is **Task 3: connect disclosure, editable
descendants, focus/keyboard/drag behavior, and visual presentation**. Task 3 must build the full
navigation/caret affected-path inventory required by this plan's "Interaction inventory for
implementation" section before changing interaction code, and must add the scale guard and performance
baseline for a large expanded tree once the projection is actually wired into rendering.

Copyable next-session prompt: “Continue the inline node expansion initiative from `plans/inline-expansion.md`. Read `AGENTS.md`, the plan, and relevant product and architecture sections, including `src/renderer/visible-tree.ts` and `src/renderer/expansion-state.ts` from Task 2. Start Task 3 from repository state, create `WORKING_PLAN.md`, build the full interaction inventory, capture the performance baseline before wiring the projection into rendering, implement and validate disclosure/focus/keyboard/drag/visual behavior, then commit Task 3 with the updated plan.”
