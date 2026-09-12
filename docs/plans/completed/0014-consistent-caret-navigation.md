# Consistent Caret Navigation

Status: Completed
Created: 2026-09-12
Completed: 2026-09-12

## Objective

Make caret behavior consistent across sibling navigation, parent/child navigation, and non-editable hyperlink ranges.

## Approved behavior

- `↑` and `↓` preserve the character offset when moving between nodes, clamping it to the target text length.
- Explicit node entry with `Cmd+.` and parent-to-child movement with `→` place the caret at offset zero.
- A caret offset inside a non-editable link maps deterministically to the nearest editable boundary.

## Implementation

1. Document the approved `↓` behavior and hyperlink caret-boundary rule.
2. Make the hyperlink nearest-boundary mapping explicit in the renderer.
3. Add unit/component and end-to-end regression coverage for the navigation and hyperlink cases.
4. Run validation, complete the plan, and commit the logical change.

## Result

The product rules now document nearest editable hyperlink boundaries, the renderer makes the tie behavior explicit, and regression coverage verifies the boundary mapping. All unit/component tests, the build, audit, and affected end-to-end tests pass. The complete end-to-end run still has one unrelated timeout in `e2e/shortcut.spec.ts` for `Cmd+Q`.

## Follow-up

The first top-level node and the editable current parent now reset to caret offset zero on `↑`. Sibling navigation and first-child-to-parent navigation retain their existing offset-preserving behavior. The focused unit/component suite and navigation E2E suite pass; the full E2E run has the same unrelated `Cmd+Q` timeout documented above.

The last displayed node now resets to caret offset equal to its text length on `↓`, completing the symmetric boundary behavior.

The same `↓` boundary behavior now applies when the selected current parent has no children, including when its text contains a hyperlink.

It also explicitly resolves the end caret for the last linked root node. The focused tests cover both edge cases; the full E2E run continues to be limited only by the unrelated `Cmd+Q` timeout.

The Enter-at-end path was verified for a hyperlink-containing node. The new sibling receives focus and caret offset zero as required; a regression test now protects this behavior.

The regression assertion was strengthened to verify that the original node remains before the new empty sibling, preventing a false positive where `Enter` inserts before the original node while focusing the original node.

The plain-text Enter-at-end and current-parent first-child flows now also assert focus and caret offset zero explicitly.

The strengthened tests confirmed that the implementation already requests and applies the new-node caret at offset zero; the previous plain-text assertion was incomplete because it checked focus but not the caret position.

The plain-text assertion now also types into the focused new node immediately after `Enter`, proving that subsequent input is not sent to the original node.

The renderer now reapplies a new focus intent after the React event completes, preventing the browser from restoring focus to the node that handled `Enter`.
