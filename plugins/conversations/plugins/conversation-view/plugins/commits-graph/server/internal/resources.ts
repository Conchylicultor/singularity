import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { WorktreeGoneError } from "@plugins/primitives/plugins/commit-list/server";
import { resolved, unresolved } from "@plugins/primitives/plugins/live-state/core";
import { refHeadResource } from "@plugins/infra/plugins/git-watcher/server";
import { getAttempt, listPushesForAttempt, pushesResource } from "@plugins/tasks/plugins/tasks-core/server";
import type { Push } from "@plugins/tasks/plugins/tasks-core/core";
import {
  CommitDeltaPayloadSchema,
  CommitsGraphPayloadSchema,
  type CommitDeltaPayload,
  type CommitsGraphPayload,
} from "../../shared/protocol";
import {
  computeDelta,
  computeGraph,
  deltaSignature,
  evictWorktree,
  probeHeadMain,
} from "./compute-graph";
import { graphEtag } from "./etag";

type Params = { attemptId: string };

async function worktreeFor(attemptId: string): Promise<string | null> {
  const row = await getAttempt(attemptId);
  return row?.worktreePath ?? null;
}

// An attempt outlives its worktree: the row (and the chip subscribed to it) stay
// after worktree-cleanup reaps the directory, so `worktreePath` is a DB-held
// claim about a dir that may be gone. That is the SAME determinate state as "no
// worktree at all" — not a failed read — so both collapse onto the caller's
// `gone` value. Checked by catching, not by stat-then-run: a reap racing the
// compute would slip past any pre-check. Every other git failure propagates.
async function onWorktree<T>(
  attemptId: string,
  gone: T,
  compute: (worktreePath: string) => Promise<T>,
): Promise<T> {
  const wt = await worktreeFor(attemptId);
  if (!wt) return gone;
  try {
    return await compute(wt);
  } catch (err) {
    if (!(err instanceof WorktreeGoneError)) throw err;
    evictWorktree(wt);
    return gone;
  }
}

// `onLastUnsubscribe` is sync while `worktreeFor` is async, so drop the cache
// entry fire-and-forget. Dropping a still-referenced entry is harmless — it just
// forces a cheap cold re-probe on the next read — so no coordination is needed.
function evictWorktreeFor(attemptId: string): void {
  void runTracked("commits-graph:evict", () =>
    worktreeFor(attemptId).then((wt) => {
      if (wt) evictWorktree(wt);
    }),
  );
}

// Map upstream pushes notifications to the set of attemptIds that have ever
// pushed. The downstream notify is gated by per-attempt subscriptions, so
// only actively-watched chips re-run git.
function attemptIdsFromPushes(_upstreamParams: unknown, value: unknown): Params[] {
  const pushes = (value ?? []) as Array<Pick<Push, "attemptId">>;
  const ids = new Set<string>();
  for (const p of pushes) ids.add(p.attemptId);
  return [...ids].map((attemptId) => ({ attemptId }));
}

// AttemptIds with a live chip/pane subscriber, tracked per resource via the
// sub-lifecycle hooks. A git ref advance (local commit / rebase / sync-to-head,
// or main moving) changes the ahead/behind of every visible delta, so any
// refHeadResource notify fans out to exactly the attempts currently on screen.
// git-watcher only tracks `main` + this worktree's own branch, so a notify
// already implies a relevant ref moved — no need to inspect the refName.
const activeDeltaAttempts = new Set<string>();
const activeGraphAttempts = new Set<string>();

function activeAttemptParams(active: ReadonlySet<string>): () => Params[] {
  return () => [...active].map((attemptId) => ({ attemptId }));
}

export const commitDeltaResource = defineResource({
  key: "commits-graph.delta",
  mode: "push",
  schema: CommitDeltaPayloadSchema,
  dependsOn: [
    { resource: pushesResource, map: attemptIdsFromPushes },
    { resource: refHeadResource, map: activeAttemptParams(activeDeltaAttempts) },
  ],
  onFirstSubscribe: ({ attemptId }: Params) => {
    activeDeltaAttempts.add(attemptId);
  },
  onLastUnsubscribe: ({ attemptId }: Params) => {
    activeDeltaAttempts.delete(attemptId);
    evictWorktreeFor(attemptId);
  },
  loader: ({ attemptId }: Params): Promise<CommitDeltaPayload> =>
    onWorktree(attemptId, unresolved("worktree unavailable"), async (wt) =>
      resolved(await computeDelta(wt)),
    ),
  // Cheap ETag: literally `deltaMemo`'s own signature — the very key the loader's
  // read-through caches under, not a separately-maintained twin of it. The two
  // cannot drift, so a fresh ETag can never certify a stale value (see
  // research/2026-07-09-global-etag-value-coproduction.md). It derives entirely
  // from (headSha, mainSha), so an unchanged pair proves ahead/behind/mergeBase
  // are unchanged. No worktree (or a reaped one) ⇒ `unresolved(...)`, so a stable
  // "no-worktree" sentinel keeps that determinate non-value up-to-date — the ETag
  // and value are one consistent pair produced from the SAME `onWorktree` branch,
  // now honest ("unknown") rather than a `{ahead: 0, …}` stand-in that lies about
  // an unmeasured branch. Cost: 1–2 ungated `rev-parse` vs. the loader's
  // `merge-base` + `rev-list --count`.
  revalidate: ({ attemptId }: Params): Promise<string> =>
    onWorktree(attemptId, "no-worktree", (wt) => deltaSignature(wt)),
});

export const commitsGraphResource = defineResource({
  key: "commits-graph.graph",
  mode: "push",
  schema: CommitsGraphPayloadSchema,
  dependsOn: [
    { resource: pushesResource, map: attemptIdsFromPushes },
    { resource: refHeadResource, map: activeAttemptParams(activeGraphAttempts) },
  ],
  onFirstSubscribe: ({ attemptId }: Params) => {
    activeGraphAttempts.add(attemptId);
  },
  onLastUnsubscribe: ({ attemptId }: Params) => {
    activeGraphAttempts.delete(attemptId);
    evictWorktreeFor(attemptId);
  },
  loader: ({ attemptId }: Params): Promise<CommitsGraphPayload> =>
    onWorktree(attemptId, unresolved("worktree unavailable"), async (wt) => {
      const pushes = await listPushesForAttempt(attemptId);
      return resolved(await computeGraph(wt, pushes.map((p) => p.sha)));
    }),
  // Cheap ETag: the graph value derives from (headSha, mainSha, mergeBase,
  // pushedShas). mergeBase is a pure function of the two tips (immutable history),
  // so folding in both tips covers it without spawning `merge-base`; pushedShas
  // (a DB read, NOT derivable from the tips) is folded in because the landed set
  // moves whenever a push lands — head/main alone would serve a stale graph. No
  // worktree ⇒ `unresolved(...)`, so a stable "no-worktree" sentinel keeps that
  // determinate non-value up-to-date — ETag and value are one consistent pair
  // from the SAME `onWorktree` branch, honest ("unknown") rather than an empty
  // graph stand-in. Cost: 1–2 ungated `rev-parse` + the same push DB read the
  // loader does, vs. the loader's additional `merge-base` and up-to-250-commit
  // `git log`s.
  revalidate: ({ attemptId }: Params): Promise<string> =>
    onWorktree(attemptId, "no-worktree", async (wt) => {
      const [{ headSha, mainSha }, pushes] = await Promise.all([
        probeHeadMain(wt),
        listPushesForAttempt(attemptId),
      ]);
      return graphEtag(headSha, mainSha, pushes.map((p) => p.sha));
    }),
});
