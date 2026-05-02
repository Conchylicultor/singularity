# Central Runtime

The `central/` directory is the **shared central runtime** — a single long-running process that handles cross-worktree concerns (secrets, OAuth, leader election, cross-namespace notifications). Unlike the per-worktree `server/`, there is exactly one instance of `central/` running for the entire host.

## RULES

- **NEVER modify anything in `central/` unless the user explicitly instructs so.** Changes here affect all worktrees simultaneously and cannot be sandboxed inside a worktree branch. Always get explicit approval before touching this directory.
