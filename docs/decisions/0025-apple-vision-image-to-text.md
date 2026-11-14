# Apple Vision Image to Text

Status: Accepted
Date: 2026-11-11

## Context

The owner approved English OCR for Apple Silicon macOS Electron after trying a local
prototype. Images and recognition must stay on device. Browser/Linux OCR and automatic
task creation are out of scope. The owner chose Apple Vision over a downloadable OCR
engine and model, and requested background execution with a queue.

## Decision

Use a small Swift command-line helper linked to the system Vision and ImageIO frameworks.
Electron main starts it using a fixed executable path, sends image bytes over stdin,
and validates JSON text output. Each request has an independent process and bounded
input, output and duration. Only one helper runs at a time. The renderer application
owns a bounded queue and inserts results through the existing immutable domain/history.
No shell command, renderer-provided path, telemetry or network operation is involved.

Image paste also uses this queue to derive hidden attachment search text. Automatic
results enrich current and retained history snapshots without a separate Undo step;
the explicit command continues to append visible children. Both purposes share native
execution and source-lifetime cancellation.

Build the helper with the installed Apple toolchain for arm64 macOS 13.0, matching
the current Electron bundle minimum. Package it in `Contents/Helpers` so standard
nested-code signing discovers it. Retain existing hardened runtime, entitlements,
renderer sandbox and fuses. Test real OCR in macOS source smoke and in the signed
DMG/ZIP verification runner through the production renderer and bridge.

## Consequences

Development on Apple Silicon requires Xcode Command Line Tools. Browser and Linux
builds skip Swift compilation and expose no OCR capability. Runtime needs no downloaded
model. Vision chooses compute resources; Tree does not force CPU/GPU or promise identical
recognition across OS versions. Paragraph grouping uses provisional geometry rules.
The subprocess isolates native OCR failure from Electron, but runs with the user's
OS authority and is not a new sandbox boundary. Signed artifact readiness is established
by release verification, not by an unsigned development run.
