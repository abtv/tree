# Worker-Owned E2E Application Reuse

Status: Accepted
Date: 2026-10-11

## Context

Fresh Electron launches dominate the hidden E2E suite's time. The bounded E2E-3 experiment reused a worker-owned application for navigation and Tab structure while preserving both editing modes and every existing launch guard. Same-window reload reduced common-case summed time by about three quarters at six workers; destroying and recreating the window saved less. Measurements and their host-variance limits are in the active E2E suite time initiative until rollout completes.

The Product Owner approved D1 on this date. This decision authorizes bounded adoption; the accepted ADR does not mean the rollout is implemented. The existing fixture remains fresh by default and the prototype remains opt-in until the rollout tasks pass their validation. ADR 0012 stays accepted: worker ownership, shortcut isolation, clipboard locking, hidden/visible execution and the prohibition on concurrent Playwright invocations still apply.

## Decision

Adopt same-window reuse through explicit per-spec or per-group eligibility, keeping fresh-process execution as the global fixture default. Hidden eligible editing tests may share one Electron application owned by their Playwright worker. Visible runs and fresh controls use ordinary per-test processes. A reviewed owner must establish the complete reset contract before opting in; proximity to an eligible test is not evidence of eligibility.

The test-owned fixture disposes the old renderer by main-process navigation to a blank document, acknowledges navigation in Playwright, drains tracked original production IPC operations and any surviving native-state debounce, then removes only the worker data directory. The next test seeds its document and editing preference before loading the production renderer. Capture the expected seed before renderer loading and verify document, location/expansion, selected-editor focus, initial mode, empty undo/redo and native window state. Preserve save/operation-error observation, clipboard ownership/release, canonical scale, scrollbars, shortcut and hidden-window assertions. Close an owned process before deleting files after a failed reset; worker teardown remains bounded.

No reset hook, test channel or test branch enters the production bundle. IPC instrumentation remains in the test-owned entry and invokes original production handlers. Clipboard state is not cleared outside the existing ownership lock. Resets deliberately discard pending renderer edits; they do not substitute for persistence or quit-flush coverage.

Keep startup, persistence/recovery, quit/shutdown, native-shortcut, window-lifecycle and appearance-flash tests on fresh processes. Also keep relaunch tests, custom launch configuration, clocks, browser-context initialization scripts, replaced IPC handlers and retained main-process instrumentation fresh unless a separate owner proves and reviews their reset. The first adoption contract accepts only top-level, collapsed seeds; nested or expanded seeds remain fresh until their contract is explicitly extended and verified.

## Consequences

Process identity, Chromium session caches, main-process listeners and file-service generation state survive renderer replacement. Reuse is weaker isolation than a fresh process. Reset/recovery regressions and repeated-cycle renderer/process-memory measurements must precede broader adoption; investigate sustained growth against warm-up and fresh controls rather than inventing a time or memory budget. The duration-budget decision remains deferred.

Roll out fixture hardening first, then navigation/Tab structure, then independently reviewed Vim text and navigation/selection areas. Every area inventories all launch paths and state mutations, preserves existing mode coverage, compares fresh controls and completes High Risk validation and independent review. Full-suite timing pairs close the bounded rollout; do not extrapolate the two-file prototype to the whole suite.

This refines the per-test process-isolation model for opted-in editing coverage without changing the application's product behavior, domain model, persistence model, security channels or performance-suite execution. Development §8 owns the supported commands and current eligibility; the active initiative owns outstanding rollout tasks.
