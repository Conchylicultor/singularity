import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { getAttempt, listPushesForAttempt, pushesResource } from "@plugins/tasks/plugins/tasks-core/server";
import type { Push } from "@plugins/tasks/plugins/tasks-core/core";
import {
  CommitDeltaSchema,
  CommitsGraphSchema,
  type CommitDelta,
  type CommitsGraph,
} from "../../shared/protocol";
import { computeDelta, computeGraph } from "./compute-graph";

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

// Map upstream pushes notifications to the set of attemptIds that have ever
// pushed. The downstream notify is gated by per-attempt subscriptions, so
// only actively-watched chips re-run git.
function attemptIdsFromPushes(_upstreamParams: unknown, value: unknown): Params[] {
  const pushes = (value ?? []) as Array<Pick<Push, "attemptId">>;
  const ids = new Set<string>();
  for (const p of pushes) ids.add(p.attemptId);
  return [...ids].map((attemptId) => ({ attemptId }));
}

export const commitDeltaResource = defineResource({
  key: "commits-graph.delta",
  mode: "push",
  schema: CommitDeltaSchema,
  dependsOn: [{ resource: pushesResource, map: attemptIdsFromPushes }],
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
  dependsOn: [{ resource: pushesResource, map: attemptIdsFromPushes }],
  loader: async ({ attemptId }: Params): Promise<CommitsGraph> => {
    const wt = await worktreeFor(attemptId);
    if (!wt) return EMPTY_GRAPH;
    const pushes = await listPushesForAttempt(attemptId);
    const pushedShas = pushes.map((p) => p.sha);
    return computeGraph(wt, pushedShas);
  },
});
