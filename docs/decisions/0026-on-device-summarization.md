# On-Device Summarization

Status: Accepted
Date: 2026-11-12

## Context

The owner approved English summarization of selected nodes and their descendants,
including Agenda, with a final clipboard result and bottom status progress/cancel.
Processing must remain on device and require no app-managed model installation.

## Decision

Use Foundation Models `SystemLanguageModel` in a separate Swift executable, following
the native helper boundary of ADR 0025. Never instantiate Private Cloud Compute or
provide network tools. The helper builds with the installed Apple SDK and retains
the application minimum macOS 13; an availability guard disables inference below 26.
Package it in `Contents/Helpers` under existing nested signing and hardened runtime.

The application owns an immutable input snapshot and sequential bounded reduction
of branches. Each request creates a fresh native session. Conservative UTF-8 byte
limits reserve the 4K context for instructions and output without depending on token
APIs absent from macOS 26. The main process validates requests, owns native lifetime
and job identity, and commits the final plain-text clipboard write only for the
current live renderer job. No document/history/persistence operation is involved.

## Consequences

Apple Intelligence availability and output quality depend on the OS, device and
system model. macOS may download system assets; Tree provides no downloader. Model
execution is asynchronous, but shared hardware can affect editor responsiveness.
Hierarchical summaries can lose details; bounded refusal is preferable to truncation
or unbounded work. Final output intentionally replaces the current clipboard.
Intermediate results and job state are never persisted or resumed.
