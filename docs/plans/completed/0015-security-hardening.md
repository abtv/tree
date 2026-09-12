# Security hardening

Status: Completed
Created: 2026-09-12
Completed: 2026-09-12

## Goal

Harden the Electron process boundaries and local attachment handling against compromised renderer content, malformed IPC input, unexpected navigation, and oversized or invalid image data.

## Scope

- Validate IPC callers and payloads in the main process.
- Restrict renderer navigation to the packaged application page or trusted development renderer.
- Enforce attachment size and binary image payload limits.
- Tighten and test the production content security policy.
- Document the security boundaries and validation workflow.

## Testing strategy

- Unit-test URL trust and IPC payload validation.
- Unit-test attachment limits and PNG validation.
- Add Electron end-to-end coverage for navigation denial and the production CSP.
- Run `npm run check:full` and `npm audit`.
