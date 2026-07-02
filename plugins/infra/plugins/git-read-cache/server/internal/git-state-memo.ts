import { createInflight } from "@plugins/packages/plugins/inflight/core";
import { chargeWait } from "@plugins/infra/plugins/runtime-profiler/core";

export interface GitStateMemo<T> {
  /**
   * Return the memoized value for `worktreePath` if the cheap ungated
   * `signatureFn` fingerprint is unchanged since the last compute; otherwise
   * single-flight the gated `computeFn` (keyed per worktree) and cache its
   * result under the freshly probed signature.
   *
   * - `signatureFn`: cheap, UNGATED probe (runs on EVERY call — keep it ~sub-ms,
   *   e.g. one ungated `rev-parse`). It must fingerprint every input the result
   *   depends on, so a stale result is never served.
   * - `computeFn`: the expensive, gated recompute. It owns its own
   *   `withHeavyReadSlot` — the memo never touches the heavy-read gate, so a
   *   signature hit acquires NO slot at all.
   */
  get(
    worktreePath: string,
    signatureFn: () => Promise<string>,
    computeFn: () => Promise<T>,
  ): Promise<T>;
  /**
   * Write-through prime: store `{ signature, value }` for `worktreePath`
   * directly, bypassing `signatureFn`/`computeFn`. For an **authoritative
   * external writer** that already computed the value and the signature it
   * belongs to — e.g. the @parcel watcher behind edited-files, which is the
   * sole source of truth for working-tree state and bumps a monotonic
   * generation signature on every completed recompute. A subsequent `get` whose
   * `signatureFn` returns the same signature is then a pure cache hit (no
   * `computeFn`, no heavy slot). The writer owns correctness: it must only set a
   * value it knows matches the signature.
   */
  set(worktreePath: string, signature: string, value: T): void;
  /** Drop the cached entry for `worktreePath` (subscription-lifecycle cleanup). */
  evict(worktreePath: string): void;
}

/**
 * Git-state-keyed result memo. Three live-state levers collapse into one
 * abstraction: a cheap ungated signature probe short-circuits the gated git
 * recompute on a match (skip-redundant-work / incremental), an embedded
 * per-worktree `createInflight` folds stacked concurrent recomputes into one
 * execution (skip-in-flight), and keying on `worktreePath` (not
 * conversationId/attemptId) coalesces the fan-out across views.
 *
 * The whole point: the memo short-circuits BEFORE any heavy slot is acquired —
 * a hit acquires neither the per-worktree nor the host heavy-read slot, so the
 * storm path becomes mostly memo hits.
 *
 * See research/2026-06-19-global-incremental-git-loaders.md.
 */
export function createGitStateMemo<T>(opts: { name: string }): GitStateMemo<T> {
  const cache = new Map<string, { signature: string; value: T }>();
  const inflight = createInflight();
  return {
    async get(worktreePath, signatureFn, computeFn) {
      const sig = await signatureFn(); // cheap, ungated, no slot
      const hit = cache.get(worktreePath);
      if (hit && hit.signature === sig) {
        // 0ms marker: hit-rate signal only — never pollutes wait timing.
        chargeWait(`git-memo-hit:${opts.name}`, 0);
        return hit.value; // short-circuit BEFORE any heavy slot
      }
      // Capture `sig` before the inflight: a second caller arriving with a
      // *different* signature mid-flight shares this in-flight (≤1-event stale)
      // result; the next notify re-probes. Mirrors the runtime single-flight's
      // staleness-sharing contract.
      return inflight.run(
        worktreePath,
        async () => {
          chargeWait(`git-memo-miss:${opts.name}`, 0);
          const value = await computeFn(); // computeFn owns withHeavyReadSlot
          cache.set(worktreePath, { signature: sig, value });
          return value;
        },
        // Joiners charge the time spent awaiting the shared compute to their
        // OWN enclosing entry — the starter's compute is real work, not wait.
        (ms) => chargeWait(`git-coalesce:${opts.name}`, ms),
      );
    },
    set(worktreePath, signature, value) {
      // Write-through prime from an authoritative external writer: cache the
      // value under the signature it already knows it matches. The next `get`
      // with the same signature short-circuits with no compute and no slot.
      cache.set(worktreePath, { signature, value });
    },
    evict(worktreePath) {
      cache.delete(worktreePath);
    },
  };
}
