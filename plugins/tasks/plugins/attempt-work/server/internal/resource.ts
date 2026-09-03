import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { refHeadResource } from "@plugins/infra/plugins/git/plugins/git-watcher/server";
import { attemptWorkResource as attemptWorkDescriptor } from "../../core/resources";
import type { AttemptWorkPayload } from "../../core/protocol";
import { attemptWorkSignature, evictAttemptWork, getAttemptWork } from "./work";

type Params = { attemptId: string };

// AttemptIds with a live subscriber, tracked per resource via the sub-lifecycle
// hooks. A git ref advance (local commit / rebase / sync-to-head, or main moving)
// changes the standing of every visible attempt, so any refHeadResource notify
// fans out to exactly the attempts currently on screen. git-watcher only tracks
// `main` + this worktree's own branch, so a notify already implies a relevant ref
// moved — no need to inspect the refName.
//
// There is deliberately NO `pushesResource` dependency. The landed set is now
// git-measured, so a ref advance is the COMPLETE refresh signal; the ledger only
// corroborates, and its own arrival moves the signature (see `attemptWorkEtag`)
// so a push row landing without a ref advance still invalidates on the next read.
const activeWorkAttempts = new Set<string>();

function activeAttemptParams(active: ReadonlySet<string>): () => Params[] {
  return () => [...active].map((attemptId) => ({ attemptId }));
}

// Two-arg form: `key` / `schema` / param typing come from the shared client
// descriptor, so server and client cannot drift about the contract.
export const attemptWorkServerResource = defineResource(attemptWorkDescriptor, {
  mode: "push",
  dependsOn: [
    { resource: refHeadResource, map: activeAttemptParams(activeWorkAttempts) },
  ],
  onFirstSubscribe: ({ attemptId }: Params) => {
    activeWorkAttempts.add(attemptId);
  },
  onLastUnsubscribe: ({ attemptId }: Params) => {
    activeWorkAttempts.delete(attemptId);
    // Keyed by attemptId, so the eviction needs no DB lookup (commits-graph's
    // equivalent had to resolve a worktree path first, fire-and-forget). Dropping
    // a still-referenced entry is harmless — it forces one cheap cold re-probe.
    evictAttemptWork(attemptId);
  },
  // A missing worktree is NOT automatically unresolved here, unlike
  // commits-graph's `onWorktree` collapse: `landed` is measurable from the main
  // repo even when the checkout is gone, and so is `pending` (the branch ref
  // survives `git worktree remove`). The only unresolved arm is a genuinely
  // unmeasurable standing — an attempt row that no longer exists. Every real git
  // failure THROWS rather than resolving to a confident-looking zero.
  loader: ({ attemptId }: Params): Promise<AttemptWorkPayload> =>
    getAttemptWork(attemptId),
  // Cheap ETag: literally the memo's own signature — the very key the loader's
  // read-through caches under, not a separately-maintained twin of it. The two
  // cannot drift, so a fresh ETag can never certify a stale value (see
  // research/2026-07-09-global-etag-value-coproduction.md). Cost: 1–2 ungated
  // `rev-parse` plus the same small DB reads the loader does, against the loader's
  // `merge-base` + `rev-list --count` + trailer-bearing `git log`.
  revalidate: ({ attemptId }: Params): Promise<string> =>
    attemptWorkSignature(attemptId),
});
