# Tree E2E Coverage Consolidation

## Objective and authorization

Reduce repeated Electron execution while preserving meaningful regression protection. Start with remaining Tree drag-and-drop matrices, then consider Tree structural editing. Select coverage by failure mechanism, not a reduction percentage or a fixed number of Electron cases.

The owner authorized research and recording this plan on 2026-10-16, then explicitly authorized **T1 only** with its proposed 4–6 active-hour budget (maximum 6 hours), measurement and review obligations. After the separate caret correction, the owner requested `conntinue T2`, authorizing T2 within its recorded scope and six-hour cap, including its early no-removal stop. T3 and its budget remain unauthorized. The selected tool is Codex. A fresh configured planner independently inspected the candidates; the primary reconciled its recommendations with source and available runtime evidence.

**T1 is complete as a no-removal assessment.** Its nonzero-caret checks exposed a production defect, so replacement fidelity was not established and all original tests remain. Independent review found no meaningful issues with the assessment. The owner subsequently authorized a separate contained fix for that defect; it does not resume consolidation or authorize T2/T3. Removing none was an allowed pilot outcome; do not expand merely to achieve a case count.

**T2 is complete as an early no-removal assessment.** Current timing puts its sole initial candidate at 423–424 ms of summed Electron execution. The required App replacement and fidelity work is not justified by that bounded benefit. All 19 Tab scenarios remain unchanged. P0, T1 and T2 are three substantive consolidation tasks; the delivered assessment is `Awaiting owner acceptance`. T3 is not ready or authorized.

Application behavior, production source, harnesses, fixtures, runner/configuration, dependencies, isolation, concurrency, reset eligibility and timeout policy stay unchanged. No new browser runner, reporting framework, duration gate, production test hook, permanent per-test registry or validation archive. Do not revive the retired coverage-efficiency runner initiative. Its surviving scratch checkout is historical evidence only.

