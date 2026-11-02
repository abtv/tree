# Security Audit

This is the shared agent procedure for `security audit` and equivalent natural-language requests. Read it before conducting the audit. It supplements the workflow owned by [AGENTS.md](../AGENTS.md); it does not change architecture or security requirements.

## Scope and authority

Default to the current Tree repository, including Electron, the React renderer, the browser app, dependencies and build/release configuration. Honor an explicitly narrower scope and name exclusions. This command authorizes investigation and a report, not remediation, dependency updates, configuration changes or commits. Use isolated synthetic data. Temporary probes and evidence belong in `.scratch/<task>/`; use existing suite locations when the test runner requires them, and remove task-created diagnostic specs before handoff. Preserve existing changes and user data. Do not test external systems or personal profiles.

## Procedure

1. Record the commit and relevant working-tree changes. Read the applicable product, architecture and nested agent instructions. Inventory production entry points, data sources, privileged operations and trust boundaries. Treat imported documents, archives, attachments, clipboard content, links and persisted content as potentially hostile. Distinguish ordinary hostile input from an already compromised renderer.
2. Check the capabilities needed for the selected audit under [Development Guide §10](DEVELOPMENT.md#task-capability-check). State missing runtime or advisory access early and continue independent inspection. Use the existing named validation workflows and permission mechanisms. Do not install scanners or change permissions as an implicit part of the audit.
3. Consult current primary guidance: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [OWASP XSS prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html), [OWASP DOM XSS prevention](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html), and relevant vendor advisories for installed versions. Record source dates and access limitations; do not present recalled or unavailable advisory data as current verification.
4. Inspect every applicable area below. Trace attacker-controlled input through validation and transformations to its destination. Search matches identify candidates, not confirmed vulnerabilities. Check production configuration and runtime wiring; development settings and TypeScript types do not establish production protection.
5. Run `npm run audit` and relevant existing security tests. Select focused runtime checks using [Development Guide §9](DEVELOPMENT.md#9-full-validation). Reproduce candidate failures safely with synthetic fixtures when possible. Test the actual Electron or browser boundary when a claim depends on runtime behavior. Distinguish injected test access from access a real attacker can obtain. A blocked check is unverified, not passed.
6. Review the evidence and return the report below. Do not silently fix findings. Retain temporary evidence only when needed for an unfinished handoff; otherwise use the documented scratch retirement workflow.

## Inspection checklist

| Area | Checks |
| --- | --- |
| Electron isolation | Inspect every window and web contents: sandbox, context isolation, Node integration, web security, preload exposure and Electron fuses where applicable. Check that untrusted content cannot acquire Node or main-process capabilities. |
| IPC and preload | Check narrow APIs, sender/frame validation, runtime argument validation, authorization of sensitive actions, event exposure and return data. Trace renderer compromise to filesystem access, command execution or data disclosure; do not assume context isolation alone prevents these paths. |
| Navigation and network | Check redirects, subframes, new windows, webviews, permissions, external-link scheme validation and network restrictions. Inspect the `app://` handler for encoded path escapes, unexpected asset types and origin confusion. Verify CSP in the form actually delivered; a declared directive may not be enforced. |
| React and DOM | Trace stored and DOM XSS through text, rich editing, links, clipboard, imports and restored data. Inspect `dangerouslySetInnerHTML`, HTML insertion/parsing APIs, event attributes, unsafe URL schemes, `eval`, `Function` and string-based execution. React text escaping does not establish safety for HTML or URL sinks. Check sanitization for the actual output context. |
| Files, archives and images | Check traversal, absolute paths, symlink escapes, archive entry names, decompression limits, image dimensions, malformed content, arbitrary reads/writes and command injection. Check size/depth/count limits before expensive parsing or allocation and assess reachable denial of service. |
| Browser boundaries | Inspect origin isolation, storage, service workers and caches where present, message sender/origin checks, CSP delivery and data export. Apply CORS, CSRF and authentication checks only where the corresponding network or session boundary exists; mark absent features not applicable with a reason. |
| Data disclosure | Check unintended network requests, URLs, logs, error reports, exports and packaged assets for sensitive data exposure. Report secret locations without copying secret values into the report. |
| Dependencies and distribution | Review lockfile versions, direct and transitive advisories, Electron/Chromium/Node exposure, install scripts, CI permissions, build inputs and release/update integrity where present. Distinguish production reachability from build-time exposure. A clean dependency audit does not establish application security. |

The checklist is a minimum inspection guide, not a reason to stop following a demonstrated attack path. Do not invent missing services or treat every hardening recommendation as an exploitable defect.

## Report

Lead with confirmed findings ordered by severity. For each finding include:

* A stable report ID, severity and confidence, with the impact and prerequisites that justify them.
* File and line references, the affected runtime/build and the attacker-controlled entry point.
* The path to the dangerous operation, including which existing controls fail or are bypassed.
* A minimal safe reproduction and observed result, or an explicit explanation of what is established by code inspection and what remains unverified.
* A recommended correction and a regression check that would detect the failure.

Separate confirmed vulnerabilities, unconfirmed candidates and defense-in-depth suggestions. Include a compact coverage table: area, inspected scope, checks run and outcome (`verified`, `inspection only`, `blocked`, or `not applicable` with a reason). Record exact commands, tested snapshot, relevant build/environment assumptions and primary-source links. Identify excluded areas and the next action for blocked checks. If there are no confirmed findings, say so within the inspected scope; never claim that the application is secure merely because tests or dependency audits passed.

Return the report in conversation unless the owner requests a saved destination. A request to fix findings starts a separate implementation task under the normal defect, validation and review rules.
