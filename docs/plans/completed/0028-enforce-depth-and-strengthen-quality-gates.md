# Enforce Document Depth and Strengthen Quality Gates

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal

Enforce the approved 20-level document-depth limit, replace catastrophic-only performance checks with meaningful regression budgets, and improve risk-bearing branch coverage in the domain and editor application layers.

## Approved Product Decision

`docs/PRODUCT.md` section 2.3 is the source of truth for the approved behavior:

* top-level root nodes are level 1;
* the maximum node depth is 20;
* level-20 nodes may be entered, selected, and edited but cannot have children;
* an action that would create level 21 leaves the document and runtime state unchanged and displays `Nodes cannot be nested deeper than 20 levels.`;
* persisted documents containing level-21-or-deeper nodes fail safely on load and remain unchanged on disk.

This decision replaces the earlier assumption that arbitrarily deep documents should cross the Electron context bridge. The existing persistence schema version does not change.

## Current State

* Domain traversal is iterative and has tests using documents up to 5,000 levels deep.
* Electron's context bridge cannot transfer documents nested beyond roughly 250 levels, as recorded in `docs/plans/completed/0009-performance-baselines.md`.
* The application does not currently impose a product-level maximum depth or prevent child creation below level 20.
* Performance tests run in `npm run check:full`, but their 15-second startup and 2-second typing-p95 limits catch only catastrophic failures. Current development-machine measurements are roughly 300 ms for launch and 16 ms for typing paint p95.
* Global unit coverage is 89.39% statements, 80.65% branches, 90% functions, and 91.45% lines. Important concentrations remain in `src/domain/document.ts` at 73.65% branch coverage and `src/application/editor-store.ts` at 69.41% branch coverage.
* `docs/plans/completed/0019-improve-test-coverage.md` is stored as completed but still has active metadata.

## Scope

### Product and Architecture Documentation

* Keep `docs/PRODUCT.md` section 2.3 consistent with the approved behavior.
* Add the 20-level maximum to the domain model and architectural invariants in `docs/ARCHITECTURE.md` when the implementation is added.
* Update performance and testing guidance in `docs/DEVELOPMENT.md` with the final measurement method and budgets.
* Update the depth finding in the completed performance plan only if needed to state clearly that the new product decision supersedes its earlier out-of-scope assumption; do not rewrite historical measurements.
* Correct the stale status and completion metadata in `docs/plans/completed/0019-improve-test-coverage.md`.

### Domain Depth Invariant

* Introduce one exported domain constant, `MAX_DOCUMENT_DEPTH = 20`.
* Count top-level roots as level 1.
* Validate depth iteratively while parsing and asserting documents.
* Accept documents at exactly 20 levels and reject documents at 21 levels.
* Apply the same rule to persisted version 1 and version 2 documents.
* Guard child creation at level 20 in the domain so the invariant does not depend on a React or Electron caller.
* Keep sibling-only operations unchanged because they cannot increase depth.
* Preserve persistence schema version 2; this is an invariant change, not a representation change.

### Application Behavior

* Represent maximum-depth rejection explicitly in the relevant application transition or command result.
* Surface the exact approved operation error through the existing error presentation mechanism.
* A rejected operation must not mutate the document or location, move focus or selection, create an undo/redo entry, schedule persistence, or consume a generated node ID unnecessarily.
* Entering, selecting, and editing a level-20 node must continue to work.

### Performance Regression Budgets

Replace the current catastrophic-only limits with these approved initial budgets:

| Metric | Budget |
| --- | ---: |
| Electron launch to interactive | 2,000 ms |
| Renderer start to interactive | 1,000 ms |
| Typing paint p95 | 100 ms |
| Typing paint maximum | 250 ms |

Before finalizing the assertions:

* run multiple repetitions on the supported development machine to confirm the budgets tolerate ordinary variance;
* increase the typing sample size enough for p95 to be meaningful;
* use two consecutive animation frames so the timing point follows an opportunity to paint, matching the documented measurement method;
* retain fresh, wide-1,000, and large-10,000 startup scenarios and both existing typing scenarios;
* record the final sample count, observed ranges, budgets, and rationale in the completed plan and development documentation;
* do not loosen an approved budget merely to make a regression pass. If normal variance cannot satisfy a budget, report the evidence to the Product Owner before changing it.

### Meaningful Coverage Improvements

Add tests for risk-bearing uncovered behavior, prioritizing:

* copy and cut rejection, service failure, and asynchronous selection-change paths;
* paste and attachment-write races where selection or readiness changes while an operation is pending;
* persistence results received outside ready state and recovery from visible save errors;
* malformed persisted structures and the new depth validation boundaries;
* hyperlink removal, insertion, overlap, and multiline transformation edge cases;
* no-op navigation and application-command boundaries with observable contracts.

Review defensive branches that cannot occur through valid public APIs, but do not manufacture impossible state or weaken assertions merely to increase a percentage.

The minimum focused outcome is:

* at least 80% branch coverage for `src/domain/document.ts`;
* at least 80% branch coverage for `src/application/editor-store.ts`;
* global coverage floors raised only after the new stable baseline is measured, with a small margin below measured results so small regressions fail without making the suite flaky.

Coverage percentages remain a gap-finding tool. Each new test must state the behavior or failure mode it protects.

## Testing Strategy

### Focused Unit and Property Tests

* Test document depths 19, 20, and 21.
* Test parsing and serialization at the exact boundary.
* Test child creation at level 19 and rejection at level 20.
* Test that rejected creation has no document, focus, selection, history, ID-generation, or persistence side effects.
* Update property generators and assertions so every accepted document and every command sequence preserves the 20-level invariant.
* Replace the obsolete expectation that a 5,000-level document is valid for serialization. Retain focused iterative-traversal coverage only where it remains meaningful for valid or explicitly untrusted input.
* Add the targeted asynchronous, persistence, and hyperlink branch tests described above.

