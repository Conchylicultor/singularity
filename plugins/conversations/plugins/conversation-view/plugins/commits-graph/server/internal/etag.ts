// Conditional-revalidation ETag signatures for the commits-graph resources.
// These are the cheap "did anything change?" content fingerprints the live-state
// read path compares against the client's last-known value before running the
// full loader (see the resource `revalidate` field). Both are conservative
// over-approximations: they fold in exactly the git-state inputs the loaders read,
// so an ETag miss can never hide a value change (serving stale is a correctness
// bug; a needless recompute is merely a missed optimization).
//
// Factored out as pure string-format functions so the soundness (distinct input
// dimension ⇒ distinct string) is unit-testable without spawning git.

// `computeDelta` → `computeDeltaCore` reads only: branch (rev-parse HEAD),
// merge-base(main, HEAD), and `rev-list --left-right --count main...HEAD`. Every
// one of those is fully determined by the pair (headSha, mainSha): commits are
// immutable, so if neither tip moved the merge-base and both rev-lists are
// unchanged.
//
// This is `deltaMemo`'s bound `signature` — the ETag on the wire and the key the
// loader's read-through caches under are the same string from the same call, not
// two twins kept in step by hand (see compute-graph.ts and
// research/2026-07-09-global-etag-value-coproduction.md).
export function deltaEtag(headSha: string, mainSha: string): string {
  return `${headSha}|${mainSha}`;
}

// `computeGraph` reads (headSha, mainSha, mergeBase, pushedShas) — its three
// internal cache keys are `${headSha}|${mergeBase}` (pending), `${mainSha}|
// ${mergeBase}` (behind) and `${headSha}|${mergeBase}|${pushedShas}` (landed).
// mergeBase is a pure function of (headSha, mainSha) (immutable history), so
// folding in both tips covers it without spawning `merge-base` here. pushedShas
// (a DB read) is NOT derivable from the tips — the landed set changes whenever a
// push lands — so it MUST be folded in too; head/main alone would serve stale for
// the graph. The shas are sorted so the signature is order-independent, matching
// the loader's own order-independent `pushedShasKey` sort.
export function graphEtag(
  headSha: string,
  mainSha: string,
  pushedShas: readonly string[],
): string {
  return `${headSha}|${mainSha}|${[...pushedShas].sort().join(",")}`;
}
