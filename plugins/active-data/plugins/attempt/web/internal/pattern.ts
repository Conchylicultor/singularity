// Attempt IDs are formatted as `att-<unix-seconds>-<4 base36 chars>` —
// the worktree basename is used as the attempt id directly.
export const ATTEMPT_ID_RE = /\batt-\d+-[a-z0-9]{4}\b/g;