### Boundary Contract Tests

* Verify IPC save validation accepts an exactly-20-level payload and rejects an over-depth payload with the domain validation error.
* Verify error propagation and that rejected payloads do not reach filesystem persistence.

### Electron End-to-End Tests

* Launch and navigate a valid 20-level persisted document.
* Attempt to create a child below a level-20 node and verify the exact visible error, unchanged editor state, and unchanged persisted document after restart.
* Launch with an existing 21-level document and verify the document-error state and byte-for-byte unchanged persisted file.
* Keep process ownership, save-error observation, and bounded teardown requirements intact.

### Performance Tests

* Run the revised startup and typing scenarios using the approved budgets.
* Print machine-readable measurements as today.
* Ensure a deliberately lowered test budget can make the appropriate assertion fail before accepting the new guard.

## Expected Modules

Likely implementation and test changes include:

* `src/domain/document.ts` and its unit/property tests;
* `src/application/editor-command-transitions.ts`, `src/application/editor-store.ts`, and their tests;
* `src/main/ipc-security.test.ts` or `src/main/ipc-handlers.test.ts` for the save-boundary contract;
* renderer component coverage only if required to verify the visible error contract;
* `e2e/` depth and persistence scenarios;
* `perf/startup.spec.ts`, `perf/typing.spec.ts`, and possibly shared performance fixtures;
* `vitest.config.ts` after measuring the new stable coverage baseline;
* `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and the documentation corrections listed above.

Prefer focused changes to these existing modules. Do not introduce a new state-management system, persistence version, or architectural layer.

## Data and Compatibility

* No automatic truncation or migration is permitted because it would destroy user data.
* Version 1 and version 2 documents deeper than 20 levels must fail safely and remain untouched.
* Valid documents at 20 levels or fewer remain compatible.
* The JSON schema version remains 2.

## Risks

* Depth checks applied only at load time would allow invalid state to be created at runtime; enforce the invariant in domain creation as well as parsing.
* Returning an ordinary no-op from the transition could suppress the required user-facing explanation; preserve an explicit rejection outcome.
* Asynchronous coverage tests can become timing-dependent; use controlled promises and fake services rather than wall-clock delays.
* Aggressive global coverage floors can reward incidental tests or become brittle; require the focused per-module result first and derive global floors from the measured baseline.
* Performance measurements vary with machine load; use repeated observations and approved user-visible ceilings, not a comparison with one unusually fast run.

## Validation

During implementation:

1. Run focused unit, property, contract, Electron, and performance tests while developing.
2. Run `npm run test:coverage` and confirm both focused modules meet the required branch coverage.
3. Run `npm run check:full` on supported macOS hardware with a display.
4. Confirm no relevant test was skipped and the real Electron persistence boundary ran.
5. Review the diff for unrelated behavior or architecture changes.
6. Record final coverage and performance measurements in this plan.
7. Change the plan status to `Completed`, add `Completed: YYYY-MM-DD`, and move this same file to `docs/plans/completed/`.
8. Commit the completed logical change.

## Completion Criteria

* The approved maximum-depth behavior is implemented and documented.
* Exact-boundary, property, IPC contract, and real Electron tests pass.
* Over-depth persisted data is rejected without modification.
* Rejected child creation has no document, runtime, history, ID, or persistence side effects and displays the approved message.
* Performance tests enforce the approved meaningful budgets using the documented measurement method.
* The two focused modules each reach at least 80% branch coverage through meaningful tests.
* Stable global coverage floors are updated without weakening any existing floor.
* Documentation metadata is coherent.
* `npm run check:full` passes without skipped boundary coverage.

## Final Validation Outcome

Implemented the 20-level invariant across domain creation, document assertion, persisted-state parsing, application transitions, IPC save validation, and the real Electron UI. Level-20 nodes remain enterable, selectable, and editable. Rejected child creation returns an explicit transition rejection before ID generation, leaves the document, location, focus, history, and persistence queue unchanged, and presents the approved error. Version 1 and version 2 over-depth persisted documents fail safely without modifying their files.

Added focused unit and property coverage, IPC contract coverage, and real Electron persistence tests for depths 19, 20, and 21, asynchronous clipboard and attachment races, clipboard failures, malformed persistence, and hyperlink edge cases. The focused branch results are `src/domain/document.ts` 83.73% and `src/application/editor-store.ts` 85.05%.

The measured global coverage baseline is 92.84% statements, 84.64% branches, 92.94% functions, and 94.57% lines. Enforced floors are 91%, 83%, 92%, and 93%, respectively; each is above the previous floor and leaves a small variance margin.

Performance used three startup repetitions per scenario and 104 typing samples per scenario. Typing latency was measured from the input event through two consecutive animation frames. Final observations on the supported development machine were:

| Scenario | Launch range | Renderer range | Typing paint p95 | Typing paint maximum |
| --- | ---: | ---: | ---: | ---: |
| fresh | 289.41–387.87 ms | 80.2–90.8 ms | — | — |
| wide-1000 | 300.83–392.1 ms | 103.5–106.4 ms | 33.1 ms | 34.1 ms |
| large-10000 | 285.67–347.41 ms | 92.2–99.9 ms | 36 ms | 40.4 ms |

The approved budgets remain 2,000 ms launch, 1,000 ms renderer, 100 ms typing p95, and 250 ms typing maximum. All five performance scenarios passed.

`npm run check:full` passed: type checking, linting, formatting, 210 unit/component tests with coverage, production build, audit with zero vulnerabilities, all 69 real Electron E2E tests, and all five performance tests. No relevant boundary test was skipped.
