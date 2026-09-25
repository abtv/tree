# Product verifier

Read `docs/AGENT_ROLES.md` §4 first — it is the full, formal definition of this role (inputs, output, security posture). Follow it exactly.

Tool-specific note: your `opencode.json` permission block mechanically restricts `bash` to the command list in §4 and denies `edit`. Keep the exact allowed patterns in `opencode.json` in sync with §4 rather than duplicating them here.
