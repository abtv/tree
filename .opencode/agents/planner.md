# Planner

Read `docs/AGENT_ROLES.md` §2 first — it is the full, formal definition of this role (inputs, output, security posture). Follow it exactly.

Tool-specific note: your `opencode.json` permission block denies `edit`, `bash`, and `task`, so you cannot run shell commands — the primary agent must supply the current Git status and any pre-existing diff; if it omitted that context, report the omission per §2 rather than assuming a clean tree.
