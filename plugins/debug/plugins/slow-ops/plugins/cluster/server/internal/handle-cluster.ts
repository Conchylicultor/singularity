import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  listDatabases,
  openShortLivedClient,
} from "@plugins/database/plugins/admin/server";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { SlowOpSchema, type SlowOp } from "@plugins/debug/plugins/slow-ops/core";
import {
  getSlowOpsCluster,
  type ClusterWorktree,
} from "../../shared/endpoints";

// Bound the fan-out so a 16-worktree cluster never opens 16 pools at once. Each
// short-lived pool is `max: 1`, so this caps concurrent backends we add to the
// (already-contended) cluster while still parallelising the merge.
const FANOUT_CONCURRENCY = 6;

const SELECT_SLOW_OPS = `
  SELECT id, worktree, operation_kind, operation, count, total_ms, max_ms,
         last_ms, threshold_ms, callers, recent_samples, first_seen_at,
         last_seen_at
  FROM slow_ops
`;

// One raw row as Postgres returns it (snake_case; numeric columns may arrive as
// strings from node-postgres, so SlowOpSchema's z.coerce handles the dates and
// we Number() the rest before parsing).
interface RawRow {
  id: string;
  worktree: string;
  operation_kind: string;
  operation: string;
  count: number | string;
  total_ms: number | string;
  max_ms: number | string;
  last_ms: number | string;
  threshold_ms: number | string;
  callers: unknown;
  recent_samples: unknown;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
}

function toSlowOp(row: RawRow): SlowOp {
  // Parse through the shared schema so date coercion + jsonb shape validation
  // are enforced exactly as the live resource does — a malformed row throws and
  // is caught by the per-DB try/catch (surfaced as an error row).
  return SlowOpSchema.parse({
    id: row.id,
    worktree: row.worktree,
    operationKind: row.operation_kind,
    operation: row.operation,
    count: Number(row.count),
    totalMs: Number(row.total_ms),
    maxMs: Number(row.max_ms),
    lastMs: Number(row.last_ms),
    thresholdMs: Number(row.threshold_ms),
    callers: row.callers,
    recentSamples: row.recent_samples,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  });
}

async function fetchWorktree(name: string): Promise<ClusterWorktree> {
  const pool = openShortLivedClient(name);
  try {
    const result = await pool.query<RawRow>(SELECT_SLOW_OPS);
    const ops = result.rows.map(toSlowOp);
    return { name, ok: true, ops };
  } catch (err) {
    // Loud-but-resilient: one stale or old-schema fork (e.g. missing the
    // recent_samples column) must not blank the whole cluster view. Surface the
    // error per-row in the UI instead of swallowing it.
    return { name, ok: false, error: String(err), ops: [] };
  } finally {
    await pool.end();
  }
}

export const handleSlowOpsCluster = implement(getSlowOpsCluster, async () => {
  const names = await listDatabases();
  const semaphore = createSemaphore(FANOUT_CONCURRENCY);
  const worktrees = await Promise.all(
    names.map((name) => semaphore.run(() => fetchWorktree(name))),
  );
  return { worktrees };
});