Sources of truth: [coverage policy](../docs/AGENT_WORKFLOW.md#9-tests), [validation tiers](../docs/DEVELOPMENT.md#risk-based-validation), [input-path consistency](../docs/DEVELOPMENT.md#input-path-consistency), [initiative workflow](../docs/DEVELOPMENT.md#11-multi-session-initiatives), [architecture §8](../docs/ARCHITECTURE.md#8-ui-layer), and [PRODUCT](../docs/PRODUCT.md) §§2.2, 2.4, 5.1, 8, 10, 11, 20.2.8, 20.2.24 and 20.7. Read applicable nested instructions before work.

No product requirement gaps were resolved. No product, architecture or persistence decision is delegated. Ordinary test arrangement and assertion placement within these boundaries are implementation choices. If faithful replacement needs production or shared test-infrastructure changes, retain the Electron case and report the separate proposal.

## Verified starting point and evidence limits

Inspection baseline: clean `e41d7054e7b510a44ecc14fe37124ad7f183f45e`, authored by abtv on 2026-10-16 (+0200). That commit changes only `src/renderer/App.test.tsx`, `e2e/drag-and-drop-hierarchy.spec.ts` and testing guidance in `docs/DEVELOPMENT.md`. No unfinished working plan or active initiative existed at bootstrap.

| Experiment claim | What is established |
| --- | --- |
| Eight combinations through real App/store integration | Verified from the commit and a fresh focused run: 2 destinations × 2 expansion states × 2 editing modes. `App breadcrumb move matrix` renders the real App with a real `EditorStore`; it drives pointer and keyboard handlers and asserts complete document shape, location, selected identity, focus/caret, visible depth and Undo/Redo. IDs cannot be regenerated. |
| Four retained Electron scenarios | Verified from the diff and a fresh run: Standard ancestor/collapsed and root/expanded; Vim ancestor/expanded and root/collapsed. These are four history cases, not the entirety of breadcrumb coverage. Image-only, invalid/cancelled, highlight, editing-state and unrelated-navigation cases remain. |
| Five deliberately introduced faults detected | Owner-reported result. Original fault definitions, patches, commands and failing assertions were not found in available scratch/test artifacts or the commit. Not independently verified; do not invent the five faults or claim mutation adequacy. |
| Selected group became faster | Owner-reported result. Original paired before/after reports and environment details were not found. Fresh results establish current execution only, not acceleration. |
| Full suite became faster because of this experiment | Not measured by the reported experiment, and not established here. Older full-suite reports concern different commits and cannot establish this causal claim. |

The App matrix substitutes geometry, scroll and external services, advances timers and synthesizes events. It does not establish native pointer capture, browser hit testing/default selection, focus timing, contenteditable behavior, IPC or disk persistence. “Real App/store” describes the collaborating renderer/application code, not the external boundaries.

Fresh research checks at `e41d705`: `npm test -- src/renderer/App.test.tsx -t 'App breadcrumb move matrix'` passed 8 selected cases (88 excluded by the filter), 169 ms test execution and 871 ms Vitest duration. `npm run test:e2e -- e2e/drag-and-drop-hierarchy.spec.ts --grep 'appends to (ancestor|root) and undo'` built successfully and passed 4 cases, one worker, 5.8 s Playwright duration. Build/startup is outside that duration. These single runs are not a before/after benchmark. No faults were introduced during planning.

Repository/Git reads, the independent planner's inspection, focused Vitest and real hidden Electron execution worked in this session. Documentation editing/checks are verified on their first necessary operations. Future session access must still be checked. Visible screenshot inspection and reviewer execution have not been exercised by this planning task; exposed tools/configuration alone are not verified access.

## Cost evidence and prioritization

Available `.scratch/test-time-comparison/new-1.json` and `new-2.json` contain passing full-suite reports starting on 2026-10-14 UTC. Their companion `summary.json` attributes the current version to `44e321b`, before the breadcrumb experiment, with six hidden workers and the same machine/dependencies. That attribution is a historical local record, not a freshly reproduced checkout. The reports still include all eight old breadcrumb history cases. The separate `.scratch/ordinary-e2e-measurement/report.json` also predates this experiment and lacks equivalent commit provenance; it is not the implementation baseline.

Recomputed from the two attributed reports:

| Group | Cases then | Summed test seconds, runs 1 / 2 | Interpretation |
| --- | ---: | ---: | --- |
| Breadcrumb editing-state matrix | 6 | 12.189 / 12.684 | Candidate overlap with retained history; session states remain meaningful. |
| Row-drop editing-state matrix | 6 | 11.757 / 12.448 | Candidate overlap with fold/history and Visual-node rendering cases. |
| Row-drop expansion/history matrix | 4 | 9.052 / 9.263 | Collapsed versus expanded DOM geometry is distinct; retain initially. |
| Tab successful-shift matrix | 6 | 2.094 / 2.096 | Already uses adopted application reset; little removable setup cost. |
| Tab blocked zoom-boundary matrix | 6 | 6.575 / 7.273 | Contains navigation, focus and unfinished-session assertions. |
| Entire Tab spec | 19 | 14.135 / 14.993 | Not all of this cost belongs to either matrix. |

These are **sums of reported test durations**, including work within each test, not parallel suite wall-time savings. Full-suite Playwright durations were 190.745 / 198.168 s. The hierarchy spec is serial within its worker; reducing it can shorten that worker's work but only affects overall wall time according to scheduling and the critical path. Do not divide summed savings by six or subtract them directly from suite wall time. Do not attribute older suite acceleration to this plan.

The earlier audit's estimates are not adopted. Inspection found material differences: DnD launches fresh applications; Tab uses `sharedApplicationAdopted()`; structural setup often types and navigates through real editors. A similar final tree assertion does not establish duplicate coverage of those paths.

## Tasks and sequencing

| ID | Outcome | Dependency | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| P0 | Independent research and recorded plan | Owner's planning request | Source audit, breadcrumb checks, evidence limitations and proposed scope | Done |
| T1 | Assess remaining Tree DnD state overlap; retain all cases when fidelity fails | Owner authorized T1 only on 2026-10-16 | No-removal assessment below; original suites retained; independent review found no meaningful issues | Done; no removals |
| T2 | Evaluate and consolidate Tab structural state overlap | Owner's explicit T2 request after separate caret correction | Current timing, source/assertion audit and independent fidelity review; early no-removal result below | Done; no removals |
| T3 | Consolidate Enter subtree-rule duplication | T2 assessment and explicit expansion authorization | Split-rule/App mapping, textarea and rich-editor boundary retention, measured comparison | Planned |

### T1 — Tree drag-and-drop pilot

**Scope and files.** Expected changes: `src/renderer/App.test.tsx`, `e2e/drag-and-drop-hierarchy.spec.ts`, this plan/index, and only affected guidance/references in `docs/DEVELOPMENT.md` or `docs/VIM_CONFORMANCE.md`. Supplement existing focused tests only where the audit proves a rule gap. Keep `e2e/drag-and-drop.spec.ts`, windowing/persistence suites and shared helpers unchanged.

**Execution path and existing coverage.** Inspect `use-node-list-drag.ts` → `NodeList.tsx` → `App.tsx`'s `moveNode` → `EditorStore.moveNodeToParent`. Row, gap and breadcrumb targets share release/store dispatch, but geometry and breadcrumb location changes differ. App clears whole-node Visual only after a successful cross-parent move; a same-parent reorder preserves it. `node-drag.test.ts` and its property suite cover gesture rules; `drop-targets.test.ts` and its property suite cover target/index rules; `document-move.test.ts` covers identity, subtrees, attachments, rejection and depth. `NodeList.test.tsx`'s `appends onto a %s row and switches between row and gap feedback` covers leaf/collapsed/expanded geometry with an `onMove` spy, not a real store. `editor-store.test.ts`'s move-to-parent group covers expansion, history, location/caret, no-ops, depth errors, pending saves and lock/recovery. Existing App drag tests cover gap reorder, lock, cancellation and unfocused restoration; they do not cover the remaining row/breadcrumb editing-state matrix.

**Missing integration.** Add real App/store scenarios for Standard and Vim Normal, Insert, pending Replace, character Visual and whole-node Visual on both row and breadcrumb routes. Use production handlers; do not call the final store command to simulate the gesture or mock the callback being verified. Assert original and resulting tree/IDs, location, selected node, mode, both selection endpoints, nonzero caret, text/draft preservation, focus restoration and exact Undo/Redo sequencing. Cover same-parent versus cross-parent Visual-node behavior and keep invalid/cancelled outcomes separate. Add a small row expansion integration table for collapsed/expanded destinations if it is needed to support consolidated assertions; do not copy every target rule into App tests. Synthetic geometry cannot establish real selection or capture.

**Specific consolidation candidates, after replacement passes:**

| Existing case in hierarchy spec | Required replacement and retained Electron protection |
| --- | --- |
| `resolves normal mode and its caret after a breadcrumb drop` | App mode matrix plus retained breadcrumb history cases. Transfer any missing Normal badge/nonzero frozen-caret assertion into a retained Vim history case before deletion. Its real pointer must still leave the list, hit the toolbar and restore focus after a location change. |
| `keeps the caret and resolves normal editing when dropping onto a row` | App row matrix plus retained Vim row expansion/history scenario, augmented with the omitted mode/caret assertions. Browser targeting, row movement and deferred focus must still be observed. |
| `keeps the caret and resolves visual-node editing when dropping onto a row` | App cross-parent/same-parent matrix plus `outlines only the receiving row in both appearances and keeps the edge band as a gap`, which already enters `V`, releases onto a leaf and asserts return to Normal. Add the source focus/frozen-caret/text assertions before removing the duplicate. Preserve its light/dark snapshots. |

Retain the Standard, Vim Insert, pending Replace and character Visual row and breadcrumb mode cases initially: real blur/draft commitment and native selection interact with different DOM/location transitions. Retain breadcrumb whole-node Visual until the App matrix and a retained toolbar case prove its cleanup path. This is a deliberate conservative boundary, not a general rule that every state must always appear on every route.

**Other retained Electron scenarios and failures:** keep all four collapsed/expanded row history cases (real row layout and post-drop fold/focus changes); unfocused gutter source (event target outside the input); focused/unfocused image-only breadcrumb sources (attachment surface and image-caret ownership); breadcrumb invalid/current-parent/whitespace cancellation (toolbar routing and cleanup); row and gap invalid/depth errors (different target acceptance followed by visible rejection); hierarchy nesting with Undo/Redo/restart (horizontal hit geometry plus real save/load); same-parent Visual-node reorder (must not terminate range mode). Preserve `drag-and-drop.spec.ts`'s quick click, early-move native text selection, frame-sampled selection suppression, Escape-until-release, unfocused source and browser hover-reset cases, and `windowed-list.spec.ts`'s scrolling/source-pinning cases. Their browser defaults, animation frames, capture and mounting cannot be replaced by jsdom. Preserve real contenteditable/pointer coverage in existing editor suites; these textarea matrices establish no rich-editor equivalence.

**Benefit, effort and risk.** The three named candidates cost 5.912 / 6.107 summed seconds in the old reports. Gross potential is approximately 0–6 s of summed Electron work, before added assertions and App tests; no wall-time saving is promised. Allow 4–6 active engineering hours, one implementation task commit. Main risks are simulated focus masking browser behavior, lost pending Replace edits, wrong selection endpoint, and duplicate/omitted dispatch at the toolbar. If the three mappings fail, keep the cases and finish with the evidenced assessment; do not widen scope to compensate.

**Validation and acceptance.** Low Risk, contained test-only change. Run the common checks below, complete App/NodeList/drag/target/store suites, and both complete DnD Electron specs. Inspect the retained row/gap/toolbar screenshots if their test setup/assertions change; retain existing baseline files. Independently review the old-to-new assertion mapping. Demonstrate sensitivity to representative routing/state faults before removal: wrong target parent/index, omitted cross-parent Visual cleanup, or lost caret restoration. Use temporary test-local seams/spies that call through the real path where faithful; never replace the path with the desired result. Production edits are outside scope, including temporary mutation edits. If a required fault cannot be modeled faithfully without them, retain the affected case and record the limitation. No fixed fault count. Remove probes and rerun invalidated checks before the final diff.

### T1 result and expansion gate

The pilot removed **zero** cases and changed no production or committed test code. A trial App/store matrix covered the six editing states on row and breadcrumb routes plus same-parent node-Visual reordering. Its document assertions passed, but all thirteen cases failed the nonzero post-drop caret assertion before their remaining history assertions could run. The matrix is not accepted replacement coverage.

A real Electron check then strengthened the four retained Vim row/breadcrumb history cases: press 24 pixels into the source text, capture the activated drag's caret, drop normally, and compare the restored caret after focus returns. **All four captured position 2 and received position 0 after release.** Both row expansion states and both breadcrumb destinations failed. Four Standard cases using their original press position passed; this does not establish Standard nonzero-caret behavior. The original zero-position cases pass and cannot detect this failure. This reproduces a runtime defect against PRODUCT §11, which requires focus and the text cursor to return to the node when the drag ends. It is not established as a jsdom-only limitation.

The production cause has not been proved. Source inspection suggests that a move publishes the store's older focus cursor and deferred focus projection can overwrite the drag-restored DOM cursor. A separate defect-first task should confirm that sequence in the existing caret/focus owners, fix it, and cover nonzero positions through real Electron. T1 did not authorize production edits, so the pilot preserved its failing test diff in temporary evidence and restored all original tests. No assertion was changed to accept zero, no candidate was deleted, and no fault probes were needed to justify removals because there were none.

Current measurements at the unchanged executable baseline: two full runs passed 775 cases in **155.751 / 163.891 seconds**; two focused runs passed 71 DnD cases in **72.666 / 72.429 seconds**, with **94.196 / 93.924 summed test seconds**, two active spec workers, 73 launch annotations and no resets. No retries, skips or errors occurred. The three candidates cost **3.528 / 3.611 summed seconds** in the focused runs. The baseline App suite passed 96 cases with **877 ms** test execution. No replacement cost or acceleration is claimed. Since final executable inputs equal the baseline, those results remain valid; rerunning them as a nominal after-snapshot would measure variation rather than an implementation effect. The final assessment changes documentation only, so its applicable tier is Minimal Risk; test-source type/lint checks and additional owning-suite runs are not required for unchanged files.

Do not expand to T2/T3 on this result. At the T1 handoff, the recommendation was a separately authorized fix for the reproduced caret failure, followed by a fresh assessment of replacement fidelity if coverage consolidation is requested again. P0 plus T1 is two substantive consolidation tasks; no three-task acceptance gate has been reached for that scope.

### Separate caret defect correction

After T1, the owner requested fixing the reproduced defect. The separate contained correction restores the captured caret through the existing pending-caret owner after the move's focus intent, and resolves outside-list drops before the caret release listener. Regression coverage includes nonzero positions, both editing configurations, pending edits, same-parent versus cross-parent Visual state, history, rich inputs, stale requests and image return positions. No original Electron case is removed. The correction passed all required validation stages, affected real Electron suites and existing drag scale guards. Independent code review and product verification found no meaningful issues. This resolves the runtime blocker; it does not establish a consolidation saving or authorize the conditional tasks.

### T2 — Tab structural editing

**Scope and files.** Expected changes: `src/renderer/App.test.tsx`, `e2e/tab-structure.spec.ts`, affected requirement/conformance references and plan/index. No changes to the adopted shared-application mechanism. Audit the six successful-move cases and six zoom-boundary cases separately.

**Existing coverage and paths.** `document-shift.test.ts` covers range shape/order, rejection and attachments. `editor-store.test.ts` covers range history/expansion and `confines Tab outdents to the displayed current parent without changing Vim <`; store/property tests protect structural invariants. `editor-input-handlers.test.ts` has `routes Tab and Shift+Tab through focused subtree shifts in %s mode`, whole-node range dispatch, blocked prefix clearing, modified Tab and Standard callback checks. Those tests use store/command doubles. Production `editor-input-handlers.ts` intercepts Tab and checks zoom confinement before finishing a pending session; Standard calls `shiftFocusedNode`, Vim calls `shiftCurrentNode` or the node-Visual route. `use-node-input-bindings.ts` restores pending selection. Its existing real-store hook fixture manually mounts/synchronizes textareas; it is not App mounting/focus coverage.

**Missing integration and candidate removal.** Add actual App/store coverage for successful and blocked Standard/Normal/Insert/Replace/character-Visual/node-Visual transitions, including continued typing, selection direction/endpoints, focused range endpoint, no-op history, retained Replace draft and separate text/move undo entries. Start by evaluating the blocked **Normal** case for transfer to that matrix, retaining native blocked Standard, Insert, Replace and both Visual cases. Do not nominate the entire six-state successful matrix for deletion: its scenarios assert different editor behavior. Any additional candidate needs a named replacement and retained Electron path within this task's cap; otherwise report no removal.

**Retained Electron and browser failures.** Keep Standard selection plus continued typing (Tab default traversal must be suppressed); Vim successful Normal (command routing and block caret); Insert and Replace continued typing/history (browser editor draft and focus timing); character Visual selection and whole-node range (native selection versus multi-input focus). Keep blocked Insert/Replace continuation (rejected Shift+Tab must not flush or split a session), blocked Standard/Visual cases (native traversal/selection), root no-op, deeper-descendant outdent, native status-bar Tab traversal, blocked image caret and successful image-caret/text-position return. The Tab matrix uses textareas; audit rich-editor coverage before claiming contenteditable coverage. If removing a case exposes a previously uncovered contenteditable dispatch risk, retain it and report the separate coverage gap rather than expanding this task into a new editor matrix.

**Benefit, effort and risk.** The whole successful matrix costs only about 2.1 summed seconds historically. The blocked matrix costs 6.6–7.3 s; most is protected above. Budget 4–6 active hours with an early stop after 2 hours if the mapping predicts negligible benefit; estimate 0–2 s gross summed reduction, subject to fresh timing, with no promised wall-time gain. Risk is greater than raw count suggests: committing Replace before a rejected command changes history, and losing `preventDefault` can move focus while domain tests pass.

**Validation and acceptance.** Low Risk. Common checks; App, handler, hook, shift/store/history/property tests; complete `e2e/tab-structure.spec.ts` and affected `e2e/undo-sessions.spec.ts` cases, plus an existing rich-editor owning spec only if its coverage is relied on. Probes must detect an incorrect blocked-boundary result/history change and omitted selection restoration; retained Electron checks must detect native focus/default behavior. Inspect affected existing Tab screenshot attachments. Independent replacement-fidelity review is required by this plan. Keep all original scenarios if the evidence does not support consolidation.

### T2 result and expansion gate

The assessment stopped early under T2's negligible-benefit rule, with **zero removals and no executable changes** at `4f0d97b`. No App matrix or fault probes were added, and no replacement fidelity or acceleration is claimed. T1's previous caret defect was not reproduced again; its separate fix remains untouched.

Both current complete Tab runs passed all 19 cases with one active worker, 11 launch annotations and eight reset annotations per run. There were no retries, skips, flaky outcomes or errors. Same checkout, dependencies, hidden-window settings and reset policy were used:

| Scope | Run 1 | Run 2 |
| --- | ---: | ---: |
| Playwright duration, excluding build | 5.330 s | 5.411 s |
| Summed test durations | 4.979 s | 5.062 s |
| Six successful-shift cases, summed | 0.918 s | 0.899 s |
| Six blocked zoom-boundary cases, summed | 2.369 s | 2.416 s |
| Sole initial candidate: blocked Vim Normal | 0.424 s | 0.423 s |

These are current-cost samples, not a before/after comparison. A focused Vitest invocation started in the same second that the first Electron run ended; possible tail overlap limits timing precision. No saving is inferred from the difference between samples, older reports, or summed test durations. Outer build/command time was not measured. Since executable inputs remain unchanged, an after run would measure variation rather than an implementation effect.

The successful six-state matrix stays: Standard selection and typing, Normal command routing, Insert/Replace continuation and separate history, character Visual selection and whole-node Visual range/focus exercise distinct native risks. Of the blocked matrix, only Normal was initially nominated. It asserts the zoom parent, both child texts/order, focused editor and NORMAL badge after real Shift+Tab. Store coverage (`confines Tab outdents to the displayed current parent without changing Vim <`) proves exact no-op state for the range rule; handler tests cover routing/mode with doubles; the Standard hook test exercises a real-store successful shift with manually mounted textareas. None establishes the missing App integration. Other blocked states and root Normal retain native focus/default protection, but removing the candidate still needs the planned replacement and fault evidence. The candidate does not itself prove nonzero caret, no-op history or a pending Normal prefix.

At most about 0.424 summed seconds is exposed by that initial candidate before adding replacement execution and maintenance. This does not justify building the six-state App matrix and fault experiments solely for this removal. No additional candidate was nominated to increase savings. Keep all successful and blocked cases, root no-op, deeper outdent, status-bar traversal and both image-caret cases. Existing Standard screenshot owners remain unchanged; no new visual result is claimed.

The rich-editor audit found no confirmed Tree structural Tab/Shift+Tab Electron coverage on contenteditable. Shared handler wiring and rich-editor coverage for other commands do not prove its native selection/restoration behavior. This is an existing evidence limit, not a newly introduced gap; T2 does not expand into an editor matrix.

Focused existing handler/store/shift suites passed 595 tests. Independent source/assertion review supported the early no-removal outcome; final review and documentation validation are recorded in temporary task evidence. The final change is documentation-only, so Minimal Risk applies: formatting and documentation checks are required; unchanged test sources do not require type/lint, additional history/property suites, screenshots or fault probes. No product requirements or architecture decisions changed. T3's expansion gate is not established: recommend retaining the remaining tests. Owner acceptance of the delivered three-task assessment is required before closing this initiative; T3 still requires separate authorization.

### T3 — Enter subtree rule, conditional

**Scope and files.** Expected changes: `src/renderer/App.test.tsx`, `e2e/editing.spec.ts`, affected guidance/references and plan/index. Exclude clipboard scenarios sharing that spec, deletion/Backspace, joins, Vim open/repeat commands, Agenda and persistence suites.

**Existing coverage.** `document.test.ts` covers inserting before without changing a subtree and image ownership during split; `document.property.test.ts`'s split property reconstructs text and preserves children/image. `document-operations.test.ts` covers links and Unicode splits. `editor-command-transitions.test.ts` and `editor-store.test.ts` cover before/middle/end/empty creation, first-child creation, selection and location. App already tests a middle split, empty-node Backspace and linked Enter focus. The basic split test does not assert the complete subtree, all modes or all focus/history results.

**Missing integration and candidate removal.** Add App/store before-start/subtree scenarios in Standard and Vim Insert, asserting complete tree identity, children/attachments/links, new-node focus at zero and Undo/Redo. Use actual input dispatch. Candidate: both mode instances of `Enter at the beginning preserves the selected node subtree`. Its setup uses Cmd+. and Cmd+, types a child, then enters the retained subtree to assert it; preserve those navigation paths' owning tests rather than claiming the setup itself is equivalent. Transfer the full preservation assertion before removal.

**Retained Electron and browser failures.** Keep beginning, middle, end and successive Enter cases: these exercise browser caret offsets, new-input focus and a second key routed to a newly mounted editor. Keep `Enter at the end of a linked node focuses the new sibling`: its real clipboard setup creates contenteditable, and the key must suppress native rich-editor behavior and transfer focus into a textarea. Plain Enter cannot replace that case. Keep current-parent first-child creation in its existing navigation/App/Electron owners. Preserve clipboard/preload paths and all deletion/empty-node specs: Cmd+Backspace versus Backspace, next/previous/parent focus, last-root protection and native text deletion are distinct. Existing store deletion tests do not justify their removal in this scope.

**Benefit, effort and risk.** The two nominated subtree cases cost 2.495 / 2.538 summed seconds historically, so estimate 0–2.5 s gross reduction, less replacement cost; no whole-suite claim. Budget 2–4 active hours. Risks are loss of subtree/attachment assertions and confusing rich-editor/native behavior with plain-text rules. Repeated Enter is explicitly retained because focus timing makes it more than a repeated split table row.

**Validation and acceptance.** Low Risk. Common checks; App, document split/operations/property, command-transition and store tests; complete `e2e/editing.spec.ts` plus owning navigation cases if relied upon. A test-local fault must demonstrate that the preservation oracle fails on lost children/identity; retained cases must still assert focus/caret and rich-editor behavior. Independently review the mapping and verify no clipboard or screenshot ownership was lost.

## Common validation and measurement contract

Before deletion, record old title/assertions → exact replacement test → retained Electron title and browser-only failure → evidence, in temporary `WORKING_PLAN.md`/`.scratch/tree-e2e-coverage/<task>/`. Account for focused/unfocused inputs, nonzero caret and both selection endpoints, textarea versus contenteditable, pending sessions, event target/routing, cancellation/no-op/history, and real process boundaries. Do not treat a mock call assertion as a store-state assertion or a synthetic event as native default behavior. Reuse adequate property tests; production invariants are unchanged.

Test-only tasks require affected TypeScript checks (`npm run typecheck:renderer`, `npm run typecheck:e2e`), lint of changed test files, `npm run format:check:changed`, `npm run check:docs`, `npm run check:requirements`, `npm run check:e2e-modes`, and focused `npm test -- <owning files>`. Run complete affected specs with `npm run test:e2e -- <specs>` outside the Codex sandbox. Confirm nonempty selections. Tests build production through the existing workflow. Use `npm run test:e2e:visible -- <spec> --grep <case>` when affected visual evidence needs capture; inspect actual artifacts. No production/pixel changes are intended, so unchanged valid visual evidence can be reused.

Independent reviewer input must include the full diff, old/new mapping, exact commands/results, snapshot and fault-probe limitations. This plan requests one reviewer pass per implementation task because removal fidelity is its main risk. Separate product verification is not required for unchanged product behavior. A runtime defect discovered during research is a separate outcome: preserve the test and report it; do not quietly fix production as part of consolidation.

Use the existing diagnostic command to save paired timing reports: `npm run test:e2e:diagnose -- --json-output=.scratch/tree-e2e-coverage/<task>/<phase>.json --workers=6 --reporter=list,json <specs>`. Replace placeholders with task-owned paths. Measure the same selected specs before and after, twice per snapshot, with unchanged machine, installed dependencies, settings, reset mode and competing workload. Record actual active workers (one serial spec can use only one), launch/reset counts, failures/retries, summed durations and Playwright wall time separately. Record build/outer-command elapsed separately if measured. Include added Vitest execution cost; do not claim a net total-test saving from Electron reductions alone.

For T1, also collect two ordinary full-suite baseline reports before editing and two final reports with the same command minus spec arguments. This is an explicit experiment measurement, not a new standing Low Risk validation requirement. Run invocations sequentially. Report the sample range and composition changes; two samples cannot establish a confidence interval. If the wall-time difference is within variation, say no full-suite acceleration was demonstrated. Do not rerun broad suites for reassurance; additional samples require new evidence and remaining budget. Do not reuse old-commit reports as the baseline. T2/T3 repeat focused measurements; repeat full-suite measurement only for an approved expanded-scope outcome, not at every handoff.

Shared fixtures, runner or production changes invalidate the scope and require a decision; they are not a shortcut to a larger saving. If such work is separately authorized, reclassify validation under the highest applicable tier, including High Risk full validation where required.

## Expansion gate, budget and owner involvement

T1 may justify proposing T2 only when replacement tests fail on relevant faults, retained cases cover each distinct native/DOM route, independent review finds no lost regression, all selected checks pass, and current measurements show a useful tradeoff after added focused-test cost. A full-suite acceleration claim additionally requires the paired full-suite evidence. Clear local savings can justify a bounded next task even when full-suite change is inconclusive, but the owner must see that limitation. If savings are marginal, scaffolding grows, or cases prove browser-distinct, stop after T1 and recommend retaining the rest. T3 requires the same assessment after T2. Neither gate supplies implementation authorization by itself.

Approved allowances: T1 at most 6 active engineering hours, one substantive implementation commit, the stated paired measurement runs, one independent review plus correction/review of invalidated findings; T2 at most 6 hours with its early no-removal stop, now delivered within that allowance. Stop after two unsuccessful recovery attempts at the same blocker without new evidence, or when the allowance is exhausted. T3's proposed maximum 4 hours remains unauthorized. These are effort estimates, not execution-time promises. No automatic budget renewal on a new session.

The full proposed initiative has four substantive tasks including research outcome P0. P0, T1 and T2 are delivered: the three-working-task threshold is reached, and the plan/index remain `Awaiting owner acceptance`. One explicit final acceptance round is required. Proposed separate closure allowance: one hour for acceptance recording, extraction of useful testing guidance and plan retirement; waiting consumes no implementation allowance. No closure allowance is currently approved.

| Task/check | Classification | Expected owner action and timing |
| --- | --- | --- |
| Planning delivery | Automated/source inspection | Inspect this plan; no application check required. |
| T1 implementation and budget | Owner decision, complete | Owner authorized T1 only and its bounds on 2026-10-16; pilot finished with no removals. |
| T1–T3 Vitest, Electron, screenshot evidence and review | Automated/agent inspection | Zero anticipated owner manual application-verification rounds. Primary owns commands and artifact inspection. |
| Future Electron, artifact or reviewer access failure | Capability unresolved until that session's first operation | Supported permission/environment action only if actually blocked; dependent removals wait. Possible additional permission round, not counted as a confirmed manual check. T1 verified hidden Electron, image viewing and independent reviewer inspection; no changed renderer required visible capture. |
| T2 expansion | Owner decision, complete | Owner requested T2 after the separate caret fix; early no-removal assessment delivered. |
| Expansion to T3 | Owner decision | Not authorized; current evidence does not establish the expansion gate. |
| Final acceptance after threshold | Owner decision | One separate post-delivery round reviewing commits, coverage mapping and measurements; no invented UI exercise. Rejection adds only the needed repair/acceptance round. |

## Exact next action and next-session prompt

Await owner acceptance of the delivered P0/T1/T2 assessment. Recommend retaining the remaining tests and closing the initiative after acceptance; do not retire this plan before that decision. No implementation task is ready. T3 remains unauthorized and its expansion gate is not established. Do not repeat unchanged measurements or the corrected caret defect solely because another session starts.

```text
Review plans/tree-e2e-coverage.md and recover current repository state.
P0/T1/T2 are delivered and awaiting owner acceptance. T1 removed no tests;
the separately authorized caret correction is delivered. T2's early
assessment retained all 19 Tab cases: its sole initial candidate costs
423–424 ms, insufficient to justify replacement scaffolding. T3 remains
unauthorized; no full-suite acceleration or replacement fidelity is claimed.
```
