import { ndjsonResponse } from "@plugins/infra/plugins/ndjson-stream/server";
import { openShortLivedClient } from "@plugins/database/plugins/admin/server";
import { listLiveForkDatabases } from "@plugins/debug/plugins/slow-ops/plugins/cluster/server";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import {
  runInBackgroundLane,
  runWithoutProfiling,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/server";
import { TimelineQuerySchema, HOST_LANE, type TimelineFrame } from "../../shared/frames";
import { DB_SOURCES } from "./sources/db-sources";
import type { DbSourceCtx } from "./sources/context";
import { loadBootEvents } from "./sources/boot";
import { loadDuressEpisodes } from "./sources/duress";
import { readHealthLane, readHostLane } from "./sources/health";
import { listWorktreeLogDirs } from "./log-dirs";

// Same bound as the cluster tab's fan-out: each short-lived pool is `max: 1`,
// so this caps the backends we add to the (possibly already-contended)
// cluster while still parallelising the merge.
const FANOUT_CONCURRENCY = 6;

// This view gets opened DURING incidents. A saturated fork must produce an
// error chunk within seconds, not hang the stream — every fan-out session
// sets this before its first query.
const STATEMENT_TIMEOUT_MS = 10_000;

type Emit = (frame: TimelineFrame) => void;

// Streamed as NDJSON for the same reason the cluster tab is: the fan-out
// across ~16 fork DBs can take tens of seconds under load, so the client gets
// a determinate `{ total }` up front, then per-(source, worktree) chunks as
// they resolve. Whole producer runs under the background lane with profiling
// suppressed — observability must never feed the profiler or ride the
// interactive lane (anti-amplification discipline).
export function handleTimeline(req: Request): Response {
  const url = new URL(req.url);
  const parsed = TimelineQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success || parsed.data.fromMs >= parsed.data.toMs) {
    return new Response("fromMs and toMs are required (wall-clock epoch ms, fromMs < toMs)", {
      status: 400,
    });
  }
  const { fromMs, toMs } = parsed.data;
  return ndjsonResponse((emit) =>
    runInBackgroundLane(() => runWithoutProfiling(() => produceTimeline(emit, fromMs, toMs))),
  );
}

// Exported so the in-process get_timeline MCP tool can drive the SAME producer
// with an array-push emit (see internal/collect.ts) — one source of truth for
// the fan-out, whether the frames stream to the web tab or collect into a
// rendered text report.
export async function produceTimeline(emit: Emit, fromMs: number, toMs: number): Promise<void> {
  const dbNames = await listLiveForkDatabases(Date.now());
  const logWorktrees = listWorktreeLogDirs();
  // Planned chunk count: every (DB × DB-source) cell, one boot chunk per
  // worktree log dir, plus the single host-global duress chunk. Health frames
  // are series, not chunks, and don't count.
  emit({ total: dbNames.length * DB_SOURCES.length + logWorktrees.length + 1 });

  const semaphore = createSemaphore(FANOUT_CONCURRENCY);
  const dbWork = Promise.all(
    dbNames.map((dbName) => semaphore.run(() => emitDbChunks(emit, dbName, fromMs, toMs))),
  );

  try {
    // Disk-backed lanes (cheap main-local reads) while the DB fan-out runs.
    for (const worktree of logWorktrees) {
      try {
        const events = loadBootEvents(worktree, fromMs, toMs);
        emit({ chunk: { source: "boot", worktree, ok: true, events } });
      } catch (err) {
        // Loud-but-resilient, like the per-DB cells: one unreadable boot.jsonl
        // must not blank the whole timeline.
        emit({ chunk: { source: "boot", worktree, ok: false, error: String(err) } });
      }
      const samples = readHealthLane(worktree, fromMs, toMs);
      if (samples.length) emit({ health: { worktree, samples } });
    }
    // Host-global duress episodes (one chunk on the host lane, read from
    // main's log dir — the sentinel worker is the latch's sole writer).
    try {
      const events = loadDuressEpisodes(fromMs, toMs);
      emit({ chunk: { source: "duress", worktree: HOST_LANE, ok: true, events } });
    } catch (err) {
      emit({ chunk: { source: "duress", worktree: HOST_LANE, ok: false, error: String(err) } });
    }
    const hostSamples = readHostLane(fromMs, toMs);
    if (hostSamples.length) emit({ health: { worktree: HOST_LANE, samples: hostSamples } });
  } finally {
    // Always drain the DB fan-out, even if a disk scan threw — otherwise its
    // late chunks would race the closed stream as unhandled rejections.
    await dbWork;
  }

  emit({ end: true });
}

// Open the per-DB session and pin its statement timeout. Throws on any
// failure; the caller turns that into one error chunk per source.
async function openSession(pool: ReturnType<typeof openShortLivedClient>) {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
  } catch (err) {
    client.release();
    throw err;
  }
  return client;
}

async function emitDbChunks(
  emit: Emit,
  dbName: string,
  fromMs: number,
  toMs: number,
): Promise<void> {
  const ctx: DbSourceCtx = { dbName, isMainDb: dbName === MAIN_WORKTREE_NAME, fromMs, toMs };
  const pool = openShortLivedClient(dbName);
  try {
    let client: Awaited<ReturnType<typeof openSession>>;
    try {
      client = await openSession(pool);
    } catch (err) {
      // The whole DB is unreachable (dropped fork, saturated cluster): one
      // error chunk per source keeps the client's progress accounting exact.
      for (const src of DB_SOURCES) {
        emit({ chunk: { source: src.source, worktree: dbName, ok: false, error: String(err) } });
      }
      return;
    }
    try {
      for (const src of DB_SOURCES) {
        try {
          const q = src.build(ctx);
          const res = await client.query(q.text, q.values);
          const events = src.map(res.rows, ctx);
          emit({ chunk: { source: src.source, worktree: dbName, ok: true, events } });
        } catch (err) {
          // Per-cell isolation (statement timeout, old-schema fork, malformed
          // row): surface the error in that cell, keep the rest of the DB.
          emit({ chunk: { source: src.source, worktree: dbName, ok: false, error: String(err) } });
        }
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
