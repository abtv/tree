Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

# Event-based synchronization for E2E waits

## Goal

Remove the fixed-duration `waitForTimeout` calls that guard timing-sensitive E2E assertions and replace them with synchronization on observable application events.

## Current behavior

Four fixed waits remain in the E2E suite:

- `e2e/csp.spec.ts` waits 250 ms after assigning a cross-origin `document.location.href`, then asserts the renderer URL is unchanged.
- `e2e/persistence-reliability.spec.ts` waits 250 ms before asserting that deferred attachment cleanup did not run while saves are blocked; waits 100 ms before asserting the application did not exit while an attachment write is gated; and waits 100 ms after a quit request before releasing a failing attachment write.
- `e2e/shutdown-failures.spec.ts` waits 750 ms for a deliberately delayed save to resolve before retrying quit.

These sleeps are the suite's main flake candidates: they assume a duration rather than a state, so a loaded machine can fail the test and a fast machine wastes time.

## Proposed changes

1. **Blocked navigation (`csp.spec.ts`).** Register a one-shot `will-navigate` listener on the window's web contents from the main process before triggering the navigation. Poll until the event fires and assert it was default-prevented, then assert the URL is unchanged.
2. **Deferred cleanup (`persistence-reliability.spec.ts`).** Wait for the visible `image blocked` operation error, which proves the failed attachment and save paths completed, then assert the cleanup counter is still zero.
3. **Gated image quit (`persistence-reliability.spec.ts`).** Drop the 100 ms wait. The gated write plus the post-release `app.evaluate` and close event already fail the test if the application exits early; keep the immediate exit-code assertion.
4. **Cancelled quit (`persistence-reliability.spec.ts`).** Register a renderer `onQuitRequested` listener before invoking quit, poll until the request is observed, then release the failing attachment. The renderer's flush starts from the same event, so the failure is injected while the flush is pending.
5. **Delayed save retry (`shutdown-failures.spec.ts`).** Extend `delaySaveIpc` to record when the delayed handler resolves and add a `waitForDelayedSave` fixture that polls for it; replace the 750 ms sleep.

The bounded 50 ms polling loops in `perf/state.spec.ts` already poll a probe against a deadline and are not blind sleeps; they stay.

No product code changes.

## Affected modules

- `e2e/fixtures.ts`
- `e2e/csp.spec.ts`
- `e2e/persistence-reliability.spec.ts`
- `e2e/shutdown-failures.spec.ts`

## Testing

- Run the affected E2E specs repeatedly to confirm stability.
- `npm run check:full` covers the complete E2E and performance suites.
- No new unit tests: the change is confined to test synchronization.

## Documentation

- None required; the test-suite rules in `e2e/AGENTS.md` and `docs/DEVELOPMENT.md` already prefer event-driven synchronization. Update this plan and move it to `docs/plans/completed/` when done.

## Risks

- **Navigation event delivery.** If `will-navigate` never fires for the attempted cross-origin load, the poll times out and the test fails loudly instead of passing silently; the same test is verified against the unchanged application.
- **Quit flush ordering.** Releasing the failing attachment only after the renderer observes the quit request preserves the intended race; if the flush had already completed, the test's expected quit failure would not appear and it would fail.
- **Delayed save resolution.** Polling for the main-process resolution can precede the renderer receiving the IPC response by microseconds; the retried quit has its own bounded flush wait, so it still succeeds deterministically.

## Out of scope

- Product code, IPC contracts, and the performance suite's bounded probe loops.

## Outcome

All fixed waits in `e2e/` are gone. The affected specs (`csp`, `persistence-reliability`, `shutdown-failures`) passed, then passed again with `--repeat-each=2` (26 tests). `npm run check:full` passed before commit.
