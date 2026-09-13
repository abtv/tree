Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Record perf results and compare against a baseline

## Goal

Make performance runs comparable on the same machine: record every scenario's measurements to a JSON artifact and support failing a run when a metric regresses against a previously recorded baseline, without committing machine-specific numbers or weakening the portable absolute ceilings.

## Current behavior

Each performance test asserts absolute wall-clock ceilings and prints one `PERF` JSON line per scenario to the test output. Nothing is recorded, so a developer can only compare numbers by eye from two console scrolls. Absolute budgets are machine-sensitive and cannot express "this change made typing slower" on the machine where the change was made.

## Proposed changes

1. Add `perf/results.ts`:
   - `recordPerfResult` logs the scenario, writes or merges the measurements into a results artifact, and, when `PERF_BASELINE` points at a previously recorded artifact, compares the current metrics against it.
   - The artifact defaults to `test-results/perf-results.json` and can be redirected with `PERF_RESULTS`; it records creation time, platform, architecture, and Node version.
   - `compareMetrics` fails metrics that exceed the baseline ratio by more than `PERF_REGRESSION_TOLERANCE` (default `1.5`). Metrics missing from the baseline, non-positive baselines, and improvements never fail.
   - Range metrics such as startup `launchMs` flatten to `.min` and `.max` keys.
2. Replace the per-spec `console.log` calls with `recordPerfResult`; the existing absolute `expect` ceilings stay in every scenario.
3. Run `perf/results.test.ts` with the unit suite by excluding only the Playwright performance specs from Vitest, and restrict the Playwright performance project to `*.spec.ts` so it ignores the unit test.
4. Document the capture/compare workflow for developers.

No product code, budgets, or scenario parameters change.

## Workflow

```bash
npm run test:perf                                        # record a baseline
cp test-results/perf-results.json /tmp/perf-baseline.json
# implement the change
PERF_BASELINE=/tmp/perf-baseline.json npm run test:perf  # fail on regressions
```

## Affected modules

- `perf/results.ts` (new), `perf/results.test.ts` (new)
- `perf/startup.spec.ts`, `perf/typing.spec.ts`, `perf/state.spec.ts`
- `vitest.config.ts`, `perf.config.ts`
- `perf/AGENTS.md`, `docs/DEVELOPMENT.md`

## Testing

- Unit tests cover metric flattening, regression detection, tolerance, missing and zero baselines, artifact merging, and the baseline failure path.
- Run `npm run test:perf` to record an artifact, then rerun with `PERF_BASELINE` set to the recorded artifact and confirm it passes.
- `npm run check:full` before commit.

## Documentation

- `perf/AGENTS.md`: require recording through `perf/results.ts` and state that baselines are same-machine artifacts, never committed.
- `docs/DEVELOPMENT.md` §12: describe the artifact and comparison environment variables.
- Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **Cross-machine baselines.** A baseline recorded on different hardware is not meaningful; the comparison prints the recording environment and remains explicit opt-in through `PERF_BASELINE`.
- **Noisy metrics.** A single same-machine baseline can be unlucky; the tolerance absorbs normal variance and the absolute ceilings remain the hard gate. The plan's outcome records whether a back-to-back comparison passes.
- **Vitest/Playwright overlap.** The new unit test must not be collected by the performance project; the `testMatch` change makes the split explicit.

## Out of scope

- Changing budgets, scenarios, scale targets, or committing baseline numbers.
- CI configuration.

## Outcome

All nine scenarios record through `perf/results.ts`. A baseline run followed by a `PERF_BASELINE` comparison run passed on this machine; a deliberately tight baseline failed all three typing scenarios with per-metric regression messages, confirming the failure path through the real suite. Eight new unit tests cover flattening, regression detection, artifact merging, and baseline failures. `npm run check:full` passed before commit.
