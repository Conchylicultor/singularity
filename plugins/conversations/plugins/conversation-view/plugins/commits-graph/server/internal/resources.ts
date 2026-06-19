import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { refHeadResource } from "@plugins/infra/plugins/git-watcher/server";
import { getAttempt, listPushesForAttempt, pushesResource } from "@plugins/tasks/plugins/tasks-core/server";
import type { Push } from "@plugins/tasks/plugins/tasks-core/core";
import {
  CommitDeltaSchema,
  CommitsGraphSchema,
  type CommitDelta,
  type CommitsGraph,
} from "../../shared/protocol";
import { computeDelta, computeGraph, evictWorktree } from "./compute-graph";

type Params = { attemptId: string };

const EMPTY_DELTA: CommitDelta = {
  ahead: 0,
  behind: 0,
  mergeBase: null,
  branch: null,
};

const EMPTY_GRAPH: CommitsGraph = { ...EMPTY_DELTA, commits: [], landedCommits: [], behindCommits: [] };

async function worktreeFor(attemptId: string): Promise<string | null> {
  const row = await getAttempt(attemptId);
  return row?.worktreePath ?? null;
}

// `onLastUnsubscribe` is sync while `worktreeFor` is async, so drop the cache
// entry fire-and-forget. Dropping a still-referenced entry is harmless — it just
// forces a cheap cold re-probe on the next read — so no coordination is needed.
function evictWorktreeFor(attemptId: string): void {
  void worktreeFor(attemptId).then((wt) => {
    if (wt) evictWorktree(wt);
  });
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
  schema: CommitDeltaSchema,
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
  loader: async ({ attemptId }: Params): Promise<CommitDelta> => {
    const wt = await worktreeFor(attemptId);
    if (!wt) return EMPTY_DELTA;
    return computeDelta(wt);
  },
});

export const commitsGraphResource = defineResource({
  key: "commits-graph.graph",
  mode: "push",
  schema: CommitsGraphSchema,
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
  loader: async ({ attemptId }: Params): Promise<CommitsGraph> => {
    const wt = await worktreeFor(attemptId);
    if (!wt) return EMPTY_GRAPH;
    const pushes = await listPushesForAttempt(attemptId);
    const pushedShas = pushes.map((p) => p.sha);
    return computeGraph(wt, pushedShas);
  },
});
