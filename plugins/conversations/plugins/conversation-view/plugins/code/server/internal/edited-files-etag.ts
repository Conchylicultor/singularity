// Conditional-revalidation ETag signature for the `edited-files` resource: the
// cheap "did anything change?" fingerprint the HTTP read path (If-None-Match →
// 304) compares against the client's last value before running the full loader
// (`getEditedFiles`). A conservative over-approximation — it changes whenever the
// resource's VALUE could change (serving stale is a correctness bug; a needless
// recompute is merely a missed optimization). Factored into pure functions so the
// soundness is unit-testable without spawning git.
//
// The value (`getEditedFiles`) is the list of changed files vs. merge-base, each
// with a status AND per-file added/deleted line counts. Its inputs:
//   1. committed branch diff — `git diff <mergeBase>` (name-status + numstat),
//      fully determined by (headSha, mergeBase): both are immutable trees, so a
//      commit/amend/rebase that changes the committed diff moves headSha (and a
//      main advance moves mergeBase). A porcelain-only signature would MISS this
//      (an amend leaves the working tree clean → identical `git status`).
//   2. uncommitted working-tree changes — `git status --porcelain -uall` plus the
//      numstat/line counts of each dirty file. The porcelain output alone is NOT
//      enough: a file already in the changed set can gain more edits while its
//      status stays `M` (unchanged porcelain line) yet its numstat (and thus the
//      value) changes. So we additionally fold in each dirty entry's lstat
//      (mtimeMs + size) — git's own stat-cache dirty signal, which changes on any
//      content edit. This is an `lstat` per dirty file (no content read), strictly
//      cheaper than the loader's two `git diff` passes + untracked line reads.

export interface DirtyEntry {
  /** Two-char porcelain-v1 status code (e.g. "??", " M", "A "). */
  code: string;
  path: string;
  /** lstat mtime in ms, or -1 when the path could not be stat'd (e.g. deleted). */
  mtimeMs: number;
  /** lstat size in bytes, or -1 when the path could not be stat'd. */
  size: number;
}

// Parse `git status --porcelain --no-renames -uall -z` output. The `-z` form is
// NUL-delimited (`XY <path>\0` per entry) so paths containing spaces/newlines/
// quotes need no unquoting. `--no-renames` avoids the two-token rename record, so
// every entry is a single `XY <path>` token.
export function parsePorcelainZ(out: string | null): Array<{ code: string; path: string }> {
  if (!out) return [];
  const entries: Array<{ code: string; path: string }> = [];
  for (const token of out.split("\0")) {
    if (token.length < 3) continue; // "XY " prefix + at least one path char
    entries.push({ code: token.slice(0, 2), path: token.slice(3) });
  }
  return entries;
}

// Format the gathered inputs into a stable ETag. Entries are sorted by path so
// the string is order-independent (git's output order is stable, but sorting
// makes the fingerprint robust to it). NUL joins entries (a path can contain any
// byte except NUL) and the per-entry layout puts the free-form `path` LAST so its
// arbitrary bytes cannot be confused with the fixed-shape code/mtime/size fields.
export function editedFilesEtag(
  headSha: string,
  mergeBase: string,
  entries: readonly DirtyEntry[],
): string {
  const rows = [...entries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((e) => `${e.code}:${e.mtimeMs}:${e.size}:${e.path}`)
    .join("\0");
  return `${headSha}|${mergeBase}\0${rows}`;
}
