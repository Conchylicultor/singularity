// Shared CLI machinery, not a command (no default export): the gated upgrade
// runner `./singularity deps upgrade` and its alias `toolchain upgrade` both
// drive. It spawns `./singularity check` / `test` and the smoke commands, and
// prints to the terminal.
export { upgradeThisWorktree } from "./internal/worktree-upgrade";
