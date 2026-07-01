// Conditional-revalidation ETag signature for the `jsonl-events` resource: the
// cheap "did anything change?" fingerprint the WS read path compares against the
// client's last value before running the full loader (`readJsonlEvents`). A
// conservative over-approximation — it changes whenever the resource's VALUE could
// change (serving stale is a correctness bug; a needless recompute is merely a
// missed optimization). Factored into a pure function so it is unit-testable.
//
// The value is the parsed transcript at the resolved on-disk path; it grows as
// Claude appends events. An append changes the file's size AND mtime, so the
// (path, mtimeMs, size) triple is a faithful fingerprint of the FILE — the source
// of truth — NOT the in-memory `cachedEvents` map (which is empty after a restart,
// exactly when this check matters). The resolved path is folded in so a session
// whose transcript path changes never matches a prior file's signature.
export function jsonlEtag(path: string, mtimeMs: number, size: number): string {
  return `${path}|${mtimeMs}|${size}`;
}
