import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  queryQueueBacklog,
  queryBacklogByJobName,
  queryRunningJobs,
  queryDeadJobStats,
  JOB_CONCURRENCY,
} from "@plugins/infra/plugins/jobs/server";
import { queueHealthSummaryEndpoint } from "../../core";

// A single attributed snapshot of this worktree's queue health, assembled from
// the jobs plugin's read-only introspection API (which owns the graphile
// coupling) plus the shared slot-pool size. The MCP tool proxies to this route
// through the gateway so it always reads the target worktree's live backend.
export const handleQueueHealthSummary = implement(
  queueHealthSummaryEndpoint,
  async () => {
    const [backlog, byJobName, running, dead] = await Promise.all([
      queryQueueBacklog(),
      queryBacklogByJobName(),
      queryRunningJobs(),
      queryDeadJobStats(),
    ]);
    return {
      concurrency: JOB_CONCURRENCY,
      backlog: {
        readyCount: backlog.readyCount,
        lockedCount: backlog.lockedCount,
        oldestOverdueMs: backlog.oldestOverdueMs,
      },
      byJobName,
      running,
      dead,
    };
  },
);
