// Conditional-revalidation ETag signature for the `jsonl-events` resource: the
// cheap "did anything change?" fingerprint the WS read path compares against the
// client's last value before running the full loader (`readJsonlEventsFromChain`).
// A conservative over-approximation — it changes whenever the resource's VALUE
// could change (serving stale is a correctness bug; a needless recompute is merely
// a missed optimization). Factored into pure functions so it is unit-testable.
//
// The value is the MERGE of a conversation's whole session chain, so the signature
// must cover every file in it. Each file contributes a (path, mtimeMs, size)
// triple: an append changes both mtime and size, and folding in the resolved path
// means a session whose transcript path changes never matches a prior file's
// signature. It fingerprints the FILES — the source of truth — NOT the in-memory
// `cachedEvents` map (which is empty after a restart, exactly when this matters).

/** One file's contribution to a chain signature. */
export function jsonlEtag(path: string, mtimeMs: number, size: number): string {
  return `${path}|${mtimeMs}|${size}`;
}

/**
 * Signature of a whole session chain.
 *
 * `chainLength` is how many files the resolver returned; `files` are the ones that
 * still existed when stat'd. Both are folded in, so all three ways the value can
 * move produce a different string:
 *   - an append to any file     → that file's (mtimeMs, size) changes;
 *   - a NEW chain entry         → `chainLength` grows and a new triple appears;
 *   - a file vanishing under us → its triple disappears while `chainLength` stands.
 *
 * An empty chain is `"none"`, which never matches a real signature, so it degrades
 * to a recompute (safe) rather than a stale match.
 */
export function jsonlChainEtag(
  chainLength: number,
  files: readonly { path: string; mtimeMs: number; size: number }[],
): string {
  if (chainLength === 0) return "none";
  return `${chainLength}|${files.map((f) => jsonlEtag(f.path, f.mtimeMs, f.size)).join("|")}`;
}
