# Remove On-Device Summarization

Status: Accepted
Date: 2026-11-21

## Context

ADR 0026 added English summarization through a Foundation Models Swift helper. On 2026-11-21 the Product Owner decided to remove the feature because they do not use it (PD-008 in `docs/OPEN_QUESTIONS.md`). It cost a second native helper, five IPC channels, an asynchronous application job, a packaged executable, an Xcode 26 SDK selection in four macOS CI workflows, and real-model tests whose inference check depends on local Apple Intelligence readiness.

## Decision

Remove the `summarize` command, its application job, the main-process helper adapter and IPC channels, the preload bridge, the Swift helper and its build and packaging steps, and the CI steps that selected Xcode 26.2 only for the Foundation Models SDK. `PRODUCT.md` §15.2 is retired. The Apple Vision image-recognition helper of ADR 0025 is unchanged.

A `summarize` entry in an existing command history is ignored under the existing rule for names absent from the registry (`PRODUCT.md` §20.2.30). The feature persisted no document data, so no migration is needed.

## Consequences

macOS builds again use the SDK that the runner or `xcrun` selects by default. The packaged application contains one native helper. Restoring summarization would require a new product decision and a new ADR.
