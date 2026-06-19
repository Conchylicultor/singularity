import { ndjsonResponse } from "@plugins/infra/plugins/ndjson-stream/server";
import {
  listDatabases,
  openShortLivedClient,
} from "@plugins/database/plugins/admin/server";
import { listAttempts } from "@plugins/tasks/plugins/tasks-core/server";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { SlowOpSchema, type SlowOp } from "@plugins/debug/plugins/slow-ops/core";
import { type ClusterWorktree } from "../../shared/endpoints";

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

// A fork DB is only worth scanning if its attempt is still live: the host
// accumulates 1000+ finished worktree forks (most without even a `slow_ops`
// table), so blindly fanning out over every database in `listDatabases()` opens
// a thousand pools to surface a handful of error rows. We restrict the fan-out
// to the main DB plus forks whose attempt is active or created in the last 24h.
const RECENT_FORK_WINDOW_MS = 24 * 60 * 60 * 1000;

async function relevantDatabases(now: number): Promise<string[]> {
  const [dbNames, attempts] = await Promise.all([listDatabases(), listAttempts()]);
  const dbSet = new Set(dbNames);
  const relevant = new Set<string>();
  if (dbSet.has("singularity")) relevant.add("singularity");
  for (const a of attempts) {
    if (!dbSet.has(a.id)) continue;
    const live = a.active || now - a.createdAt.getTime() < RECENT_FORK_WINDOW_MS;
    if (live) relevant.add(a.id);
  }
  return [...relevant];
}

// Streamed as NDJSON rather than a single JSON response: the fan-out across ~16
// worktree DB forks takes 20s+, so withholding the whole payload until the last
// fork resolves leaves the user staring at a blank pane (and risks Bun's idle
// timeout). Instead we emit a `{ total }` frame up front (after relevantDatabases())
// so the client can show a determinate "scanning X / N worktrees" progress bar,
// then emit each `{ worktree }` as its fetch resolves so the two DataViews fill
// in live. A producer throw is auto-framed as `{ error }` by ndjsonResponse;
// per-DB failures are still surfaced inline as `ok: false` worktree rows.
export function handleSlowOpsCluster(): Response {
  return ndjsonResponse(async (emit) => {
    const names = await relevantDatabases(Date.now());
    emit({ total: names.length });
    const semaphore = createSemaphore(FANOUT_CONCURRENCY);
    await Promise.all(
      names.map((name) =>
        semaphore.run(async () => emit({ worktree: await fetchWorktree(name) })),
      ),
    );
    emit({ end: true });
  });
}
