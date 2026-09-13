# Performance Baselines for Startup and Typing Latency

```text
Status: Completed
Created: 2026-09-11
Completed: 2026-09-11
```

## Goal

Measure and guard two user-visible performance characteristics:

- **startup**: time from launching the application to the first interactive level;
- **typing latency**: time from a keypress to the resulting frame being painted.

This plan only adds measurement. Optimizations are decided after baselines exist.

## Current State

- The renderer renders one level at a time, so DOM size scales with the number of siblings, not the whole tree.
- `EditorStore` clones the entire document on text edits and structural commands, and persists the whole document on every change.
- No performance measurements, benchmarks, or budgets exist.
- `npm run check:full` runs the functional end-to-end suite; performance assertions must not make it flaky.

## Scope and Constraints

In scope:

- a separate Playwright project under `perf/` with its own config and npm command;
- representative scenarios at several scales;
- startup and typing-latency measurement with loose sanity bounds;
- documented budgets once baselines are known.

Out of scope:

- true OS-level process-spawn timing (measured from before `electron.launch`, including harness overhead, for consistency);
- CI trend tracking;
- correctness testing.

Constraints:

- No test hooks in production code. Measurement is done from Playwright and in-page `performance` APIs.
- Performance tests run via `npm run test:perf` and as part of `npm run check:full`.

## Proposed Approach

### Scenarios

Documents are seeded into the isolated `userData` directory before launch:

- `fresh`: one empty root;
- `wide-1000`: one root with 1,000 children;
- `large-10000`: 100 roots with 100 children each (10,000 nodes).

Scales are defined in one place so they can be adjusted.

### Startup

- Record `performance.now()` immediately before `electron.launch`.
- Launch, wait for the first interactive level (`main.tree-app` and the first node field).
- Report `launchMs` (harness-relative) and `rendererMs` (in-page `performance.now()` at ready, i.e. document start to interactive).
- Loose upper bounds only, to catch catastrophic regressions without flaking.

### Typing latency

- Seed a large document, focus a node, and install an in-page probe that records `performance.now() - inputEvent.timeStamp` after the post-event paint (`requestAnimationFrame` twice).
- Type a fixed number of characters and report the median and p95 latency.
- Loose upper bounds only.

### Output

Each perf test prints a single JSON line per scenario with the measured values. Baselines are recorded in this plan; budgets are chosen from them.

## Affected Modules

- New: `perf/` (config, fixtures, startup spec, typing spec).
- `package.json`: `test:perf` script.
- `docs/DEVELOPMENT.md`: how to run performance tests.

## Data Model and Persistence Changes

None.

## Testing Strategy

Performance scenarios run after the correctness suites as part of `check:full`. Correctness is unchanged and remains covered by the unit, component, and `e2e/` suites.

## Baselines

Measured on the development machine, one worker, production build:

| Scenario | Startup (launch) | Startup (renderer) | Typing commit (median) | Typing paint (median / p95) |
| --- | --- | --- | --- | --- |
| fresh | ~460 ms | ~170 ms | — | — |
| wide-1000 | ~465 ms | ~174 ms | ~0.1 ms | ~10 / ~18 ms |
| large-10000 | ~426 ms | ~137 ms | ~0.1 ms | ~6.5 / ~21 ms |

Observations:

- Startup is flat across scales: parsing and rendering one level does not degrade with total document size.
- Typing on the main thread is sub-millisecond; measured paint latency is dominated by frame quantization (roughly one frame), not application work. The whole-document clone per edit is not a practical bottleneck at 10,000 nodes.
- No budget enforcement is needed yet; the loose sanity bounds remain.

## Findings

- **Electron `contextBridge` depth limit.** Documents nested deeper than roughly 250 tree levels cannot be loaded, because each level crosses an object and an array and Electron rejects nested objects beyond a depth of 1,000 (`contextBridge recursion depth exceeded`). The app fails safely into its error state and leaves the file unchanged. This is below the domain's own traversal capability and is a process-boundary constraint, not a performance one. The approved 20-level product invariant in plan 0028 supersedes this plan's earlier assumption that expected nesting was merely well under the bridge limit; changing the IPC payload remains out of scope.

## Risks and Open Questions

- **Wall-clock variance.** Thresholds must be generous; the value is in baselines and trends, not millisecond precision.
- **Harness overhead.** `launchMs` includes Playwright's launch call, so it is comparable between runs but not an absolute OS startup time.
- **Focus.** Only startup and typing latency are measured here.
