// Attempt IDs are formatted as `att-<unix-seconds>-<4 base36 chars>` —
// the worktree basename is used as the attempt id directly.
// Negative lookbehind for `/` excludes path segments (…/att-…) and URL
// subdomains (://att-…). Negative lookahead for `/` and `.` excludes trailing
// path separators and domain suffixes (att-….localhost.com).
export const ATTEMPT_ID_RE = /(?<!\/)att-\d+-[a-z0-9]{4}(?![/.])\b/g;
